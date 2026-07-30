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
  "ETERNAL BLADES — COMMUNITY ROLES";

const BLANK_LINE =
  "\u200B";

const ROLE_IDS = {
  firstBlades:
    "1531702413545963651",
  bladeWarden:
    "1506664105459585115",
  bladeVanguard:
    "1506660264584679584",
  bladeSeeker:
    "1506660051564237032",
  legendOfTheBlades:
    "1532166665482276964",
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
            "ACCESS & ELIGIBILITY",
          value:
            [
              BLANK_LINE,
              roleMention(
                ROLE_IDS.bladeSeeker
              ),
              BLANK_LINE,
              "> The first step into the Eternal Blades universe. Every warrior begins their journey as a Blade Seeker, ready to explore, contribute, and forge their own legacy.",
              BLANK_LINE,
              roleMention(
                ROLE_IDS.firstBlades
              ),
              BLANK_LINE,
              "> Awarded to the first warriors who entered the Eternal Blades universe. A symbol of those who answered the call the moment the gates opened.",
              BLANK_LINE,
              roleMention(
                ROLE_IDS.bladeVanguard
              ),
              BLANK_LINE,
              "> Awarded to those who secured a First Come, First Served whitelist spot. Awarded to the warriors who answered the call first. Blade Vanguard honors those who stood at the forefront of the Eternal Blades journey from the very beginning."
            ].join("\n"),
          inline:
            false
        },
        {
          name:
            BLANK_LINE,
          value:
            [
              BLANK_LINE,
              roleMention(
                ROLE_IDS.bladeWarden
              ),
              BLANK_LINE,
              "> Reserved for warriors personally chosen to receive a Guaranteed Whitelist. A mark of trust, commitment, and early belief in Eternal Blades.",
              BLANK_LINE,
              roleMention(
                ROLE_IDS.legendOfTheBlades
              ),
              BLANK_LINE,
              "> Reserved for the rare few whose extraordinary support leaves a permanent mark on Eternal Blades. This title cannot be earned through ordinary participation. It is bestowed only upon those whose actions become part of our story. Legends are remembered forever.",
              BLANK_LINE,
              roleMention(
                ROLE_IDS.serverBooster
              ),
              BLANK_LINE,
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
