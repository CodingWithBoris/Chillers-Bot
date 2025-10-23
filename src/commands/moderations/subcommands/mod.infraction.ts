import {
  ChatInputCommandInteraction,
  ButtonBuilder,
  ActionRowBuilder,
  ButtonStyle,
  SeparatorBuilder,
  SectionBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  MessageFlagsBitField,
} from "discord.js";
import { ThumbnailBuilder } from "@discordjs/builders";

import SubCommand from "../../../base/classes/SubCommand";
import CustomClient from "../../../base/classes/CustomClient";
import UserModeration from "../../../base/schema/UserModeration";

export default class ModInfraction extends SubCommand {
  constructor(client: CustomClient) {
    super(client, { name: "mod.infraction" });
  }

  async Execute(interaction: ChatInputCommandInteraction) {
    const user = interaction.options.getUser("user", true);
    const guildId = interaction.guildId!;

    await interaction.deferReply({ ephemeral: true });

    // Fetch user moderation record
    const doc = await UserModeration.findOne({ userId: user.id, guildId });
    if (!doc) {
      await interaction.editReply({
        content: `✅ No moderation record found for **${user.tag}**.`,
      });
      return;
    }

    // ----- WARNINGS -----
    const warningEntries = Array.from(doc.warnings.entries());
    const warningsFormatted =
      warningEntries.length > 0
        ? warningEntries
            .map(([rule, info]) => {
              const dates = info.dates
                .map((d) => `<t:${Math.floor(d.getTime() / 1000)}:R>`)
                .join(", ");
              return `**${rule}** — ${info.count}x\nMods: ${info.mods
                .map((id) => `<@${id}>`)
                .join(", ")}\nDates: ${dates}`;
            })
            .join("\n\n")
        : "None";

    // ----- PUNISHMENTS -----
    const punishmentsFormatted =
      doc.punishments.length > 0
        ? doc.punishments
            .map(
              (p) =>
                `**${p.type.toUpperCase()}** — ${p.reason}\nDuration: ${
                  p.duration || "Permanent"
                }\nBy: <@${p.modId}> on <t:${Math.floor(
                  p.date.getTime() / 1000
                )}:F>`
            )
            .join("\n\n")
        : "None";

    // ----- NOTES -----
    const notesFormatted = doc.notes?.trim() || "No notes available.";

    // ----- COMPONENTS V2 UI BUILD -----

    // Header Section
    const headerText = new TextDisplayBuilder().setContent(
      `# 🧾 User Infraction Report\n### ${user.tag} (${user.id})`
    );
    const avatar = new ThumbnailBuilder().setURL(user.displayAvatarURL());

    const headerSection = new SectionBuilder()
      .addTextDisplayComponents(headerText)
      .setThumbnailAccessory(avatar);

    // Warnings Section
    const warningsText = new TextDisplayBuilder().setContent(
      `## ⚠️ Warnings\n${warningsFormatted}`
    );

    // Punishments Section
    const punishmentsText = new TextDisplayBuilder().setContent(
      `## ⛔ Punishments\n${punishmentsFormatted}`
    );

    // Notes Section
    const notesText = new TextDisplayBuilder().setContent(
      `## 📝 Notes\n${notesFormatted}`
    );

    // Separators
    const divider = new SeparatorBuilder().setDivider(true).setSpacing(1);
    const largeDivider = new SeparatorBuilder().setDivider(true).setSpacing(2);

    // Container (final message)
    const container = new ContainerBuilder()
    .addSectionComponents(headerSection)
    .addSeparatorComponents(largeDivider)
    .addTextDisplayComponents(warningsText)
    .addSeparatorComponents(divider)
    .addTextDisplayComponents(punishmentsText)
    .addSeparatorComponents(divider)
    .addTextDisplayComponents(notesText);

    // Send using Components V2 flag
    const v2Flag = MessageFlagsBitField.Flags.IsComponentsV2;

    await interaction.editReply({
      content: "",
      flags: v2Flag,
      components: [container],
    });
  }
}
