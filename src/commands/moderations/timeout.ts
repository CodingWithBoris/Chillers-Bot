import {
    ApplicationCommandOptionType,
    ChatInputCommandInteraction,
    EmbedBuilder,
    PermissionFlagsBits,
} from "discord.js";
import Command from "../../base/classes/Command";
import CustomClient from "../../base/classes/CustomClient";
import Category from "../../base/enums/Category";
import UserModeration from "../../base/schema/UserModeration";
import {
    buildProfileEmbed,
    getOrCreateThread,
} from "../../utils/moderationUtils";

export default class Timeout extends Command {
    constructor(client: CustomClient) {
        super(client, {
            name: "timeout",
            description: "Times out a user for a specific duration.",
            category: Category.Moderation,
            options: [
                {
                    name: "user",
                    description: "The user to timeout.",
                    type: ApplicationCommandOptionType.User,
                    required: true,
                },
                {
                    name: "reason",
                    description: "The reason for why you are timeouting the user.",
                    type: ApplicationCommandOptionType.String,
                    choices: client.config.warningReasons.map((r) => ({
                        name: r,
                        value: r,
                    })),
                    required: true,
                },
                {
                    name: "duration",
                    description: "The duration of the timeout (e.g., 10m, 1h, 1d).",
                    type: ApplicationCommandOptionType.String,
                    required: true,
                },
                {
                    name: "notes",
                    description: "Any further proof/notes you wish to add.",
                    type: ApplicationCommandOptionType.String,
                    required: false,
                }
            ],
            default_member_permissions: PermissionFlagsBits.ModerateMembers,
            dm_permission: false,
            cooldown: 0,
        });
    }

    async Execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const user = interaction.options.getUser("user", true);
        const reason = interaction.options.getString("reason", true);
        const durationStr = interaction.options.getString("duration", true);

        if (user.id === interaction.user.id) {
            await interaction.reply({
                content: "❌ You cannot timeout yourself.",
                ephemeral: true,
            });
            return;
        }

        const guildId = interaction.guildId!;
        let doc = await UserModeration.findOne({ userId: user.id, guildId });
        if (!doc) {
            doc = new UserModeration({
                userId: user.id,
                guildId,
                notes: "",
                punishments: [],
            });
        }

        const now = new Date();
        const existingWarning = doc.warnings.get(reason);
        if (!existingWarning) {
            doc.warnings.set(reason, {
                count: 1,
                dates: [now],
                mods: [interaction.user.id],
            });
        } else {
            existingWarning.count++;
            existingWarning.dates.push(now);
            existingWarning.mods.push(interaction.user.id);
            doc.warnings.set(reason, existingWarning);
        }

        // ✅ New, simpler active timeout check
        const activeTimeout = doc.punishments.find((p) => p.type === "timeout");
        if (activeTimeout) {
            await interaction.reply({
                content: `❌ User already has an active timeout recorded.`,
                ephemeral: true,
            });
            return;
        }

        // Record this timeout in Mongo
        doc.punishments.push({
            type: "timeout",
            reason,
            modId: interaction.user.id,
            date: now,
            duration: durationStr,
        });

        await doc.save();

        // Update moderation thread and profile
        const { thread, profileMessage } = await getOrCreateThread(
            this.client,
            guildId,
            user.id
        );
        if (profileMessage)
            await profileMessage.edit({ embeds: [buildProfileEmbed(user, doc)] });

        const unixTimestamp = Math.floor(now.getTime() / 1000);
        const embed = new EmbedBuilder()
            .setColor("Orange")
            .setTitle("User Timed Out")
            .setDescription(
                `**Reason:** ${reason}\n**Duration:** ${durationStr}\n**By:** ${interaction.user.tag}\nAt: <t:${unixTimestamp}:F> (<t:${unixTimestamp}:R>)`
            );

        await thread.send({ embeds: [embed] });

        // Log the timeout to punishment log channels
        const logChannelIds =
            this.client.config.Moderation.Channels?.punishmentLogs;
        const plainLog = `# ⏱️ **User Timed Out**
User: ${user.tag} (${user.id})
By: ${interaction.user.tag} (${interaction.user.id})
Reason: ${reason}
Duration: ${durationStr}
At: <t:${unixTimestamp}:F> (<t:${unixTimestamp}:R>)`;

        if (logChannelIds) {
            const ids = Array.isArray(logChannelIds)
                ? logChannelIds
                : [logChannelIds];

            for (const channelId of ids) {
                try {
                    const ch = await interaction.guild?.channels.fetch(channelId);
                    if (ch?.isTextBased())
                        await (ch as any).send({ content: plainLog });
                } catch (e) {
                    console.error(
                        `[WARN LOG] Failed to log timeout to ${channelId}:`,
                        e
                    );
                }
            }
        }

        // Attempt to DM the user
        try {
            await user.send(
                `⚠️ You were timed out in **${interaction.guild?.name}** for ${durationStr} for: ${reason}.`
            );
        } catch {
            console.log(`[Timeout] Could not DM ${user.tag}.`);
        }

        await interaction.reply({
            content: `✅ Successfully timed out ${user.tag} for ${durationStr}.`,
            ephemeral: true,
        });
    }
}
