import {
  ChannelType,
  EmbedBuilder,
  PermissionsBitField
} from "discord.js";


const BOT_LOGS_CHANNEL_ID =
  "1531389340675084470";

const MAX_ERROR_TEXT_LENGTH =
  3500;

const MAX_CONTEXT_TEXT_LENGTH =
  900;

let reporterClient =
  null;

let botLogsChannel =
  null;


function truncate(
  value,
  maxLength
) {
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


function redactSensitiveText(value) {
  let text =
    String(value ?? "");

  const token =
    process.env.TOKEN?.trim();

  if (token) {
    text =
      text.split(token)
        .join("[REDACTED]");
  }

  return text
    .replace(
      /mfa\.[A-Za-z0-9_-]{20,}/g,
      "[REDACTED]"
    )
    .replace(
      /[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{20,}/g,
      "[REDACTED]"
    );
}


function getErrorText(error) {
  if (error instanceof Error) {
    return redactSensitiveText(
      error.stack ||
      `${error.name}: ${error.message}`
    );
  }

  if (typeof error === "string") {
    return redactSensitiveText(
      error
    );
  }

  try {
    return redactSensitiveText(
      JSON.stringify(
        error,
        null,
        2
      )
    );

  } catch {
    return redactSensitiveText(
      String(error)
    );
  }
}


function getContextText(context) {
  if (
    !context ||
    Object.keys(context).length === 0
  ) {
    return null;
  }

  try {
    return truncate(
      redactSensitiveText(
        JSON.stringify(
          context,
          null,
          2
        )
      ),
      MAX_CONTEXT_TEXT_LENGTH
    );

  } catch {
    return truncate(
      redactSensitiveText(
        String(context)
      ),
      MAX_CONTEXT_TEXT_LENGTH
    );
  }
}


async function assertBotLogsPermissions(
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
      "Bot logs channel is missing permissions: " +
      missingPermissions
        .map(
          permission =>
            permission.name
        )
        .join(", ")
    );
  }
}


export async function setupErrorReporter(
  client
) {
  reporterClient =
    client;

  const channel =
    await client.channels.fetch(
      BOT_LOGS_CHANNEL_ID
    );

  if (
    !channel ||
    channel.type !==
      ChannelType.GuildText
  ) {
    throw new Error(
      "Bot logs channel was not found or is not a guild text channel."
    );
  }

  await assertBotLogsPermissions(
    channel
  );

  botLogsChannel =
    channel;

  console.log(
    `Error reporter ready: ${BOT_LOGS_CHANNEL_ID}`
  );

  return channel;
}


export async function reportError({
  title,
  error,
  context = {},
  severity = "error"
}) {
  if (
    !reporterClient ||
    !botLogsChannel
  ) {
    return false;
  }

  const errorText =
    truncate(
      getErrorText(error) ||
      "No error details were provided.",
      MAX_ERROR_TEXT_LENGTH
    );

  const contextText =
    getContextText(
      context
    );

  const color =
    severity === "warning"
      ? "#f1c40f"
      : "#ff0000";

  const embed =
    new EmbedBuilder()
      .setTitle(
        truncate(
          `🚨 ${title || "Bot Error"}`,
          256
        )
      )
      .setDescription(
        `\`\`\`\n${errorText}\n\`\`\``
      )
      .setColor(
        color
      )
      .setFooter({
        text:
          "Eternal Blades Error Reporter"
      })
      .setTimestamp();

  if (contextText) {
    embed.addFields({
      name:
        "Context",
      value:
        `\`\`\`json\n${contextText}\n\`\`\``,
      inline:
        false
    });
  }

  try {
    await botLogsChannel.send({
      embeds: [
        embed
      ],
      allowedMentions: {
        parse: []
      }
    });

    return true;

  } catch (reportingError) {
    console.error(
      "Discord error report could not be sent:",
      reportingError
    );

    return false;
  }
}


export async function reportSystemEvent({
  title,
  description,
  color = "#2ecc71"
}) {
  if (
    !reporterClient ||
    !botLogsChannel
  ) {
    return false;
  }

  const embed =
    new EmbedBuilder()
      .setTitle(
        truncate(
          title,
          256
        )
      )
      .setDescription(
        truncate(
          description,
          4000
        )
      )
      .setColor(
        color
      )
      .setFooter({
        text:
          "Eternal Blades System"
      })
      .setTimestamp();

  try {
    await botLogsChannel.send({
      embeds: [
        embed
      ],
      allowedMentions: {
        parse: []
      }
    });

    return true;

  } catch (reportingError) {
    console.error(
      "Discord system event could not be sent:",
      reportingError
    );

    return false;
  }
}
