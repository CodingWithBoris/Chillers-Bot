import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  ApplicationCommandOptionType,
  PermissionFlagsBits,
} from "discord.js";
import Command from "../../base/classes/Command";
import Category from "../../base/enums/Category";
import CustomClient from "../../base/classes/CustomClient";
import { vrchatClient } from "../../utils/vrchatClient";

export default class VRChatLookup extends Command {
  constructor(client: CustomClient) {
    super(client, {
      name: "vrchat",
      description: "VRChat tools",
      category: Category.Utilities,
      options: [
        {
          name: "lookup",
          description: "Find a user in VRChat",
          type: ApplicationCommandOptionType.Subcommand,
          options: [
            {
              name: "username",
              description: "VRChat username or display name",
              type: ApplicationCommandOptionType.String,
              required: true,
            },
          ],
        },
      ],
      default_member_permissions: PermissionFlagsBits.SendMessages,
      dm_permission: true,
      cooldown: 3,
    });
  }

  async Execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const sub = interaction.options.getSubcommand();
    if (sub !== "lookup") return;

    const username = interaction.options.getString("username", true);
    await interaction.deferReply();

    try {
      const loggedIn = await vrchatClient.loginWithCookies();
      if (!loggedIn) {
        await interaction.editReply(
          "❌ Failed to authenticate with VRChat API. Check your cookies."
        );
        return;
      }

      const results = await vrchatClient.get(
        `/users?search=${encodeURIComponent(username)}`
      );

      if (!results || results.length === 0) {
        await interaction.editReply(
          `⚠ No VRChat users found matching **${username}**.`
        );
        return;
      }

      const user = results[0];
      const embed = new EmbedBuilder()
        .setTitle(`${user.displayName}`)
        .setURL(`https://vrchat.com/home/user/${user.id}`)
        .setThumbnail(
          user.currentAvatarImageUrl || user.currentAvatarThumbnailImageUrl
        )
        .setDescription(user.bio || "*No description set.*")
        .addFields(
          {
            name: "Username",
            value: user.username || "Unknown",
            inline: true,
          },
          {
            name: "Trust Level",
            value:
              user.tags?.find((t: string) =>
                t.startsWith("system_trust_")
              )?.replace("system_trust_", "") || "Unknown",
            inline: true,
          },
          {
            name: "Status",
            value: user.status || "Offline",
            inline: true,
          },
          {
            name: "User ID",
            value: user.id || "N/A",
          }
        )
        .setColor(0x00aaff)
        .setFooter({ text: "VRChat Lookup • Data via VRChat API" })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (err: any) {
      console.error(err);
      await interaction.editReply(`❌ Error fetching VRChat user: ${err.message}`);
    }
  }
}
