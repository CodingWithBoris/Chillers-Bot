// src/events/client/TicketPanelPoster.ts
import Event from "../../base/classes/Event";
import { Events, ActionRowBuilder, StringSelectMenuBuilder, TextChannel, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, MessageFlagsBitField, MediaGalleryBuilder, MediaGalleryItemBuilder } from "discord.js";
import CustomClient from "../../base/classes/CustomClient";

export default class TicketPanelPoster extends Event {
  constructor(client: CustomClient) {
    super(client, {
      name: Events.ClientReady,
      description: "Posts the ticket select panel to the support channel (separate from Ready.ts).",
      once: true,
    });
  }

  public async Execute() {
    try {
      const client = this.client as CustomClient;
      const cfg = client.config;

      const supportChannelId = cfg.supportChannelId;
      if (!supportChannelId) {
        console.warn("[TicketPanelPoster] supportChannelId not set in config — skipping ticket panel post.");
        return;
      }

      const guild = await client.guilds.fetch(cfg.guildId).catch(() => null);
      if (!guild) {
        console.warn("[TicketPanelPoster] Could not fetch guild — skipping ticket panel post.");
        return;
      }

      const chan = await guild.channels.fetch(supportChannelId);
      if (!chan) {
        console.warn(`[TicketPanelPoster] Support channel ${supportChannelId} not found — skipping ticket panel post.`);
        return;
      }

      if (!chan.isTextBased()) {
        console.warn(`[TicketPanelPoster] Support channel ${supportChannelId} is not a text channel — skipping ticket panel post.`);
        return;
      }

      const textChan = chan as TextChannel;

      // Look through recent messages for an existing ticket_select component
      const recent = await textChan.messages.fetch({ limit: 100 }).catch(() => null);
      if (recent && recent.size) {
        for (const m of recent.values()) {
          if (!m.components || m.components.length === 0) continue;
          // Inspect each row and each component for customId "ticket_select"
          const hasTicketSelect = m.components.some(row =>
            // @ts-ignore - components types in runtime
            (row.components as any[]).some(c => c?.customId === "ticket_select")
          );
          if (hasTicketSelect) {
            console.log("[TicketPanelPoster] Found existing ticket panel in support channel — not reposting.");
            return;
          }
        }
      }

      // Build the ticket select menu
      const select = new StringSelectMenuBuilder()
        .setCustomId("ticket_select")
        .setPlaceholder("Select a reason to open a ticket")
        .addOptions(
          { label: "Reporting a player?", value: "instanceMod", description: "Report an incident in VRChat/instance" },
          { label: "Reporting a member?", value: "discordMod", description: "Moderation issue in Discord" },
          { label: "Bot issue", value: "developer1", description: "The bot died or something went wrong" },
          { label: "Discord issue", value: "developer2", description: "Something went wrong on discord itself" },
          { label: "Appeal a punishment", value: "appeal", description: "Ban, mute, or warning appeal" },
          { label: "Other", value: "other", description: "Something else" }
        );
      const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);

      const ticketTitle = new TextDisplayBuilder().setContent("# Ticket Support")
      const ticketDescription = new TextDisplayBuilder().setContent("Welcome to our custom ticket support! If you need assistance, please select the appropriate reason from the dropdown menu below to open a ticket. Our support team will be with you shortly.");
      const ticketBanner = new MediaGalleryItemBuilder().setURL("https://cdn.discordapp.com/attachments/1416070724015362139/1416368377282166784/Support_Tickets_2.png?ex=68c69757&is=68c545d7&hm=fcd0f7a7a4e15cee0ca24bd1522d069660a7e86d224becbba78a88e0ea431a88&").setDescription("Support Tickets");
      const headerImage = new MediaGalleryBuilder().addItems(ticketBanner)
      const separator = new SeparatorBuilder().setDivider(true).setSpacing(1);
      const bigseparator = new SeparatorBuilder().setDivider(true).setSpacing(2);

      const v2Flag = MessageFlagsBitField.Flags.IsComponentsV2;

      const TicketContainer = new ContainerBuilder()
      .addMediaGalleryComponents(headerImage)
      .addSeparatorComponents(bigseparator)
      .addTextDisplayComponents(ticketTitle)
      .addTextDisplayComponents(ticketDescription)
      .addSeparatorComponents(separator)
      .addActionRowComponents(row);

      await textChan.send({
        flags: v2Flag,
        components: [TicketContainer],
      });

      console.log("[TicketPanelPoster] Ticket panel posted to support channel.");
    } catch (err) {
      console.error("[TicketPanelPoster] Error while attempting to post ticket panel:", err);
    }
  }
}
