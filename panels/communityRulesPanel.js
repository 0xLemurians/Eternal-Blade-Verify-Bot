import {
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionsBitField
} from "discord.js";

import {
  upsertPanelMessage
} from "../utils/panelMessage.js";


// ==================================================
// COMMUNITY RULES PANEL SETTINGS
// ==================================================

const COMMUNITY_RULES_CHANNEL_ID =
  "1532179699256525011";

const COMMUNITY_RULES_PANEL_MESSAGE_ID =
  process.env.COMMUNITY_RULES_PANEL_MESSAGE_ID
    ?.trim() || "";

const COMMUNITY_RULES_PANEL_TITLE =
  "ETERNAL BLADES | COMMUNITY RULES";

const COMMUNITY_CLOSING_TITLE =
  "⚔️ TWO ERAS. ONE COMMUNITY.";


// ==================================================
// PERMISSIONS
// ==================================================

async function assertCommunityRulesPermissions(
  channel
) {
  const botMember =
    channel.guild.members.me ||
    await channel.guild.members.fetchMe();

  const permissions =
    channel.permissionsFor(
      botMember
    );

  const requiredPermissions = [
    {
      flag:
        PermissionsBitField.Flags.ViewChannel,
      name:
        "View Channel"
    },
    {
      flag:
        PermissionsBitField.Flags.SendMessages,
      name:
        "Send Messages"
    },
    {
      flag:
        PermissionsBitField.Flags.EmbedLinks,
      name:
        "Embed Links"
    },
    {
      flag:
        PermissionsBitField.Flags.ReadMessageHistory,
      name:
        "Read Message History"
    }
  ];

  const missingPermissions =
    requiredPermissions.filter(
      permission =>
        !permissions?.has(
          permission.flag
        )
    );

  if (missingPermissions.length > 0) {
    throw new Error(
      "Community rules channel is missing bot permissions: " +
      missingPermissions
        .map(
          permission =>
            permission.name
        )
        .join(", ")
    );
  }
}


// ==================================================
// CREATE COMMUNITY RULES PANEL
// ==================================================

function createCommunityRulesPanel(
  client
) {
  const introductionAndFirstRules =
    new EmbedBuilder()
      .setTitle(
        COMMUNITY_RULES_PANEL_TITLE
      )
      .setDescription(
        [
          "Welcome to Eternal Blades.",
          "",
          "Two different eras. One universe. Countless warriors.",
          "",
          "We all come from different backgrounds, different cultures, and different parts of the world. But under the banner of Eternal Blades, we are all part of the same community.",
          "",
          "We want to build a strong community within this universe. A place where creativity, art, technology, and gaming culture come together; where people can connect, share their ideas, and grow together.",
          "",
          "That is why there are certain rules every warrior must follow.",
          "",
          "**1. Every warrior deserves respect**",
          "",
          "Treat everyone with respect.",
          "",
          "Harassment, bullying, sexism, racism, hate speech, or degrading behavior targeting any individual will not be tolerated.",
          "",
          "Point your blades toward the challenges ahead, not at one another.",
          "",
          "**2. We stand under the same banner**",
          "",
          "Eternal Blades is not just a project. It is a universe we are building together.",
          "",
          "We may compete, debate, and hold different opinions here. But we must always do so with mutual respect.",
          "",
          "Our goal is not simply to become a large community, but to build a strong, creative, and genuinely connected one.",
          "",
          "**3. Spam and unauthorized promotion are prohibited**",
          "",
          "Do not spam, advertise, or promote your own project outside of designated areas.",
          "",
          "This also includes sending unsolicited direct messages to community members for advertising or promotional purposes.",
          "",
          "Appropriate action will be taken against accounts that attempt to use the Eternal Blades community for their own benefit."
        ].join("\n")
      )
      .setColor(
        "#ff0000"
      )
      .setThumbnail(
        client.user.displayAvatarURL({
          size:
            256
        })
      );

  const middleRules =
    new EmbedBuilder()
      .setDescription(
        [
          "**4. Explicit and inappropriate content is prohibited**",
          "",
          "NSFW, pornographic, excessively disturbing, or otherwise inappropriate content for a community environment is not permitted.",
          "",
          "This rule applies to text, images, videos, and links.",
          "",
          "**5. Report issues to the team**",
          "",
          "If you see behavior that violates the rules or encounter a situation that causes any community member to feel threatened, uncomfortable, or excluded, please report it to the moderation team.",
          "",
          "You do not have to try to resolve everything on your own.",
          "",
          "Protecting the community is a responsibility we all share.",
          "",
          "**6. Different opinions are welcome. Disrespect is not.**",
          "",
          "Constructive criticism, different perspectives, and open discussion are always valued within the Eternal Blades community.",
          "",
          "However, intentional FUD, spreading misinformation, persistent provocation, personal attacks, attempts to manipulate the community, and toxic communication will not be tolerated.",
          "",
          "Challenge ideas, not people."
        ].join("\n")
      )
      .setColor(
        "#ff0000"
      );

  const finalRules =
    new EmbedBuilder()
      .setDescription(
        [
          "**7. Protect your security**",
          "",
          "The Eternal Blades team will never ask for your password or seed phrase.",
          "",
          "Do not click suspicious links, and always verify the address before connecting your wallet.",
          "",
          "Official announcements will only be made through Eternal Blades' verified official channels.",
          "",
          "In the digital world, vigilance is the strongest armor.",
          "",
          "**8. Respect creativity and the work behind it**",
          "",
          "Eternal Blades is a universe built on art, creativity, and creation.",
          "",
          "Do not use other artists' work without permission, do not present work that is not yours as your own, and respect the efforts of community members.",
          "",
          "Every great universe exists because of the work of those who build it.",
          "",
          "**9. Respect moderation decisions**",
          "",
          "Violations of the rules may result in a warning, mute, temporary suspension, or permanent ban, depending on the nature and severity of the violation.",
          "",
          "Fraud, serious harassment, hate speech, malicious links, or situations that threaten the safety of the community may result in a permanent ban without prior warning.",
          "",
          "The purpose of the moderation team is not to punish people, but to protect the Eternal Blades community."
        ].join("\n")
      )
      .setColor(
        "#ff0000"
      );

  const communityClosing =
    new EmbedBuilder()
      .setTitle(
        COMMUNITY_CLOSING_TITLE
      )
      .setDescription(
        [
          "In the Eternal Blades universe, warriors of the medieval age and warriors of the future come face to face in the same world.",
          "",
          "Some will fight to survive.",
          "Some to conquer.",
          "Others to find their way home.",
          "",
          "But here on this Discord, we are all part of the same community.",
          "",
          "The world is already hard enough. Everyone is fighting battles in their own lives that others may never see. So let us make this a place where people can connect, create, have fun, and feel that they are truly part of something great.",
          "",
          "We may come from different eras.",
          "We may carry different stories.",
          "But here, we stand under the same banner.",
          "",
          "**Welcome to Eternal Blades. ⚔️**",
          "",
          "In addition to our own community rules, Discord's Community Guidelines and Terms of Service also apply to our server: https://discord.com/guidelines"
        ].join("\n")
      )
      .setColor(
        "#f1c40f"
      );

  return {
    embeds: [
      introductionAndFirstRules,
      middleRules,
      finalRules,
      communityClosing
    ],
    components: [],
    flags:
      MessageFlags.SuppressNotifications,
    allowedMentions: {
      parse: []
    }
  };
}


// ==================================================
// SETUP COMMUNITY RULES PANEL
// ==================================================

export async function setupCommunityRulesPanel(
  client
) {
  const communityRulesChannel =
    await client.channels.fetch(
      COMMUNITY_RULES_CHANNEL_ID
    );

  if (
    !communityRulesChannel ||
    communityRulesChannel.type !==
      ChannelType.GuildText
  ) {
    throw new Error(
      "Community rules channel was not found or is not a guild text channel."
    );
  }

  await assertCommunityRulesPermissions(
    communityRulesChannel
  );

  await upsertPanelMessage({
    channel:
      communityRulesChannel,
    configuredMessageId:
      COMMUNITY_RULES_PANEL_MESSAGE_ID,
    environmentVariableName:
      "COMMUNITY_RULES_PANEL_MESSAGE_ID",
    panelName:
      "Community rules panel",
    isExpectedPanel:
      message =>
        message.author.id ===
          client.user.id &&
        message.embeds.some(
          embed =>
            embed.title ===
            COMMUNITY_RULES_PANEL_TITLE
        ) &&
        message.embeds.some(
          embed =>
            embed.title ===
            COMMUNITY_CLOSING_TITLE
        ),
    buildPayload:
      () =>
        createCommunityRulesPanel(
          client
        )
  });
}
