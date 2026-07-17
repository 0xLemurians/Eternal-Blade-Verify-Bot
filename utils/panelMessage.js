const DEFAULT_RECENT_SCAN_LIMIT = 100;


function normalizeMessageId(value) {
  const messageId =
    String(value ?? "").trim();

  if (!/^\d{17,20}$/.test(messageId)) {
    return "";
  }

  return messageId;
}


function sortMessagesOldestFirst(messages) {
  return [...messages].sort(
    (first, second) =>
      first.createdTimestamp -
      second.createdTimestamp
  );
}


async function fetchConfiguredPanel({
  channel,
  configuredMessageId,
  isExpectedPanel,
  panelName,
  environmentVariableName
}) {
  const messageId =
    normalizeMessageId(
      configuredMessageId
    );

  if (!messageId) {
    return null;
  }

  try {
    const message =
      await channel.messages.fetch(
        messageId
      );

    if (!isExpectedPanel(message)) {
      console.warn(
        `${panelName} message ID from ${environmentVariableName} does not point to the expected bot panel. Falling back to one recent-message scan.`
      );

      return null;
    }

    return message;

  } catch (error) {
    console.warn(
      `${panelName} message ID from ${environmentVariableName} could not be fetched. Falling back to one recent-message scan.`,
      error
    );

    return null;
  }
}


async function fetchRecentPanelCandidates({
  channel,
  isExpectedPanel,
  recentScanLimit
}) {
  const recentMessages =
    await channel.messages.fetch({
      limit:
        recentScanLimit
    });

  const panels =
    sortMessagesOldestFirst(
      recentMessages.filter(
        message =>
          isExpectedPanel(message)
      ).values()
    );

  return {
    recentMessages,
    panels
  };
}


async function channelHasMessagesOlderThan(
  recentMessages
) {
  if (recentMessages.size === 0) {
    return false;
  }

  const oldestMessage =
    recentMessages.last();

  const olderMessages =
    await oldestMessage.channel.messages.fetch({
      limit:
        1,

      before:
        oldestMessage.id
    });

  return olderMessages.size > 0;
}


function logPanelMessageId({
  panelName,
  environmentVariableName,
  message
}) {
  console.log(
    `${panelName} message ID: ${message.id}`
  );

  console.log(
    `Set Railway variable ${environmentVariableName}=${message.id} for direct panel updates without scanning message history.`
  );
}


export async function upsertPanelMessage({
  channel,
  configuredMessageId,
  environmentVariableName,
  panelName,
  isExpectedPanel,
  buildPayload,
  recentScanLimit = DEFAULT_RECENT_SCAN_LIMIT
}) {
  if (
    !Number.isInteger(recentScanLimit) ||
    recentScanLimit < 1 ||
    recentScanLimit > 100
  ) {
    throw new RangeError(
      "recentScanLimit must be an integer between 1 and 100."
    );
  }

  const configuredPanel =
    await fetchConfiguredPanel({
      channel,
      configuredMessageId,
      isExpectedPanel,
      panelName,
      environmentVariableName
    });

  if (configuredPanel) {
    await configuredPanel.edit(
      buildPayload()
    );

    console.log(
      `Existing ${panelName.toLowerCase()} updated directly by message ID.`
    );

    return configuredPanel;
  }

  /*
    This is a bounded fallback. It fetches at most the
    latest 100 messages, plus one older-message check
    only when needed. It never downloads full history.
  */

  const {
    recentMessages,
    panels:
      recentPanels
  } = await fetchRecentPanelCandidates({
    channel,
    isExpectedPanel,
    recentScanLimit
  });

  if (recentPanels.length > 0) {
    const panelToKeep =
      recentPanels.at(-1);

    await panelToKeep.edit(
      buildPayload()
    );

    console.log(
      `Existing ${panelName.toLowerCase()} updated from the recent-message fallback.`
    );

    for (
      const duplicatePanel
      of recentPanels.slice(0, -1)
    ) {
      await duplicatePanel
        .delete()
        .then(
          () =>
            console.log(
              `Duplicate ${panelName.toLowerCase()} deleted.`
            )
        )
        .catch(
          error =>
            console.error(
              `Duplicate ${panelName.toLowerCase()} delete error:`,
              error
            )
        );
    }

    logPanelMessageId({
      panelName,
      environmentVariableName,
      message:
        panelToKeep
    });

    return panelToKeep;
  }

  if (
    recentMessages.size ===
      recentScanLimit &&
    await channelHasMessagesOlderThan(
      recentMessages
    )
  ) {
    throw new Error(
      `${panelName} was not found in the most recent ${recentScanLimit} messages, and older channel history exists. No new panel was sent to prevent duplicates. Set ${environmentVariableName} to the existing panel message ID.`
    );
  }

  const newPanel =
    await channel.send(
      buildPayload()
    );

  console.log(
    `New ${panelName.toLowerCase()} sent.`
  );

  logPanelMessageId({
    panelName,
    environmentVariableName,
    message:
      newPanel
  });

  return newPanel;
}
