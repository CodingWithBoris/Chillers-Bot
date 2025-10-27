// src/commands/registerUser.ts
import { ChatInputCommandInteraction, CacheType, ApplicationCommandOptionType, PermissionFlagsBits } from "discord.js";
import Command from "../../base/classes/Command";
import CustomClient from "../../base/classes/CustomClient";
import Category from "../../base/enums/Category";
import VRChatUserInfo from "../../base/schema/VRChatUserInfo";

export default class RegisterUserCommand extends Command {
    constructor(client: CustomClient) {
        super(client, {
            name: "register",
            description: "Manually register a VRChat user in the database for testing.",
            category: Category.Utilities,
            options: [
                {
                    name: "vrchat_username",
                    description: "Your VRChat display name",
                    type: ApplicationCommandOptionType.String,
                    required: true,
                },
                {
                    name: "discord_user",
                    description: "Discord user to register (defaults to yourself)",
                    type: ApplicationCommandOptionType.User,
                    required: false,
                },
            ],
            default_member_permissions: PermissionFlagsBits.Administrator, // restrict for safety
            dm_permission: false,
            cooldown: 0,
        });
    }

    async Execute(interaction: ChatInputCommandInteraction<CacheType>) {
        await interaction.deferReply({ ephemeral: true });

        const discordUser = interaction.options.getUser("discord_user") || interaction.user;
        const vrchatUsername = interaction.options.getString("vrchat_username", true);

        try {
            // Check if user already exists
            const existing = await VRChatUserInfo.findOne({ discordId: discordUser.id });
            if (existing) {
                return interaction.editReply(`This Discord user is already registered with VRChat ID: ${existing.vrchatId}`);
            }

            const newUser = new VRChatUserInfo({
                discordId: discordUser.id,
                vrchatId: `test_${Date.now()}`, // temporary VRChat ID for testing
                username: vrchatUsername,
                trustLevel: "Visitor",
                is18Plus: false,
                instances: [],
                moderation: [],
            });

            await newUser.save();

            return interaction.editReply(`Successfully registered ${discordUser.tag} as VRChat user "${vrchatUsername}"`);
        } catch (err) {
            console.error(err);
            return interaction.editReply("Failed to register user. Check console for details.");
        }
    }
}
