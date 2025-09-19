import { ApplicationCommandOptionType, ChatInputCommandInteraction, PermissionFlagsBits } from "discord.js";
import Command from "../../base/classes/Command";
import Category from "../../base/enums/Category";
import CustomClient from "../../base/classes/CustomClient";
import UserModeration from "../../base/schema/UserModeration";
import { buildProfileEmbed, getOrCreateThread } from "../../utils/moderationUtils";
import { EmbedBuilder } from "discord.js";

export default class Note extends Command {
    constructor(client: CustomClient) {
        super(client, {
            name: "note",
            description: "Add a note to a user's moderation form.",
            category: Category.Moderation,
            options: [
                {
                    name: "user",
                    description: "The user to add a note for.",
                    type: ApplicationCommandOptionType.User,
                    required: true,
                },
                {
                    name: "text",
                    description: "The note text to add.",
                    type: ApplicationCommandOptionType.String,
                    required: true,
                },
            ],
            default_member_permissions: PermissionFlagsBits.ModerateMembers,
            dm_permission: false,
            cooldown: 3
        });
    }

    async Execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const user = interaction.options.getUser("user", true);
        const text = interaction.options.getString("text", true);

        const guildId = interaction.guildId!;
        let doc = await UserModeration.findOne({ userId: user.id, guildId });
        if (!doc) {
            doc = new UserModeration({ userId: user.id, guildId, notes: "", warnings: {}, punishments: [] });
        }

        doc.notes = (doc.notes ? doc.notes + "\n" : "") + text;
        await doc.save();

        const { thread, profileMessage } = await getOrCreateThread(this.client, guildId, user.id);
        await profileMessage.edit({ embeds: [buildProfileEmbed(user, doc)] });

        await thread.send({
            embeds: [
                new EmbedBuilder()
                    .setColor("Blue")
                    .setDescription(`**Note Added**\nText: ${text}\nBy: ${interaction.user.tag}\nAt: ${new Date().toLocaleString()}`),
            ],
        });

        await interaction.reply({ content: `Added note to ${user.tag}: "${text}"`, ephemeral: true });
    }
}