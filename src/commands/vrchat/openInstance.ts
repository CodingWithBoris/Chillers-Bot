import { ChatInputCommandInteraction, ApplicationCommandOptionType, PermissionFlagsBits } from "discord.js";
import Command from "../../base/classes/Command";
import CustomClient from "../../base/classes/CustomClient";
import Category from "../../base/enums/Category";
import fetch from "node-fetch";
import type { Response as FetchResponse } from "node-fetch";
import VRChatUserInfo from "../../base/schema/VRChatUserInfo";

/**
 * Slash command to open a new VRChat group instance.  The command allows a
 * staff member to select a world from a pre‑defined list in your config,
 * specify the group access type and region, and optionally enable the 18+
 * age gate.  The command then calls the VRChat REST API to create a new
 * instance as a group instance owned by your group.  On success, it
 * replies with the details of the newly created instance.
 */
export default class OpenInstanceCommand extends Command {
  constructor(client: CustomClient) {
    // Build the choices for the world selector from the config.  Each entry in
    // client.config["VRChat Worlds"] should be an object with a single key
    // (the world name) and the value (the worldId).  We iterate over the
    // array and extract the first key/value from each object.
    const worldChoices: { name: string; value: string }[] = [];
    try {
      const worlds = (client.config as any)["VRChat Worlds"] as any[];
      if (Array.isArray(worlds)) {
        for (const w of worlds) {
          if (w && typeof w === "object") {
            const entries = Object.entries(w);
            if (entries.length > 0) {
              const [name, id] = entries[0] as [string, any];
              // Only add the choice if the id can be treated as a string.  Cast
              // to string here so TypeScript does not infer unknown.
              if (typeof id === "string") {
                const idStr: string = id;
                worldChoices.push({ name, value: idStr });
              }
            }
          }
        }
      }
    } catch {
      // If parsing fails, leave choices empty; the command will still work but
      // will require the user to type the worldId manually (fallback to string).
    }

    super(client, {
      name: "openinstance",
      description: "Open a new VRChat group instance",
      category: Category.Moderation,
      options: [
        {
          name: "world",
          description: "Select the world in which to open the instance",
          type: ApplicationCommandOptionType.String,
          required: true,
          choices: worldChoices.length > 0 ? worldChoices : undefined,
        },
        {
          name: "access",
          description: "Who can join the group instance",
          type: ApplicationCommandOptionType.String,
          required: true,
          choices: [
            { name: "Public", value: "public" },
            { name: "Group+", value: "plus" },
            { name: "Members only", value: "members" },
          ],
        },
        {
          name: "region",
          description: "Server region for the instance",
          type: ApplicationCommandOptionType.String,
          required: true,
          choices: [
            { name: "US West", value: "us" },
            { name: "US East", value: "use" },
            { name: "Europe", value: "eu" },
            { name: "Japan", value: "jp" },
            { name: "Unknown", value: "unknown" },
          ],
        },
        {
          name: "age_gate",
          description: "Require users to be 18+ to join (default: off)",
          type: ApplicationCommandOptionType.Boolean,
          required: false,
        },
      ],
      default_member_permissions: PermissionFlagsBits.Administrator,
      dm_permission: false,
      cooldown: 5,
    });
  }

  /**
   * Execute the slash command.  Creates a new group instance using the
   * provided parameters and replies to the invoker with the result.
   */
  async Execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });
    const worldId = interaction.options.getString("world", true);
    const access = interaction.options.getString("access", true) as "public" | "plus" | "members";
    const region = interaction.options.getString("region", true) as
      | "us"
      | "use"
      | "eu"
      | "jp"
      | "unknown";
    const ageGate = interaction.options.getBoolean("age_gate") ?? false;

    // Construct the request body for creating a group instance.  We set
    // type="group" to ensure this is a group instance, and ownerId to the
    // configured group ID so the instance belongs to your group.  The
    // groupAccessType determines whether the instance is public (anyone can
    // join), plus (group members and invited guests), or members (only
    // group members allowed).
    const body = {
      worldId: worldId,
      type: "group",
      ownerId: this.client.config.VRChat_Group_ID,
      groupAccessType: access,
      region: region,
      ageGate: ageGate,
    };

    try {
      // helper to perform the create request with current cookies.  We
      // annotate the return type using the node-fetch Response type rather
      // than the DOM Response, as node-fetch's Response does not include
      // browser-specific properties such as `bytes`.  See lib.dom.d.ts for
      // the DOM Response definition which includes `bytes`【65910199548138†L249-L280】.
      const doCreate = async (): Promise<FetchResponse> => {
        return fetch("https://api.vrchat.cloud/api/1/instances", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "VRChatDiscordBot/1.0",
            Cookie: this.client.getVRChatCookieHeader(),
          },
          body: JSON.stringify(body),
        }) as unknown as FetchResponse;
      };

      let res = await doCreate();
      // If the API returns 401 (requires 2FA), re-login and try once more
      if (res.status === 401) {
        console.log("[OpenInstance] VRChat cookie invalid (401). Re-logging...");
        const ok = await this.client.loginVRChat(true);
        if (!ok) {
          const text = await res.text().catch(() => "");
           interaction.editReply(
            `❌ Failed to re-authenticate VRChat. Original error ${res.status}: ${text}`
          );
        }
        // Wait briefly for cookies to settle
        await new Promise((r) => setTimeout(r, 700));
        res = await doCreate();
      }

      // Always read the response body exactly once.  Many error responses from
      // node-fetch cannot be consumed multiple times; reading .text() and then
      // .json() on the same Response throws "body used already".  To avoid
      // this, read the body once into a string, then attempt to parse JSON
      // from it.  If parsing fails, treat the body as plain text.
      const bodyText = await res.text();
      let data: any = null;
      try {
        data = JSON.parse(bodyText);
      } catch {
        // ignore parse errors; data will remain null
      }
      // If the response is not OK (status >= 400), return the plain body text
      if (!res.ok) {
         interaction.editReply(
          `❌ Failed to create instance. VRChat API returned ${res.status}: ${bodyText}`
        );
      }
      // If parsing succeeded and the response is OK, extract the instance identifier.  For
      // group instances, the VRChat API returns an `id` field formatted as
      // `worldId:instanceId`.  Some responses include a separate `instanceId`,
      // others do not.  We fall back to splitting the `id` on ':' and taking the
      // portion after the worldId.  If neither is present, mark unknown.
      let instanceId: string = "unknown";
      if (data?.instanceId && typeof data.instanceId === "string") {
        instanceId = data.instanceId;
      } else if (data?.id && typeof data.id === "string" && data.id.includes(":")) {
        instanceId = data.id.split(":").slice(1).join(":");
      }
      // Send the initial success message before inviting the user.  Do not return here
      // so that we can perform the invite afterwards.
      await interaction.editReply(
        `✅ Instance created!\nWorld: ${worldId}\nInstance ID: ${instanceId}\nAccess: ${access}\nRegion: ${region}\nAge gate: ${ageGate ? "On" : "Off"}`
      );
      // Attempt to look up the VRChat user associated with the Discord user and invite them
      // to the newly created instance.  We use the VRChatUserInfo schema to resolve
      // the VRChat user ID from the Discord ID.  If a linked account is found,
      // send an invite using the VRChat API.  The invite endpoint requires the
      // full instance identifier in the format worldId:instanceId.  We handle
      // 401 responses similarly to the creation step by re-authenticating once.
      try {
        const linkedUser = await VRChatUserInfo.findOne({ discordId: interaction.user.id });
        if (!linkedUser || !linkedUser.vrchatId) {
          // No linked VRChat account found; inform the user and exit silently
          await interaction.followUp({
            content: "⚠️ You do not have a linked VRChat account, so an invite was not sent. Please verify your VRChat account to enable auto-invites.",
            ephemeral: true,
          });
          return;
        }
        const inviteBody = { instanceId: `${worldId}:${instanceId}` };
        const doInvite = async (): Promise<FetchResponse> => {
          return fetch(
            `https://api.vrchat.cloud/api/1/invite/${linkedUser.vrchatId}`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "User-Agent": "VRChatDiscordBot/1.0",
                Cookie: this.client.getVRChatCookieHeader(),
              },
              body: JSON.stringify(inviteBody),
            }
          ) as unknown as FetchResponse;
        };
        let inviteRes = await doInvite();
        if (inviteRes.status === 401) {
          // Re-authenticate once if cookies are stale
          const ok2 = await this.client.loginVRChat(true);
          if (ok2) {
            await new Promise((r) => setTimeout(r, 700));
            inviteRes = await doInvite();
          }
        }
        if (!inviteRes.ok) {
          const errText = await inviteRes.text().catch(() => "");
          await interaction.followUp({
            content: `⚠️ Created the instance but failed to send invite (${inviteRes.status}): ${errText}`,
            ephemeral: true,
          });
        } else {
          await interaction.followUp({
            content: `📨 An invite to **${worldId}:${instanceId}** has been sent to your VRChat account! Check your notifications in-game to join.`,
            ephemeral: true,
          });
        }
      } catch (errInvite) {
        console.error("[OpenInstance] Invite error", errInvite);
        await interaction.followUp({
          content: "⚠️ Instance created, but there was an error sending the invite. Please join the instance manually.",
          ephemeral: true,
        });
      }
      return;
    } catch (err: any) {
      console.error("[CreateInstance] API error", err);
       interaction.editReply("❌ Error creating instance. Please try again later.");
    }
  }
}