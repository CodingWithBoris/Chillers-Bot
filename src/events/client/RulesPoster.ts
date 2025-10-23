// src/events/client/RulesPoster.ts
import Event from "../../base/classes/Event";
import { Events, ActionRowBuilder, StringSelectMenuBuilder, TextChannel, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, MessageFlagsBitField, MediaGalleryBuilder, MediaGalleryItemBuilder } from "discord.js";
import CustomClient from "../../base/classes/CustomClient";

export default class RulesPoster extends Event {
  constructor(client: CustomClient) {
    super(client, {
      name: Events.ClientReady,
      description: "Posts the concise 18+ server rules to the configured rules channel.",
      once: true,
    });
  }

  public async Execute() {
    try {
      const client = this.client as CustomClient;
      const cfg = client.config;

      const rulesChannelId = cfg.rulesChannelId;
      if (!rulesChannelId) {
        console.warn("[RulesPoster] rulesChannelId not set in config — skipping rules post.");
        return;
      }

      const guild = await client.guilds.fetch(cfg.guildId).catch(() => null);
      if (!guild) {
        console.warn("[RulesPoster] Could not fetch guild — skipping rules post.");
        return;
      }

      const chan = await guild.channels.fetch(rulesChannelId);
      if (!chan) {
        console.warn(`[RulesPoster] Rules channel ${rulesChannelId} not found — skipping rules post.`);
        return;
      }

      if (!chan.isTextBased()) {
        console.warn(`[RulesPoster] Rules channel ${rulesChannelId} is not a text channel — skipping rules post.`);
        return;
      }

      const textChan = chan as TextChannel;

      // Avoid reposting if a rules container is already present
        // Only post if the channel is empty
        const lastMsg = await textChan.messages.fetch({ limit: 1 }).catch(() => null);
        if (lastMsg && lastMsg.size > 0) {
            console.log("[RulesPoster] Channel not empty — skipping rules post.");
            return;
        }


        // Build text displays (concise rules)
      const title = new TextDisplayBuilder().setContent("# [Server Rules](https://docs.google.com/document/d/1nNJxoza8MnsThUwEbrQ7-U8kFhKJ4Njucsu6KjMMi7s/edit?usp=sharing) — 18+ Only");

      const rulesText1 = new TextDisplayBuilder().setContent(
`• **Age & Verification**: You must be 18+. By joining you confirm you are 18+. Verification via our VRChat 18+ check is required.`
      );

      const rulesText2 = new TextDisplayBuilder().setContent(
`• **Respect**: Be respectful. Harassment, hate speech, doxxing, stalking, or targeted abuse are banned. Don’t be a nuisance or disrupt conversations.`
      );

      const rulesText3 = new TextDisplayBuilder().setContent(
`• **Illegal Activity**: No promotion/coordination of illegal acts. Discussion or instruction to obtain/use hard drugs (e.g., heroin, cocaine) is prohibited.`
      );

      const rulesText4 = new TextDisplayBuilder().setContent(
`• **Sexual & NSFW**: Adult sexual content is allowed among consenting adults only. Non-consensual sexual content(unless kink-based), sexual content involving minors, bestiality(unless furries), or incest is strictly forbidden.`
      );

      const rulesText5 = new TextDisplayBuilder().setContent(
`• **VRChat & Platform Compliance**: Follow Discord & VRChat Terms. Some NSFW avatars/worlds may still violate VRChat rules — use caution and keep explicit content private.`
      );

      const rulesText6 = new TextDisplayBuilder().setContent(
`• **Spam & Ads**: No spam, mass-pinging, or unsolicited advertising. Keep channels on-topic.`
      );

      const rulesText7 = new TextDisplayBuilder().setContent(
`• **Moderation**: We keep moderation light but consistent. Mods may warn/mute/kick/ban for rule violations. Appeals can be made to staff via DM.`
      );

      const rulesFooter = new TextDisplayBuilder().setContent(
`-# By remaining in this server you confirm you are 18+ and agree to follow these rules.`
      );

      // Relevant policy links (displayed at end)
      const linksText = new TextDisplayBuilder().setContent(
`Relevant policy & guidance:
-# • Discord Sexual Content & Age rules: https://discord.com/safety/sexual-content-policy-explainer
-# • Discord Age-Restricted Content: https://support.discord.com/hc/en-us/articles/115000084051-Age-Restricted-Channels-and-Content
-# • Discord Community Guidelines: https://discord.com/guidelines
-# • VRChat Community Guidelines: https://hello.vrchat.com/community-guidelines
-# • VRChat Terms & Legal: https://hello.vrchat.com/legal`
      );

      // Optional header image (replace URL if desired)
      const headerImageItem = new MediaGalleryItemBuilder()
        .setURL("https://cdn.discordapp.com/attachments/1416070724015362139/1416434965549158585/Support_Tickets_3_1.png?ex=68c6d55b&is=68c583db&hm=d6e8093b8892ed33f5ac727da6dba32a1ef1ba8f739f0e307e2d129779616ea5&")
        .setDescription("Rules");

      const headerGallery = new MediaGalleryBuilder().addItems(headerImageItem);

      const separator = new SeparatorBuilder().setDivider(true).setSpacing(1);
      const bigSeparator = new SeparatorBuilder().setDivider(true).setSpacing(2);

      const v2Flag = MessageFlagsBitField.Flags.IsComponentsV2;

      // NOTE: we give the top-level component a customId so we can detect duplicates above
      const rulesContainer = new ContainerBuilder()
        .addMediaGalleryComponents(headerGallery)
        .addSeparatorComponents(bigSeparator)
        .addTextDisplayComponents(title)
        .addTextDisplayComponents(rulesText1)
        .addTextDisplayComponents(rulesText2)
        .addTextDisplayComponents(rulesText3)
        .addTextDisplayComponents(rulesText4)
        .addTextDisplayComponents(rulesText5)
        .addTextDisplayComponents(rulesText6)
        .addTextDisplayComponents(rulesText7)
        .addTextDisplayComponents(rulesFooter)
        .addSeparatorComponents(separator)
        .addTextDisplayComponents(linksText);

      await textChan.send({
        flags: v2Flag,
        components: [rulesContainer],
      });

      console.log("[RulesPoster] Rules panel posted to rules channel.");
    } catch (err) {
      console.error("[RulesPoster] Error while attempting to post rules panel:", err);
    }
  }
}
