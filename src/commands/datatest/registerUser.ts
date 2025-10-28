// src/commands/registerUser.ts
import {
  ChatInputCommandInteraction,
  CacheType,
  ApplicationCommandOptionType,
  PermissionFlagsBits,
} from "discord.js";
import Command from "../../base/classes/Command";
import CustomClient from "../../base/classes/CustomClient";
import Category from "../../base/enums/Category";
import VRChatUserInfo from "../../base/schema/VRChatUserInfo";
import { vrchatClient } from "../../utils/vrchatClient";

export default class RegisterUserCommand extends Command {
  constructor(client: CustomClient) {
    super(client, {
      name: "register",
      description: "Register a VRChat user by username and link them to a Discord account.",
      category: Category.Utilities,
      options: [
        {
          name: "vrchat_username",
          description: "The VRChat display name (case-sensitive)",
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
      default_member_permissions: PermissionFlagsBits.Administrator,
      dm_permission: false,
      cooldown: 0,
    });
  }

  async Execute(interaction: ChatInputCommandInteraction<CacheType>) {
    await interaction.deferReply({ ephemeral: true });

    const discordUser = interaction.options.getUser("discord_user") || interaction.user;
    const vrchatUsername = interaction.options.getString("vrchat_username", true);

    try {
      // Check if the Discord user is already registered
      const existing = await VRChatUserInfo.findOne({ discordId: discordUser.id });
      if (existing) {
        return interaction.editReply(
          `⚠️ ${discordUser.tag} is already registered with VRChat ID: \`${existing.vrchatId}\`.`
        );
      }

      // Search VRChat users by display name
      const searchRes = await vrchatClient.get(`/users?search=${encodeURIComponent(vrchatUsername)}&n=1`);
      const users = searchRes?.data ?? searchRes ?? [];
      if (!Array.isArray(users) || users.length === 0) {
        return interaction.editReply(`❌ No VRChat user found with the name **${vrchatUsername}**.`);
      }

      // Pick the first result (VRChat usernames are unique enough)
      const userData = users[0];
      const vrchatId = userData.id;
      const displayName = userData.displayName;
      const trustLevel = userData.tags?.find((tag: string) =>
        tag.startsWith("system_trust")
      )?.replace("system_trust_", "") || "Unknown";
      const is18Plus = Boolean(userData.tags?.includes("system_age_verified"));

      // Save new VRChat user info
      const newUser = new VRChatUserInfo({
        discordId: discordUser.id,
        vrchatId,
        username: displayName,
        trustLevel,
        is18Plus,
        instances: [],
        moderation: [],
      });

      await newUser.save();

      return interaction.editReply(
        `✅ Registered **${discordUser.tag}** as VRChat user **${displayName}**\n` +
          `🆔 VRChat ID: \`${vrchatId}\`\n` +
          `🛡️ Trust Level: **${trustLevel}**\n` +
          `🔞 18+ Verified: **${is18Plus ? "Yes" : "No"}**`
      );
    } catch (err: any) {
      console.error("[RegisterUser] Error:", err);
      return interaction.editReply(`❌ Failed to register. Error: ${err.message || err}`);
    }
  }
}
