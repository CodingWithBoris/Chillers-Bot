import { Client, Collection, GatewayIntentBits } from "discord.js";
import IConfig from "../interfaces/IConfig";
import Handler from "./Handler";
import Command from "./Command";
import SubCommand from "./SubCommand";
import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import readline from "readline";

interface VRChatSecrets {
  AUTH_COOKIE: string;
  TWOFA_COOKIE: string;
}

export default class CustomClient extends Client {
  handler: Handler;
  config: IConfig;
  commands: Collection<string, Command>;
  subCommands: Collection<string, SubCommand>;
  cooldowns: Collection<string, Collection<string, number>>;
  developerMode: boolean;

  vrchatAuthCookie: string | null = null;
  vrchat2FACookie: string | null = null;

  constructor() {
    super({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMessages,
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

    await mongoose
      .connect(this.config.mongoURI)
      .then(() => console.log("Connected to MongoDB"))
      .catch((err) => console.error("Failed to connect to MongoDB:", err));

    await this.loginVRChat(); // Load cookies
    await this.login(this.config.token).catch(console.error);
  }

  public getVRChatCookieHeader(): string {
    const parts: string[] = [];
    if (this.vrchatAuthCookie) parts.push(`auth=${this.vrchatAuthCookie}`);
    if (this.vrchat2FACookie) parts.push(`twoFactorAuth=${this.vrchat2FACookie}`);
    return parts.join("; ");
  }

    public async loginVRChat(forceLogin: boolean = false): Promise<boolean> {
        const secretsPath = path.join(process.cwd(), "data/secrets.json");

        if (!forceLogin && fs.existsSync(secretsPath)) {
            try {
                const data: VRChatSecrets = JSON.parse(fs.readFileSync(secretsPath, "utf-8"));
                this.vrchatAuthCookie = data.AUTH_COOKIE;
                this.vrchat2FACookie = data.TWOFA_COOKIE;
                console.log("[VRChat] Loaded cookies from secrets.json");
                return true;
            } catch (err) {
                console.warn("[VRChat] Failed to read cookies, will re-login", err);
            }
        }

        console.log("[VRChat] Logging in with credentials...");

        const credentials = Buffer.from(
            `${this.config.VRCHAT_USERNAME}:${this.config.VRCHAT_PASSWORD}`
        ).toString("base64");

        const doAuthUser = async () => {
            return fetch("https://api.vrchat.cloud/api/1/auth/user", {
                headers: {
                    Authorization: `Basic ${credentials}`,
                    "User-Agent": "MyDiscordBot/1.0.0",
                    Accept: "application/json",
                },
            });
        };

        let res = await doAuthUser();

        // If 2FA required, run the verify step and capture cookies from that response if present.
        if (res.status === 401) {
            console.log("[VRChat] 2FA required. Enter your code in the console.");
            const code = await this.promptConsole("2FA Code: ");

            const verifyRes = await fetch("https://api.vrchat.cloud/api/1/auth/verify", {
                method: "POST",
                headers: {
                    Authorization: `Basic ${credentials}`,
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
                body: JSON.stringify({ code }),
            });

            // Log verify result for debugging
            console.log("[VRChat] verify response status:", verifyRes.status);

            // If verify returns cookies, record them
            const verifyCookies = verifyRes.headers.raw()["set-cookie"] || [];
            if (verifyCookies.length > 0) {
                console.log("[VRChat] set-cookie from verify:", verifyCookies);
                this._assignCookiesFromSetCookieArray(verifyCookies);
            }

            // Wait a short moment to let their backend settle, then re-auth
            await new Promise((r) => setTimeout(r, 500));

            res = await doAuthUser();
        }

        if (!res.ok) {
            console.error("[VRChat] Login failed:", await res.text());
            return false;
        }

        const cookies = res.headers.raw()["set-cookie"] || [];
        console.log("[VRChat] set-cookie from auth/user:", cookies);
        if (cookies.length === 0 && !this.vrchatAuthCookie) {
            console.error("[VRChat] No cookies received from VRChat!");
            return false;
        }

        // assign cookies (auth, twoFactorAuth) using helper
        this._assignCookiesFromSetCookieArray(cookies);

        // persist
        try {
            fs.writeFileSync(
                secretsPath,
                JSON.stringify({
                    AUTH_COOKIE: this.vrchatAuthCookie,
                    TWOFA_COOKIE: this.vrchat2FACookie,
                }),
                "utf-8"
            );
            console.log("[VRChat] Logged in and saved cookies!");
        } catch (err) {
            console.warn("[VRChat] Failed to write secrets.json", err);
        }

        return true;
    }

    /** small helper to extract auth / twoFactorAuth robustly */
    private _assignCookiesFromSetCookieArray(setCookieArr: string[]) {
        // simple parse for "name=value" at the start of a Set-Cookie entry
        for (const sc of setCookieArr) {
            const firstPart = sc.split(";")[0].trim(); // "auth=VALUE" or "twoFactorAuth=VALUE"
            const [name, ...rest] = firstPart.split("=");
            const val = rest.join("=");
            if (!name || !val) continue;
            if (name === "auth") this.vrchatAuthCookie = val;
            if (name === "twoFactorAuth") this.vrchat2FACookie = val;
            // log for debugging
            console.log(`[VRChat] parsed cookie ${name}=${val?.slice(0, 8)}...`);
        }
    }

  private promptConsole(question: string): Promise<string> {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); }));
  }

  private LoadHandlers(): void {
    this.handler.LoadEvents();
    this.handler.LoadCommands();
  }
}
