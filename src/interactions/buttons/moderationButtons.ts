import {
  ButtonInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} from "discord.js";
import CustomClient from "../../base/classes/CustomClient";

export async function handleModerationButton(client: CustomClient, interaction: ButtonInteraction) {
  const [_, action, userId] = interaction.customId.split("_");
  const user = await client.users.fetch(userId);
  const hasDuration = ["mute", "timeout", "ban"].includes(action);

  const modal = new ModalBuilder()
    .setCustomId(`mod_${action}_${userId}`)
    .setTitle(`${action.charAt(0).toUpperCase() + action.slice(1)} ${user.username}`);

  const reasonInput = new TextInputBuilder()
    .setCustomId("reason")
    .setLabel("Reason")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput));

  if (hasDuration) {
    const durationInput = new TextInputBuilder()
      .setCustomId("duration")
      .setLabel("Duration (e.g., 1h, 1d, 1 hour)")
      .setStyle(TextInputStyle.Short)
      .setRequired(action === "timeout" || action === "mute");

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(durationInput));
  }

  await interaction.showModal(modal);
}
