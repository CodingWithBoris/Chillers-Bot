export default interface IConfig {
  token: string;
  clientId: string;
  guildId: string;

  mongoURI: string;
  moderationChannelId: string;
  muteRoleId: string;
  warningReasons: string[];

  RankOrder: string[];
  RankSystem: Record<string, string>;

  Departments: {
    // top-level department role ids
    [key: string]: string | { [sub: string]: string };
  };

  Moderation: {
    Channels: {
      internalCase: string;
      punishmentLogs: string | string[];
    };
  };

  // Ticket system additions:
  supportChannelId?: string;
  ticketCategoryId?: string;
  transcriptionChannelId?: string;
  rulesChannelId: string;
}
