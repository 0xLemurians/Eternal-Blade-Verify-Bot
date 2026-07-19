import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
  ChannelType,
  Events,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ThreadAutoArchiveDuration,
  MessageFlags
} from "discord.js";

import {
  setupLinksPanel
} from "./panels/linksPanel.js";

import {
  upsertPanelMessage
} from "./utils/panelMessage.js";


// ==================================================
// DISCORD CLIENT
// ==================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});


// ==================================================
// DISCORD IDS
// ==================================================

const OPEN_TICKET_CHANNEL_ID =
  "1506778989736493106";

const TICKET_PANEL_MESSAGE_ID =
  process.env.TICKET_PANEL_MESSAGE_ID
    ?.trim() || "";

const SUPPORT_CATEGORY_ID =
  "1506778963392069734";

const SUPPORT_TRANSCRIPT_CHANNEL_ID =
  "1527352998936707193";

const COLLAB_TRANSCRIPT_CHANNEL_ID =
  "1527352927960698994";

const STAFF_ROLE_IDS = [
  "1506665451923443875", // Eternal Founder
  "1506668525874577489"  // Community Manager
];


// ==================================================
// SETTINGS AND RUNTIME STATE
// ==================================================

const ALLOWED_TICKET_TYPES = [
  "support",
  "collab"
];

const SHUTDOWN_MAX_WAIT_MS =
  25_000;

const creatingTickets =
  new Set();

const closingTickets =
  new Set();

let isShuttingDown =
  false;


// ==================================================
// SMALL HELPERS
// ==================================================

function sleep(milliseconds) {
  return new Promise(
    resolve =>
      setTimeout(
        resolve,
        milliseconds
      )
  );
}


function truncate(value, maxLength) {
  const text =
    String(value ?? "");

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(
    0,
    Math.max(
      0,
      maxLength - 3
    )
  )}...`;
}


function formatDate(timestamp) {
  return new Date(timestamp).toLocaleString(
    "tr-TR",
    {
      timeZone:
        "Europe/Istanbul",

      year:
        "numeric",

      month:
        "2-digit",

      day:
        "2-digit",

      hour:
        "2-digit",

      minute:
        "2-digit",

      second:
        "2-digit"
    }
  );
}


function formatThreadTimestamp(timestamp) {
  const parts =
    new Intl.DateTimeFormat(
      "en-GB",
      {
        timeZone:
          "Europe/Istanbul",

        year:
          "numeric",

        month:
          "2-digit",

        day:
          "2-digit",

        hour:
          "2-digit",

        minute:
          "2-digit",

        second:
          "2-digit",

        hourCycle:
          "h23"
      }
    ).formatToParts(
      new Date(timestamp)
    );

  const values = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] =
        part.value;
    }
  }

  return (
    `${values.year}` +
    `${values.month}` +
    `${values.day}-` +
    `${values.hour}` +
    `${values.minute}` +
    `${values.second}`
  );
}


function parseTicketMetadata(topic = "") {
  const ownerMatch =
    topic.match(
      /User ID:\s*(\d+)/i
    );

  const typeMatch =
    topic.match(
      /Type:\s*(support|collab)/i
    );

  const openedAtMatch =
    topic.match(
      /Opened At:\s*(\d+)/i
    );

  return {
    ownerId:
      ownerMatch?.[1] || null,

    type:
      typeMatch?.[1]
        ?.toLowerCase() || null,

    openedAt:
      openedAtMatch?.[1]
        ? Number(
            openedAtMatch[1]
          )
        : null
  };
}


function getTranscriptChannelId(type) {
  if (type === "support") {
    return SUPPORT_TRANSCRIPT_CHANNEL_ID;
  }

  if (type === "collab") {
    return COLLAB_TRANSCRIPT_CHANNEL_ID;
  }

  return null;
}


function hasStaffRole(member) {
  return STAFF_ROLE_IDS.some(
    roleId =>
      member.roles.cache.has(
        roleId
      )
  );
}


function getTicketCreationKey({
  guildId,
  userId,
  type
}) {
  return `${guildId}:${userId}:${type}`;
}


function isTicketChannelForUser(
  channel,
  userId,
  type
) {
  if (
    channel.type !==
      ChannelType.GuildText ||
    channel.parentId !==
      SUPPORT_CATEGORY_ID
  ) {
    return false;
  }

  const metadata =
    parseTicketMetadata(
      channel.topic || ""
    );

  return (
    metadata.ownerId === userId &&
    metadata.type === type
  );
}


function validateTicketChannel(channel) {
  if (
    !channel ||
    channel.type !==
      ChannelType.GuildText
  ) {
    throw new Error(
      "The interaction channel is not a guild text channel."
    );
  }

  if (
    channel.parentId !==
    SUPPORT_CATEGORY_ID
  ) {
    throw new Error(
      "The close button was used outside the configured ticket category."
    );
  }

  const metadata =
    parseTicketMetadata(
      channel.topic || ""
    );

  if (!metadata.ownerId) {
    throw new Error(
      "Ticket owner metadata is missing."
    );
  }

  if (
    !metadata.type ||
    !ALLOWED_TICKET_TYPES.includes(
      metadata.type
    )
  ) {
    throw new Error(
      "Ticket type metadata is missing or invalid."
    );
  }

  return metadata;
}


async function assertChannelPermissions(
  channel,
  requiredPermissions,
  channelLabel
) {
  const botMember =
    channel.guild.members.me ||
    await channel.guild.members.fetchMe();

  const permissions =
    channel.permissionsFor(
      botMember
    );

  const missing =
    requiredPermissions.filter(
      permission =>
        !permissions?.has(
          permission.flag
        )
    );

  if (missing.length > 0) {
    throw new Error(
      `${channelLabel} is missing bot permissions: ` +
      missing
        .map(
          permission =>
            permission.name
        )
        .join(", ")
    );
  }
}


async function validateStaffRoles(guild) {
  const roles =
    await guild.roles.fetch();

  const missingRoleIds =
    STAFF_ROLE_IDS.filter(
      roleId =>
        !roles.has(roleId)
    );

  if (missingRoleIds.length > 0) {
    console.error(
      "Configured staff roles could not be found:",
      missingRoleIds
    );

    return false;
  }

  console.log(
    "Staff role IDs validated successfully."
  );

  return true;
}


// ==================================================
// FETCH ALL TICKET MESSAGES
// ==================================================

async function fetchAllTicketMessages(channel) {
  const messages = [];

  let before;

  while (true) {
    const batch =
      await channel.messages.fetch({
        limit:
          100,

        ...(before
          ? {
              before
            }
          : {})
      });

    if (batch.size === 0) {
      break;
    }

    messages.push(
      ...batch.values()
    );

    before =
      batch.last().id;

    if (batch.size < 100) {
      break;
    }
  }

  return messages.sort(
    (first, second) =>
      first.createdTimestamp -
      second.createdTimestamp
  );
}


// ==================================================
// TICKET PANEL
// ==================================================

function createTicketPanel() {
  const ticketPanelEmbed =
    new EmbedBuilder()
      .setTitle(
        "🎫 Eternal Blades Ticket Center"
      )
      .setDescription(
        [
          "Please select the category that best matches your request.",
          "",
          "Our team will review your ticket as soon as possible."
        ].join("\n")
      )
      .setColor(
        "#ff0000"
      )
      .addFields(
        {
          name:
            "✅ Open a ticket for:",

          value:
            [
              "• Support issues",
              "• Technical problems",
              "• Collaboration requests",
              "• Partnership proposals"
            ].join("\n"),

          inline:
            false
        },

        {
          name:
            "❌ Do not open a ticket for:",

          value:
            [
              "• General chat",
              "• Repeated spam",
              "• Questions already answered in #announcements or #links",
              "• Fake or unserious partnership offers",
              "• Duplicate tickets about the same issue"
            ].join("\n"),

          inline:
            false
        },

        {
          name:
            "📌 Before opening a ticket:",

          value:
            [
              "• Check #announcements and #links first",
              "• Choose the correct ticket category",
              "• Explain your request clearly",
              "• Keep only one active ticket per category"
            ].join("\n"),

          inline:
            false
        }
      )
      .setFooter({
        text:
          "Eternal Blades Support System"
      });

  const ticketSelectMenu =
    new StringSelectMenuBuilder()
      .setCustomId(
        "ticket_select"
      )
      .setPlaceholder(
        "▼ Choose a ticket category"
      )
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel(
            "Support"
          )
          .setDescription(
            "Technical help, questions and support issues."
          )
          .setEmoji(
            "🛠️"
          )
          .setValue(
            "support"
          ),

        new StringSelectMenuOptionBuilder()
          .setLabel(
            "Collaboration"
          )
          .setDescription(
            "Partnerships, proposals and business inquiries."
          )
          .setEmoji(
            "🤝"
          )
          .setValue(
            "collab"
          )
      );

  return {
    embeds: [
      ticketPanelEmbed
    ],

    components: [
      new ActionRowBuilder()
        .addComponents(
          ticketSelectMenu
        )
    ]
  };
}


async function setupTicketPanel() {
  try {
    const ticketPanelChannel =
      await client.channels.fetch(
        OPEN_TICKET_CHANNEL_ID
      );

    if (
      !ticketPanelChannel ||
      ticketPanelChannel.type !==
        ChannelType.GuildText
    ) {
      throw new Error(
        "Ticket panel channel was not found or is not a guild text channel."
      );
    }

    await validateStaffRoles(
      ticketPanelChannel.guild
    );

    await assertChannelPermissions(
      ticketPanelChannel,
      [
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
      ],
      "Ticket panel channel"
    );

    await upsertPanelMessage({
      channel:
        ticketPanelChannel,

      configuredMessageId:
        TICKET_PANEL_MESSAGE_ID,

      environmentVariableName:
        "TICKET_PANEL_MESSAGE_ID",

      panelName:
        "Ticket panel",

      isExpectedPanel:
        message =>
          message.author.id ===
            client.user.id &&
          message.components.some(
            row =>
              row.components.some(
                component =>
                  component.customId ===
                  "ticket_select"
              )
          ),

      buildPayload:
        () =>
          createTicketPanel()
    });

  } catch (error) {
    console.error(
      "Ticket panel setup error:",
      error
    );
  }
}


// ==================================================
// TICKET MESSAGE EMBEDS
// ==================================================

function createTicketOpeningPayload(
  type,
  userId
) {
  const closeButton =
    new ButtonBuilder()
      .setCustomId(
        "close_ticket"
      )
      .setLabel(
        "CLOSE TICKET"
      )
      .setEmoji(
        "🗑️"
      )
      .setStyle(
        ButtonStyle.Danger
      );

  const supportEmbed =
    new EmbedBuilder()
      .setTitle(
        "🎫 SUPPORT TICKET"
      )
      .setDescription(
        [
          "Welcome to Eternal Blades Support.",
          "",
          "Please explain your issue clearly and provide any useful details or screenshots.",
          "",
          "A team member will assist you shortly."
        ].join("\n")
      )
      .setColor(
        "#ff0000"
      )
      .addFields(
        {
          name:
            "📌 Please include:",

          value:
            [
              "• A clear explanation of the problem",
              "• Screenshots or relevant files",
              "• The steps that caused the issue",
              "• Any other useful information"
            ].join("\n"),

          inline:
            false
        },

        {
          name:
            "⏳ Response time",

          value:
            "Please remain patient and avoid repeatedly mentioning staff members.",

          inline:
            false
        }
      )
      .setFooter({
        text:
          "The ticket creator or authorized staff members can close this ticket."
      })
      .setTimestamp();

  const collabEmbed =
    new EmbedBuilder()
      .setTitle(
        "🤝 COLLABORATION TICKET"
      )
      .setDescription(
        [
          "Welcome to the Eternal Blades Collaboration Desk.",
          "",
          "Please introduce your project and explain what kind of collaboration you are proposing.",
          "",
          "Our team will review your request shortly."
        ].join("\n")
      )
      .setColor(
        "#ff0000"
      )
      .addFields(
        {
          name:
            "📋 Please include:",

          value:
            [
              "• Project or community name",
              "• Official website and social links",
              "• Community size and activity",
              "• Your proposed collaboration",
              "• What both communities will gain"
            ].join("\n"),

          inline:
            false
        },

        {
          name:
            "⚠️ Important",

          value:
            "Fake, incomplete or unserious partnership offers may be closed without a response.",

          inline:
            false
        }
      )
      .setFooter({
        text:
          "The ticket creator or authorized staff members can close this ticket."
      })
      .setTimestamp();

  return {
    content:
      `<@${userId}>`,

    allowedMentions: {
      users: [
        userId
      ]
    },

    embeds: [
      type === "support"
        ? supportEmbed
        : collabEmbed
    ],

    components: [
      new ActionRowBuilder()
        .addComponents(
          closeButton
        )
    ]
  };
}


// ==================================================
// OPEN-TICKET HELPERS
// ==================================================

async function getOpenTickets(
  guild,
  userId,
  type
) {
  await guild.channels.fetch();

  return [
    ...guild.channels.cache.values()
  ]
    .filter(
      channel =>
        isTicketChannelForUser(
          channel,
          userId,
          type
        )
    )
    .sort(
      (first, second) =>
        first.createdTimestamp -
        second.createdTimestamp
    );
}


async function buildTicketPermissionOverwrites(
  guild,
  userId
) {
  const roles =
    await guild.roles.fetch();

  const permissionOverwrites = [
    {
      id:
        guild.id,

      deny: [
        PermissionsBitField.Flags.ViewChannel
      ]
    },

    {
      id:
        client.user.id,

      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.ManageChannels,
        PermissionsBitField.Flags.EmbedLinks,
        PermissionsBitField.Flags.AttachFiles
      ]
    },

    {
      id:
        userId,

      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.EmbedLinks,
        PermissionsBitField.Flags.AttachFiles
      ]
    }
  ];

  for (const roleId of STAFF_ROLE_IDS) {
    if (!roles.has(roleId)) {
      console.error(
        `Configured staff role was not found: ${roleId}`
      );

      continue;
    }

    permissionOverwrites.push({
      id:
        roleId,

      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.EmbedLinks,
        PermissionsBitField.Flags.AttachFiles
      ]
    });
  }

  const configuredStaffCount =
    STAFF_ROLE_IDS.filter(
      roleId =>
        roles.has(roleId)
    ).length;

  if (configuredStaffCount === 0) {
    throw new Error(
      "No configured staff role could be found. Ticket creation was stopped for safety."
    );
  }

  return permissionOverwrites;
}


async function handleTicketCreation(
  interaction
) {
  if (!interaction.guild) {
    return interaction.reply({
      content:
        "❌ This action can only be used in a server.",

      flags:
        MessageFlags.Ephemeral
    });
  }

  await interaction.deferReply({
    flags:
      MessageFlags.Ephemeral
  });

  const type =
    interaction.values[0];

  if (
    !ALLOWED_TICKET_TYPES.includes(
      type
    )
  ) {
    return interaction.editReply({
      content:
        "❌ Invalid ticket category."
    });
  }

  const creationKey =
    getTicketCreationKey({
      guildId:
        interaction.guild.id,

      userId:
        interaction.user.id,

      type
    });

  if (
    creatingTickets.has(
      creationKey
    )
  ) {
    return interaction.editReply({
      content:
        "⏳ Your ticket is already being created. Please wait."
    });
  }

  creatingTickets.add(
    creationKey
  );

  let createdTicketChannel =
    null;

  let openingMessageSent =
    false;

  try {
    const existingTickets =
      await getOpenTickets(
        interaction.guild,
        interaction.user.id,
        type
      );

    if (existingTickets.length > 0) {
      const keeper =
        existingTickets[0];

      if (existingTickets.length > 1) {
        console.warn(
          `Multiple existing ${type} tickets were found for user ${interaction.user.id}. No existing channel was deleted automatically.`
        );
      }

      return interaction.editReply({
        content:
          `❌ You already have an open ${type} ticket: ${keeper}`
      });
    }

    const safeUsername =
      interaction.user.username
        .toLowerCase()
        .replace(
          /[^a-z0-9]/g,
          ""
        )
        .slice(
          0,
          18
        );

    const usernamePart =
      safeUsername ||
      "user";

    const ticketName =
      `${type}-${usernamePart}-` +
      `${interaction.user.id.slice(-6)}`;

    const permissionOverwrites =
      await buildTicketPermissionOverwrites(
        interaction.guild,
        interaction.user.id
      );

    const openedAt =
      Date.now();

    createdTicketChannel =
      await interaction.guild.channels.create({
        name:
          ticketName,

        type:
          ChannelType.GuildText,

        parent:
          SUPPORT_CATEGORY_ID,

        topic:
          `Ticket Owner: ${interaction.user.tag} | ` +
          `User ID: ${interaction.user.id} | ` +
          `Type: ${type} | ` +
          `Opened At: ${openedAt}`,

        permissionOverwrites,

        reason:
          `${type} ticket opened by ${interaction.user.tag}`
      });

    /*
      A short delay plus a second server fetch closes
      the small race window where two requests arrive
      almost at exactly the same time.
    */

    await sleep(
      350
    );

    const postCreationTickets =
      await getOpenTickets(
        interaction.guild,
        interaction.user.id,
        type
      );

    const keeper =
      postCreationTickets[0];

    if (
      keeper.id !==
      createdTicketChannel.id
    ) {
      await createdTicketChannel
        .delete(
          "Duplicate ticket creation prevented"
        )
        .catch(
          deleteError =>
            console.error(
              "New duplicate ticket cleanup error:",
              deleteError
            )
        );

      return interaction.editReply({
        content:
          `❌ You already have an open ${type} ticket: ${keeper}`
      });
    }

    if (postCreationTickets.length > 1) {
      console.warn(
        `A possible cross-process ticket race was detected for user ${interaction.user.id}. Existing channels were preserved to avoid data loss.`
      );
    }

    await createdTicketChannel.send(
      createTicketOpeningPayload(
        type,
        interaction.user.id
      )
    );

    openingMessageSent =
      true;

    await interaction.editReply({
      content:
        `✅ Ticket created: ${createdTicketChannel}`
    });

    setTimeout(
      () => {
        interaction
          .deleteReply()
          .catch(
            () => {}
          );
      },
      5000
    ).unref();

  } catch (error) {
    if (
      createdTicketChannel &&
      !openingMessageSent
    ) {
      await createdTicketChannel
        .delete(
          "Ticket creation rollback after an error"
        )
        .catch(
          rollbackError =>
            console.error(
              "Ticket rollback error:",
              rollbackError
            )
        );
    }

    throw error;

  } finally {
    creatingTickets.delete(
      creationKey
    );
  }
}


// ==================================================
// TRANSCRIPT HELPERS
// ==================================================

function isOpeningBotMessage(message) {
  if (
    message.author.id !==
    client.user.id
  ) {
    return false;
  }

  return message.components.some(
    row =>
      row.components.some(
        component =>
          component.customId ===
          "close_ticket"
      )
  );
}


function getMessageDisplayName(message) {
  return (
    message.member?.displayName ||
    message.author.globalName ||
    message.author.username
  );
}


function getOriginalEmbedText(message) {
  if (!message.embeds.length) {
    return "";
  }

  const parts = [];

  for (const embed of message.embeds) {
    if (embed.title) {
      parts.push(
        `**${embed.title}**`
      );
    }

    if (embed.description) {
      parts.push(
        embed.description
      );
    }

    for (
      const field
      of embed.fields || []
    ) {
      parts.push(
        `**${field.name}**\n${field.value}`
      );
    }

    if (embed.url) {
      parts.push(
        embed.url
      );
    }
  }

  return parts.join(
    "\n\n"
  );
}


function getStickerText(message) {
  if (!message.stickers?.size) {
    return "";
  }

  return message.stickers
    .map(
      sticker =>
        `Sticker: ${sticker.name} — ${sticker.url}`
    )
    .join(
      "\n"
    );
}


function getAttachmentLinksText(message) {
  if (!message.attachments.size) {
    return "";
  }

  return message.attachments
    .map(
      attachment => {
        const name =
          attachment.name ||
          "attachment";

        return (
          `📎 [${name}]` +
          `(${attachment.url})`
        );
      }
    )
    .join(
      "\n"
    );
}


function buildThreadEmbed(
  message,
  includeAttachmentLinks = false
) {
  const sections = [];

  if (message.content) {
    sections.push(
      message.content
    );
  }

  const originalEmbedText =
    getOriginalEmbedText(
      message
    );

  if (originalEmbedText) {
    sections.push(
      originalEmbedText
    );
  }

  const stickerText =
    getStickerText(
      message
    );

  if (stickerText) {
    sections.push(
      stickerText
    );
  }

  if (includeAttachmentLinks) {
    const attachmentText =
      getAttachmentLinksText(
        message
      );

    if (attachmentText) {
      sections.push(
        attachmentText
      );
    }
  }

  const description =
    truncate(
      sections.join(
        "\n\n"
      ) ||
      "*Mesaj içeriği yok.*",
      4000
    );

  return new EmbedBuilder()
    .setAuthor({
      name:
        truncate(
          `${getMessageDisplayName(
            message
          )}${
            message.author.bot
              ? " • BOT"
              : ""
          }`,
          256
        ),

      iconURL:
        message.author.displayAvatarURL({
          extension:
            "png",

          size:
            64
        })
    })
    .setDescription(
      description
    )
    .setColor(
      "#ff0000"
    )
    .setTimestamp(
      message.createdAt
    );
}


async function copyMessageToThread(
  thread,
  message
) {
  const files =
    message.attachments.map(
      attachment => ({
        attachment:
          attachment.url,

        name:
          attachment.name ||
          `attachment-${attachment.id}`
      })
    );

  try {
    await thread.send({
      embeds: [
        buildThreadEmbed(
          message,
          false
        )
      ],

      files,

      allowedMentions: {
        parse: []
      }
    });

  } catch (fileError) {
    console.warn(
      `Attachment re-upload failed for message ${message.id}. Sending links instead.`,
      fileError
    );

    await thread.send({
      embeds: [
        buildThreadEmbed(
          message,
          true
        )
      ],

      allowedMentions: {
        parse: []
      }
    });
  }
}


async function createDiscordThreadTranscript({
  logMessage,
  ticketChannel,
  messages,
  closedAt
}) {
  const timestamp =
    formatThreadTimestamp(
      closedAt
    );

  const threadName =
    truncate(
      `${ticketChannel.name}-${timestamp}`,
      100
    );

  const thread =
    await logMessage.startThread({
      name:
        threadName,

      autoArchiveDuration:
        ThreadAutoArchiveDuration.OneDay,

      reason:
        `Transcript for ${ticketChannel.name}`
    });

  for (const message of messages) {
    await copyMessageToThread(
      thread,
      message
    );
  }

  return thread;
}


// ==================================================
// CLOSE TICKET
// ==================================================

async function handleTicketClose(
  interaction
) {
  if (
    !interaction.guild ||
    !interaction.channel
  ) {
    return interaction.reply({
      content:
        "❌ Ticket channel could not be found.",

      flags:
        MessageFlags.Ephemeral
    });
  }

  let metadata;

  try {
    metadata =
      validateTicketChannel(
        interaction.channel
      );

  } catch (validationError) {
    console.error(
      "Close-ticket validation error:",
      validationError
    );

    return interaction.reply({
      content:
        "❌ This button is not inside a valid Eternal Blades ticket channel.",

      flags:
        MessageFlags.Ephemeral
    });
  }

  const member =
    await interaction.guild.members.fetch(
      interaction.user.id
    );

  const isStaff =
    hasStaffRole(
      member
    );

  const isTicketOwner =
    metadata.ownerId ===
      interaction.user.id;

  if (
    !isStaff &&
    !isTicketOwner
  ) {
    return interaction.reply({
      content:
        "❌ Only the ticket creator or authorized staff members can close this ticket.",

      flags:
        MessageFlags.Ephemeral
    });
  }

  const closedByType =
    isStaff
      ? "Staff"
      : "Ticket Owner";

  const ticketChannel =
    interaction.channel;

  const ticketChannelId =
    ticketChannel.id;

  if (
    closingTickets.has(
      ticketChannelId
    )
  ) {
    return interaction.reply({
      content:
        "⏳ This ticket is already being closed.",

      flags:
        MessageFlags.Ephemeral
    });
  }

  closingTickets.add(
    ticketChannelId
  );

  let logMessage =
    null;

  let transcriptThread =
    null;

  try {
    await interaction.deferReply({
      flags:
        MessageFlags.Ephemeral
    });

    await assertChannelPermissions(
      ticketChannel,
      [
        {
          flag:
            PermissionsBitField.Flags.ViewChannel,
          name:
            "View Channel"
        },
        {
          flag:
            PermissionsBitField.Flags.ReadMessageHistory,
          name:
            "Read Message History"
        },
        {
          flag:
            PermissionsBitField.Flags.ManageChannels,
          name:
            "Manage Channels"
        }
      ],
      "Ticket channel"
    );

    const transcriptChannelId =
      getTranscriptChannelId(
        metadata.type
      );

    if (!transcriptChannelId) {
      throw new Error(
        "Transcript channel ID is not configured."
      );
    }

    const transcriptChannel =
      await client.channels.fetch(
        transcriptChannelId
      );

    if (
      !transcriptChannel ||
      transcriptChannel.type !==
        ChannelType.GuildText
    ) {
      throw new Error(
        "Transcript channel was not found or is not a guild text channel."
      );
    }

    await assertChannelPermissions(
      transcriptChannel,
      [
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
        },
        {
          flag:
            PermissionsBitField.Flags.AttachFiles,
          name:
            "Attach Files"
        },
        {
          flag:
            PermissionsBitField.Flags.CreatePublicThreads,
          name:
            "Create Public Threads"
        },
        {
          flag:
            PermissionsBitField.Flags.SendMessagesInThreads,
          name:
            "Send Messages in Threads"
        }
      ],
      "Transcript channel"
    );

    const allMessages =
      await fetchAllTicketMessages(
        ticketChannel
      );

    const transcriptMessages =
      allMessages.filter(
        message =>
          !isOpeningBotMessage(
            message
          )
      );

    const closedAt =
      Date.now();

    const openedAt =
      metadata.openedAt ||
      ticketChannel.createdTimestamp;

    const ownerText =
      `<@${metadata.ownerId}> ` +
      `(${metadata.ownerId})`;

    const logEmbed =
      new EmbedBuilder()
        .setTitle(
          metadata.type === "support"
            ? "🎫 Support Ticket Closed"
            : "🤝 Collab Ticket Closed"
        )
        .setColor(
          "#ff0000"
        )
        .addFields(
          {
            name:
              "Ticket",

            value:
              `#${ticketChannel.name}`,

            inline:
              true
          },

          {
            name:
              "Opened by",

            value:
              ownerText,

            inline:
              true
          },

          {
            name:
              "Closed by",

            value:
              `${interaction.user} (${interaction.user.id})`,

            inline:
              true
          },

          {
            name:
              "Closed by type",

            value:
              closedByType,

            inline:
              true
          },

          {
            name:
              "Opened at",

            value:
              formatDate(
                openedAt
              ),

            inline:
              true
          },

          {
            name:
              "Closed at",

            value:
              formatDate(
                closedAt
              ),

            inline:
              true
          },

          {
            name:
              "Messages",

            value:
              String(
                transcriptMessages.length
              ),

            inline:
              true
          }
        )
        .setFooter({
          text:
            "Eternal Blades Ticket Logs"
        })
        .setTimestamp();

    try {
      logMessage =
        await transcriptChannel.send({
          allowedMentions: {
            parse: []
          },

          embeds: [
            logEmbed
          ]
        });

      transcriptThread =
        await createDiscordThreadTranscript({
          logMessage,
          ticketChannel,
          messages:
            transcriptMessages,
          closedAt
        });

      const viewThreadButton =
        new ButtonBuilder()
          .setLabel(
            "VIEW TRANSCRIPT"
          )
          .setEmoji(
            "🧵"
          )
          .setStyle(
            ButtonStyle.Link
          )
          .setURL(
            `https://discord.com/channels/` +
            `${interaction.guild.id}/${transcriptThread.id}`
          );

      await logMessage.edit({
        components: [
          new ActionRowBuilder()
            .addComponents(
              viewThreadButton
            )
        ]
      });

    } catch (transcriptError) {
      console.error(
        "Transcript creation error:",
        transcriptError
      );

      if (transcriptThread) {
        await transcriptThread
          .delete()
          .catch(
            cleanupError =>
              console.error(
                "Transcript thread cleanup error:",
                cleanupError
              )
          );
      }

      if (logMessage) {
        await logMessage
          .delete()
          .catch(
            cleanupError =>
              console.error(
                "Transcript log cleanup error:",
                cleanupError
              )
          );
      }

      return interaction.editReply({
        content:
          "❌ The Discord transcript could not be completed, so the ticket was NOT deleted. Check the transcript-channel permissions and Railway logs."
      });
    }

    await interaction.editReply({
      content:
        "✅ Discord transcript saved successfully. This ticket will close in 3 seconds."
    });

    await sleep(
      3000
    );

    try {
      await ticketChannel.delete(
        `Ticket closed by ${interaction.user.tag}`
      );

    } catch (deleteError) {
      console.error(
        "Ticket delete error:",
        deleteError
      );

      return interaction.editReply({
        content:
          "⚠️ The transcript was saved, but the ticket channel could not be deleted. Check the bot's Manage Channels permission."
      }).catch(
        () => {}
      );
    }

  } finally {
    closingTickets.delete(
      ticketChannelId
    );
  }
}


// ==================================================
// BOT READY
// ==================================================

client.once(
  Events.ClientReady,

  async readyClient => {
    console.log(
      `${readyClient.user.tag} online!`
    );

    /*
      Each panel has its own error boundary, so one
      panel cannot prevent the other one from loading.
    */

    await Promise.allSettled([
      setupLinksPanel(
        readyClient
      ),
      setupTicketPanel()
    ]);
  }
);


// ==================================================
// INTERACTIONS
// ==================================================

client.on(
  Events.InteractionCreate,

  async interaction => {
    try {
      if (isShuttingDown) {
        if (interaction.isRepliable()) {
          await interaction.reply({
            content:
              "⏳ The bot is restarting. Please try again in a moment.",

            flags:
              MessageFlags.Ephemeral
          }).catch(
            () => {}
          );
        }

        return;
      }

      if (
        interaction.isStringSelectMenu() &&
        interaction.customId ===
          "ticket_select"
      ) {
        await handleTicketCreation(
          interaction
        );

        return;
      }

      if (
        interaction.isButton() &&
        interaction.customId ===
          "close_ticket"
      ) {
        await handleTicketClose(
          interaction
        );
      }

    } catch (error) {
      console.error(
        "Interaction error:",
        error
      );

      if (interaction.deferred) {
        await interaction.editReply({
          content:
            "❌ Something went wrong. The issue was recorded in the Railway logs."
        }).catch(
          () => {}
        );

        return;
      }

      if (
        !interaction.replied &&
        interaction.isRepliable()
      ) {
        await interaction.reply({
          content:
            "❌ Something went wrong. The issue was recorded in the Railway logs.",

          flags:
            MessageFlags.Ephemeral
        }).catch(
          () => {}
        );
      }
    }
  }
);


// ==================================================
// CLIENT AND PROCESS ERROR LOGGING
// ==================================================

client.on(
  "error",
  error => {
    console.error(
      "Discord client error:",
      error
    );
  }
);


client.on(
  "warn",
  warning => {
    console.warn(
      "Discord client warning:",
      warning
    );
  }
);


process.once(
  "unhandledRejection",
  reason => {
    console.error(
      "Unhandled promise rejection:",
      reason
    );

    void gracefulShutdown(
      "UNHANDLED_REJECTION",
      {
        exitCode:
          1,

        waitForOperations:
          false
      }
    );
  }
);


// ==================================================
// GRACEFUL SHUTDOWN
// ==================================================

async function waitForActiveTicketOperations(
  maximumWaitMilliseconds
) {
  const startedAt =
    Date.now();

  while (
    creatingTickets.size > 0 ||
    closingTickets.size > 0
  ) {
    if (
      Date.now() - startedAt >=
      maximumWaitMilliseconds
    ) {
      console.warn(
        "Shutdown wait limit reached. Active ticket operations may be interrupted."
      );

      return;
    }

    await sleep(
      250
    );
  }
}


async function gracefulShutdown(
  signal,
  {
    exitCode = 0,
    waitForOperations = true
  } = {}
) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown =
    true;

  console.log(
    `${signal} received. Eternal Blades is shutting down safely...`
  );

  const forcedExitTimer =
    setTimeout(
      () => {
        console.error(
          "Graceful shutdown timed out. Forcing process exit."
        );

        process.exit(
          exitCode || 1
        );
      },
      SHUTDOWN_MAX_WAIT_MS +
      5000
    );

  forcedExitTimer.unref();

  try {
    if (waitForOperations) {
      await waitForActiveTicketOperations(
        SHUTDOWN_MAX_WAIT_MS
      );
    }

    client.destroy();

    console.log(
      "Eternal Blades shutdown completed."
    );

  } catch (error) {
    console.error(
      "Graceful shutdown error:",
      error
    );

  } finally {
    clearTimeout(
      forcedExitTimer
    );

    process.exit(
      exitCode
    );
  }
}


process.once(
  "SIGTERM",
  () => {
    void gracefulShutdown(
      "SIGTERM"
    );
  }
);


process.once(
  "SIGINT",
  () => {
    void gracefulShutdown(
      "SIGINT"
    );
  }
);


process.once(
  "uncaughtException",
  error => {
    console.error(
      "Uncaught exception:",
      error
    );

    void gracefulShutdown(
      "UNCAUGHT_EXCEPTION",
      {
        exitCode:
          1,

        waitForOperations:
          false
      }
    );
  }
);


// ==================================================
// BOT LOGIN
// ==================================================

const token =
  process.env.TOKEN?.trim();

if (!token) {
  console.error(
    "TOKEN environment variable is missing or empty."
  );

  process.exit(1);
}


client.login(
  token
).catch(
  error => {
    console.error(
      "Discord login failed:",
      error
    );

    void gracefulShutdown(
      "LOGIN_FAILURE",
      {
        exitCode:
          1,

        waitForOperations:
          false
      }
    );
  }
);
