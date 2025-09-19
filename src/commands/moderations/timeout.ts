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

    const timeout = doc.punishments.find(
      (p) => p.type === "timeout" && !p.duration
    );
    if (timeout) {
      await interaction.reply({
        content: `❌ User is already timed out.`,
        ephemeral: true,
      });
      return;
    } else {
      doc.punishments.push({
        type: "timeout",
        reason,
        modId: interaction.user.id,
        date: now,
      });
    }

    await doc.save();

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

    const logChannelIds =
      this.client.config.Moderation.Channels?.punishmentLogs;
    const plainLog = `# ⏱️ **User Timed Out**
User: ${user.tag} (${user.id})
By: ${interaction.user.tag} (${interaction.user.id})
Reason: ${reason}
Duration: ${durationStr}
At: <t:${unixTimestamp}:F> (<t:${unixTimestamp}:R>)`;

    if (logChannelIds) {
      if (Array.isArray(logChannelIds)) {
        for (const channelId of logChannelIds) {
          try {
            const ch = await interaction.guild?.channels.fetch(channelId);
            if (ch?.isTextBased())
              await (ch as any).send({ content: plainLog });
          } catch (e) {
            console.error(
              `[WARN LOG :3] Failed to log warning to ${channelId}:`,
              e
            );
          }
        }
      } else {
        try {
          const ch = await interaction.guild?.channels.fetch(logChannelIds);
          if (ch?.isTextBased()) await (ch as any).send({ content: plainLog });
        } catch (e) {
          console.error("[WARN LOG :3] Failed to log warning:", e);
        }
      }
    }

    try {
        await user.send(`⚠️ You were timed out in **${interaction.guild?.name}** for ${durationStr} for: ${reason}.`);
    } catch {}

    await interaction.reply({
      content: `✅ Successfully timed out ${user.tag} for ${durationStr}.`,
      ephemeral: true,
    });
  }
}
