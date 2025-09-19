import { Events, GuildMember } from "discord.js";
import Event from "../../base/classes/Event";
import CustomClient from "../../base/classes/CustomClient";

export default class GuildMemberUpdateEvent extends Event {
  constructor(client: CustomClient) {
    super(client, {
      name: Events.GuildMemberUpdate,
      description: "Auto-updates member nicknames based on rank role changes",
      once: false,
    });
  }

  public async Execute(oldMember: GuildMember, newMember: GuildMember) {
    // Only proceed if roles haven't changed
    if (
      oldMember.roles.cache.size === newMember.roles.cache.size &&
      oldMember.roles.cache.every(r => newMember.roles.cache.has(r.id))
    ) {
      return;
    }

    // Fetch rank configuration
    const rankOrder: string[] = this.client.config.RankOrder;
    const rankRoles: Record<string, string> = this.client.config.RankSystem;

    // Identify the member's rank roles
    const memberRanks = rankOrder.filter(rank => {
      const roleId = rankRoles[rank];
      return roleId && newMember.roles.cache.has(roleId);
    });

    if (!memberRanks.length) {
      // No rank roles: optionally strip any existing prefix
      const currentName = newMember.nickname ?? newMember.user.username;
      const stripped = currentName.replace(/^(?:\[[^\]]+\]\s*|[^|]+\s*\|\s*)/, "");
      if (currentName !== stripped) {
        try {
          await newMember.setNickname(stripped, "Removed outdated rank prefix");
        } catch (e) {
          console.error(`Failed to strip prefix for ${newMember.id}:`, e);
        }
      }
      return;
    }

    // Highest-priority rank (first in config list)
    const highestRank = memberRanks[0];

    // Strip any existing prefix ([OLD] or OLD | ) to get base name
    const current = newMember.nickname ?? newMember.user.username;
    const base = current.replace(/^(?:\[[^\]]+\]\s*|[^|]+\s*\|\s*)/, "");

    // Desired new display
    const desiredNick = `${highestRank} | ${base}`;
    if (current === desiredNick) return;

    try {
      await newMember.setNickname(desiredNick, "Auto-updated rank prefix");
    } catch (err) {
      console.error(`Failed to update nickname for ${newMember.id}:`, err);
    }
  }
}
