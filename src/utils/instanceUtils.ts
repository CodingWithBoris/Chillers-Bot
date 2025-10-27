import {
    ChannelType,
    EmbedBuilder,
    ThreadAutoArchiveDuration,
    ThreadChannel,
  } from 'discord.js';
  import CustomClient from '../base/classes/CustomClient';
  import VRChatInstance, { IVRChatInstance } from '../base/schema/VRChatInstance';
  import VRChatUserInfo, { IVRChatUserInfo } from '../base/schema/VRChatUserInfo';
  import VerifiedUser from '../base/schema/VerifiedUser';
  import InstanceThreadLog from '../base/schema/InstanceThreadLog';
  
  /**
   * Build an embed for a user's first join into a VRChat instance.  Includes
   * details about the user, their linked Discord account if known, the world
   * and instance identifiers, and whether they are a group moderator.
   */
  export function buildInstanceJoinEmbed(
    vrchatUser: IVRChatUserInfo,
    vrchatInstance: IVRChatInstance,
    joinTime: Date,
    discordMention: string,
    isModerator: boolean
  ): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setTitle(`First Join – ${vrchatUser.username}`)
      .setColor(isModerator ? 'Green' : 'Blue')
      .addFields(
        { name: 'VRChat Name', value: vrchatUser.username, inline: true },
        { name: 'VRChat ID', value: vrchatUser.vrchatId, inline: true },
        { name: 'World ID', value: vrchatInstance.worldId, inline: true },
        { name: 'Instance ID', value: vrchatInstance.instanceId, inline: true },
        { name: 'First Join', value: joinTime.toISOString(), inline: false }
      );
    if (discordMention) {
      embed.addFields({ name: 'Discord', value: discordMention, inline: false });
    }
    if (isModerator) {
      embed.addFields({ name: 'Moderator', value: 'Yes', inline: true });
    }
    if (vrchatUser.trustLevel) {
      embed.addFields({ name: 'Trust Level', value: vrchatUser.trustLevel, inline: true });
    }
    return embed;
  }
  
  /**
   * Build an embed indicating that a VRChat instance has become unmoderated
   * and has therefore been closed.  Includes the world and instance IDs and
   * the time at which the last moderator left.
   */
  export function buildInstanceClosedEmbed(
    vrchatInstance: IVRChatInstance,
    closedAt: Date
  ): EmbedBuilder {
    return new EmbedBuilder()
      .setTitle('Instance Closed – No Moderators Present')
      .setColor('Red')
      .addFields(
        { name: 'World ID', value: vrchatInstance.worldId, inline: true },
        { name: 'Instance ID', value: vrchatInstance.instanceId, inline: true },
        { name: 'Closed At', value: closedAt.toISOString(), inline: false }
      )
      .setTimestamp(closedAt);
  }
  
  /**
   * Create or retrieve the Discord thread used to log first joins and
   * moderator events for a VRChat instance.  The thread is stored in
   * InstanceThreadLog so subsequent calls return the same thread.  If a
   * thread does not exist, it is created in the configured instanceLogs
   * channel (or internalCase as a fallback) with an initial message.
   *
   * @param client   The custom Discord client
   * @param guildId  The guild in which to create the thread
   * @param instance The VRChat instance document
   * @returns The thread channel in which the instance log resides
   */
  export async function getOrCreateInstanceThread(
    client: CustomClient,
    guildId: string,
    instance: IVRChatInstance
  ): Promise<ThreadChannel> {
    let logDoc = await InstanceThreadLog.findOne({ instanceId: instance.instanceId, guildId });
    if (!logDoc) {
      logDoc = new InstanceThreadLog({ instanceId: instance.instanceId, guildId });
      await logDoc.save();
    }
    // Resolve the channel to use for instance logs
    const channelId =
      client.config.Moderation.Channels.instanceLogs || client.config.Moderation.Channels.internalCase;
    const guild = await client.guilds.fetch(guildId);
    const channel = await guild.channels.fetch(channelId);
    if (!channel) {
      throw new Error('Instance log channel not found.');
    }
    if (
      channel.type !== ChannelType.GuildText &&
      channel.type !== ChannelType.GuildForum &&
      channel.type !== ChannelType.GuildMedia
    ) {
      throw new Error('Instance log channel must be a text, forum, or media channel.');
    }
    let thread: ThreadChannel | undefined;
    if (logDoc.threadId) {
      const fetched = await channel.threads.fetch(logDoc.threadId).catch(() => null);
      thread = fetched ?? undefined;
    }
    if (!thread) {
      // When creating a new thread, post an initial embed describing the instance
      const initEmbed = new EmbedBuilder()
        .setTitle(`Instance Log – ${instance.instanceId}`)
        .setColor('Blue')
        .addFields(
          { name: 'World ID', value: instance.worldId, inline: true },
          { name: 'Instance ID', value: instance.instanceId, inline: true },
          { name: 'Created', value: instance.createdAt.toISOString(), inline: false }
        )
        .setTimestamp(instance.createdAt);
      if (channel.type === ChannelType.GuildForum || channel.type === ChannelType.GuildMedia) {
        thread = await channel.threads.create({
          name: `${instance.worldId}:${instance.instanceId}`,
          autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
          reason: 'VRChat instance log',
          message: { embeds: [initEmbed] },
        });
        await thread.fetchStarterMessage();
        const starterId = thread.lastMessageId;
        if (starterId) logDoc.messageId = starterId;
      } else {
        thread = await channel.threads.create({
          name: `${instance.worldId}:${instance.instanceId}`,
          autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
          reason: 'VRChat instance log',
        });
        const msg = await thread.send({ embeds: [initEmbed] });
        logDoc.messageId = msg.id;
      }
      logDoc.threadId = thread.id;
      await logDoc.save();
    }
    return thread!;
  }
  
  /**
   * Resolve a Discord mention for the given VRChat user.  If the user already
   * has a discordId set, that is used.  Otherwise, attempt to look up a
   * VerifiedUser record and update the VRChatUserInfo with the discovered
   * discordId.  Returns an empty string if no Discord account is found.
   */
  export async function resolveDiscordMention(
    vrchatUser: IVRChatUserInfo
  ): Promise<string> {
    if (vrchatUser.discordId) {
      return `<@${vrchatUser.discordId}>`;
    }
    try {
      const verified = await VerifiedUser.findOne({ vrchatId: vrchatUser.vrchatId });
      if (verified) {
        vrchatUser.discordId = verified.discordId;
        await vrchatUser.save();
        return `<@${verified.discordId}>`;
      }
    } catch {
      // ignore errors
    }
    return '';
  }