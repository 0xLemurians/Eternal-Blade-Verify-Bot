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

import {
  reportError,
  reportSystemEvent,
  setupErrorReporter
} from "./services/errorReporter.js";

import {
  scheduleTicketStatsRefresh,
  setupTicketStats,
  stopTicketStats
} from "./services/ticketStats.js";


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

const SUPPORT_TICKETS_CATEGORY_ID =
  "1531270150081216643";

const COLLAB_TICKETS_CATEGORY_ID =
  "1531269649470197830";

/*
  This category is used only to recognize, close and
  deduplicate tickets created before the category split.
  New tickets are never created in this category.
*/
const LEGACY_TICKETS_CATEGORY_ID =
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

const TICKET_CREATE_COOLDOWN_MS =
  15_000;

const MAX_CONCURRENT_TICKET_CREATIONS =
  3;

const TICKET_CATEGORY_CAPACITY =
  50;

const CLOSE_CONFIRMATION_TTL_MS =
  5 * 60_000;

const SHUTDOWN_MAX_WAIT_MS =
  25_000;

const creatingTickets =
  new Set();

const closingTickets =
  new Set();

const ticketCreateCooldowns =
  new Map();

const pendingCloseConfirmations =
  new Map();

const activeOperations =
  new Map();

const categoryLocks =
  new Map();

const categoryReservations =
  new Map();

const ticketCategoryState =
  new Map(
    ALLOWED_TICKET_TYPES.map(
      type => [
        type,
        {
          available:
            false,
          categoryId:
            null,
          reason:
            "Category validation has not completed."
        }
      ]
    )
  );

const ticketCreationQueue = [];

let activeTicketCreations =
  0;

let staffRolesReady =
  false;

let ticketGuildId =
  null;

let isShuttingDown =
  false;

let shutdownTimedOut =
  false;

let shutdownPromise =
  null;

let processExitRequested =
  false;


class ShutdownInProgressError extends Error {
  constructor() {
    super(
      "The bot is shutting down."
    );

    this.name =
      "ShutdownInProgressError";
  }
}


class ShutdownDeadlineError extends Error {
  constructor() {
    super(
      "The graceful-shutdown deadline was reached."
    );

    this.name =
      "ShutdownDeadlineError";
  }
}


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


function getTicketCategoryId(type) {
  if (type === "support") {
    return SUPPORT_TICKETS_CATEGORY_ID;
  }

  if (type === "collab") {
    return COLLAB_TICKETS_CATEGORY_ID;
  }

  return null;
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


function getTicketCreationKey({
  guildId,
  userId,
  type
}) {
  return `${guildId}:${userId}:${type}`;
}


function hasStaffRole(member) {
  return STAFF_ROLE_IDS.some(
    roleId =>
      member.roles.cache.has(
        roleId
      )
  );
}


function isKnownTicketParent(
  parentId,
  type
) {
  return (
    parentId ===
      getTicketCategoryId(type) ||
    parentId ===
      LEGACY_TICKETS_CATEGORY_ID
  );
}


function stripTranscriptMetadata(
  topic = ""
) {
  const marker =
    " | Transcript Status:";

  const markerIndex =
    topic.indexOf(marker);

  return (
    markerIndex === -1
      ? topic
      : topic.slice(
          0,
          markerIndex
        )
  ).trim();
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

  const transcriptStatusMatch =
    topic.match(
      /Transcript Status:\s*(creating|complete)/i
    );

  const transcriptThreadMatch =
    topic.match(
      /Transcript Thread ID:\s*(\d+)/i
    );

  const transcriptLogMatch =
    topic.match(
      /Transcript Log ID:\s*(\d+)/i
    );

  const closedAtMatch =
    topic.match(
      /Closed At:\s*(\d+)/i
    );

  const closedByMatch =
    topic.match(
      /Closed By:\s*(\d+)/i
    );

  const deletePendingMatch =
    topic.match(
      /Delete Pending:\s*(yes|no)/i
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
        : null,
    transcriptStatus:
      transcriptStatusMatch?.[1]
        ?.toLowerCase() || null,
    transcriptThreadId:
      transcriptThreadMatch?.[1] ||
      null,
    transcriptLogMessageId:
      transcriptLogMatch?.[1] ||
      null,
    closedAt:
      closedAtMatch?.[1]
        ? Number(
            closedAtMatch[1]
          )
        : null,
    closedById:
      closedByMatch?.[1] ||
      null,
    deletePending:
      deletePendingMatch?.[1]
        ?.toLowerCase() === "yes"
  };
}


function buildTicketTopic(
  ticketChannel,
  {
    status,
    threadId = null,
    logMessageId = null,
    closedAt = null,
    closedById = null,
    deletePending = false
  } = {}
) {
  const baseTopic =
    stripTranscriptMetadata(
      ticketChannel.topic || ""
    );

  if (!status) {
    return baseTopic;
  }

  const parts = [
    baseTopic,
    `Transcript Status: ${status}`
  ];

  if (threadId) {
    parts.push(
      `Transcript Thread ID: ${threadId}`
    );
  }

  if (logMessageId) {
    parts.push(
      `Transcript Log ID: ${logMessageId}`
    );
  }

  if (closedAt) {
    parts.push(
      `Closed At: ${closedAt}`
    );
  }

  if (closedById) {
    parts.push(
      `Closed By: ${closedById}`
    );
  }

  parts.push(
    `Delete Pending: ${
      deletePending
        ? "yes"
        : "no"
    }`
  );

  const topic =
    parts.join(" | ");

  if (topic.length > 1024) {
    throw new Error(
      "Ticket metadata would exceed Discord's 1024-character topic limit."
    );
  }

  return topic;
}


async function updateTicketTranscriptMetadata(
  ticketChannel,
  metadata,
  reason
) {
  const topic =
    buildTicketTopic(
      ticketChannel,
      metadata
    );

  await ticketChannel.setTopic(
    topic,
    reason
  );
}


function getTranscriptUrl(
  guildId,
  threadId
) {
  if (!threadId) {
    return null;
  }

  return (
    "https://discord.com/channels/" +
    `${guildId}/${threadId}`
  );
}


function isUnknownDiscordResource(
  error
) {
  return (
    error?.code === 10003 ||
    error?.code === 10008
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

  if (
    !isKnownTicketParent(
      channel.parentId,
      metadata.type
    )
  ) {
    throw new Error(
      "The ticket category does not match the ticket metadata."
    );
  }

  return metadata;
}


function isTicketChannelForUser(
  channel,
  userId,
  type
) {
  if (
    channel.type !==
      ChannelType.GuildText ||
    !isKnownTicketParent(
      channel.parentId,
      type
    )
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


function getOpenTicketsFromChannels(
  channels,
  userId,
  type
) {
  return [
    ...channels.values()
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
      (first, second) => {
        const timestampDifference =
          first.createdTimestamp -
          second.createdTimestamp;

        if (timestampDifference !== 0) {
          return timestampDifference;
        }

        return first.id.localeCompare(
          second.id
        );
      }
    );
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


function assertTicketCategoryPermissions(
  category,
  botMember,
  type
) {
  const permissions =
    category.permissionsFor(
      botMember
    );

  const required = [
    {
      flag:
        PermissionsBitField.Flags.ViewChannel,
      name:
        "View Channel"
    },
    {
      flag:
        PermissionsBitField.Flags.ManageChannels,
      name:
        "Manage Channels"
    }
  ];

  const missing =
    required.filter(
      permission =>
        !permissions?.has(
          permission.flag
        )
    );

  if (missing.length > 0) {
    throw new Error(
      `${type} ticket category is missing bot permissions: ` +
      missing
        .map(
          permission =>
            permission.name
        )
        .join(", ")
    );
  }
}


async function respondToInteraction(
  interaction,
  content
) {
  if (!interaction.isRepliable()) {
    return;
  }

  if (
    interaction.deferred ||
    interaction.replied
  ) {
    await interaction.editReply({
      content,
      components: []
    });

    return;
  }

  await interaction.reply({
    content,
    flags:
      MessageFlags.Ephemeral
  });
}


function beginOperation(details) {
  const operationToken =
    Symbol(details.kind);

  activeOperations.set(
    operationToken,
    {
      ...details,
      stage:
        details.stage || "starting",
      startedAt:
        Date.now()
    }
  );

  return operationToken;
}


function updateOperation(
  operationToken,
  updates
) {
  const operation =
    activeOperations.get(
      operationToken
    );

  if (operation) {
    Object.assign(
      operation,
      updates
    );
  }
}


function endOperation(operationToken) {
  activeOperations.delete(
    operationToken
  );
}


function getOperationCounts() {
  let creations = 0;
  let queuedCreations = 0;
  let closes = 0;

  for (
    const operation
    of activeOperations.values()
  ) {
    if (operation.kind === "creation") {
      creations += 1;

      if (
        operation.stage ===
        "queued"
      ) {
        queuedCreations += 1;
      }
    }

    if (operation.kind === "close") {
      closes += 1;
    }
  }

  return {
    total:
      activeOperations.size,
    creations,
    queuedCreations,
    closes
  };
}


function ensureShutdownDeadlineNotReached() {
  if (shutdownTimedOut) {
    throw new ShutdownDeadlineError();
  }
}


// ==================================================
// COOLDOWN AND CONFIRMATION CLEANUP
// ==================================================

function getCooldownRemainingSeconds(
  creationKey
) {
  const expiresAt =
    ticketCreateCooldowns.get(
      creationKey
    );

  if (!expiresAt) {
    return 0;
  }

  const remainingMilliseconds =
    expiresAt - Date.now();

  if (remainingMilliseconds <= 0) {
    ticketCreateCooldowns.delete(
      creationKey
    );

    return 0;
  }

  return Math.ceil(
    remainingMilliseconds / 1000
  );
}


function cleanupRuntimeMaps() {
  const now =
    Date.now();

  for (
    const [
      key,
      expiresAt
    ]
    of ticketCreateCooldowns
  ) {
    if (expiresAt <= now) {
      ticketCreateCooldowns.delete(
        key
      );
    }
  }

  for (
    const [
      requestId,
      confirmation
    ]
    of pendingCloseConfirmations
  ) {
    if (
      confirmation.expiresAt <=
      now
    ) {
      pendingCloseConfirmations.delete(
        requestId
      );
    }
  }
}


const runtimeCleanupTimer =
  setInterval(
    cleanupRuntimeMaps,
    60_000
  );

runtimeCleanupTimer.unref();


// ==================================================
// GLOBAL CREATION SEMAPHORE
// ==================================================

function makeCreationSlotRelease() {
  let released =
    false;

  return () => {
    if (released) {
      return;
    }

    released =
      true;

    activeTicketCreations =
      Math.max(
        0,
        activeTicketCreations - 1
      );

    drainTicketCreationQueue();
  };
}


function drainTicketCreationQueue() {
  if (isShuttingDown) {
    cancelQueuedTicketCreations();
    return;
  }

  while (
    activeTicketCreations <
      MAX_CONCURRENT_TICKET_CREATIONS &&
    ticketCreationQueue.length > 0
  ) {
    const queued =
      ticketCreationQueue.shift();

    activeTicketCreations +=
      1;

    queued.resolve(
      makeCreationSlotRelease()
    );
  }
}


function acquireTicketCreationSlot({
  userId,
  type
}) {
  if (isShuttingDown) {
    return Promise.reject(
      new ShutdownInProgressError()
    );
  }

  if (
    activeTicketCreations <
    MAX_CONCURRENT_TICKET_CREATIONS
  ) {
    activeTicketCreations +=
      1;

    return Promise.resolve(
      makeCreationSlotRelease()
    );
  }

  return new Promise(
    (resolve, reject) => {
      ticketCreationQueue.push({
        resolve,
        reject,
        userId,
        type
      });
    }
  );
}


function cancelQueuedTicketCreations() {
  const queuedItems =
    ticketCreationQueue.splice(
      0
    );

  for (const queued of queuedItems) {
    queued.reject(
      new ShutdownInProgressError()
    );
  }
}


// ==================================================
// CATEGORY LOCKS AND RESERVATIONS
// ==================================================

function getCategoryLock(categoryId) {
  if (!categoryLocks.has(categoryId)) {
    categoryLocks.set(
      categoryId,
      {
        locked:
          false,
        queue:
          []
      }
    );
  }

  return categoryLocks.get(
    categoryId
  );
}


function makeCategoryLockRelease(
  categoryId
) {
  let released =
    false;

  return () => {
    if (released) {
      return;
    }

    released =
      true;

    const lock =
      getCategoryLock(
        categoryId
      );

    const next =
      lock.queue.shift();

    if (next) {
      next(
        makeCategoryLockRelease(
          categoryId
        )
      );

      return;
    }

    lock.locked =
      false;
  };
}


function acquireCategoryLock(categoryId) {
  const lock =
    getCategoryLock(
      categoryId
    );

  if (!lock.locked) {
    lock.locked =
      true;

    return Promise.resolve(
      makeCategoryLockRelease(
        categoryId
      )
    );
  }

  return new Promise(
    resolve => {
      lock.queue.push(
        resolve
      );
    }
  );
}


function reserveCategorySlot(categoryId) {
  const current =
    categoryReservations.get(
      categoryId
    ) || 0;

  categoryReservations.set(
    categoryId,
    current + 1
  );
}


function releaseCategoryReservation(
  categoryId
) {
  const current =
    categoryReservations.get(
      categoryId
    ) || 0;

  if (current <= 1) {
    categoryReservations.delete(
      categoryId
    );

    return;
  }

  categoryReservations.set(
    categoryId,
    current - 1
  );
}


// ==================================================
// STARTUP VALIDATION
// ==================================================

async function validateStaffRoles(guild) {
  const missingRoleIds = [];

  for (const roleId of STAFF_ROLE_IDS) {
    let role =
      guild.roles.cache.get(
        roleId
      );

    if (!role) {
      role =
        await guild.roles
          .fetch(
            roleId
          )
          .catch(
            error => {
              console.error(
                `Staff role fetch failed for ${roleId}:`,
                error
              );

              return null;
            }
          );
    }

    if (!role) {
      missingRoleIds.push(
        roleId
      );
    }
  }

  if (missingRoleIds.length > 0) {
    console.error(
      "Ticket creation disabled because required staff roles are missing:",
      missingRoleIds
    );

    staffRolesReady =
      false;

    return false;
  }

  staffRolesReady =
    true;

  console.log(
    "Staff role IDs validated successfully."
  );

  return true;
}


async function validateTicketCategory(
  guild,
  type
) {
  const categoryId =
    getTicketCategoryId(type);

  try {
    let category =
      guild.channels.cache.get(
        categoryId
      );

    if (!category) {
      category =
        await guild.channels.fetch(
          categoryId,
          {
            force:
              true
          }
        );
    }

    if (
      !category ||
      category.type !==
        ChannelType.GuildCategory
    ) {
      throw new Error(
        "The configured channel is missing or is not a guild category."
      );
    }

    if (
      category.guild.id !==
      guild.id
    ) {
      throw new Error(
        "The configured category belongs to a different guild."
      );
    }

    const botMember =
      guild.members.me ||
      await guild.members.fetchMe();

    assertTicketCategoryPermissions(
      category,
      botMember,
      type
    );

    ticketCategoryState.set(
      type,
      {
        available:
          true,
        categoryId,
        reason:
          null
      }
    );

    console.log(
      `${type} ticket category validated successfully: ${categoryId}`
    );

    return true;

  } catch (error) {
    ticketCategoryState.set(
      type,
      {
        available:
          false,
        categoryId,
        reason:
          error.message
      }
    );

    console.error(
      `${type} ticket category validation failed for ${categoryId}:`,
      error
    );

    void reportError({
      title:
        "Ticket Category Validation Failed",
      error,
      context: {
        type,
        categoryId
      }
    });

    return false;
  }
}


// ==================================================
// FETCH ALL TICKET MESSAGES
// ==================================================

async function fetchAllTicketMessages(channel) {
  const messages = [];

  let before;

  while (true) {
    ensureShutdownDeadlineNotReached();

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

    ticketGuildId =
      ticketPanelChannel.guild.id;

    await validateStaffRoles(
      ticketPanelChannel.guild
    );

    await Promise.all([
      validateTicketCategory(
        ticketPanelChannel.guild,
        "support"
      ),
      validateTicketCategory(
        ticketPanelChannel.guild,
        "collab"
      )
    ]);

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

    void reportError({
      title:
        "Ticket Panel Setup Failed",
      error
    });
  }
}


async function resetTicketPanelSelection(
  interaction
) {
  if (
    !interaction.message ||
    interaction.message.author.id !==
      client.user.id ||
    interaction.message.channelId !==
      OPEN_TICKET_CHANNEL_ID
  ) {
    return;
  }

  try {
    await interaction.message.edit({
      components:
        createTicketPanel().components
    });

  } catch (error) {
    console.warn(
      "Ticket panel selection reset failed:",
      error
    );
  }
}


// ==================================================
// TICKET OPENING MESSAGE
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
              "\u200B",
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
            "\u200B\nPlease remain patient and avoid repeatedly mentioning staff members.",
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
          "Hey! Thanks for reaching out to Eternal Blades.",
          "",
          "Tell us a little about your project or community and the idea you have in mind. We’re always happy to explore genuine collaborations.",
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
            "📋 Share with us:",
          value:
            [
              "\u200B",
              "• Project or community name",
              "• Official website and social links",
              "• Your collaboration idea",
              "• Anything you think we should know",
            ].join("\n"),
          inline:
            false
        },
        {
          name:
            "⚠️ Important",
          value:
            "\u200B\nPlease keep it genuine and clear. We’ll get back to you as soon as we can.",
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


function buildTicketPermissionOverwrites(
  guild,
  userId
) {
  if (!staffRolesReady) {
    throw new Error(
      "Required staff roles are not available. Ticket creation was stopped for safety."
    );
  }

  return [
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
    },
    ...STAFF_ROLE_IDS.map(
      roleId => ({
        id:
          roleId,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.EmbedLinks,
          PermissionsBitField.Flags.AttachFiles
        ]
      })
    )
  ];
}


// ==================================================
// CREATE TICKET
// ==================================================

async function handleTicketCreation(
  interaction
) {
  const type =
    interaction.values?.[0];

  const operationToken =
    beginOperation({
      kind:
        "creation",
      stage:
        "starting",
      userId:
        interaction.user.id,
      type:
        type || "unknown"
    });

  let creationKey =
    null;

  let releaseCreationSlot =
    null;

  let reservedCategoryId =
    null;

  let createdTicketChannel =
    null;

  let openingMessageSent =
    false;

  try {
    if (
      isShuttingDown
    ) {
      return await respondToInteraction(
        interaction,
        "⏳ The bot is restarting. Please try again in a moment."
      );
    }

    if (!interaction.guild) {
      return await respondToInteraction(
        interaction,
        "❌ This action can only be used in a server."
      );
    }

    if (
      !ALLOWED_TICKET_TYPES.includes(
        type
      )
    ) {
      return await respondToInteraction(
        interaction,
        "❌ Invalid ticket category."
      );
    }

    creationKey =
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
      return await respondToInteraction(
        interaction,
        "⏳ Your ticket is already being created. Please wait."
      );
    }

    creatingTickets.add(
      creationKey
    );

    await interaction.deferReply({
      flags:
        MessageFlags.Ephemeral
    });

    await resetTicketPanelSelection(
      interaction
    );

    if (
      ticketGuildId &&
      interaction.guild.id !==
        ticketGuildId
    ) {
      return await interaction.editReply({
        content:
          "❌ This ticket panel is not configured for this server."
      });
    }

    if (!staffRolesReady) {
      return await interaction.editReply({
        content:
          "❌ Ticket creation is temporarily unavailable because the required staff roles could not be validated."
      });
    }

    const categoryStatus =
      ticketCategoryState.get(
        type
      );

    if (!categoryStatus?.available) {
      return await interaction.editReply({
        content:
          "❌ This ticket category is temporarily unavailable. Please contact a staff member."
      });
    }

    const cooldownRemaining =
      getCooldownRemainingSeconds(
        creationKey
      );

    if (cooldownRemaining > 0) {
      return await interaction.editReply({
        content:
          `Please wait ${cooldownRemaining} seconds before creating another ticket of this type.`
      });
    }

    updateOperation(
      operationToken,
      {
        stage:
          "queued"
      }
    );

    releaseCreationSlot =
      await acquireTicketCreationSlot({
        userId:
          interaction.user.id,
        type
      });

    updateOperation(
      operationToken,
      {
        stage:
          "checking"
      }
    );

    if (isShuttingDown) {
      throw new ShutdownInProgressError();
    }

    const categoryId =
      getTicketCategoryId(type);

    const releaseCategoryLock =
      await acquireCategoryLock(
        categoryId
      );

    let existingTickets = [];

    try {
      if (isShuttingDown) {
        throw new ShutdownInProgressError();
      }

      const channels =
        await interaction.guild.channels.fetch();

      const targetCategory =
        channels.get(
          categoryId
        );

      if (
        !targetCategory ||
        targetCategory.type !==
          ChannelType.GuildCategory ||
        targetCategory.guild.id !==
          interaction.guild.id
      ) {
        ticketCategoryState.set(
          type,
          {
            available:
              false,
            categoryId,
            reason:
              "The target category is missing, invalid or belongs to another guild."
          }
        );

        return await interaction.editReply({
          content:
            "❌ This ticket category is temporarily unavailable. Please contact a staff member."
        });
      }

      const botMember =
        interaction.guild.members.me;

      if (!botMember) {
        throw new Error(
          "The bot guild member could not be resolved."
        );
      }

      try {
        assertTicketCategoryPermissions(
          targetCategory,
          botMember,
          type
        );

      } catch (permissionError) {
        ticketCategoryState.set(
          type,
          {
            available:
              false,
            categoryId,
            reason:
              permissionError.message
          }
        );

        console.error(
          `${type} ticket category permission validation failed:`,
          permissionError
        );

        return await interaction.editReply({
          content:
            "❌ This ticket category is temporarily unavailable because the bot is missing required permissions."
        });
      }

      existingTickets =
        getOpenTicketsFromChannels(
          channels,
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

        return await interaction.editReply({
          content:
            `❌ You already have an open ${type} ticket: ${keeper}`
        });
      }

      const directChildCount =
        channels.filter(
          channel =>
            channel.parentId ===
            categoryId
        ).size;

      const reservationCount =
        categoryReservations.get(
          categoryId
        ) || 0;

      const effectiveChildCount =
        directChildCount +
        reservationCount;

      if (
        effectiveChildCount >=
        TICKET_CATEGORY_CAPACITY
      ) {
        console.warn(
          "Ticket creation rejected because the category is full:",
          {
            type,
            userId:
              interaction.user.id,
            categoryId,
            directChildCount,
            reservationCount,
            capacity:
              TICKET_CATEGORY_CAPACITY
          }
        );

        return await interaction.editReply({
          content:
            "This ticket category is currently full. Please wait for an existing ticket to close or contact a staff member."
        });
      }

      reserveCategorySlot(
        categoryId
      );

      reservedCategoryId =
        categoryId;

    } finally {
      releaseCategoryLock();
    }

    updateOperation(
      operationToken,
      {
        stage:
          "creating"
      }
    );

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

    const openedAt =
      Date.now();

    createdTicketChannel =
      await interaction.guild.channels.create({
        name:
          ticketName,
        type:
          ChannelType.GuildText,
        parent:
          reservedCategoryId,
        topic:
          `Ticket Owner: ${interaction.user.tag} | ` +
          `User ID: ${interaction.user.id} | ` +
          `Type: ${type} | ` +
          `Opened At: ${openedAt}`,
        permissionOverwrites:
          buildTicketPermissionOverwrites(
            interaction.guild,
            interaction.user.id
          ),
        reason:
          `${type} ticket opened by ${interaction.user.tag}`
      });

    if (reservedCategoryId) {
      releaseCategoryReservation(
        reservedCategoryId
      );

      reservedCategoryId =
        null;
    }

    await sleep(
      350
    );

    const postCreationTickets =
      getOpenTicketsFromChannels(
        interaction.guild.channels.cache,
        interaction.user.id,
        type
      );

    if (
      !postCreationTickets.some(
        channel =>
          channel.id ===
          createdTicketChannel.id
      )
    ) {
      postCreationTickets.push(
        createdTicketChannel
      );

      postCreationTickets.sort(
        (first, second) =>
          first.createdTimestamp -
            second.createdTimestamp ||
          first.id.localeCompare(
            second.id
          )
      );
    }

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

      return await interaction.editReply({
        content:
          `❌ You already have an open ${type} ticket: ${keeper}`
      });
    }

    if (postCreationTickets.length > 1) {
      console.warn(
        `A post-create duplicate race was detected for user ${interaction.user.id}. Existing channels were preserved to avoid data loss.`
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

    scheduleTicketStatsRefresh(
      "ticket-created"
    );

    ticketCreateCooldowns.set(
      creationKey,
      Date.now() +
        TICKET_CREATE_COOLDOWN_MS
    );

    updateOperation(
      operationToken,
      {
        stage:
          "completed"
      }
    );

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

    if (
      error instanceof
      ShutdownInProgressError
    ) {
      await respondToInteraction(
        interaction,
        "⏳ The bot is restarting, so your ticket could not be created. Please try again in a moment."
      ).catch(
        () => {}
      );

      return;
    }

    throw error;

  } finally {
    if (reservedCategoryId) {
      releaseCategoryReservation(
        reservedCategoryId
      );
    }

    if (releaseCreationSlot) {
      releaseCreationSlot();
    }

    if (creationKey) {
      creatingTickets.delete(
        creationKey
      );
    }

    endOperation(
      operationToken
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
  closedAt,
  onThreadCreated
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

  onThreadCreated(
    thread
  );

  for (const message of messages) {
    ensureShutdownDeadlineNotReached();

    await copyMessageToThread(
      thread,
      message
    );
  }

  return thread;
}


async function resolveTranscriptLogSafely({
  logMessage,
  logMessageId,
  transcriptChannel
}) {
  let targetMessage =
    logMessage;

  if (!targetMessage && logMessageId) {
    targetMessage =
      await transcriptChannel.messages
        .fetch(
          logMessageId
        )
        .catch(
          error => {
            if (
              isUnknownDiscordResource(
                error
              )
            ) {
              return null;
            }

            throw error;
          }
        );
  }

  if (!targetMessage) {
    return null;
  }

  if (
    targetMessage.channelId !==
      transcriptChannel.id ||
    targetMessage.author.id !==
      client.user.id
  ) {
    throw new Error(
      "Refusing to use a transcript log message that was not created by this bot in the configured transcript channel."
    );
  }

  return targetMessage;
}


async function resolveTranscriptThreadSafely({
  thread,
  threadId,
  logMessage,
  transcriptChannel
}) {
  let targetThread =
    thread;

  if (!targetThread && threadId) {
    targetThread =
      await client.channels
        .fetch(
          threadId
        )
        .catch(
          error => {
            if (
              isUnknownDiscordResource(
                error
              )
            ) {
              return null;
            }

            throw error;
          }
        );
  }

  if (!targetThread && logMessage?.thread) {
    targetThread =
      logMessage.thread;
  }

  if (!targetThread && logMessage?.id) {
    targetThread =
      await client.channels
        .fetch(
          logMessage.id
        )
        .catch(
          error => {
            if (
              isUnknownDiscordResource(
                error
              )
            ) {
              return null;
            }

            throw error;
          }
        );
  }

  if (!targetThread) {
    return null;
  }

  if (
    !targetThread.isThread?.() ||
    targetThread.parentId !==
      transcriptChannel.id
  ) {
    throw new Error(
      "Refusing to use a transcript thread that does not belong to the configured transcript channel."
    );
  }

  return targetThread;
}


async function cleanupIncompleteTranscript({
  ticketChannel,
  metadata,
  transcriptChannel,
  thread = null,
  logMessage = null,
  clearMetadata = true
}) {
  try {
    const targetLogMessage =
      await resolveTranscriptLogSafely({
        logMessage,
        logMessageId:
          metadata.transcriptLogMessageId,
        transcriptChannel
      });

    const targetThread =
      await resolveTranscriptThreadSafely({
        thread,
        threadId:
          metadata.transcriptThreadId,
        logMessage:
          targetLogMessage,
        transcriptChannel
      });

    if (targetThread) {
      await targetThread.delete(
        "Incomplete ticket transcript cleanup"
      );
    }

    if (targetLogMessage) {
      await targetLogMessage.delete();
    }

    if (clearMetadata) {
      await updateTicketTranscriptMetadata(
        ticketChannel,
        {},
        "Cleared incomplete transcript metadata"
      );
    }

    console.log(
      `Incomplete transcript state cleaned for ticket ${ticketChannel.id}.`
    );

    return true;

  } catch (cleanupError) {
    console.error(
      `Incomplete transcript cleanup failed for ticket ${ticketChannel.id}:`,
      cleanupError
    );

    return false;
  }
}


function createTranscriptLogEmbed({
  ticketChannel,
  metadata,
  closer,
  closedByType,
  closedAt,
  messageCount
}) {
  const openedAt =
    metadata.openedAt ||
    ticketChannel.createdTimestamp;

  const ownerText =
    `<@${metadata.ownerId}> ` +
    `(${metadata.ownerId})`;

  return new EmbedBuilder()
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
          `${closer} (${closer.id})`,
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
            messageCount
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
}


async function fetchTranscriptChannel(
  guild,
  type
) {
  const transcriptChannelId =
    getTranscriptChannelId(type);

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
      ChannelType.GuildText ||
    transcriptChannel.guild.id !==
      guild.id
  ) {
    throw new Error(
      "Transcript channel was not found, is invalid or belongs to another guild."
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

  return transcriptChannel;
}


// ==================================================
// CLOSE CONFIRMATION
// ==================================================

function parseCloseConfirmationCustomId(
  customId
) {
  const match =
    customId.match(
      /^ticket_close_(confirm|cancel):(\d{17,20}):(\d{17,20}):(\d{17,20})$/
    );

  if (!match) {
    return null;
  }

  return {
    action:
      match[1],
    channelId:
      match[2],
    userId:
      match[3],
    requestId:
      match[4]
  };
}


async function getCloseAuthorization(
  interaction,
  metadata
) {
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

  return {
    authorized:
      isStaff ||
      isTicketOwner,
    closedByType:
      isStaff
        ? "Staff"
        : "Ticket Owner"
  };
}


async function handleTicketCloseRequest(
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

  const authorization =
    await getCloseAuthorization(
      interaction,
      metadata
    );

  if (!authorization.authorized) {
    return interaction.reply({
      content:
        "❌ Only the ticket creator or authorized staff members can close this ticket.",
      flags:
        MessageFlags.Ephemeral
    });
  }

  for (
    const [
      requestId,
      confirmation
    ]
    of pendingCloseConfirmations
  ) {
    if (
      confirmation.channelId ===
        interaction.channel.id &&
      confirmation.userId ===
        interaction.user.id
    ) {
      pendingCloseConfirmations.delete(
        requestId
      );
    }
  }

  const requestId =
    interaction.id;

  pendingCloseConfirmations.set(
    requestId,
    {
      channelId:
        interaction.channel.id,
      userId:
        interaction.user.id,
      expiresAt:
        Date.now() +
        CLOSE_CONFIRMATION_TTL_MS
    }
  );

  const confirmButton =
    new ButtonBuilder()
      .setCustomId(
        `ticket_close_confirm:${interaction.channel.id}:${interaction.user.id}:${requestId}`
      )
      .setLabel(
        "Confirm Close"
      )
      .setStyle(
        ButtonStyle.Danger
      );

  const cancelButton =
    new ButtonBuilder()
      .setCustomId(
        `ticket_close_cancel:${interaction.channel.id}:${interaction.user.id}:${requestId}`
      )
      .setLabel(
        "Cancel"
      )
      .setStyle(
        ButtonStyle.Secondary
      );

  return interaction.reply({
    content:
      "Are you sure you want to close this ticket?",
    components: [
      new ActionRowBuilder()
        .addComponents(
          confirmButton,
          cancelButton
        )
    ],
    flags:
      MessageFlags.Ephemeral
  });
}


async function handleTicketCloseCancel(
  interaction,
  confirmationId
) {
  const parsed =
    parseCloseConfirmationCustomId(
      confirmationId
    );

  const pending =
    parsed
      ? pendingCloseConfirmations.get(
          parsed.requestId
        )
      : null;

  const valid =
    parsed?.action === "cancel" &&
    pending &&
    pending.expiresAt >
      Date.now() &&
    parsed.userId ===
      interaction.user.id &&
    parsed.channelId ===
      interaction.channelId &&
    pending.userId ===
      interaction.user.id &&
    pending.channelId ===
      interaction.channelId;

  if (!valid) {
    return interaction.reply({
      content:
        "❌ This ticket closure confirmation is invalid or has expired.",
      flags:
        MessageFlags.Ephemeral
    });
  }

  pendingCloseConfirmations.delete(
    parsed.requestId
  );

  return interaction.update({
    content:
      "Ticket closure cancelled.",
    components: []
  });
}


async function retryCompletedTicketDeletion({
  interaction,
  ticketChannel,
  metadata
}) {
  const transcriptUrl =
    getTranscriptUrl(
      interaction.guild.id,
      metadata.transcriptThreadId
    );

  const linkText =
    transcriptUrl
      ? ` [VIEW TRANSCRIPT](${transcriptUrl})`
      : "";

  await interaction.editReply({
    content:
      "ℹ️ The transcript has already been saved. Retrying ticket channel deletion..." +
      linkText,
    components: []
  });

  ensureShutdownDeadlineNotReached();

  try {
    await ticketChannel.delete(
      `Previously archived ticket deletion retried by ${interaction.user.tag}`
    );

    scheduleTicketStatsRefresh(
      "archived-ticket-deleted"
    );

  } catch (deleteError) {
    console.error(
      `Archived ticket channel deletion retry failed for ${ticketChannel.id}:`,
      deleteError
    );

    void reportError({
      title:
        "Archived Ticket Delete Retry Failed",
      error:
        deleteError,
      context: {
        ticketChannelId:
          ticketChannel.id,
        closerId:
          interaction.user.id
      }
    });

    await interaction.editReply({
      content:
        "⚠️ The transcript has already been saved, but the ticket channel could not be deleted. Please contact a staff member." +
        linkText,
      components: []
    }).catch(
      () => {}
    );
  }
}


// ==================================================
// CONFIRMED CLOSE AND TRANSCRIPT
// ==================================================

async function handleTicketCloseConfirm(
  interaction,
  confirmationId
) {
  const parsed =
    parseCloseConfirmationCustomId(
      confirmationId
    );

  const operationToken =
    beginOperation({
      kind:
        "close",
      stage:
        "confirming",
      userId:
        interaction.user.id,
      channelId:
        interaction.channelId
    });

  let ticketChannelId =
    null;

  try {
    const pending =
      parsed
        ? pendingCloseConfirmations.get(
            parsed.requestId
          )
        : null;

    const valid =
      parsed?.action === "confirm" &&
      pending &&
      pending.expiresAt >
        Date.now() &&
      parsed.userId ===
        interaction.user.id &&
      parsed.channelId ===
        interaction.channelId &&
      pending.userId ===
        interaction.user.id &&
      pending.channelId ===
        interaction.channelId;

    if (!valid) {
      return await interaction.reply({
        content:
          "❌ This ticket closure confirmation is invalid or has expired.",
        flags:
          MessageFlags.Ephemeral
      });
    }

    pendingCloseConfirmations.delete(
      parsed.requestId
    );

    if (
      !interaction.guild ||
      !interaction.channel
    ) {
      return await interaction.update({
        content:
          "❌ Ticket channel could not be found.",
        components: []
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
        "Confirmed close metadata validation error:",
        validationError
      );

      return await interaction.update({
        content:
          "❌ This is no longer a valid Eternal Blades ticket channel.",
        components: []
      });
    }

    await interaction.update({
      content:
        "⏳ Closing ticket...",
      components: []
    });

    const authorization =
      await getCloseAuthorization(
        interaction,
        metadata
      );

    if (!authorization.authorized) {
      return await interaction.editReply({
        content:
          "❌ You are no longer authorized to close this ticket.",
        components: []
      });
    }

    const ticketChannel =
      interaction.channel;

    ticketChannelId =
      ticketChannel.id;

    if (
      closingTickets.has(
        ticketChannelId
      )
    ) {
      return await interaction.editReply({
        content:
          "⏳ This ticket is already being closed.",
        components: []
      });
    }

    closingTickets.add(
      ticketChannelId
    );

    updateOperation(
      operationToken,
      {
        stage:
          "validating"
      }
    );

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

    metadata =
      validateTicketChannel(
        ticketChannel
      );

    if (
      metadata.transcriptStatus ===
      "complete"
    ) {
      updateOperation(
        operationToken,
        {
          stage:
            "delete-retry"
        }
      );

      await retryCompletedTicketDeletion({
        interaction,
        ticketChannel,
        metadata
      });

      return;
    }

    const transcriptChannel =
      await fetchTranscriptChannel(
        interaction.guild,
        metadata.type
      );

    if (
      metadata.transcriptStatus ===
      "creating"
    ) {
      updateOperation(
        operationToken,
        {
          stage:
            "recovering"
        }
      );

      const recovered =
        await cleanupIncompleteTranscript({
          ticketChannel,
          metadata,
          transcriptChannel,
          clearMetadata:
            false
        });

      if (!recovered) {
        return await interaction.editReply({
          content:
            "❌ An incomplete transcript from an earlier attempt could not be cleaned safely. The ticket was NOT deleted. Please contact a staff member.",
          components: []
        });
      }

    }

    updateOperation(
      operationToken,
      {
        stage:
          "fetching-messages"
      }
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

    const transcriptState = {
      status:
        "creating",
      threadId:
        null,
      logMessageId:
        null,
      closedAt,
      closedById:
        interaction.user.id,
      deletePending:
        false
    };

    let logMessage =
      null;

    let transcriptThread =
      null;

    let transcriptMetadataUpdateCount =
      0;

    try {
      updateOperation(
        operationToken,
        {
          stage:
            "creating-transcript"
        }
      );

      const logEmbed =
        createTranscriptLogEmbed({
          ticketChannel,
          metadata,
          closer:
            interaction.user,
          closedByType:
            authorization.closedByType,
          closedAt,
          messageCount:
            transcriptMessages.length
        });

      logMessage =
        await transcriptChannel.send({
          allowedMentions: {
            parse: []
          },
          embeds: [
            logEmbed
          ]
        });

      console.log(
        `[Ticket ${ticketChannel.id}] transcript log created`
      );

      transcriptState.logMessageId =
        logMessage.id;

      transcriptMetadataUpdateCount +=
        1;

      await updateTicketTranscriptMetadata(
        ticketChannel,
        transcriptState,
        "Ticket transcript log created"
      );

      console.log(
        `[Ticket ${ticketChannel.id}] creating metadata saved`
      );

      transcriptThread =
        await createDiscordThreadTranscript({
          logMessage,
          ticketChannel,
          messages:
            transcriptMessages,
          closedAt,
          onThreadCreated:
            thread => {
              transcriptState.threadId =
                thread.id;

              console.log(
                `[Ticket ${ticketChannel.id}] transcript thread created`
              );
            }
        });

      console.log(
        `[Ticket ${ticketChannel.id}] transcript messages copied`
      );

      ensureShutdownDeadlineNotReached();

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
            getTranscriptUrl(
              interaction.guild.id,
              transcriptThread.id
            )
          );

      await logMessage.edit({
        components: [
          new ActionRowBuilder()
            .addComponents(
              viewThreadButton
            )
        ]
      });

      console.log(
        `[Ticket ${ticketChannel.id}] view transcript button added`
      );

      ensureShutdownDeadlineNotReached();

      transcriptMetadataUpdateCount +=
        1;

      await updateTicketTranscriptMetadata(
        ticketChannel,
        {
          ...transcriptState,
          status:
            "complete",
          deletePending:
            true
        },
        "Ticket transcript completed"
      );

      console.log(
        `[Ticket ${ticketChannel.id}] complete metadata saved`
      );

      scheduleTicketStatsRefresh(
        "ticket-closed"
      );

    } catch (transcriptError) {
      console.error(
        "Transcript creation error:",
        transcriptError
      );

      void reportError({
        title:
          "Transcript Creation Failed",
        error:
          transcriptError,
        context: {
          ticketChannelId:
            ticketChannel.id,
          ticketType:
            metadata.type,
          closerId:
            interaction.user.id
        }
      });

      const currentMetadata =
        parseTicketMetadata(
          ticketChannel.topic || ""
        );

      await cleanupIncompleteTranscript({
        ticketChannel,
        metadata: {
          ...currentMetadata,
          transcriptThreadId:
            currentMetadata.transcriptThreadId ||
            transcriptThread?.id ||
            transcriptState.threadId,
          transcriptLogMessageId:
            currentMetadata.transcriptLogMessageId ||
            logMessage?.id ||
            transcriptState.logMessageId
        },
        transcriptChannel,
        thread:
          transcriptThread,
        logMessage,
        clearMetadata:
          transcriptMetadataUpdateCount <
          2
      });

      return await interaction.editReply({
        content:
          "❌ The Discord transcript could not be completed, so the ticket was NOT deleted. Check the transcript-channel permissions and Railway logs.",
        components: []
      });
    }

    updateOperation(
      operationToken,
      {
        stage:
          "deleting"
      }
    );

    await interaction.editReply({
      content:
        "✅ Discord transcript saved successfully. This ticket will close in 3 seconds.",
      components: []
    });

    await sleep(
      3000
    );

    ensureShutdownDeadlineNotReached();

    try {
      console.log(
        `[Ticket ${ticketChannel.id}] ticket delete started`
      );

      await ticketChannel.delete(
        `Ticket closed by ${interaction.user.tag}`
      );

      console.log(
        `[Ticket ${ticketChannel.id}] ticket deleted`
      );

      scheduleTicketStatsRefresh(
        "ticket-channel-deleted"
      );

    } catch (deleteError) {
      console.error(
        "Ticket delete error:",
        deleteError
      );

      void reportError({
        title:
          "Ticket Channel Delete Failed",
        error:
          deleteError,
        context: {
          ticketChannelId:
            ticketChannel.id,
          ticketType:
            metadata.type,
          closerId:
            interaction.user.id
        }
      });

      const transcriptUrl =
        getTranscriptUrl(
          interaction.guild.id,
          transcriptThread.id
        );

      return await interaction.editReply({
        content:
          "⚠️ The transcript has already been saved, but the ticket channel could not be deleted. Please contact a staff member. " +
          `[VIEW TRANSCRIPT](${transcriptUrl})`,
        components: []
      }).catch(
        () => {}
      );
    }

  } finally {
    if (ticketChannelId) {
      closingTickets.delete(
        ticketChannelId
      );
    }

    endOperation(
      operationToken
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

    await setupErrorReporter(
      readyClient
    ).catch(
      error =>
        console.error(
          "Error reporter setup error:",
          error
        )
    );

    const setupResults =
      await Promise.allSettled([
        setupLinksPanel(
          readyClient
        ),
        setupTicketPanel(),
        setupTicketStats(
          readyClient
        )
      ]);

    for (
      const result
      of setupResults
    ) {
      if (
        result.status ===
        "rejected"
      ) {
        console.error(
          "Ready task failed:",
          result.reason
        );

        void reportError({
          title:
            "Bot Ready Task Failed",
          error:
            result.reason
        });
      }
    }

    const failedReadyTaskCount =
      setupResults.filter(
        result =>
          result.status ===
            "rejected"
      ).length;

    await reportSystemEvent({
      title:
        failedReadyTaskCount === 0
          ? "✅ Eternal Blades Online"
          : "⚠️ Eternal Blades Online with Setup Warnings",
      description:
        failedReadyTaskCount === 0
          ? "The bot started successfully and completed its startup checks."
          : `The bot started, but ${failedReadyTaskCount} startup task(s) failed. Check the error reports above.`,
      color:
        failedReadyTaskCount === 0
          ? "#2ecc71"
          : "#f1c40f"
    });
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
          await respondToInteraction(
            interaction,
            "⏳ The bot is restarting. Please try again in a moment."
          ).catch(
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

      if (!interaction.isButton()) {
        return;
      }

      if (
        interaction.customId ===
        "close_ticket"
      ) {
        await handleTicketCloseRequest(
          interaction
        );

        return;
      }

      if (
        interaction.customId.startsWith(
          "ticket_close_confirm:"
        )
      ) {
        await handleTicketCloseConfirm(
          interaction,
          interaction.customId
        );

        return;
      }

      if (
        interaction.customId.startsWith(
          "ticket_close_cancel:"
        )
      ) {
        await handleTicketCloseCancel(
          interaction,
          interaction.customId
        );
      }

    } catch (error) {
      console.error(
        "Interaction error:",
        error
      );

      void reportError({
        title:
          "Discord Interaction Failed",
        error,
        context: {
          interactionId:
            interaction.id,
          interactionType:
            interaction.type,
          channelId:
            interaction.channelId,
          userId:
            interaction.user?.id || null,
          customId:
            interaction.customId || null
        }
      });

      await respondToInteraction(
        interaction,
        "❌ Something went wrong. The issue was recorded in the Railway logs."
      ).catch(
        () => {}
      );
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

    void reportError({
      title:
        "Discord Client Error",
      error
    });
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

    void reportError({
      title:
        "Unhandled Promise Rejection",
      error:
        reason
    });

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
    activeOperations.size > 0
  ) {
    if (
      Date.now() - startedAt >=
      maximumWaitMilliseconds
    ) {
      shutdownTimedOut =
        true;

      console.warn(
        "Shutdown wait limit reached. Active ticket operations will not be allowed to delete ticket channels.",
        getOperationCounts()
      );

      return false;
    }

    await sleep(
      250
    );
  }

  return true;
}


function requestProcessExit(exitCode) {
  if (processExitRequested) {
    return;
  }

  processExitRequested =
    true;

  process.exit(
    exitCode
  );
}


function gracefulShutdown(
  signal,
  {
    exitCode = 0,
    waitForOperations = true
  } = {}
) {
  if (shutdownPromise) {
    return shutdownPromise;
  }

  isShuttingDown =
    true;

  cancelQueuedTicketCreations();

  const initialCounts =
    getOperationCounts();

  console.log(
    `${signal} received. Eternal Blades is shutting down safely...`,
    initialCounts
  );

  shutdownPromise =
    (async () => {
      const forcedExitTimer =
        setTimeout(
          () => {
            console.error(
              "Graceful shutdown timed out. Forcing process exit.",
              getOperationCounts()
            );

            requestProcessExit(
              exitCode || 1
            );
          },
          SHUTDOWN_MAX_WAIT_MS +
          5000
        );

      forcedExitTimer.unref();

      try {
        stopTicketStats();

        const shutdownReportPromise =
          reportSystemEvent({
            title:
              "⏳ Eternal Blades Shutting Down",
            description:
              `${signal} received. Active ticket operations: ${initialCounts.total}.`,
            color:
              "#f1c40f"
          });

        if (waitForOperations) {
          await waitForActiveTicketOperations(
            SHUTDOWN_MAX_WAIT_MS
          );
        }

        await Promise.race([
          shutdownReportPromise,
          sleep(
            1000
          )
        ]);

        client.destroy();

        console.log(
          "Eternal Blades shutdown completed.",
          getOperationCounts()
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

        requestProcessExit(
          exitCode
        );
      }
    })();

  return shutdownPromise;
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

    void reportError({
      title:
        "Uncaught Exception",
      error
    });

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

  requestProcessExit(1);
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
