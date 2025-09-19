import { ChatInputCommandInteraction, PermissionFlagsBits } from "discord.js";
import Command from "../../base/classes/Command";
import CustomClient from "../../base/classes/CustomClient";
import Category from "../../base/enums/Category";

export default class Check extends Command {
  constructor(client: CustomClient) {
    super(client, {
      name: "check",
      description: "Check if a user is registered in the database.",
      category: Category.Utilities,
      options: [],
      default_member_permissions: PermissionFlagsBits.Administrator,
      dm_permission: false,
      cooldown: 0,
    });
  }

  async execute(interaction: ChatInputCommandInteraction) {
    const userid = interaction.user.id;

    if (userid) {
      await interaction.reply({
        content: "You are registered in the database.",
        ephemeral: true,
      });
    }
  }
}
