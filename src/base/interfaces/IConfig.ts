export default interface IConfig {
  token: string;
  clientId: string;
  guildId: string;
  VRChat_Group_ID: string
  VRCHAT_USERNAME : string;
  VRCHAT_PASSWORD : string;
  VRCHAT_2FA_SECRET : string;
  AUTH_COOKIE: string;
  TWOFA_COOKIE: string;

  mongoURI: string;
  moderationChannelId: string;
  muteRoleId: string;
  warningReasons: string[];

  RankOrder: string[];
  RankSystem: Record<string, string>;
  VerifiedRoleId: string;
  MemberRoleId: string;
  UnverifiedRoleId: string;

  Departments: {
    // top-level department role ids
    [key: string]: string | { [sub: string]: string };
  };

  Moderation: {
    Channels: {
      internalCase: string;
      punishmentLogs: string | string[];
      instanceLogs : string;
      moderatorLogs : string;
    };
  };

  // Ticket system additions:
  supportChannelId?: string;
  ticketCategoryId?: string;
  transcriptionChannelId?: string;
  rulesChannelId: string;
}
