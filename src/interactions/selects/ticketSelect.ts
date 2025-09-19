// src/interactions/selects/ticketSelect.ts
import {
  StringSelectMenuInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} from "discord.js";

export async function handleTicketSelect(interaction: StringSelectMenuInteraction) {
  // select custom id should be "ticket_select"
  const selected = interaction.values[0];
  // build modal per ticket type
  const modal = new ModalBuilder()
    .setCustomId(`ticket_modal_${selected}_${interaction.user.id}`)
    .setTitle(`New Ticket — ${selected}`);

  // dynamic inputs
  if (selected === "instanceMod") {
    const vrchat = new TextInputBuilder()
      .setCustomId("vrchat")
      .setLabel("VRChat Username")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const reported = new TextInputBuilder()
      .setCustomId("reported")
      .setLabel("Who are you reporting (username/id)?")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const why = new TextInputBuilder()
      .setCustomId("why")
      .setLabel("Why are you reporting them?")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    const proof = new TextInputBuilder()
      .setCustomId("proof")
      .setLabel("Proof? (links or descriptions)")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(vrchat),
      new ActionRowBuilder<TextInputBuilder>().addComponents(reported),
      new ActionRowBuilder<TextInputBuilder>().addComponents(why),
      new ActionRowBuilder<TextInputBuilder>().addComponents(proof)
    );
  } else if (selected === "discordMod") {
    const discordMember = new TextInputBuilder()
    .setCustomId("member")
    .setLabel("Who are you reporting (username/id)?")
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

    const why = new TextInputBuilder()
      .setCustomId("why")
      .setLabel("Why are you reporting them?")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    const proof = new TextInputBuilder()
      .setCustomId("proof")
      .setLabel("Proof? (links or descriptions)")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(discordMember),
      new ActionRowBuilder<TextInputBuilder>().addComponents(why),
      new ActionRowBuilder<TextInputBuilder>().addComponents(proof)
    );
  } else if (selected === "developer1") {
    const issue = new TextInputBuilder()
      .setCustomId("issue")
      .setLabel("Describe the bot issue")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(issue));
  } else if (selected === "developer2") {
    const issue = new TextInputBuilder()
      .setCustomId("issue")
      .setLabel("Describe the Discord issue")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(issue));
  } else if (selected === "other") {
    const summary = new TextInputBuilder()
      .setCustomId("summary")
      .setLabel("Describe the issue")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(summary));
  } else if (selected === "appeal") {
    const punishment = new TextInputBuilder()
      .setCustomId("punishment")
      .setLabel("What punishment are you appealing?")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);
    const reason = new TextInputBuilder()
      .setCustomId("reason")
      .setLabel("Why were you punished?")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);
    const appeal = new TextInputBuilder()
      .setCustomId("appeal")
      .setLabel("Why should the punishment be lifted?")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(punishment),
      new ActionRowBuilder<TextInputBuilder>().addComponents(reason),
      new ActionRowBuilder<TextInputBuilder>().addComponents(appeal)
    );
  }else {
    // generic fields for other categories
    const summary = new TextInputBuilder()
      .setCustomId("summary")
      .setLabel("Describe the issue / provide details")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    const extra = new TextInputBuilder()
      .setCustomId("extra")
      .setLabel("Any proof or additional info? (optional)")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(summary),
      new ActionRowBuilder<TextInputBuilder>().addComponents(extra)
    );
  }

  await interaction.showModal(modal);
}
