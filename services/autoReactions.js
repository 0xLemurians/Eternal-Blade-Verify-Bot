import {
  ChannelType,
  Events,
  PermissionsBitField
} from "discord.js";

import {
  reportError
} from "./errorReporter.js";


const GENERAL_GREETING_CHANNEL_ID =
  "1506654040895914036";

const AUTO_REACTION_CHANNELS =
  new Map([
    [
      "1506655170543484958",
      "content-creators"
    ],
    [
      "1506654401304199272",
      "raid-proofs"
    ],
    [
      GENERAL_GREETING_CHANNEL_ID,
      "general"
    ]
  ]);

const AUTO_REACTION_EMOJI =
  "💛";

const LINK_PATTERN =
  /(?:https?:\/\/|www\.)[^\s<>]+/i;

const GREETING_PATTERN =
  /^(?:gm+|gn+)(?:\s+(?:gm+|gn+))*$/i;

const ERROR_REPORT_COOLDOWN_MS =
  5 * 60_000;

const activeChannelIds =
  new Set();

const lastErrorReportAt =
  new Map();

let listenerClient =
  null;

let messageCreateListener =
  null;


function hasLink(content) {
  return LINK_PATTERN.test(
    String(content || "")
  );
}


function hasGreeting(content) {
  return GREETING_PATTERN.test(
    String(content || "").trim()
  );
}


function shouldReactToMessage(
  message
) {
  if (
    message.channelId ===
      GENERAL_GREETING_CHANNEL_ID
  ) {
    return hasGreeting(
      message.content
    );
  }

  return hasLink(
    message.content
  );
}


async function validateReactionChannel(
  client,
  channelId,
  channelName
) {
  const channel =
    await client.channels.fetch(
      channelId
    );

  if (
    !channel ||
    channel.type !==
      ChannelType.GuildText
  ) {
    throw new Error(
      `${channelName} was not found or is not a guild text channel.`
    );
  }

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
        PermissionsBitField.Flags.ReadMessageHistory,
      name:
        "Read Message History"
    },
    {
      flag:
        PermissionsBitField.Flags.AddReactions,
      name:
        "Add Reactions"
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
      `${channelName} is missing bot permissions: ` +
      missingPermissions
        .map(
          permission =>
            permission.name
        )
        .join(", ")
    );
  }

  return channel;
}


function shouldReportReactionError(
  channelId
) {
  const now =
    Date.now();

  const lastReportedAt =
    lastErrorReportAt.get(
      channelId
    ) || 0;

  if (
    now - lastReportedAt <
    ERROR_REPORT_COOLDOWN_MS
  ) {
    return false;
  }

  lastErrorReportAt.set(
    channelId,
    now
  );

  return true;
}


async function handleAutoReactionMessage(
  message
) {
  if (
    !message.inGuild() ||
    !activeChannelIds.has(
      message.channelId
    ) ||
    message.author.bot ||
    message.webhookId ||
    !shouldReactToMessage(
      message
    )
  ) {
    return;
  }

  try {
    await message.react(
      AUTO_REACTION_EMOJI
    );

  } catch (error) {
    if (error?.code === 10008) {
      return;
    }

    console.error(
      `Auto reaction failed for message ${message.id}:`,
      error
    );

    if (
      shouldReportReactionError(
        message.channelId
      )
    ) {
      void reportError({
        title:
          "Automatic Message Reaction Failed",
        error,
        context: {
          channelId:
            message.channelId,
          messageId:
            message.id,
          authorId:
            message.author.id
        }
      });
    }
  }
}


export async function setupAutoReactions(
  client
) {
  stopAutoReactions();

  const validationResults =
    await Promise.allSettled(
      [...AUTO_REACTION_CHANNELS]
        .map(
          ([
            channelId,
            channelName
          ]) =>
            validateReactionChannel(
              client,
              channelId,
              channelName
            )
        )
    );

  const channelEntries =
    [...AUTO_REACTION_CHANNELS];

  for (
    let index = 0;
    index < validationResults.length;
    index += 1
  ) {
    const result =
      validationResults[index];

    const [
      channelId,
      channelName
    ] = channelEntries[index];

    if (result.status === "fulfilled") {
      activeChannelIds.add(
        channelId
      );

      continue;
    }

    console.error(
      `Auto reaction channel validation failed for ${channelName} (${channelId}):`,
      result.reason
    );

    void reportError({
      title:
        "Auto Reaction Channel Validation Failed",
      error:
        result.reason,
      context: {
        channelId,
        channelName
      }
    });
  }

  if (activeChannelIds.size === 0) {
    throw new Error(
      "Automatic link reactions could not be enabled in any configured channel."
    );
  }

  listenerClient =
    client;

  messageCreateListener =
    message => {
      void handleAutoReactionMessage(
        message
      );
    };

  listenerClient.on(
    Events.MessageCreate,
    messageCreateListener
  );

  console.log(
    `Automatic link reactions ready in ${activeChannelIds.size} channel(s).`
  );
}


export function stopAutoReactions() {
  if (
    listenerClient &&
    messageCreateListener
  ) {
    listenerClient.off(
      Events.MessageCreate,
      messageCreateListener
    );
  }

  activeChannelIds.clear();
  lastErrorReportAt.clear();

  listenerClient =
    null;

  messageCreateListener =
    null;
}
