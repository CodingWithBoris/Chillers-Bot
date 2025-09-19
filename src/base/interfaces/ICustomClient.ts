import { Collection } from "discord.js";
import Command from "../classes/Command";
import IConfig from "./IConfig";
import SubCommand from "../classes/SubCommand";

export default interface ICustomClient {
    config: IConfig;
    commands: Collection<string, Command>;
    subCommands: Collection<string, SubCommand>;
    cooldowns: Collection<string, Collection<string, number>>;
    developerMode: boolean;

    Init():void;
    LoadHandlers(): void;
}