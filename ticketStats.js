import {
  ChannelType,
  EmbedBuilder,
  PermissionsBitField
} from "discord.js";

import {
  upsertPanelMessage
} from "../utils/panelMessage.js";

import {
  reportError
} from "./errorReporter.js";


const TICKET_STATS_CHANNEL_ID =
  "1531389774424965333";

const TICKET_STATS_MESSAGE_ID =
  process.env.TICKET_STATS_MESSAGE_ID
    ?.trim() || "";

const SUPPORT_TICKETS_CATEGORY_ID =
  "1531270150081216643";

const COLLAB_TICKETS_CATEGORY_ID =
  "1531269649470197830";

const LEGACY_TICKETS_CATEGORY_ID =
  "1506778963392069734";

const SUPPORT_TRANSCRIPT_CHANNEL_ID =
  "1527352998936707193";

const COLLAB_TRANSCRIPT_CHANNEL_ID =
  "1527352927960698994";

const TICKET_CATEGORY_CAPACITY =
  50;

const STATS_REFRESH_INTERVAL_MS =
  30 * 60_000;

const STATS_REFRESH_DEBOUNCE_MS =
  1500;

const MAX_TRANSCRIPT_STATS_PAGES =
  10;

const TRANSCRIPT_STATS_PAGE_DELAY_MS =
  250;

const ISTANBUL_OFFSET_MS =
  3 * 60 * 60 * 1000;

const TICKET_STATS_PANEL_TITLE =
  "📊 Eternal Blades Ticket İstatistikleri";

const LEGACY_TICKET_STATS_PANEL_TITLE =
  "📊 Eternal Blades Ticket Statistics";

let statsClient =
  null;

let statsGuild =
  null;

let statsChannel =
  null;

let statsPanelMessage =
  null;

let refreshInterval =
  null;

let refreshTimer =
  null;

let refreshPromise =
  null;

let refreshRequested =
  false;

let transcriptStatsLimitWarningActive =
  false;


function sleep(milliseconds) {
  return new Promise(
    resolve =>
      setTimeout(
        resolve,
        milliseconds
      )
  );
}


function parseTicketTopic(
  topic = ""
) {
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

  const statusMatch =
    topic.match(
      /Transcript Status:\s*(creating|complete)/i
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
      statusMatch?.[1]
        ?.toLowerCase() || null
  };
}


function getIstanbulPeriodStarts(
  timestamp = Date.now()
) {
  const shiftedDate =
    new Date(
      timestamp +
      ISTANBUL_OFFSET_MS
    );

  const year =
    shiftedDate.getUTCFullYear();

  const month =
    shiftedDate.getUTCMonth();

  const day =
    shiftedDate.getUTCDate();

  const todayStart =
    Date.UTC(
      year,
      month,
      day
    ) -
    ISTANBUL_OFFSET_MS;

  const weekday =
    shiftedDate.getUTCDay();

  const daysSinceMonday =
    weekday === 0
      ? 6
      : weekday - 1;

  const weekStart =
    todayStart -
    daysSinceMonday *
      24 *
      60 *
      60 *
      1000;

  return {
    todayStart,
    weekStart
  };
}


function parseTurkishDateTime(
  value
) {
  const match =
    String(value ?? "").match(
      /(\d{2})[./](\d{2})[./](\d{4})\s+(\d{2}):(\d{2}):(\d{2})/
    );

  if (!match) {
    return null;
  }

  const [
    ,
    day,
    month,
    year,
    hour,
    minute,
    second
  ] = match;

  return (
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second)
    ) -
    ISTANBUL_OFFSET_MS
  );
}


function getEmbedFieldValue(
  embed,
  fieldName
) {
  const field =
    embed.fields?.find(
      item =>
        item.name.toLowerCase() ===
        fieldName.toLowerCase()
    );

  return field?.value || null;
}


function hasViewTranscriptButton(
  message
) {
  return message.components?.some(
    row =>
      row.components?.some(
        component => {
          const label =
            component.label ??
            component.data?.label;

          const url =
            component.url ??
            component.data?.url;

          return (
            label ===
              "VIEW TRANSCRIPT" &&
            Boolean(url)
          );
        }
      )
  ) || false;
}


function parseTranscriptRecord(
  message,
  type
) {
  if (
    message.author.id !==
      statsClient.user.id ||
    message.embeds.length === 0 ||
    !hasViewTranscriptButton(
      message
    )
  ) {
    return null;
  }

  const embed =
    message.embeds[0];

  const openedAt =
    parseTurkishDateTime(
      getEmbedFieldValue(
        embed,
        "Opened at"
      )
    );

  const closedAt =
    parseTurkishDateTime(
      getEmbedFieldValue(
        embed,
        "Closed at"
      )
    ) ||
    message.createdTimestamp;

  const ticketName =
    getEmbedFieldValue(
      embed,
      "Ticket"
    );

  if (
    !openedAt ||
    !closedAt ||
    !ticketName
  ) {
    return null;
  }

  return {
    type,
    openedAt,
    closedAt,
    ticketName
  };
}


async function fetchRecentTranscriptRecords(
  channel,
  type,
  weekStart
) {
  const records = [];

  let before;

  let pageCount =
    0;

  let limitReached =
    false;

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

    pageCount += 1;

    for (const message of batch.values()) {
      if (
        message.createdTimestamp <
        weekStart
      ) {
        continue;
      }

      const record =
        parseTranscriptRecord(
          message,
          type
        );

      if (record) {
        records.push(
          record
        );
      }
    }

    const oldestMessage =
      batch.last();

    if (
      batch.size < 100 ||
      !oldestMessage ||
      oldestMessage.createdTimestamp <
        weekStart
    ) {
      break;
    }

    if (
      pageCount >=
      MAX_TRANSCRIPT_STATS_PAGES
    ) {
      limitReached =
        true;

      break;
    }

    before =
      oldestMessage.id;

    await sleep(
      TRANSCRIPT_STATS_PAGE_DELAY_MS
    );
  }

  return {
    records,
    pageCount,
    limitReached
  };
}


function deduplicateTranscriptRecords(
  records
) {
  const uniqueRecords =
    new Map();

  for (const record of records) {
    const key =
      `${record.type}:` +
      `${record.ticketName}:` +
      `${record.openedAt}`;

    const existing =
      uniqueRecords.get(
        key
      );

    if (
      !existing ||
      record.closedAt <
        existing.closedAt
    ) {
      uniqueRecords.set(
        key,
        record
      );
    }
  }

  return [
    ...uniqueRecords.values()
  ];
}


function getOpenTicketRecords(
  channels
) {
  const records = [];

  const knownCategoryIds =
    new Set([
      SUPPORT_TICKETS_CATEGORY_ID,
      COLLAB_TICKETS_CATEGORY_ID,
      LEGACY_TICKETS_CATEGORY_ID
    ]);

  for (const channel of channels.values()) {
    if (
      channel.type !==
        ChannelType.GuildText ||
      !knownCategoryIds.has(
        channel.parentId
      )
    ) {
      continue;
    }

    const metadata =
      parseTicketTopic(
        channel.topic || ""
      );

    if (
      !metadata.ownerId ||
      !metadata.openedAt ||
      ![
        "support",
        "collab"
      ].includes(
        metadata.type
      ) ||
      metadata.transcriptStatus ===
        "complete"
    ) {
      continue;
    }

    records.push({
      channel,
      type:
        metadata.type,
      openedAt:
        metadata.openedAt
    });
  }

  return records;
}


function countByType(
  records,
  predicate = () => true
) {
  const result = {
    support:
      0,
    collab:
      0
  };

  for (const record of records) {
    if (
      predicate(record) &&
      Object.hasOwn(
        result,
        record.type
      )
    ) {
      result[record.type] +=
        1;
    }
  }

  return result;
}


function formatTypeCounts(
  counts
) {
  const total =
    counts.support +
    counts.collab;

  return [
    `🎫 Destek: **${counts.support}**`,
    `🤝 İş Birliği: **${counts.collab}**`,
    `Toplam: **${total}**`
  ].join("\n");
}


function formatDuration(
  milliseconds
) {
  if (
    !Number.isFinite(milliseconds) ||
    milliseconds < 0
  ) {
    return "Henüz veri yok";
  }

  const totalMinutes =
    Math.max(
      1,
      Math.round(
        milliseconds /
        60_000
      )
    );

  const days =
    Math.floor(
      totalMinutes /
      (24 * 60)
    );

  const hours =
    Math.floor(
      (
        totalMinutes %
        (24 * 60)
      ) /
      60
    );

  const minutes =
    totalMinutes % 60;

  const parts = [];

  if (days > 0) {
    parts.push(
      `${days}g`
    );
  }

  if (hours > 0) {
    parts.push(
      `${hours}sa`
    );
  }

  if (
    minutes > 0 ||
    parts.length === 0
  ) {
    parts.push(
      `${minutes}dk`
    );
  }

  return parts.join(" ");
}


function calculateAverageCloseTime(
  records
) {
  const durations =
    records
      .map(
        record =>
          record.closedAt -
          record.openedAt
      )
      .filter(
        duration =>
          Number.isFinite(
            duration
          ) &&
          duration >= 0
      );

  if (durations.length === 0) {
    return null;
  }

  return (
    durations.reduce(
      (
        total,
        duration
      ) =>
        total + duration,
      0
    ) /
    durations.length
  );
}


function getOldestOpenTicket(
  records
) {
  if (records.length === 0) {
    return null;
  }

  return [
    ...records
  ].sort(
    (
      first,
      second
    ) =>
      first.openedAt -
      second.openedAt
  )[0];
}


async function assertStatsChannelPermissions(
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
      "Ticket stats channel is missing permissions: " +
      missingPermissions
        .map(
          permission =>
            permission.name
        )
        .join(", ")
    );
  }
}


async function fetchRequiredGuildTextChannel(
  channelId,
  label
) {
  const channel =
    await statsClient.channels.fetch(
      channelId
    );

  if (
    !channel ||
    channel.type !==
      ChannelType.GuildText ||
    channel.guild.id !==
      statsGuild.id
  ) {
    throw new Error(
      `${label} was not found, is invalid or belongs to another guild.`
    );
  }

  return channel;
}


async function collectStatsSnapshot() {
  const now =
    Date.now();

  const {
    todayStart,
    weekStart
  } =
    getIstanbulPeriodStarts(
      now
    );

  const channels =
    await statsGuild.channels.fetch();

  const openRecords =
    getOpenTicketRecords(
      channels
    );

  const [
    supportTranscriptChannel,
    collabTranscriptChannel
  ] =
    await Promise.all([
      fetchRequiredGuildTextChannel(
        SUPPORT_TRANSCRIPT_CHANNEL_ID,
        "Support transcript channel"
      ),
      fetchRequiredGuildTextChannel(
        COLLAB_TRANSCRIPT_CHANNEL_ID,
        "Collaboration transcript channel"
      )
    ]);

  const supportTranscriptResult =
    await fetchRecentTranscriptRecords(
      supportTranscriptChannel,
      "support",
      weekStart
    );

  const collabTranscriptResult =
    await fetchRecentTranscriptRecords(
      collabTranscriptChannel,
      "collab",
      weekStart
    );

  const transcriptStatsLimitReached =
    supportTranscriptResult.limitReached ||
    collabTranscriptResult.limitReached;

  if (
    transcriptStatsLimitReached &&
    !transcriptStatsLimitWarningActive
  ) {
    transcriptStatsLimitWarningActive =
      true;

    void reportError({
      title:
        "Ticket Stats Scan Limit Reached",
      error:
        new Error(
          "The weekly transcript scan reached its safety limit."
        ),
      severity:
        "warning",
      context: {
        supportPages:
          supportTranscriptResult.pageCount,
        collabPages:
          collabTranscriptResult.pageCount,
        maximumPagesPerChannel:
          MAX_TRANSCRIPT_STATS_PAGES
      }
    });

  } else if (!transcriptStatsLimitReached) {
    transcriptStatsLimitWarningActive =
      false;
  }

  const closedRecords =
    deduplicateTranscriptRecords([
      ...supportTranscriptResult.records,
      ...collabTranscriptResult.records
    ]);

  const openedToday =
    countByType(
      [
        ...openRecords,
        ...closedRecords
      ],
      record =>
        record.openedAt >=
          todayStart &&
        record.openedAt <=
          now
    );

  const openedThisWeek =
    countByType(
      [
        ...openRecords,
        ...closedRecords
      ],
      record =>
        record.openedAt >=
          weekStart &&
        record.openedAt <=
          now
    );

  const currentlyOpen =
    countByType(
      openRecords
    );

  const closedToday =
    closedRecords.filter(
      record =>
        record.closedAt >=
          todayStart &&
        record.closedAt <=
          now
    );

  const closedThisWeek =
    closedRecords.filter(
      record =>
        record.closedAt >=
          weekStart &&
        record.closedAt <=
          now
    );

  const averageCloseTime =
    calculateAverageCloseTime(
      closedThisWeek
    );

  const oldestOpenTicket =
    getOldestOpenTicket(
      openRecords
    );

  const supportCategoryCount =
    channels.filter(
      channel =>
        channel.parentId ===
          SUPPORT_TICKETS_CATEGORY_ID
    ).size;

  const collabCategoryCount =
    channels.filter(
      channel =>
        channel.parentId ===
          COLLAB_TICKETS_CATEGORY_ID
    ).size;

  return {
    now,
    openedToday,
    openedThisWeek,
    currentlyOpen,
    closedToday:
      closedToday.length,
    closedThisWeek:
      closedThisWeek.length,
    averageCloseTime,
    oldestOpenTicket,
    supportCategoryCount,
    collabCategoryCount
  };
}


function createStatsPayload(
  snapshot
) {
  const oldestOpenText =
    snapshot.oldestOpenTicket
      ? (
          `${snapshot.oldestOpenTicket.channel} • ` +
          `${formatDuration(
            snapshot.now -
            snapshot.oldestOpenTicket.openedAt
          )}`
        )
      : "Açık ticket yok";

  const embed =
    new EmbedBuilder()
      .setTitle(
        TICKET_STATS_PANEL_TITLE
      )
      .setDescription(
        "Destek ve İş Birliği ticketlarının canlı özeti."
      )
      .setColor(
        "#ff0000"
      )
      .addFields(
        {
          name:
            "📅 Bugün Açılanlar",
          value:
            formatTypeCounts(
              snapshot.openedToday
            ),
          inline:
            true
        },
        {
          name:
            "🗓️ Bu Hafta Açılanlar",
          value:
            formatTypeCounts(
              snapshot.openedThisWeek
            ),
          inline:
            true
        },
        {
          name:
            "✅ Kapatılan Ticketlar",
          value:
            [
              `Bugün: **${snapshot.closedToday}**`,
              `Bu hafta: **${snapshot.closedThisWeek}**`
            ].join("\n"),
          inline:
            true
        },
        {
          name:
            "📂 Şu An Açık",
          value:
            formatTypeCounts(
              snapshot.currentlyOpen
            ),
          inline:
            true
        },
        {
          name:
            "⏱️ Ortalama Kapatma Süresi",
          value:
            `${formatDuration(
              snapshot.averageCloseTime
            )} • Bu hafta`,
          inline:
            true
        },
        {
          name:
            "🕰️ En Eski Açık Ticket",
          value:
            oldestOpenText,
          inline:
            true
        },
        {
          name:
            "📦 Kategori Kapasitesi",
          value:
            [
              `Destek: **${snapshot.supportCategoryCount}/${TICKET_CATEGORY_CAPACITY}**`,
              `İş Birliği: **${snapshot.collabCategoryCount}/${TICKET_CATEGORY_CAPACITY}**`
            ].join("\n"),
          inline:
            false
        }
      )
      .setFooter({
        text:
          "Eternal Blades • Otomatik güncellenir"
      })
      .setTimestamp(
        snapshot.now
      );

  return {
    embeds: [
      embed
    ],
    components: [],
    allowedMentions: {
      parse: []
    }
  };
}


async function upsertStatsPanel() {
  const snapshot =
    await collectStatsSnapshot();

  statsPanelMessage =
    await upsertPanelMessage({
      channel:
        statsChannel,
      configuredMessageId:
        TICKET_STATS_MESSAGE_ID,
      environmentVariableName:
        "TICKET_STATS_MESSAGE_ID",
      panelName:
        "Ticket stats panel",
      isExpectedPanel:
        message =>
          message.author.id ===
            statsClient.user.id &&
          message.embeds.some(
            embed =>
              [
                TICKET_STATS_PANEL_TITLE,
                LEGACY_TICKET_STATS_PANEL_TITLE
              ].includes(
                embed.title
              )
          ),
      buildPayload:
        () =>
          createStatsPayload(
            snapshot
          )
    });

  return statsPanelMessage;
}


export async function refreshTicketStats(
  reason = "manual"
) {
  if (
    !statsClient ||
    !statsGuild ||
    !statsChannel
  ) {
    return false;
  }

  if (refreshPromise) {
    refreshRequested =
      true;

    return refreshPromise;
  }

  refreshPromise =
    (async () => {
      try {
        const snapshot =
          await collectStatsSnapshot();

        if (!statsPanelMessage) {
          await upsertStatsPanel();

        } else {
          await statsPanelMessage.edit(
            createStatsPayload(
              snapshot
            )
          );
        }

        console.log(
          `Ticket stats refreshed (${reason}).`
        );

        return true;

      } catch (error) {
        console.error(
          "Ticket stats refresh error:",
          error
        );

        await reportError({
          title:
            "Ticket Stats Refresh Failed",
          error,
          context: {
            reason
          }
        });

        return false;
      }
    })();

  try {
    return await refreshPromise;

  } finally {
    refreshPromise =
      null;

    if (refreshRequested) {
      refreshRequested =
        false;

      scheduleTicketStatsRefresh(
        "queued-refresh"
      );
    }
  }
}


export function scheduleTicketStatsRefresh(
  reason = "ticket-change"
) {
  if (
    !statsClient ||
    !statsChannel
  ) {
    return;
  }

  if (refreshTimer) {
    clearTimeout(
      refreshTimer
    );
  }

  refreshTimer =
    setTimeout(
      () => {
        refreshTimer =
          null;

        void refreshTicketStats(
          reason
        );
      },
      STATS_REFRESH_DEBOUNCE_MS
    );

  refreshTimer.unref();
}


export async function setupTicketStats(
  client
) {
  statsClient =
    client;

  const channel =
    await client.channels.fetch(
      TICKET_STATS_CHANNEL_ID
    );

  if (
    !channel ||
    channel.type !==
      ChannelType.GuildText
  ) {
    throw new Error(
      "Ticket stats channel was not found or is not a guild text channel."
    );
  }

  await assertStatsChannelPermissions(
    channel
  );

  statsChannel =
    channel;

  statsGuild =
    channel.guild;

  await upsertStatsPanel();

  if (refreshInterval) {
    clearInterval(
      refreshInterval
    );
  }

  refreshInterval =
    setInterval(
      () => {
        void refreshTicketStats(
          "scheduled"
        );
      },
      STATS_REFRESH_INTERVAL_MS
    );

  refreshInterval.unref();

  console.log(
    `Ticket stats ready: ${TICKET_STATS_CHANNEL_ID}`
  );

  return statsPanelMessage;
}


export function stopTicketStats() {
  if (refreshTimer) {
    clearTimeout(
      refreshTimer
    );

    refreshTimer =
      null;
  }

  if (refreshInterval) {
    clearInterval(
      refreshInterval
    );

    refreshInterval =
      null;
  }
}
