// src/interactions/buttons/ticketButtons.ts
import {
  ButtonInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  FileBuilder,
  AttachmentBuilder,
  MessageFlags,
} from "discord.js";
import CustomClient from "../../base/classes/CustomClient";
import TicketModel from "../../base/schema/Ticket";
import { fetchAllMessages, createTranscriptFile } from "../../utils/ticketUtils";
import fs from "fs";
import path from "path";

/**
 * Collect all department role IDs from config.Departments (top-level and nested)
 */
function collectDeptIds(cfg: any): string[] {
  const ids: string[] = [];
  if (!cfg?.Departments) return ids;
  for (const [k, v] of Object.entries(cfg.Departments)) {
    if (typeof v === "string") ids.push(v);
    else if (typeof v === "object" && v !== null) {
      for (const sub of Object.values(v)) if (typeof sub === "string") ids.push(sub);
    }
  }
  return Array.from(new Set(ids));
}

/**
 * Check if the interaction member has any role present in the Departments config
 */
function staffCheck(interaction: ButtonInteraction, cfg: any): boolean {
  try {
    const deptIds = collectDeptIds(cfg);
    if (!interaction.member || !("roles" in (interaction.member as any))) return false;
    for (const r of deptIds) {
      if ((interaction.member as any).roles.cache.has(String(r))) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Handle ticket-related button interactions.
 * This function resolves to void (Promise<void>) — it awaits replies/showModal/etc and then returns.
 */
export async function handleTicketButton(client: CustomClient, interaction: ButtonInteraction): Promise<void> {
  try {
    const id = interaction.customId;
    const cfg = client.config;

    // -------------------------
    // CLAIM
    // -------------------------
    if (id.startsWith("ticket_claim_")) {
      if (!staffCheck(interaction, cfg)) {
        await interaction.reply({ content: "You don't have permission to claim this ticket.", flags: 64 });
        return;
      }

      const ticketId = parseInt(id.split("_").pop() || "-1", 10);
      const doc = await TicketModel.findOne({ guildId: interaction.guildId, ticketId });
      if (!doc) {
        await interaction.reply({ content: "Ticket not found in DB.", flags: 64 });
        return;
      }

      doc.claimedBy = interaction.user.id;
      await doc.save();

      // edit the first bot message embed in the channel to show claimed by
      const msgs = await interaction.channel?.messages.fetch({ limit: 50 });
      const botMsg = msgs?.find(m => m.author?.id === client.user?.id && m.embeds.length);
      if (botMsg) {
        try {
          const newEmbed = EmbedBuilder.from(botMsg.embeds[0]).setFooter({ text: `Claimed by ${interaction.user.tag}` });
          await botMsg.edit({ embeds: [newEmbed] }).catch(() => {});
        } catch {}
      }

      await interaction.reply({ content: `Ticket #${ticketId} claimed by <@${interaction.user.id}>.`, flags: 64 });
      return;
    }

    // -------------------------
    // CLOSE WITH REASON -> show modal
    // customId: ticket_close_reason_<ticketId>
    // -------------------------
    if (id.startsWith("ticket_close_reason_")) {
      if (!staffCheck(interaction, cfg)) {
        await interaction.reply({ content: "You don't have permission to close this ticket.", flags: 64 });
        return;
      }

      const parts = id.split("_");
      const ticketId = parts[3]; // ticket_close_reason_<ticketId>
      const modal = new ModalBuilder()
        .setCustomId(`ticket_close_reason_modal_${ticketId}_${interaction.user.id}`)
        .setTitle("Close Ticket — Reason");

      const reasonInput = new TextInputBuilder()
        .setCustomId("close_reason")
        .setLabel("Reason for closing this ticket")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput));
      await interaction.showModal(modal);
      return;
    }

    // -------------------------
    // CLOSE -> ask ephemeral confirm (Yes -> transcript, No -> just close)
    // customId: ticket_close_<ticketId>
    // -------------------------
    if (id.startsWith("ticket_close_")) {
      if (!staffCheck(interaction, cfg)) {
        await interaction.reply({ content: "You don't have permission to close this ticket.", flags: 64 });
        return;
      }

      const parts = id.split("_");
      // id could be "ticket_close_<ticketId>"
      const ticketId = parts[2] ?? parts[3] ?? "unknown";
      const yes = new ButtonBuilder()
        .setCustomId(`ticket_confirm_close_yes_${ticketId}_${interaction.user.id}`)
        .setLabel("Yes - Transcript")
        .setStyle(ButtonStyle.Primary);
      const no = new ButtonBuilder()
        .setCustomId(`ticket_confirm_close_no_${ticketId}_${interaction.user.id}`)
        .setLabel("No - Just Close")
        .setStyle(ButtonStyle.Secondary);
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(yes, no);

      await interaction.reply({ content: "Do you want a transcript of this ticket?", components: [row], flags: 64 });
      return;
    }

    // -------------------------
    // CONFIRM CLOSE (yes/no)
    // customId: ticket_confirm_close_yes_<ticketId>_<closerId>
    // or      ticket_confirm_close_no_<ticketId>_<closerId>
    // -------------------------
    if (id.startsWith("ticket_confirm_close_yes_") || id.startsWith("ticket_confirm_close_no_")) {
      const parts = id.split("_");
      // Expect: ["ticket","confirm","close","yes","<ticketId>","<closerId>"]
      if (parts.length < 6) {
        await interaction.reply({ content: "Malformed confirmation ID.", flags: 64 });
        return;
      }

      const mode = parts[3]; // "yes" or "no"
      const ticketId = parseInt(parts[4], 10);
      const closerId = parts[5];
      if (String(interaction.user.id) !== String(closerId)) {
        await interaction.reply({ content: "This confirmation is not for you.", flags: 64 });
        return;
      }

      // Defer ephemeral reply
      await interaction.deferReply({ flags: 64 });

      const ticket = await TicketModel.findOne({ guildId: interaction.guildId, ticketId });
      if (!ticket) {
        await interaction.editReply({ content: "Ticket record not found." });
        return;
      }

      const channel = interaction.channel;
      if (!channel) {
        await interaction.editReply({ content: "Channel not found."});
        return;
      }

      const wantTranscript = mode === "yes";
      let filepath: string | null = null;

      try {
        if (wantTranscript) {
          const allMessages = await fetchAllMessages(channel);
          filepath = await createTranscriptFile(allMessages);
        }

        // send as Components V2 TextDisplay + optional file component
        const transcriptionChannelId = client.config.transcriptionChannelId;
        if (transcriptionChannelId) {
          try {
            const tChan = await interaction.guild?.channels.fetch(transcriptionChannelId);
            if (tChan && tChan.isTextBased()) {
              // Title display
              const titleDisplay = new TextDisplayBuilder()
                .setContent(`# Ticket ${ticketId} closed`);

              // closedAt timestamp - use ticket.closedAt if available, else now
              const closedAtTs = ticket.closedAt ? Math.floor(ticket.closedAt.getTime() / 1000) : Math.floor(Date.now() / 1000);

              // Body display (markdown-like)
              let body = `**Ticket:** ${ticket.type} (#${ticketId})\n` +
                         `**Opened by:** <@${ticket.creatorId}>\n` +
                         `**Closed by:** <@${interaction.user.id}>\n` +
                         `\n` +
                         `**Closed at:** <t:${closedAtTs}:F>\n`;

              if (ticket.closeReason) {
                body += `\n**Close Reason:**\n${ticket.closeReason}\n`;
              }

              const bodyDisplay = new TextDisplayBuilder().setContent(body);

              // Container for the TextDisplays (and file component if present)
              const container = new ContainerBuilder()
                .addTextDisplayComponents(titleDisplay)
                .addTextDisplayComponents(bodyDisplay);

              if (filepath) {
                const filename = path.basename(filepath);
                const attachment = new AttachmentBuilder(fs.createReadStream(filepath), { name: filename });

                const fileComponent = new FileBuilder()
                  .setURL(`attachment://${filename}`);

                container.addFileComponents(fileComponent);

                await (tChan as any).send({
                  components: [container],
                  files: [attachment],
                  flags: MessageFlags.IsComponentsV2,
                });
              } else {
                // No transcript requested — still send V2 components (no files)
                await (tChan as any).send({
                  components: [container],
                  flags: MessageFlags.IsComponentsV2,
                });
              }
            }
          } catch (e) {
            console.error("[TICKET CLOSE] error sending transcript:", e);
          }
        }

        // mark closed
        ticket.status = "closed";
        ticket.closedAt = new Date();
        await ticket.save();

        // delete channel
        try {
          await channel.delete(`Ticket ${ticketId} closed by ${interaction.user.tag}`);
        } catch (e) {
          console.error("[TICKET CLOSE] failed to delete channel:", e);
        }

        // cleanup file
        try {
          if (filepath && fs.existsSync(filepath)) fs.unlinkSync(filepath);
        } catch {}

        await interaction.editReply({ content: `Ticket #${ticketId} closed.` });
        return;
      } catch (err) {
        console.error("[TICKET CLOSE] Unexpected error:", err);
        try {
          if (filepath && fs.existsSync(filepath)) fs.unlinkSync(filepath);
        } catch {}
        await interaction.editReply({ content: "An error occurred while closing the ticket." });
        return;
      }
    }

    // -------------------------
    // unknown button
    // -------------------------
    await interaction.reply({ content: "Unknown ticket action.", flags: 64 });
    return;
  } catch (err) {
    console.error("[TICKET BUTTON] Uncaught error:", err);
    try {
      await interaction.reply({ content: "An unexpected error occurred handling the button.", flags: 64 });
    } catch {}
    return;
  }
}
