import {
  ModalSubmitInteraction,
  EmbedBuilder,
} from "discord.js";
import CustomClient from "../../base/classes/CustomClient";
import UserModeration from "../../base/schema/UserModeration";
import { getOrCreateThread, parseDuration } from "../../utils/moderationUtils";

async function safeRespond(interaction: ModalSubmitInteraction, content: string, ephemeral = true) {
  try {
    if (interaction.replied) return interaction.followUp({ content, ephemeral });
    if (interaction.deferred) return interaction.editReply({ content });
    return interaction.reply({ content, ephemeral });
  } catch {
    // swallow error
  }
}

export async function handleModerationModal(client: CustomClient, interaction: ModalSubmitInteraction) {
  await interaction.deferReply({ ephemeral: true }).catch(() => {});

  const [_, action, userId] = interaction.customId.split("_");
  let reason: string;
  try {
    reason = interaction.fields.getTextInputValue("reason");
  } catch {
    await safeRespond(interaction, "Required field `reason` missing.", true);
    return;
  }

  let durationStr: string | undefined;
  try {
    durationStr = interaction.fields.getTextInputValue("duration") || undefined;
  } catch {
    durationStr = undefined;
  }

  let durationMs: number | null | undefined = undefined;
  if (durationStr) {
    durationMs = parseDuration(durationStr);
    if (durationMs === null) {
      await safeRespond(interaction, "Invalid duration format.", true);
      return;
    }
  }

  const guild = interaction.guild!;
  let member;
  try {
    member = await guild.members.fetch(userId);
  } catch {
    member = undefined;
  }
  const user = member?.user || await client.users.fetch(userId);

  let success = false;
  let errorMsg = "";

  try {
    switch (action) {
      case "mute":
        if (!member || !client.config.muteRoleId) throw new Error("Member not found or mute role missing.");
        await member.roles.add(client.config.muteRoleId, reason);
        if (durationMs) {
          setTimeout(async () => {
            try {
              const stillMember = await guild.members.fetch(userId);
              await stillMember.roles.remove(client.config.muteRoleId, "Mute expired");
            } catch {}
          }, durationMs);
        }
        success = true;
        break;

      case "timeout":
        if (!member) throw new Error("Member not found.");
        if (!durationMs) throw new Error("Timeout requires a duration.");
        await member.timeout(durationMs, reason);
        success = true;
        break;

      case "kick":
        if (!member) throw new Error("Member not found.");
        await member.kick(reason);
        success = true;
        break;

      case "ban":
        await guild.bans.create(userId, { reason });
        if (durationMs) {
          setTimeout(async () => {
            try {
              await guild.bans.remove(userId, "Ban expired");
            } catch {}
          }, durationMs);
        }
        success = true;
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  } catch (err: any) {
    errorMsg = err.message ?? String(err);
  }

  if (!success) {
    await safeRespond(interaction, `Failed to apply ${action}: ${errorMsg}`, true);
    return;
  }

  const now = new Date();

  try {
    const doc = await UserModeration.findOne({ userId, guildId: guild.id });
    if (doc) {
      doc.punishments.push({
        type: action,
        reason,
        duration: durationStr,
        modId: interaction.user.id,
        date: now,
      });
      await doc.save();
    }
  } catch (dbErr) {
    console.error("[MOD] DB save failed:", dbErr);
  }

  const unix = Math.floor(now.getTime() / 1000);
  const { thread } = await getOrCreateThread(client, guild.id, userId);
  const embed = new EmbedBuilder()
    .setColor("Red")
    .setTitle(`${action.toUpperCase()} applied`)
    .setDescription(
      `**Reason:** ${reason}\n**Duration:** ${durationStr || "Permanent"}\n**By:** ${interaction.user.tag}\nAt: <t:${unix}:F> (<t:${unix}:R>)`
    );

  await thread.send({ embeds: [embed] }).catch(() => {});

  await safeRespond(interaction, `${action} applied to ${user.username}.`, true);

  // best effort DM
  try {
    await user.send(`You received a **${action.toUpperCase()}** in **${guild.name}** for: ${reason}. Duration: ${durationStr || "Permanent"}`);
  } catch {}
}
