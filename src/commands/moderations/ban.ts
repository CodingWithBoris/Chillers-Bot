import { ApplicationCommandOptionType, PermissionFlagsBits } from "discord.js";
import Command from "../../base/classes/Command";
import CustomClient from "../../base/classes/CustomClient";
import Category from "../../base/enums/Category";

export default class Kick extends Command {
    constructor(client: CustomClient) {
        super(client, {
            name: "ban",
            description: "This command will ban a person",
            category: Category.Utilities,
            options: [
                {
                    name: "user",
                    description: "The user you want to ban.",
                    type: ApplicationCommandOptionType.User,
                    required: true,
                },
                {
                    name: "reason",
                    description: "The reason for the warning (predefined options).",
                    type: ApplicationCommandOptionType.String,
                    required: true,
                    choices: client.config.warningReasons.map((r) => ({
                        name: r,
                        value: r,
                    }))
                },
                {
                    name: "notes",
                    description: "Proof or additional details for the ban.",
                    type: ApplicationCommandOptionType.String,
                    required: false,
                }
            ],
            default_member_permissions: PermissionFlagsBits.BanMembers,
            dm_permission: false,
            cooldown: 0
        });
    }
}