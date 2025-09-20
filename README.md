<h1 align="center">Discord General Bot</h1>

<p align="center">
  <a href="#license">
    <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License">
  </a>
  <a href="#requirements">
    <img src="https://img.shields.io/badge/node-v18%2B-brightgreen.svg" alt="Node">
  </a>
  <a href="#requirements">
    <img src="https://img.shields.io/badge/discord.js-v14-blue" alt="Discord.js">
  </a>
</p>
<p align="center">
  A clean, modular, TypeScript-based Discord moderation bot built for reliability and clarity.  
  Designed around slash commands, thread-based moderation logs, and a robust MongoDB-backed user moderation schema.
</p>

---

## 🚀 Quick overview

This project provides a modern starting point for a moderation-focused Discord bot. It includes:

* Slash command framework with subcommand support
* Moderation utilities: warn, timeout, mute, kick, ban, threads & profile embeds
* MongoDB integration (Mongoose) to persist warnings, punishments and moderation threads
* Clean `CustomClient`, `Handler`, and class/interface structure in TypeScript
* Button & modal-based moderation workflow for fast moderator actions

---

## 📁 Repository structure

```

data/
└─ config.json         # runtime configuration (token, IDs, settings)
src/
├─ base/               # core classes, interfaces, enums and schemas
├─ commands/           # slash commands grouped by category
├─ events/             # client event handlers (Ready, InteractionCreate, ...)
├─ interactions/       # buttons & modals handlers
└─ utils/              # helper functions (moderation utilities)
build/                   # compiled JS output (gitignored)
README.md

````

---

## ✨ Features

* **Warn system** with persistent counts and history
* **Timeout** command with flexible duration parsing (e.g. `1d`, `2h`, `30m`, `10s`)
* **Moderation threads**: automatically create or fetch per-user thread with profile message
* **Button + Modal workflow** for Mute / Timeout / Kick / Ban (fast moderator UX)
* **Auto nickname prefixing** for rank-based roles (configurable RankSystem / RankOrder)
* **Permission & cooldown handling** for commands

---

## 🛠️ Requirements

* Node.js v18 or newer
* npm or pnpm
* TypeScript (build step)
* MongoDB instance (Atlas or self-hosted)
* Discord bot application & token with appropriate intents and bot privileges

Recommended intents in `CustomClient`:

* `Guilds`
* `GuildMembers` (needed for nickname/role logic)
* `GuildMessages`, `MessageContent` (if you plan to expand message-based features)

---

## ⚙️ Example `data/config.json`

> **Do not commit your real token**. Use environment variables or a separate secrets manager for production.

```json
{
  "token": "BOT_TOKEN_HERE",
  "clientId": "YOUR_APP_CLIENT_ID",
  "guildId": "YOUR_GUILD_ID",
  "mongoURI": "mongodb+srv://<user>:<pw>@cluster.mongodb.net/dbname",
  "moderationChannelId": "MOD_CHANNEL_ID",
  "muteRoleId": "MUTE_ROLE_ID",
  "warningReasons": ["Spam", "Harassment", "NSFW", "Other"],
  "RankOrder": ["Member", "Veteran", "Staff"],
  "RankSystem": { "Member": "ROLE_ID_1", "Veteran": "ROLE_ID_2", "Staff": "ROLE_ID_3" },
  "Moderation": {
    "Channels": {
      "internalCase": "INTERNAL_CASE_CHANNEL_ID",
      "punishmentLogs": ["PUNISH_LOG_CHANNEL_ID_1", "PUNISH_LOG_CHANNEL_ID_2"]
    }
  }
}
````

---

## 🧭 Installation & local development

```bash
# clone
git clone <repo-url>
cd repo

# install deps
npm install

# build
npm run build

# run (production build)
node build/index.js

# or run in dev with ts-node / nodemon if configured
npm run dev
```

Add your `data/config.json` (or link it via environment variables) before starting.

---

## 🧩 How the core pieces work

* `CustomClient` extends `discord.js` Client and loads `Handler` which discovers commands/events in `build/`.
* `Handler` dynamically imports compiled files from `build/commands` and `build/events` and registers them on the client.
* Commands extend the base `Command` class and implement `Execute()` — subcommands follow the `SubCommand` pattern.
* Moderation data is stored with a Mongoose model `UserModeration` using a `Map` of `warnings` and an array of `punishments`.
* `utils/moderationUtils.ts` contains helpers for creating moderation threads, building profile embeds, building action buttons, and parsing human-friendly durations.

---

## ✅ Example commands

* `/warn user: @user reason: <predefined> proof: <text>` — creates/updates a warning in the DB and logs into the moderation thread.
* `/timeout user: @user duration: 1h reason: <predefined>` — applies Discord timeout and logs the action.
* Moderator buttons in the profile thread open modals to apply `mute`, `timeout`, `kick`, or `ban`.

---

## 🔒 Permissions & safety

* Commands declare `default_member_permissions` (e.g. `PermissionFlagsBits.ModerateMembers`) to restrict access.
* The bot checks role hierarchy and `member.moderatable` before applying punishments.
* Logging is attempted in configured `Moderation.Channels.punishmentLogs` (works for single ID or array).

---

## 🧪 Testing & debugging

* Use a dedicated testing guild (set `guildId` in config) to register commands safely.
* Watch the console for helpful logs from `Ready` (command registration) and Mongo connection messages.

---

## 🤝 Contributing

Contributions are welcome! A recommended workflow:

1. Fork the repo
2. Create a feature branch: `feat/your-feature`
3. Make TypeScript changes & add tests if needed
4. Build and test in a dev server
5. Open a PR with a clear description

Please keep commits scoped and do not commit secrets.

---

## 🧾 License

This project is provided under the **MIT License** — see the `LICENSE` file for details.

---

## 📬 Need help / want customizations?

If you'd like additional features (role-based escalation, automatic punishment thresholds, web dashboard, localization, etc.), open an issue or PR and describe your use-case — happy to collaborate!

---

<p align="center"><i>Made with ❤️ and TypeScript.</i></p>
