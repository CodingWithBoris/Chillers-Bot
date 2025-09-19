import { Client, Collection, GatewayIntentBits, Partials } from "discord.js";
import IConfig from "../interfaces/IConfig";
import Handler from "./Handler";
import Command from "./Command";
import SubCommand from "./SubCommand";
import mongoose from "mongoose";

export default class CustomClient extends Client {
  handler: Handler;
  config: IConfig;
  commands: Collection<string, Command>;
  subCommands: Collection<string, SubCommand>;
  cooldowns: Collection<string, Collection<string, number>>;
  developerMode: boolean;

  constructor() {
    super({
      intents: [
        GatewayIntentBits.Guilds,                   // Needed for slash commands and most guild-level data
        GatewayIntentBits.GuildMembers,             // Needed to receive member updates (like role or nickname changes)
        GatewayIntentBits.GuildPresences,           // Optional, only needed if you're doing presence-based logic (not in your code)
        GatewayIntentBits.GuildMessages,            // Only needed if your bot handles message-based commands (not shown here)
        GatewayIntentBits.MessageContent,
      ],
    });

    this.config = require(`${process.cwd()}/data/config.json`);
    this.handler = new Handler(this);
    this.commands = new Collection();
    this.subCommands = new Collection();
    this.cooldowns = new Collection();
    this.developerMode = process.argv.includes("development");
  }

public async Init(): Promise<void> {
    this.LoadHandlers();
    await mongoose.connect(this.config.mongoURI)
        .then(() => console.log("Connected to MongoDB"))
        .catch((err) => console.error("Failed to connect to MongoDB:", err));
    this.login(this.config.token).catch(console.error);
}

  private LoadHandlers(): void {
    this.handler.LoadEvents();
    this.handler.LoadCommands();
  }
}
