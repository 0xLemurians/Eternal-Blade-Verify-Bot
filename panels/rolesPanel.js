import {
  ChannelType,
  EmbedBuilder,
  PermissionsBitField
} from "discord.js";

import {
  upsertPanelMessage
} from "../utils/panelMessage.js";


// ==================================================
// ROLES PANEL SETTINGS
// ==================================================

const ROLES_INFO_CHANNEL_ID =
  "1506653788084240454";

const ROLES_PANEL_MESSAGE_ID =
  process.env.ROLES_PANEL_MESSAGE_ID
    ?.trim() || "";

const TEAM_ROLES_PANEL_TITLE =
  "⚔️ ETERNAL BLADES — TEAM & SYSTEM ROLES";

const COMMUNITY_ROLES_PANEL_TITLE =
  "🔥 ETERNAL BLADES — COMMUNITY ROLES";

const ROLE_IDS = {
  eternalFounder:
    "1506665451923443875",
  communityManager:
    "1506668525874577489",
  eternalBladesBots:
    "1527374491175485480",
  vulcan:
    "1527334377191903265",
  eternalBlades:
    "1506659698529800263",
  firstForged:
    "1531702413545963651",
  chosenBlade:
    "1506664105459585115",
  swiftBlade:
    "1506660264584679584",
  bladeSeeker:
    "1506660051564237032",
  rumbleRoyale:
    "1506656400036855868",
  serverBooster:
    "1506667566964150453"
};


// ==================================================
// HELPERS
// ==================================================

function roleMention(roleId) {
  return `<@&${roleId}>`;
}


async function assertRolesChannelPermissions(
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
      "Roles info channel is missing bot permissions: " +
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
// CREATE ROLES PANEL
// ==================================================

function createRolesPanel() {
  const teamRolesEmbed =
    new EmbedBuilder()
      .setTitle(
        TEAM_ROLES_PANEL_TITLE
      )
      .setDescription(
        "These roles represent the official Eternal Blades team, management and server systems."
      )
      .setColor(
        "#f1c40f"
      )
      .addFields(
        {
          name:
            `👑 ${roleMention(
              ROLE_IDS.eternalFounder
            )}`,
          value:
            "Founder and owner of Eternal Blades. Responsible for the project’s vision, development and final decisions.",
          inline:
            false
        },
        {
          name:
            `👁️ ${roleMention(
              ROLE_IDS.communityManager
            )}`,
          value:
            "Manages the community, announcements, partnerships, events and member support.",
          inline:
            false
        },
        {
          name:
            `⚔️ ${roleMention(
              ROLE_IDS.eternalBlades
            )}`,
          value:
            "Official core team role for trusted members representing the Eternal Blades project.",
          inline:
            false
        },
        {
          name:
            `🤖 ${roleMention(
              ROLE_IDS.eternalBladesBots
            )}`,
          value:
            "Official bots developed and operated by Eternal Blades.",
          inline:
            false
        },
        {
          name:
            `🛡️ ${roleMention(
              ROLE_IDS.vulcan
            )}`,
          value:
            "Security, verification and server protection system.",
          inline:
            false
        }
      );

  const communityRolesEmbed =
    new EmbedBuilder()
      .setTitle(
        COMMUNITY_ROLES_PANEL_TITLE
      )
      .setDescription(
        "Community roles represent your status, participation and eligibility within Eternal Blades."
      )
      .setColor(
        "#9b59b6"
      )
      .addFields(
        {
          name:
            `⚔️ ${roleMention(
              ROLE_IDS.bladeSeeker
            )}`,
          value:
            "The default community role granted to verified Eternal Blades members.",
          inline:
            false
        },
        {
          name:
            `⚡ ${roleMention(
              ROLE_IDS.swiftBlade
            )}`,
          value:
            "Granted to members eligible for First Come, First Served opportunities.",
          inline:
            false
        },
        {
          name:
            `🔥 ${roleMention(
              ROLE_IDS.chosenBlade
            )}`,
          value:
            "Granted to members with Guaranteed allocation or GTD eligibility.",
          inline:
            false
        },
        {
          name:
            `🏆 ${roleMention(
              ROLE_IDS.firstForged
            )}`,
          value:
            "A special recognition role for early supporters who joined and supported Eternal Blades from the beginning.",
          inline:
            false
        },
        {
          name:
            `🎮 ${roleMention(
              ROLE_IDS.rumbleRoyale
            )}`,
          value:
            "Granted through Rumble Royale events, competitions or community activities.",
          inline:
            false
        },
        {
          name:
            `💎 ${roleMention(
              ROLE_IDS.serverBooster
            )}`,
          value:
            "Automatically granted to members actively boosting the Eternal Blades server.",
          inline:
            false
        }
      )
      .setFooter({
        text:
          "Some roles are granted automatically, while special roles are earned through eligibility, participation or community events."
      });

  return {
    embeds: [
      teamRolesEmbed,
      communityRolesEmbed
    ],
    components: [],
    allowedMentions: {
      parse: []
    }
  };
}


// ==================================================
// SETUP ROLES PANEL
// ==================================================

export async function setupRolesPanel(
  client
) {
  const rolesInfoChannel =
    await client.channels.fetch(
      ROLES_INFO_CHANNEL_ID
    );

  if (
    !rolesInfoChannel ||
    rolesInfoChannel.type !==
      ChannelType.GuildText
  ) {
    throw new Error(
      "Roles info channel was not found or is not a guild text channel."
    );
  }

  await assertRolesChannelPermissions(
    rolesInfoChannel
  );

  await upsertPanelMessage({
    channel:
      rolesInfoChannel,
    configuredMessageId:
      ROLES_PANEL_MESSAGE_ID,
    environmentVariableName:
      "ROLES_PANEL_MESSAGE_ID",
    panelName:
      "Roles panel",
    isExpectedPanel:
      message =>
        message.author.id ===
          client.user.id &&
        message.embeds.some(
          embed =>
            embed.title ===
            TEAM_ROLES_PANEL_TITLE
        ) &&
        message.embeds.some(
          embed =>
            embed.title ===
            COMMUNITY_ROLES_PANEL_TITLE
        ),
    buildPayload:
      () =>
        createRolesPanel()
  });
}
