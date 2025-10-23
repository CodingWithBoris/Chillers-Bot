// src/utils/moderationUtils.ts
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    EmbedBuilder,
    Message,
    ThreadAutoArchiveDuration,
    ThreadChannel,
    User,
} from "discord.js";
import CustomClient from "../base/classes/CustomClient";
import UserModeration, { IUserModeration } from "../base/schema/UserModeration";

export async function getOrCreateThread(
    client: CustomClient,
    guildId: string,
    userId: string
): Promise<{ thread: ThreadChannel; profileMessage: Message }> {
    let doc = await UserModeration.findOne({ userId, guildId });
    if (!doc) {
        doc = new UserModeration({
            userId,
            guildId,
            notes: "",
            warnings: new Map(),
            punishments: [],
        });
        await doc.save();
    }

    const guild = await client.guilds.fetch(guildId);
    const channel = await guild.channels.fetch(client.config.moderationChannelId);
    if (!channel) {
        throw new Error("Moderation channel not found.");
    }

    if (
        channel.type !== ChannelType.GuildText &&
        channel.type !== ChannelType.GuildForum &&
        channel.type !== ChannelType.GuildMedia
    ) {
        throw new Error("Moderation channel must be a text, forum, or media channel.");
    }

    let thread: ThreadChannel | undefined;
    if (doc.threadId) {
        const fetchedThread = await channel.threads.fetch(doc.threadId).catch(() => null);
        thread = fetchedThread ?? undefined; // Explicitly handle null case
    }

    if (!thread) {
        const user = await client.users.fetch(userId);
        const embed = buildProfileEmbed(user, doc);
        const components = buildButtons(userId);

        if (channel.type === ChannelType.GuildForum || channel.type === ChannelType.GuildMedia) {
            // For forum/media channels, create thread with initial message
            thread = await channel.threads.create({
                name: `${user.username} (${user.id})`,
                autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
                reason: "Moderation form",
                message: {
                    embeds: [embed],
                    components: [components],
                },
            });
            // The initial message is the last (and first) message in the thread
            await thread.fetchStarterMessage(); // Ensure starter message is cached
            const profileMessageId = thread.lastMessageId;
            if (!profileMessageId) {
                throw new Error("Failed to retrieve profile message ID.");
            }
            doc.profileMessageId = profileMessageId;
        } else {
            // For text channels, create thread then send message
            thread = await channel.threads.create({
                name: `${user.username} (${user.id})`,
                autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
                reason: "Moderation form",
            });
            const message = await thread.send({ embeds: [embed], components: [components] });
            doc.profileMessageId = message.id;
        }

        doc.threadId = thread.id;
        await doc.save();
    }

    const profileMessage = await thread.messages.fetch(doc.profileMessageId!);
    return { thread, profileMessage };
}

export function buildProfileEmbed(user: User, doc: IUserModeration): EmbedBuilder {
    const embed = new EmbedBuilder().setTitle(`${user.username} (${user.id})`).setColor("Blue");

    if (doc.notes) {
        embed.addFields({ name: "Notes", value: doc.notes, inline: false });
    }

    let warningsStr = "";
    for (const [reason, data] of doc.warnings.entries()) {
        warningsStr += `${data.count}x counts of ${reason}\n`;
    }
    if (warningsStr) {
        embed.addFields({ name: "Warnings", value: warningsStr, inline: false });
    }
    let punishmentsStr = "";
    for (const [_key, punishment] of doc.punishments.entries()) {
        const type = (punishment as any).type ?? "unknown";
        const duration = (punishment as any).duration ?? "";
        const reason = (punishment as any).reason ?? "no reason";
        punishmentsStr += `${duration} ${type} for ${reason}.\n`;
    }
    if (punishmentsStr) {
        embed.addFields({ name: "Punishments", value: punishmentsStr, inline: false });
    }

    return embed;
}

export function buildButtons(userId: string): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`mod_mute_${userId}`).setLabel("Mute").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`mod_timeout_${userId}`).setLabel("Timeout").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`mod_kick_${userId}`).setLabel("Kick").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`mod_ban_${userId}`).setLabel("Ban").setStyle(ButtonStyle.Danger)
    );
}

export function parseDuration(str: string): number | null {
    str = str.trim().toLowerCase().replace(/hours?/, "h").replace(/days?/, "d").replace(/minutes?/, "m").replace(/seconds?/, "s").replace(/weeks?/, "w").replace(/years?/, "y");

    const match = str.match(/^(\d+)\s*([smhdwy])?$/);
    if (!match) return null;

    const num = parseInt(match[1]);
    let mult = 1000; // default seconds
    switch (match[2]) {
        case "s":
            mult = 1000;
            break;
        case "m":
            mult = 60 * 1000;
            break;
        case "h":
            mult = 60 * 60 * 1000;
            break;
        case "d":
            mult = 24 * 60 * 60 * 1000;
            break;
        case "w":
            mult = 7 * 24 * 60 * 60 * 1000;
            break;
        case "y":
            mult = 365 * 24 * 60 * 60 * 1000;
            break;
    }
    return num * mult;
}