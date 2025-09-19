import {
  ApplicationCommandOptionType,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
} from "discord.js";
import Command from "../../base/classes/Command";
import Category from "../../base/enums/Category";
import CustomClient from "../../base/classes/CustomClient";
import UserModeration, { IWarning } from "../../base/schema/UserModeration";
import {
  buildProfileEmbed,
  getOrCreateThread,
} from "../../utils/moderationUtils";
import { EmbedBuilder } from "discord.js";

export default class Warn extends Command {
  constructor(client: CustomClient) {
    super(client, {
      name: "warn",
      description: "Warn a user for a specific reason.",
      category: Category.Moderation,
      options: [
        {
          name: "user",
          description: "The user to warn.",
          type: ApplicationCommandOptionType.User,
          required: true,
        },
        {
          name: "reason",
          description: "The reason for the warning (predefined options).",
          type: ApplicationCommandOptionType.String,
          required: true,
          choices: client.config.warningReasons.map((r) => ({
            name: r,
            value: r,
          })),
        },
        {
          name: "proof",
          description: "Proof or additional details for the warning.",
          type: ApplicationCommandOptionType.String,
          required: true,
        },
      ],
      default_member_permissions: PermissionFlagsBits.ModerateMembers,
      dm_permission: false,
      cooldown: 3,
    });
  }

  async Execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const user = interaction.options.getUser("user", true);
    const reason = interaction.options.getString("reason", true);
    const proof = interaction.options.getString("proof", true);

    if (user.id === interaction.user.id) {
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("❌ You cannot warn yourself."),
        ],
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
        warnings: new Map(),
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

    await doc.save();

    // Update profile message if present
    const { thread, profileMessage } = await getOrCreateThread(
      this.client,
      guildId,
      user.id
    );
    if (profileMessage)
      await profileMessage.edit({ embeds: [buildProfileEmbed(user, doc)] });

    // Thread embed with unix timestamp
    const unixTimestamp = Math.floor(now.getTime() / 1000);
    const embed = new EmbedBuilder()
      .setColor("Yellow")
      .setTitle("Warning Added")
      .setDescription(
        `**Reason:** ${reason}\n**Proof:** ${proof}\n**By:** ${interaction.user.tag}\nAt: <t:${unixTimestamp}:F> (<t:${unixTimestamp}:R>)`
      );

    await thread.send({ embeds: [embed] });

    // Log to punishment channels (supports array)
    const logChannelIds =
      this.client.config.Moderation.Channels?.punishmentLogs;
    const plainLog = `# ⚠️ **Warning Issued**
User: ${user.tag} (${user.id})
By: ${interaction.user.tag}
Reason: **${reason}**
Proof: ${proof}
At: <t:${unixTimestamp}:F>`;

    if (logChannelIds) {
      if (Array.isArray(logChannelIds)) {
        for (const channelId of logChannelIds) {
          try {
            const ch = await interaction.guild?.channels.fetch(channelId);
            if (ch?.isTextBased())
              await (ch as any).send({ content: plainLog });
          } catch (e) {
            console.error(
              `[WARN LOG] Failed to log warning to ${channelId}:`,
              e
            );
          }
        }
      } else {
        try {
          const ch = await interaction.guild?.channels.fetch(logChannelIds);
          if (ch?.isTextBased()) await (ch as any).send({ content: plainLog });
        } catch (e) {
          console.error("[WARN LOG] Failed to log warning:", e);
        }
      }
    }

    // DM warned user
    try {
      await user.send(
        `⚠️ You were warned in **${interaction.guild?.name}** for: ${reason}. Proof: ${proof}`
      );
    } catch {
      // ignore DM fail
    }

    await interaction.reply({
      content: `Warned ${user.tag} for "${reason}". Proof: ${proof}`,
      ephemeral: true,
    });
  }
}
