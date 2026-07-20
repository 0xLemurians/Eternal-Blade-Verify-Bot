import {
  AttachmentBuilder,
  EmbedBuilder,
  ChannelType,
  PermissionsBitField
} from "discord.js";

import {
  existsSync
} from "node:fs";

import {
  fileURLToPath
} from "node:url";

import {
  upsertPanelMessage
} from "../utils/panelMessage.js";


// ==================================================
// LINKS PANEL SETTINGS
// ==================================================

const LINKS_CHANNEL_ID =
  "1506653753569447956";

/*
  Add the official website later.
  Empty values safely display "Coming Soon".
*/

const WEBSITE_URL =
  "";

const TWITTER_URL =
  "https://x.com/EternalBladesW";

const LINKS_PANEL_TITLE =
  "🔗 Eternal Blades Official Links";

const LINKS_PANEL_MESSAGE_ID =
  process.env.LINKS_PANEL_MESSAGE_ID
    ?.trim() || "";

const LINKS_BANNER_NAME =
  "links-banner.gif";

const LINKS_BANNER_PATH =
  fileURLToPath(
    new URL(
      `../assets/${LINKS_BANNER_NAME}`,
      import.meta.url
    )
  );


// ==================================================
// HELPERS
// ==================================================

function isValidUrl(value) {
  if (!value) {
    return false;
  }

  try {
    const url =
      new URL(value);

    return (
      url.protocol === "https:" ||
      url.protocol === "http:"
    );

  } catch {
    return false;
  }
}


function getDisplayedUrl(
  configuredUrl
) {
  return isValidUrl(
    configuredUrl
  )
    ? configuredUrl
    : "Coming Soon";
}


async function assertLinksChannelPermissions(
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
        PermissionsBitField.Flags.AttachFiles,
      name:
        "Attach Files"
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
      "Links channel is missing bot permissions: " +
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
// CREATE LINKS PANEL
// ==================================================

function createLinksPanel(
  client,
  context = {}
) {
  const bannerAttachment =
    new AttachmentBuilder(
      LINKS_BANNER_PATH,
      {
        name:
          LINKS_BANNER_NAME
      }
    );

  const embed =
    new EmbedBuilder()
      .setTitle(
        LINKS_PANEL_TITLE
      )
      .setDescription(
        [
          "Welcome to Eternal Blades.",
          "",
          "Please use only the official links listed below."
        ].join("\n")
      )
      .setColor(
        "#ff0000"
      )
      .setThumbnail(
        client.user.displayAvatarURL({
          extension:
            "png",

          size:
            256
        })
      )
      .addFields(
        {
          name:
            "Website",

          value:
            getDisplayedUrl(
              WEBSITE_URL
            ),

          inline:
            false
        },

        {
          name:
            "Twitter / X",

          value:
            getDisplayedUrl(
              TWITTER_URL
            ),

          inline:
            false
        }
      )
      .setImage(
        `attachment://${LINKS_BANNER_NAME}`
      )
      .setFooter({
        text:
          "Eternal Blades • Official Channels"
      });

  const payload = {
    embeds: [
      embed
    ],

    files: [
      bannerAttachment
    ],

    components: [],

    allowedMentions: {
      parse: []
    }
  };

  /*
    When the existing panel is edited, remove its old
    attachment before uploading the current GIF again.
    This prevents duplicate attachments after deploys.
  */

  if (context.mode === "edit") {
    payload.attachments = [];
  }

  return payload;
}


// ==================================================
// SETUP LINKS PANEL
// ==================================================

export async function setupLinksPanel(
  client
) {
  try {
    if (
      !LINKS_CHANNEL_ID ||
      LINKS_CHANNEL_ID.includes(
        "PASTE_"
      )
    ) {
      console.warn(
        "Links panel skipped: LINKS_CHANNEL_ID has not been configured."
      );

      return;
    }

    if (!existsSync(LINKS_BANNER_PATH)) {
      throw new Error(
        `Links banner was not found: assets/${LINKS_BANNER_NAME}`
      );
    }

    const linksChannel =
      await client.channels.fetch(
        LINKS_CHANNEL_ID
      );

    if (
      !linksChannel ||
      linksChannel.type !==
        ChannelType.GuildText
    ) {
      throw new Error(
        "Links panel channel was not found or is not a guild text channel."
      );
    }

    await assertLinksChannelPermissions(
      linksChannel
    );

    await upsertPanelMessage({
      channel:
        linksChannel,

      configuredMessageId:
        LINKS_PANEL_MESSAGE_ID,

      environmentVariableName:
        "LINKS_PANEL_MESSAGE_ID",

      panelName:
        "Links panel",

      isExpectedPanel:
        message =>
          message.author.id ===
            client.user.id &&
          message.embeds.some(
            embed =>
              embed.title ===
              LINKS_PANEL_TITLE
          ),

      buildPayload:
        context =>
          createLinksPanel(
            client,
            context
          )
    });

  } catch (error) {
    console.error(
      "Links panel setup error:",
      error
    );
  }
}
