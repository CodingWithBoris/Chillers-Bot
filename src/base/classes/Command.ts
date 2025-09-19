import { ChatInputCommandInteraction, AutocompleteInteraction, CacheType } from "discord.js";
import Category from "../enums/Category";
import ICommand from "../interfaces/ICommand";
import CustomClient from "./CustomClient";
import ICommandOptions from "../interfaces/ICommandOptions";

export default class Command implements ICommand{
    client: CustomClient;
    name: string;
    description: string;
    category: Category;
    default_member_permissions: bigint;
    dm_permission: boolean;
    cooldown: number;
    options: object;
    
    constructor(client: CustomClient, options: ICommandOptions) {
        this.client = client;
        this.name = options.name;
        this.description = options.description;
        this.category = options.category;
        this.default_member_permissions = options.default_member_permissions;
        this.dm_permission = options.dm_permission;
        this.cooldown = options.cooldown;
        this.options = options.options;
    }
    
    
    Execute(interaction: ChatInputCommandInteraction<CacheType>): void {
    }
    AutoComplete(interaction: AutocompleteInteraction<CacheType>): void {
    }

}