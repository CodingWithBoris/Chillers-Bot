// src/interactions/modals/ticketCloseReasonModal.ts
import { 
  ModalSubmitInteraction,
  MessageFlags,
  ContainerBuilder,
  TextDisplayBuilder,
  FileBuilder,
  AttachmentBuilder
} from "discord.js";
import CustomClient from "../../base/classes/CustomClient";
import TicketModel from "../../base/schema/Ticket";
import { fetchAllMessages, createTranscriptFile } from "../../utils/ticketUtils";
import fs from "fs";
import path from "path";

export async function handleTicketCloseReasonModal(client: CustomClient, interaction: ModalSubmitInteraction) {
  try {
    // customId: ticket_close_reason_modal_<ticketId>_<closerId>
    const parts = interaction.customId.split("_");
    // Expect parts like ["ticket","close","reason","modal","<ticketId>","<closerId>"]
    if (parts.length < 6) {
      await interaction.reply({ content: "Malformed modal ID.", ephemeral: true });
      return;
    }

    const ticketId = parseInt(parts[4], 10);
    const closerId = parts[5];
    if (String(interaction.user.id) !== String(closerId)) {
      await interaction.reply({ content: "This modal is not for you.", ephemeral: true });
      return;
    }

    const reason = interaction.fields.getTextInputValue("close_reason");
    await interaction.deferReply({ ephemeral: true });

    const ticket = await TicketModel.findOne({ guildId: interaction.guildId, ticketId });
    if (!ticket) {
      await interaction.editReply({ content: "Ticket not found in DB." });
      return;
    }

    // save close reason and mark closed
    ticket.closeReason = reason;
    ticket.status = "closed";
    ticket.closedAt = new Date();
    await ticket.save();

    // get channel (the modal is submitted from the channel)
    const channel = interaction.channel;
    if (!channel) {
      await interaction.editReply({ content: "Channel not available." });
      return;
    }

    // fetch all messages and create transcript
    const allMessages = await fetchAllMessages(channel);
    const filepath = await createTranscriptFile(allMessages);

    if (!filepath) {
      console.error("[TICKET CLOSE REASON] createTranscriptFile returned no path.");
      await interaction.editReply({ content: "Failed to create transcript file." });
      return;
    }

    // Build display components
    const ticketCloseWithReasonTitle = new TextDisplayBuilder()
      .setContent(`# Ticket ${ticketId} Closed`);
    const ticketCloseWithReasonDescription = new TextDisplayBuilder()
      .setContent(
        `The ticket has been closed with a reason by <@${interaction.user.id}>.\n` +
        `## Ticket Information\n` +
        `• **Type:** ${ticket.type}(#${ticketId})\n` +
        `• **Close Reason:** ${reason}\n` +
        `• **Opened by:** <@${ticket.creatorId}>\n` +
        `• **Opened at:** <t:${Math.floor(ticket.createdAt.getTime() / 1000)}:F>`
      );

    // container for components (we will add a File component as well)
    const ticketCloseWithReasonContainer = new ContainerBuilder()
      .addTextDisplayComponents(ticketCloseWithReasonTitle)
      .addTextDisplayComponents(ticketCloseWithReasonDescription);

    // send transcript + embed to transcription channel if configured
    const tChanId = client.config.transcriptionChannelId;
    if (tChanId) {
      try {
        const tChan = await interaction.guild?.channels.fetch(tChanId);
        if (tChan && tChan.isTextBased()) {
          // ensure the file is read and named correctly
          const filename = path.basename(filepath); // must match attachment://<filename>
          // Create an AttachmentBuilder for the file (using a stream/read)
          const attachment = new AttachmentBuilder(fs.createReadStream(filepath), { name: filename });

          // Add a File component that references the uploaded attachment via attachment://<name>
          const fileComponent = new FileBuilder()
            .setURL(`attachment://${filename}`);

          ticketCloseWithReasonContainer.addFileComponents(fileComponent);

          // Send the message — note: when using Components V2 you must pass the IsComponentsV2 flag
          await (tChan as any).send({
            flags: MessageFlags.IsComponentsV2,
            components: [ticketCloseWithReasonContainer],
            files: [attachment],
          });
        } else {
          console.warn("[TICKET CLOSE REASON] transcription channel is not text based or not found.");
        }
      } catch (sendErr) {
        console.error("[TICKET CLOSE REASON] failed to send transcript:", sendErr);
      }
    }

    // delete the channel
    try {
      await channel.delete(`Ticket ${ticketId} closed with reason by ${interaction.user.tag}`);
    } catch (delErr) {
      console.error("[TICKET CLOSE REASON] failed to delete channel:", delErr);
    }

    // remove temporary file if it exists
    try { if (filepath && fs.existsSync(filepath)) fs.unlinkSync(filepath); } catch (unlinkErr) { console.warn(unlinkErr); }

    await interaction.editReply({ content: `Ticket #${ticketId} closed and transcript uploaded.` });
  } catch (err) {
    console.error("[TICKET CLOSE REASON] Unexpected error:", err);
    try { await interaction.reply({ content: "An unexpected error occurred while closing the ticket.", ephemeral: true }); } catch {}
  }
}
