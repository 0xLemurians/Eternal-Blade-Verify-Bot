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
// ROLES PANEL SETTINGS
// ==================================================

const ROLES_INFO_CHANNEL_ID =
  "1506653788084240454";

const ROLES_PANEL_MESSAGE_ID =
  process.env.ROLES_PANEL_MESSAGE_ID
    ?.trim() || "";

const COMMUNITY_ROLES_PANEL_TITLE =
  "🔥 ETERNAL BLADES — COMMUNITY ROLES";

const ROLE_IDS = {
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

function createRolesPanel(client) {
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
      .setThumbnail(
        client.user.displayAvatarURL({
          size:
            256
        })
      )
      .addFields(
        {
          name:
            "🛡️ ACCESS & ELIGIBILITY",
          value:
            [
              `⚔️ ${roleMention(
                ROLE_IDS.bladeSeeker
              )}`,
              "> The default community role granted to verified Eternal Blades members.",
              "",
              `⚡ ${roleMention(
                ROLE_IDS.swiftBlade
              )}`,
              "> Granted to members eligible for First Come, First Served opportunities.",
              "",
              `🔥 ${roleMention(
                ROLE_IDS.chosenBlade
              )}`,
              "> Granted to members with Guaranteed allocation or GTD eligibility."
            ].join("\n"),
          inline:
            false
        },
        {
          name:
            "🏆 RECOGNITION & SUPPORT",
          value:
            [
              `🏆 ${roleMention(
                ROLE_IDS.firstForged
              )}`,
              "> A special recognition role for early supporters who joined and supported Eternal Blades from the beginning.",
              "",
              `🎮 ${roleMention(
                ROLE_IDS.rumbleRoyale
              )}`,
              "> Granted through Rumble Royale events, competitions or community activities.",
              "",
              `💎 ${roleMention(
                ROLE_IDS.serverBooster
              )}`,
              "> Automatically granted to members actively boosting the Eternal Blades server."
            ].join("\n"),
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
      communityRolesEmbed
    ],
    components: [],
    flags:
      MessageFlags.SuppressNotifications,
    allowedMentions: {
      roles:
        Object.values(
          ROLE_IDS
        )
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
            COMMUNITY_ROLES_PANEL_TITLE
        ),
    buildPayload:
      () =>
        createRolesPanel(
          client
        )
  });
}
