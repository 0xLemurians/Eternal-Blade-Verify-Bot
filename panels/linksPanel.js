import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionsBitField
} from "discord.js";

import {
  upsertPanelMessage
} from "../utils/panelMessage.js";


// ==================================================
// LINKS PANEL SETTINGS
// ==================================================

const LINKS_CHANNEL_ID =
  "1506653753569447956";

/*
  Add the official links later.
  Empty values safely display "Coming Soon".
*/

const WEBSITE_URL =
  "https://x.com/S1Y4HS4NC4KS";

const TWITTER_URL =
  "";

const DISCORD_INVITE_URL =
  "";

const OPEN_TICKET_CHANNEL_ID =
  "1506778989736493106";

const LINKS_PANEL_TITLE =
  "🔗 Eternal Blades Official Links";

const LINKS_PANEL_MESSAGE_ID =
  process.env.LINKS_PANEL_MESSAGE_ID
    ?.trim() || "";


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


function createLinkField({
  configuredUrl,
  linkText,
  comingSoonText
}) {
  if (isValidUrl(configuredUrl)) {
    return `[${linkText}](${configuredUrl})`;
  }

  return comingSoonText;
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

function createLinksPanel(client) {
  const websiteField =
    createLinkField({
      configuredUrl:
        WEBSITE_URL,

      linkText:
        "Visit our official website",

      comingSoonText:
        "Coming Soon"
    });

  const twitterField =
    createLinkField({
      configuredUrl:
        TWITTER_URL,

      linkText:
        "Follow Eternal Blades on X",

      comingSoonText:
        "Coming Soon"
    });

  const discordField =
    createLinkField({
      configuredUrl:
        DISCORD_INVITE_URL,

      linkText:
        "Join the Eternal Blades Discord",

      comingSoonText:
        "Coming Soon"
    });

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
            " Website",

          value:
            websiteField,

          inline:
            false
        },

        {
          name:
            " Twitter / X",

          value:
            twitterField,

          inline:
            false
        },

        {
          name:
            " Discord",

          value:
            discordField,

          inline:
            false
        },

        {
          name:
            "🛠 Support",

          value:
            `Need assistance? Open a ticket in <#${OPEN_TICKET_CHANNEL_ID}>.`,

          inline:
            false
        }
      )
      .setFooter({
        text:
          "Eternal Blades • Official Channels"
      });

  const linkButtons = [];

  if (isValidUrl(WEBSITE_URL)) {
    linkButtons.push(
      new ButtonBuilder()
        .setLabel(
          "Website"
        )
        .setEmoji(
          "🌐"
        )
        .setStyle(
          ButtonStyle.Link
        )
        .setURL(
          WEBSITE_URL
        )
    );
  }

  if (isValidUrl(TWITTER_URL)) {
    linkButtons.push(
      new ButtonBuilder()
        .setLabel(
          "Twitter / X"
        )
        .setEmoji(
          ""
        )
        .setStyle(
          ButtonStyle.Link
        )
        .setURL(
          TWITTER_URL
        )
    );
  }

  if (isValidUrl(DISCORD_INVITE_URL)) {
    linkButtons.push(
      new ButtonBuilder()
        .setLabel(
          "Discord"
        )
        .setEmoji(
          ""
        )
        .setStyle(
          ButtonStyle.Link
        )
        .setURL(
          DISCORD_INVITE_URL
        )
    );
  }

  const components =
    linkButtons.length > 0
      ? [
          new ActionRowBuilder()
            .addComponents(
              linkButtons
            )
        ]
      : [];

  return {
    embeds: [
      embed
    ],

    components,

    allowedMentions: {
      parse: []
    }
  };
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
        () =>
          createLinksPanel(
            client
          )
    });

  } catch (error) {
    console.error(
      "Links panel setup error:",
      error
    );
  }
}
