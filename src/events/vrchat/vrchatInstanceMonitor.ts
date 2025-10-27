import { Events, ChannelType, EmbedBuilder, ThreadChannel } from "discord.js";
import Event from "../../base/classes/Event";
import CustomClient from "../../base/classes/CustomClient";
import { vrchatClient } from "../../utils/vrchatClient";
import VRChatInstance from "../../base/schema/VRChatInstance";
import VRChatUserInfo from "../../base/schema/VRChatUserInfo";
import VerifiedUser from "../../base/schema/VerifiedUser";
import UserPresence from "../../base/schema/UserPresence";
import {
  getOrCreateInstanceThread,
  buildInstanceJoinEmbed,
  buildInstanceClosedEmbed,
  resolveDiscordMention,
} from "../../utils/instanceUtils"

/**
 * VRChatInstanceMonitor is an event handler that periodically polls the VRChat
 * REST API and updates your MongoDB models with the latest instance and
 * presence information.  It keeps track of which group members are currently
 * in which instances, records their join/leave times on the
 * `VRChatUserInfo.instances` array, creates new `VRChatInstance` documents
 * when a brand‑new instance is encountered, and marks instances as inactive
 * once empty.  It also logs significant events to configurable Discord
 * channels so moderators can keep an eye on VRChat activity.
 *
 * This monitor assumes that you have added two new channel IDs to your
 * configuration under `Moderation.Channels` called `instanceLogs` and
 * `moderatorLogs`.  The former receives messages when anyone joins or
 * leaves a group instance, and the latter receives messages when a group
 * moderator joins or leaves.  If these values are not present in your
 * configuration the monitor falls back to `internalCase` for both.
 */
export default class VRChatInstanceMonitor extends Event {
  /**
   * A map of group member user IDs to the instanceId they are currently in.
   * A value of `null` indicates that the user is offline or in a private
   * location.  This stateful map allows us to detect when a user moves
   * between instances without having to persist transient data in the
   * database.
   */
  private memberInstances: Map<string, string | null> = new Map();

  /**
   * Track whether each currently online user is considered a moderator.  This
   * map is keyed by userId and stores a boolean.  When a user leaves we
   * remove them from this map.  It is used to determine when an instance
   * becomes unmoderated so that it can be automatically closed.
   */
  private userIsMod: Map<string, boolean> = new Map();

  constructor(client: CustomClient) {
    super(client, {
      name: Events.ClientReady,
      description: "Monitors VRChat instances and populates the database",
      once: true,
    });
  }

  /**
   * When the bot is ready, begin polling the VRChat API for group activity.  The
   * initial poll is performed immediately, then repeated every 60 seconds.
   */
  async Execute(): Promise<void> {
    // Kick off immediately
    console.log("[VRChatMonitor] Polling loop started, will run every 60s");
    this.checkInstances().catch((err) => console.error(err));
    // Repeat every minute
    setInterval(() => {
      console.log(`[VRChatMonitor] Poll tick at ${new Date().toISOString()}`);
      this.checkInstances().catch((err) => console.error(err));
    }, 60_000);
  }

  /**
   * Poll the VRChat API for the list of group members and their current
   * locations.  Any time a user moves into or out of a public location, the
   * appropriate handlers are invoked to update the database and log events.
   */
  private async checkInstances(): Promise<void> {
    const groupId = this.client.config.VRChat_Group_ID;
    try {
      // Fetch group members to obtain role information.  We will use this
      // mapping later to determine moderator status.  We fetch up to 100
      // members; if your group has more than 100 members you should page
      // through results with the offset parameter.
      const memberRes = await vrchatClient.get(`/groups/${groupId}/members?n=100`);
      const memberList: any[] = memberRes?.data ?? memberRes?.members ?? [];
      const groupMembers: Map<string, any> = new Map();
      for (const member of memberList) {
        const uid: string = member?.userId;
        if (uid) groupMembers.set(uid, member);
      }

      // Fetch all currently active group instances
      const instRes = await vrchatClient.get(`/groups/${groupId}/instances?n=100`);
      // The response may be an array or may be contained in a data or instances field.
      let groupInstances: any[];
      if (Array.isArray(instRes)) {
        groupInstances = instRes;
      } else if (Array.isArray(instRes?.instances)) {
        groupInstances = instRes.instances;
      } else if (Array.isArray(instRes?.data)) {
        groupInstances = instRes.data;
      } else {
        groupInstances = [];
      }

      // Build a mapping of current occupants: userId → instanceId
      const currentOccupants: Map<string, string> = new Map();
      // For each instance, fetch detailed information including the users array
      for (const inst of groupInstances) {
        try {
          const instId: string = inst?.instanceId ?? inst?.id;
          const worldId: string | undefined = inst?.world?.id ?? inst?.worldId;
          if (!instId || !worldId) continue;
          // Compose the path for the get-instance endpoint.  According to the
          // VRChat API, the path should be /instances/{worldId}:{instanceId}.
          const instanceDetails = await vrchatClient.get(`/instances/${worldId}:${instId}`);
          const users: any[] = instanceDetails?.users ?? [];
        // For each user in this instance, record their presence
        for (const u of users) {
          const uid = u?.id;
          if (!uid) continue;
          // We record the combined worldId and instanceId separated by ':'
          const combinedId = `${worldId}:${instId}`;
          currentOccupants.set(uid, combinedId);
        }
        } catch (err) {
          // If fetching instance details fails, skip this instance
          console.error('[VRChatMonitor] Failed to fetch instance details:', err);
        }
      }
      // Fallback: If the users array on instance details was not available or incomplete,
      // consult the location field of each group member.  The VRChat API returns a
      // `location` property on the user object indicating their current location.
      // The format for public/group instances is usually "wrld_<worldId>:<instanceHash>" or
      // "wrld_<worldId>:<instanceHash>~...".  We treat the entire string as the
      // combined worldId and instanceId.  This ensures we detect members even when
      // the `users` field is absent (e.g. the instance was not created by our bot).
      for (const [uid] of groupMembers) {
        if (!currentOccupants.has(uid)) {
          try {
            const uinfo = await vrchatClient.get(`/users/${uid}`);
            const loc: string | null = uinfo?.location ?? null;
            if (
              loc &&
              loc !== 'offline' &&
              !loc.startsWith('private') &&
              !loc.startsWith('traveling')
            ) {
              // Parse the location string into world and instance parts.  Locations can
              // include modifiers after the instance hash (e.g. "~hidden" or "~region(eu)").
              // We take only the first segment after the colon to match the instanceId we
              // receive from the group instances endpoint.
              const parts = loc.split(':');
              const worldPart = parts[0];
              let instPart = parts.length > 1 ? parts.slice(1).join(':') : '';
              // If there are modifiers (~foo), strip them off to get just the base hash
              if (instPart.includes('~')) {
                instPart = instPart.split('~')[0];
              }
              const combined = worldPart && instPart ? `${worldPart}:${instPart}` : loc;
              currentOccupants.set(uid, combined);
            }
          } catch (err) {
            // Ignore individual errors when fetching user info
          }
        }
      }

      // Determine all user IDs that need to be processed: union of previous
      // tracked users and the current occupant list
      console.log(`[VRChatMonitor] Found ${currentOccupants.size} active occupants`);
      const userIds = new Set<string>([...this.memberInstances.keys(), ...currentOccupants.keys()]);
      for (const uid of userIds) {
        const prev = this.memberInstances.get(uid) ?? null;
        const curr = currentOccupants.get(uid) ?? null;
        if (prev !== curr) {
          // If they were previously in an instance and now are not (or moved)
          if (prev) {
            await this.handleLeave(uid, prev);
          }
          // If they are now in a new instance, handle their arrival
          if (curr) {
            // Fetch full user info for proper handling
            const userInfo = await vrchatClient.get(`/users/${uid}`);
            // Retrieve the member object to determine moderator status
            const member = groupMembers.get(uid) ?? {};
            await this.handleJoin(uid, curr, userInfo, member);
          }
          console.log(`[VRChatMonitor] ${uid} moved from ${prev} -> ${curr}`);
          // Update tracked instance
          this.memberInstances.set(uid, curr);
        }
      }

      // After processing all changes, mark any tracked instances with no
      // occupants as inactive
      await this.cleanupEmptyInstances();
    } catch (err: any) {
      console.error('[VRChatMonitor] Failed to poll group instances:', err?.message || err);
      // If we encountered a 401 Unauthorized error, attempt to refresh cookies and re-auth
      try {
        const msg: string = err?.message || '';
        if (msg.includes('401') || msg.toLowerCase().includes('unauthorized')) {
          // Attempt to refresh the Discord client's VRChat login.  This will update
          // this.client.vrchatAuthCookie and this.client.vrchat2FACookie and write
          // new secrets to disk.  It returns true on success.
          await this.client.loginVRChat(true).catch(() => {});
          // If the imported vrchatClient exposes a loginWithCookies method, use it
          // to reload cookies from secrets.json into its internal cookie jar.
          const anyClient: any = vrchatClient as any;
          if (anyClient && typeof anyClient.loginWithCookies === 'function') {
            await anyClient.loginWithCookies().catch(() => {});
          }
        }
      } catch {
        // ignore errors during re-auth
      }
    }
  }

  /**
   * Convert a VRChat `location` string into an instance ID.  Returns `null`
   * for locations that do not correspond to public or group instances.
   */
  private parseInstanceId(location: string | null): string | null {
    if (!location || location === '' || location === 'offline' || location.startsWith('private')) {
      return null;
    }
    // Some locations are formatted as "traveling" or "traveling:traveling", which
    // indicate the user is between worlds.  Skip these as well.
    if (location.startsWith('traveling')) return null;
    // Expected format for public/group instances: "wrld_<worldId>:<instanceHash>"
    // Extract everything after the colon.  In rare cases VRChat may return
    // locations like "worldId:instanceId" without the "wrld_" prefix; in those
    // cases we return the full string to ensure uniqueness.
    const parts = location.split(':');
    return parts.length > 1 ? parts[1] : location;
  }

  /**
   * Handle a user joining a VRChat instance.  Creates or updates the
   * `VRChatUserInfo` and `VRChatInstance` documents, inserts a new
   * `UserPresence` record, and posts a first‑join log to Discord using
   * threads.  Subsequent joins for the same user/instance are recorded
   * silently.
   */
  private async handleJoin(userId: string, combinedId: string, userInfo: any, member: any): Promise<void> {
    const now = new Date();
    // Fetch or create the VRChatUserInfo document
    let user = await VRChatUserInfo.findOne({ vrchatId: userId });
    if (!user) {
      user = new VRChatUserInfo({
        vrchatId: userId,
        username: userInfo?.displayName || userInfo?.username || userId,
        trustLevel: userInfo?.userIcon?.trustRank || userInfo?.trustLevel || 'Unknown',
        is18Plus: Boolean(userInfo?.userIcon?.ageRestricted),
        instances: [],
        moderation: [],
      });
    }
    // Update VRChatUserInfo properties
    user.username = userInfo?.displayName || userInfo?.username || user.username;
    user.trustLevel = userInfo?.userIcon?.trustRank || userInfo?.trustLevel || user.trustLevel;
    user.is18Plus = Boolean(userInfo?.userIcon?.ageRestricted);
    user.lastSeen = now;
    // Link to a Discord account if not already linked
    if (!user.discordId) {
      try {
        const verified = await VerifiedUser.findOne({ vrchatId: user.vrchatId });
        if (verified) {
          user.discordId = verified.discordId;
        }
      } catch {
        // ignore
      }
    }
    await user.save();

    // Split the combinedId into worldId and instanceId components.  The combined
    // identifier is formatted as "worldId:instanceId".  If the delimiter is
    // missing, we assume only the instanceId portion is provided and leave
    // worldId undefined.
    let worldPart: string | undefined;
    let instPart: string;
    if (combinedId.includes(':')) {
      const parts = combinedId.split(':');
      worldPart = parts[0];
      instPart = parts.slice(1).join(':');
    } else {
      instPart = combinedId;
    }
    // Fetch or create the VRChatInstance document
    let instance = await VRChatInstance.findOne({ instanceId: instPart });
    if (!instance) {
      // Determine the world ID.  Prefer the worldPart from the combined ID.
      const worldId = worldPart || userInfo?.location?.split(':')[0] || instPart.split('~')[0];
      instance = new VRChatInstance({
        instanceId: instPart,
        worldId: worldId,
        instanceName: userInfo?.worldName || instPart,
        createdAt: now,
        isGroupInstance: true,
        isActive: true,
      });
    } else {
      instance.isActive = true;
      // If the instance document is missing worldId, attempt to set it
      if (!instance.worldId && worldPart) {
        instance.worldId = worldPart;
      }
    }
    await instance.save();

    // Update the user's instance history with this join.  We push a new
    // entry into the user.instances array and save again.  This allows you
    // to track when a user first entered an instance in addition to the
    // detailed UserPresence records.
    try {
      user.instances.push({ instanceId: instPart, joinedAt: now } as any);
      await user.save();
    } catch (err) {
      console.error(`[VRChatMonitor] Failed to update user.instances for ${user.username}:`, err);
    }

    // Create a UserPresence record for this join
    const presence = new UserPresence({
      userId: user._id,
      instanceId: instance._id,
      joinedAt: now,
    });
    try {
      await presence.save();
      console.log(`[VRChatMonitor] Saved presence for ${user.username} in ${instance.instanceId}`);
    } catch (err) {
      console.error(`[VRChatMonitor] Failed to save presence for ${user.username}:`, err);
    }

    // Determine if this is the first recorded join for this user in this instance
    const joinCount = await UserPresence.countDocuments({ userId: user._id, instanceId: instance._id });
    // Determine whether this user should be considered a moderator for logging purposes
    const isMod = this.isModerator(member);
    // Record moderator status for auto‑close logic
    this.userIsMod.set(userId, isMod);
    if (joinCount === 1) {
      // Only on the first join do we log to Discord via a thread
      try {
        // Get or create the instance log thread
        const thread = await getOrCreateInstanceThread(
          this.client,
          this.client.config.guildId,
          instance
        );
        // Resolve Discord mention for the VRChat user
        const discordMention = await resolveDiscordMention(user);
        const embed = buildInstanceJoinEmbed(user, instance, now, discordMention, isMod);
        await thread.send({ embeds: [embed] });
      } catch (err) {
        console.error('[VRChatMonitor] Failed to log first join:', err);
      }
      // Additionally, log moderators separately to moderatorLogs if configured
      if (isMod) {
        const modLogChannelId =
          this.client.config.Moderation.Channels.moderatorLogs ||
          this.client.config.Moderation.Channels.internalCase;
        const modChan = await this.client.channels.fetch(modLogChannelId).catch(() => null);
        if (modChan) {
          const modEmbed = new EmbedBuilder()
            .setTitle('Moderator First Join')
            .setColor('Green')
            .addFields(
              { name: 'Moderator', value: `${user.username} (${user.vrchatId})`, inline: false },
              { name: 'Discord', value: user.discordId ? `<@${user.discordId}>` : 'Not linked', inline: false },
              { name: 'World', value: instance.worldId, inline: true },
              { name: 'Instance', value: instance.instanceId, inline: true },
              { name: 'Joined At', value: now.toISOString(), inline: false }
            );
          // If the channel is a thread, send directly; otherwise, ensure it is text based
          if (modChan.isThread()) {
            const thread = modChan as ThreadChannel;
            await thread.send({ embeds: [modEmbed] });
          } else if (modChan.isTextBased() && !modChan.isThread()) {
            await (modChan as any).send({ embeds: [modEmbed] });
          }
        }
      }
    }
  }

  /**
   * Handle a user leaving a VRChat instance.  Updates the most recent
   * presence record on the corresponding `VRChatUserInfo` document by
   * recording when they left and the duration of their stay.  Marks the
   * `VRChatInstance` as inactive if no users remain.  Logs the departure to
   * Discord.
   */
  private async handleLeave(userId: string, combinedId: string): Promise<void> {
    const now = new Date();
    // Find the VRChatUserInfo document
    const user = await VRChatUserInfo.findOne({ vrchatId: userId });
    // Parse the combined ID into worldId and instanceId components.  We only
    // use the instanceId portion to find the corresponding document in
    // MongoDB.  The combined identifier has the form "worldId:instanceId",
    // but if no colon exists we treat the whole string as the instanceId.
    let instPart: string;
    if (combinedId.includes(':')) {
      const parts = combinedId.split(':');
      instPart = parts.slice(1).join(':');
    } else {
      instPart = combinedId;
    }
    // Find the VRChatInstance document
    const instanceDoc = await VRChatInstance.findOne({ instanceId: instPart });
    if (user && instanceDoc) {
      // Find the most recent presence record for this user in this instance that has no leftAt
      const presenceDoc = await UserPresence.findOne({
        userId: user._id,
        instanceId: instanceDoc._id,
        leftAt: { $exists: false },
      }).sort({ joinedAt: -1 });
      if (presenceDoc) {
        presenceDoc.leftAt = now;
        presenceDoc.duration = Math.floor((now.getTime() - presenceDoc.joinedAt.getTime()) / 1000);
        await presenceDoc.save();
      }
      // If no more active presence entries remain in this instance, mark it inactive
      const remaining = await UserPresence.countDocuments({ instanceId: instanceDoc._id, leftAt: { $exists: false } });
      if (remaining === 0) {
        instanceDoc.isActive = false;
        await instanceDoc.save();
      }
    }
    // Remove moderator mapping for this user
    this.userIsMod.delete(userId);

    // Determine if the instance has become unmoderated
    if (instanceDoc) {
      // Build a list of other users still tracked in this instance (excluding the leaving user)
      const stillUsers: string[] = [];
      for (const [uid, inst] of this.memberInstances.entries()) {
        if (inst === instanceDoc.instanceId && uid !== userId) {
          stillUsers.push(uid);
        }
      }
      // Are there any moderators among the remaining users?
      const anyMod = stillUsers.some((uid) => this.userIsMod.get(uid));
      // If no moderators remain but there are still users, close the instance
      if (!anyMod && stillUsers.length > 0) {
        await this.autoCloseInstance(instanceDoc, stillUsers, now);
      }
    }

    // We deliberately do not log user leaving events to Discord for individual leaves
  }

  /**
   * After each poll, examine the memberInstances map and mark any
   * `VRChatInstance` documents as inactive if there are no members currently
   * present.  This keeps your database in sync with the real‑world state.
   */
  private async cleanupEmptyInstances(): Promise<void> {
    // Build a set of currently active instance IDs (instanceId part only).
    const activeInstanceIds: Set<string> = new Set();
    for (const inst of this.memberInstances.values()) {
      if (inst) {
        let instPart: string;
        if (inst.includes(':')) {
          const parts = inst.split(':');
          instPart = parts.slice(1).join(':');
        } else {
          instPart = inst;
        }
        activeInstanceIds.add(instPart);
      }
    }
    // Find all instances in MongoDB that are active but whose instanceId is not in the active set
    const staleInstances = await VRChatInstance.find({ isActive: true, instanceId: { $nin: Array.from(activeInstanceIds) } });
    for (const inst of staleInstances) {
      inst.isActive = false;
      await inst.save();
    }
  }

  /**
   * Automatically close an instance when the last moderator has left and there
   * are still non‑moderator users present.  This method marks the instance
   * inactive, sets leftAt and duration on all remaining user presences, and
   * logs the closure to both the instance thread and the moderator log.
   *
   * @param instanceDoc The VRChat instance document that has become unmoderated
   * @param userIds     A list of VRChat user IDs still present in the instance
   * @param closedAt    The timestamp when the last moderator left
   */
  private async autoCloseInstance(
    instanceDoc: any,
    userIds: string[],
    closedAt: Date
  ): Promise<void> {
    // For each remaining user, mark their presence as ended and remove from state
    for (const uid of userIds) {
      // Remove from tracking maps
      this.memberInstances.set(uid, null);
      this.userIsMod.delete(uid);
      // Update presence record in database
      try {
        const user = await VRChatUserInfo.findOne({ vrchatId: uid });
        if (user) {
          const presenceDoc = await UserPresence.findOne({
            userId: user._id,
            instanceId: instanceDoc._id,
            leftAt: { $exists: false },
          }).sort({ joinedAt: -1 });
          if (presenceDoc) {
            presenceDoc.leftAt = closedAt;
            presenceDoc.duration = Math.floor((closedAt.getTime() - presenceDoc.joinedAt.getTime()) / 1000);
            await presenceDoc.save();
          }
        }
      } catch {
        // ignore individual errors
      }
    }
    // Mark the instance as inactive
    instanceDoc.isActive = false;
    await instanceDoc.save();
    // Log the closure to the instance thread
    try {
      const thread = await getOrCreateInstanceThread(
        this.client,
        this.client.config.guildId,
        instanceDoc
      );
      const embed = buildInstanceClosedEmbed(instanceDoc, closedAt);
      await thread.send({ embeds: [embed] });
    } catch (err) {
      console.error('[VRChatMonitor] Failed to log instance closure:', err);
    }
    // Log to moderatorLogs channel as well
    try {
      const modLogChannelId =
        this.client.config.Moderation.Channels.moderatorLogs ||
        this.client.config.Moderation.Channels.internalCase;
      const modChan = await this.client.channels.fetch(modLogChannelId).catch(() => null);
      if (modChan) {
        const embed = new EmbedBuilder()
          .setTitle('Instance Closed')
          .setColor('Red')
          .addFields(
            { name: 'World ID', value: instanceDoc.worldId, inline: true },
            { name: 'Instance ID', value: instanceDoc.instanceId, inline: true },
            { name: 'Closed At', value: closedAt.toISOString(), inline: false },
            { name: 'Reason', value: 'No moderator present', inline: false }
          )
          .setTimestamp(closedAt);
        // If channel is a thread, cast to ThreadChannel; otherwise ensure it is text based
        if (modChan.isThread()) {
          const t = modChan as ThreadChannel;
          await t.send({ embeds: [embed] });
        } else if (modChan.isTextBased() && !modChan.isThread()) {
          await (modChan as any).send({ embeds: [embed] });
        }
      }
    } catch {
      // ignore log errors
    }
  }

  /**
   * Determine whether the given group member should be treated as a
   * moderator for logging purposes.  This implementation checks the user's
   * VRChat group role against the RankOrder defined in your config; any
   * role higher than or equal to "Staff" (i.e. with an index <= that of
   * "Staff" in the RankOrder array) is considered a moderator.  You may
   * adjust this logic to suit your group's structure, or add additional
   * checks based on Discord roles.
   */
  private isModerator(member: any): boolean {
    try {
      const roleId = member?.roleId;
      const rankSystem = this.client.config.RankSystem;
      const rankOrder = this.client.config.RankOrder;
      // Find the rank name associated with the member's roleId
      const rankName = Object.keys(rankSystem).find((name) => rankSystem[name] === roleId);
      if (!rankName) return false;
      // A lower index in RankOrder corresponds to a higher rank
      const index = rankOrder.indexOf(rankName);
      const staffIndex = rankOrder.indexOf('Staff');
      return staffIndex >= 0 && index <= staffIndex;
    } catch {
      return false;
    }
  }
}