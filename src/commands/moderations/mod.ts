// src/commands/mod/mod.ts
import {
  ApplicationCommandOptionType,
  PermissionFlagsBits,
} from "discord.js";
import Command from "../../base/classes/Command";
import CustomClient from "../../base/classes/CustomClient";
import Category from "../../base/enums/Category";

export default class ModCommand extends Command {
  constructor(client: CustomClient) {
    super(client, {
      name: "mod",
      description: "Moderation command group for managing infractions and notes.",
      category: Category.Moderation,
      default_member_permissions: PermissionFlagsBits.ModerateMembers,
      dm_permission: false,
      cooldown: 3,
      options: [
        {
          name: "infraction",
          description: "Check a user’s moderation record, rule breaks, and notes.",
          type: ApplicationCommandOptionType.Subcommand,
          options: [
            {
              name: "user",
              description: "The user to check.",
              type: ApplicationCommandOptionType.User,
              required: true,
            },
          ],
        },
        // ✅ More subcommands can easily be added here later:
        // {
        //   name: "note",
        //   description: "Add or edit a moderation note for a user.",
        //   type: ApplicationCommandOptionType.Subcommand,
        //   options: [...]
        // }
      ],
    });
  }
}
