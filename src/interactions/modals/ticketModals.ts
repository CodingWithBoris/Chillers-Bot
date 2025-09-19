// src/interactions/modals/ticketModals.ts
import {
  ModalSubmitInteraction,
  EmbedBuilder,
  ChannelType,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import CustomClient from "../../base/classes/CustomClient";
import TicketModel from "../../base/schema/Ticket";
import { getNextTicketId, collectDepartmentRoleIds } from "../../utils/ticketUtils";

function sanitizeChannelName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 90);
}

export async function handleTicketModal(client: CustomClient, interaction: ModalSubmitInteraction) {
  try {
    // customId: ticket_modal_<type>_<userid>
    const parts = interaction.customId.split("_");
    if (parts.length < 3) return;
    const type = parts[2]; // value from select (e.g. instanceMod)
    const modalOwnerId = parts[3];
    // ensure only the owner interacts (modals are normally limited but double-check)
    if (modalOwnerId && modalOwnerId !== interaction.user.id) {
      await interaction.reply({ content: "This modal was not intended for you.", ephemeral: true });
      return;
    }

    // gather modal responses
    const fields: Record<string, string> = {};
    for (const field of interaction.fields.fields) {
      // interaction.fields is a MessageComponentInteractionFields object — we can fetch by ids
    }
    // safer to attempt known field ids depending on type
    if (type === "instanceMod") {
      fields.vrchat = interaction.fields.getTextInputValue("vrchat");
      fields.reported = interaction.fields.getTextInputValue("reported");
      fields.why = interaction.fields.getTextInputValue("why");
      try { fields.proof = interaction.fields.getTextInputValue("proof"); } catch { fields.proof = ""; }
    } else if (type === "discordMod") {
        fields.discordMember = interaction.fields.getTextInputValue("member");
        fields.why = interaction.fields.getTextInputValue("why");
        try { fields.proof = interaction.fields.getTextInputValue("proof"); } catch { fields.proof = ""; }
    } else if (type === "developer1") {
        fields.issue = interaction.fields.getTextInputValue("issue");
    }else if (type === "developer2") {
        fields.issue = interaction.fields.getTextInputValue("issue");
    } else if (type === "other") {
      fields.summary = interaction.fields.getTextInputValue("summary");
    } else if (type === "appeal") {
      fields.punishment = interaction.fields.getTextInputValue("punishment");
      fields.reason = interaction.fields.getTextInputValue("reason");
      fields.appeal = interaction.fields.getTextInputValue("appeal");
    }else {
      fields.summary = interaction.fields.getTextInputValue("summary");
      try { fields.extra = interaction.fields.getTextInputValue("extra"); } catch { fields.extra = ""; }
    }

    await interaction.deferReply({ ephemeral: true });

    // compute ticket id
    const guildId = interaction.guildId!;
    const ticketId = await getNextTicketId(guildId);

    // create channel under category in config
    const guild = interaction.guild!;
    const config = client.config;
    const categoryId = config.ticketCategoryId;
    const ticketName = `${interaction.user.username}-${ticketId}`;
    const sanitized = sanitizeChannelName(ticketName);

    const departmentRoleIds = collectDepartmentRoleIds(config);

    // permission overwrites: hide @everyone, allow creator, allow staff roles
    const overwrites = [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks] },
    ];

    for (const r of departmentRoleIds) {
      overwrites.push({ id: r, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });
    }

    // create channel
    const channel = await guild.channels.create({
      name: sanitized,
      type: ChannelType.GuildText,
      parent: categoryId,
      permissionOverwrites: overwrites,
      reason: `Ticket ${ticketId} opened by ${interaction.user.tag}`,
    });

    // save ticket to DB
    const ticketDoc = new TicketModel({
      guildId,
      ticketId,
      channelId: channel.id,
      creatorId: interaction.user.id,
      type,
      modalResponses: fields,
      status: "open",
      createdAt: new Date(),
    });
    await ticketDoc.save();

    // Build embed for top of ticket channel
    const embed = new EmbedBuilder()
      .setTitle(`Ticket ${ticketId} — ${type}`)
      .addFields(
        { name: "Opened by", value: `<@${interaction.user.id}>`, inline: true },
        { name: "Type", value: type, inline: true },
      )
      .setTimestamp();

    // add modal responses to embed fields
    for (const [k, v] of Object.entries(fields)) {
      if (v && v.length > 0) {
        embed.addFields({ name: k.charAt(0).toUpperCase() + k.slice(1), value: v.length > 1024 ? `${v.slice(0, 1021)}...` : v, inline: false });
      }
    }

    // buttons: claim, close, close with reason
    const claim = new ButtonBuilder().setCustomId(`ticket_claim_${ticketId}`).setLabel("Claim").setStyle(ButtonStyle.Success);
    const close = new ButtonBuilder().setCustomId(`ticket_close_${ticketId}`).setLabel("Close").setStyle(ButtonStyle.Danger);
    const closeReason = new ButtonBuilder().setCustomId(`ticket_close_reason_${ticketId}`).setLabel("Close w/ Reason").setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(claim, close, closeReason);

    await channel.send({ content: `Ticket created by <@${interaction.user.id}>`, embeds: [embed], components: [row] });

    await interaction.editReply({ content: `✅ Ticket created: ${channel}` });
  } catch (e) {
    console.error("[TICKET MODAL] Error:", e);
    try { await interaction.editReply({ content: "An error occurred while creating the ticket." }); } catch {}
  }
}
