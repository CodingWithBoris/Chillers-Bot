import {
  ChatInputCommandInteraction,
  CacheType,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  GuildMember,
  MessageFlagsBitField,
} from "discord.js";
import {
  SectionBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ContainerBuilder,
} from "@discordjs/builders";
import Command from "../../base/classes/Command";
import Category from "../../base/enums/Category";
import CustomClient from "../../base/classes/CustomClient";
import VerifiedUser from "../../base/schema/VerifiedUser";
import fetch from "node-fetch";

export default class Verify extends Command {
  constructor(client: CustomClient) {
    super(client, {
      name: "verify",
      description: "Verify your VRChat account",
      category: Category.Utilities,
      options: [
        {
          name: "username",
          description: "Your VRChat username",
          type: 3, // STRING
          required: true,
        },
      ],
      default_member_permissions: BigInt(0),
      dm_permission: false,
      cooldown: 60,
    });
  }

  async Execute(interaction: ChatInputCommandInteraction<CacheType>) {
    const member = interaction.member as GuildMember;
    const vrchatUsername = interaction.options.getString("username", true);

    // Generate 6-character code
    const code = [...Array(6)]
      .map(() => "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"[Math.floor(Math.random() * 32)])
      .join("");

    // ----- Components V2 -----
    const checkButton = new ButtonBuilder()
      .setCustomId("verify_check")
      .setLabel("Check")
      .setStyle(ButtonStyle.Primary);

    const headerText = new TextDisplayBuilder().setContent(
      `# ✅ VRChat Verification\n### Hello ${interaction.user.username}!\nPut this **6-character code** in your VRChat bio:\n\n\`\`\`${code}\`\`\`\nThen click **Check** below.`
    );

    const headerSection = new SectionBuilder()
      .addTextDisplayComponents(headerText)
      .setButtonAccessory(checkButton);

    const divider = new SeparatorBuilder().setDivider(true).setSpacing(1);

    const infoText = new TextDisplayBuilder().setContent(
      `ℹ️ This process verifies that you own your VRChat account. Your code expires in 60 seconds.`
    );

    const container = new ContainerBuilder()
      .addSectionComponents(headerSection)
      .addSeparatorComponents(divider)
      .addTextDisplayComponents(infoText);

    const v2Flag = MessageFlagsBitField.Flags.IsComponentsV2;

    await interaction.reply({
      content: "",
      flags: v2Flag,
      components: [container],
      ephemeral: true,
    });

    // ----- Collector -----
    const filter = (i: any) => i.user.id === interaction.user.id;
    const collector = interaction.channel?.createMessageComponentCollector({
      filter,
      componentType: ComponentType.Button,
      time: 60 * 1000,
    });

    collector?.on("collect", async (i) => {
      if (i.customId !== "verify_check") return;
      await i.deferUpdate();

      try {
        // --- Fetch VRChat user ---
        const fetchVRChatUser = async (): Promise<any> => {
          const client = this.client as CustomClient;

          const makeRequest = async () => {
            const cookieHeader = client.getVRChatCookieHeader();
            return fetch(
              `https://api.vrchat.cloud/api/1/users?search=${encodeURIComponent(
                vrchatUsername
              )}&n=1`,
              {
                headers: {
                  "User-Agent": "MyDiscordBot/1.0.0",
                  Accept: "application/json",
                  Referer: "https://vrchat.com/",
                  Cookie: cookieHeader,
                },
              }
            );
          };

          let res = await makeRequest();

          if (res.status === 401) {
            console.log("[Verify] VRChat cookie invalid (401). Re-logging...");
            const ok = await client.loginVRChat(true);
            if (!ok) throw new Error("Failed to re-login to VRChat");
            await new Promise((r) => setTimeout(r, 700));
            res = await makeRequest();
          }

          if (!res.ok) {
            const text = await res.text().catch(() => "<unreadable>");
            throw new Error(`VRChat API returned ${res.status}: ${text}`);
          }

          const usersData = await res.json();
          if (!Array.isArray(usersData) || usersData.length === 0)
            throw new Error(`Couldn't find VRChat user ${vrchatUsername}`);

          return usersData[0];
        };

        const vrUser = await fetchVRChatUser();
        const bio = vrUser.bio ?? "";

        if (!bio.includes(code)) {
          const failText = new TextDisplayBuilder().setContent(
            `❌ Code not found in your VRChat bio. Try again.`
          );

          const failContainer = new ContainerBuilder()
            .addTextDisplayComponents(failText)
            .addSeparatorComponents(divider)
      .addTextDisplayComponents(infoText);

          await interaction.editReply({
            content: "",
            flags: v2Flag,
            components: [failContainer],
          });
          collector.stop();
          return;
        }

        // Save verification
        await VerifiedUser.create({
          discordId: interaction.user.id,
          vrchatId: vrUser.id,
          username: vrUser.displayName,
          verificationCode: code,
          verifiedAt: new Date(),
        });

        const successText = new TextDisplayBuilder().setContent(
          `✅ Verified! Welcome, **${vrUser.displayName}**.`
        );

        const successContainer = new ContainerBuilder()
          .addTextDisplayComponents(successText)
          .addSeparatorComponents(divider)
      .addTextDisplayComponents(infoText);

        await interaction.editReply({
          content: "",
          flags: v2Flag,
          components: [successContainer],
        });

        // Update roles
        const guild = interaction.guild!;
        const verifiedRole = guild.roles.cache.get(this.client.config.VerifiedRoleId);
        const memberRole = guild.roles.cache.get(this.client.config.MemberRoleId);
        const unverifiedRole = guild.roles.cache.get(this.client.config.UnverifiedRoleId);

        if (verifiedRole) await member.roles.add(verifiedRole).catch(console.error);
        if (memberRole) await member.roles.add(memberRole).catch(console.error);
        if (unverifiedRole) await member.roles.remove(unverifiedRole).catch(console.error);

        collector.stop();
      } catch (err: any) {
        console.error("[Verify]", err);
        const errorText = new TextDisplayBuilder().setContent(
          "❌ Error verifying your VRChat account. Try again later."
        );

        const errorContainer = new ContainerBuilder()
          .addTextDisplayComponents(errorText)
          .addSeparatorComponents(divider)
      .addTextDisplayComponents(infoText);

        await interaction.editReply({
          content: "",
          flags: v2Flag,
          components: [errorContainer],
        });
        collector.stop();
      }
    });

    // Cleanup after 5 minutes
    setTimeout(async () => {
      await interaction.deleteReply().catch(() => null);
    }, 5 * 60 * 1000);
  }
}
