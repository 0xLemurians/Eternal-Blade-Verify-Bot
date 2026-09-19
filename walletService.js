import {
  ActionRowBuilder,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionsBitField,
  TextInputBuilder,
  TextInputStyle
} from "discord.js";

import {
  WALLET_CHAIN,
  WALLET_CUSTOM_IDS,
  WALLET_ELIGIBLE_ROLES,
  WALLET_LOGS_CHANNEL_ID,
  WALLET_SUBMISSION_CHANNEL_ID
} from "../config/wallet.js";

import {
  setupWalletPanel
} from "../panels/walletPanel.js";

import {
  setupWalletStore,
  stopWalletStore,
  upsertWalletSubmission
} from "./walletStore.js";

import {
  reportError
} from "./errorReporter.js";


const EVM_ADDRESS_REGEX =
  /^0x[a-fA-F0-9]{40}$/;

const EVM_ZERO_ADDRESS_REGEX =
  /^0x0{40}$/i;

const WALLET_BUTTON_COOLDOWN_MS =
  3_000;

const WALLET_SUBMISSION_COOLDOWN_MS =
  15_000;

const walletButtonCooldowns =
  new Map();

const walletSubmissionCooldowns =
  new Map();

const activeWalletSubmissions =
  new Set();

let walletGuildId =
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
      maxLength - 1
    )
  )}…`;
}


async function assertWalletLogPermissions(
  channel
) {
  const everyonePermissions =
    channel.permissionsFor(
      channel.guild.roles.everyone
    );

  if (
    everyonePermissions?.has(
      PermissionsBitField.Flags.ViewChannel
    )
  ) {
    throw new Error(
      "Wallet logs channel is visible to @everyone. Make #wallet-logs private before enabling wallet collection."
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
      "Wallet logs channel is missing bot permissions: " +
      missingPermissions
        .map(
          permission =>
            permission.name
        )
        .join(", ")
    );
  }
}


async function validateWalletRoles(
  guild
) {
  await guild.roles.fetch();

  const missingRoles =
    WALLET_ELIGIBLE_ROLES.filter(
      role =>
        !guild.roles.cache.has(
          role.id
        )
    );

  if (missingRoles.length > 0) {
    throw new Error(
      "Wallet eligibility role IDs are missing from the guild: " +
      missingRoles
        .map(
          role =>
            `${role.name} (${role.id})`
        )
        .join(", ")
    );
  }
}


function getEligibilityRole(
  member
) {
  for (
    const configuredRole
    of WALLET_ELIGIBLE_ROLES
  ) {
    const role =
      member.roles.cache.get(
        configuredRole.id
      );

    if (role) {
      return {
        id:
          configuredRole.id,
        name:
          role.name ||
          configuredRole.name
      };
    }
  }

  return null;
}


async function fetchCurrentMember(
  interaction
) {
  if (!interaction.guild) {
    return null;
  }

  return interaction.guild.members.fetch(
    interaction.user.id
  );
}


function normalizeWalletAddress(
  walletAddress
) {
  return walletAddress
    .trim()
    .toLowerCase();
}


function isValidEvmAddress(
  walletAddress
) {
  return (
    EVM_ADDRESS_REGEX.test(
      walletAddress
    ) &&
    !EVM_ZERO_ADDRESS_REGEX.test(
      walletAddress
    )
  );
}


function getCooldownRemainingMs(
  cooldowns,
  cooldownMs,
  userId
) {
  const previousActionAt =
    cooldowns.get(
      userId
    );

  if (!previousActionAt) {
    return 0;
  }

  const remainingMs =
    Math.max(
      0,
      cooldownMs -
        (
          Date.now() -
          previousActionAt
        )
    );

  if (remainingMs === 0) {
    cooldowns.delete(
      userId
    );
  }

  return remainingMs;
}


function markCooldown(
  cooldowns,
  userId
) {
  cooldowns.set(
    userId,
    Date.now()
  );
}


function createWalletModal() {
  const walletAddressInput =
    new TextInputBuilder()
      .setCustomId(
        WALLET_CUSTOM_IDS.addressInput
      )
      .setLabel(
        "Ethereum / EVM wallet address"
      )
      .setStyle(
        TextInputStyle.Short
      )
      .setPlaceholder(
        "0x1234..."
      )
      .setRequired(
        true
      )
      .setMinLength(
        42
      )
      .setMaxLength(
        42
      );

  const row =
    new ActionRowBuilder()
      .addComponents(
        walletAddressInput
      );

  return new ModalBuilder()
    .setCustomId(
      WALLET_CUSTOM_IDS.submitModal
    )
    .setTitle(
      "Submit Wallet"
    )
    .addComponents(
      row
    );
}


async function sendWalletLog({
  client,
  interaction,
  eligibilityRole,
  walletAddress,
  result
}) {
  const logChannel =
    await client.channels.fetch(
      WALLET_LOGS_CHANNEL_ID
    );

  if (
    !logChannel ||
    logChannel.type !==
      ChannelType.GuildText
  ) {
    throw new Error(
      "Wallet logs channel was not found or is not a guild text channel."
    );
  }

  const titles = {
    created:
      "🛡️ NEW WALLET SUBMISSION"
  };

  const colors = {
    created:
      "#2ecc71"
  };

  const fields = [
    {
      name:
        "Member",
      value:
        `<@${interaction.user.id}>\n\`${interaction.user.id}\``,
      inline:
        true
    },
    {
      name:
        "Eligibility",
      value:
        `${eligibilityRole.name}\n\`${eligibilityRole.id}\``,
      inline:
        true
    },
    {
      name:
        "Chain",
      value:
        WALLET_CHAIN.label,
      inline:
        true
    },
    {
      name:
        "Wallet",
      value:
        `\`${walletAddress}\``,
      inline:
        false
    }
  ];



  const embed =
    new EmbedBuilder()
      .setTitle(
        titles[result.status] ||
        "Wallet Submission"
      )
      .setColor(
        colors[result.status] ||
        "#95a5a6"
      )
      .addFields(
        fields
      )
      .setTimestamp(
        new Date()
      )
      .setFooter({
        text:
          `Discord user: ${interaction.user.username}`
      });

  await logChannel.send({
    embeds: [
      embed
    ],
    allowedMentions: {
      parse: []
    }
  });
}


async function handleWalletButton(
  interaction
) {
  if (!interaction.guild) {
    await interaction.reply({
      content:
        "❌ Wallet submission is only available inside the Eternal Blades server.",
      flags:
        MessageFlags.Ephemeral
    });

    return;
  }

  if (
    walletGuildId &&
    interaction.guild.id !==
      walletGuildId
  ) {
    await interaction.reply({
      content:
        "❌ This wallet panel is not configured for this server.",
      flags:
        MessageFlags.Ephemeral
    });

    return;
  }

  const remainingButtonCooldownMs =
    getCooldownRemainingMs(
      walletButtonCooldowns,
      WALLET_BUTTON_COOLDOWN_MS,
      interaction.user.id
    );

  if (remainingButtonCooldownMs > 0) {
    await interaction.reply({
      content:
        `⏳ Please wait ${Math.ceil(
          remainingButtonCooldownMs / 1000
        )} second(s) before opening the wallet form again.`,
      flags:
        MessageFlags.Ephemeral
    });

    return;
  }

  markCooldown(
    walletButtonCooldowns,
    interaction.user.id
  );

  const member =
    await fetchCurrentMember(
      interaction
    );

  const eligibilityRole =
    member &&
    getEligibilityRole(
      member
    );

  if (!eligibilityRole) {
    await interaction.reply({
      content:
        "❌ You are not currently eligible to submit a wallet. Eligible roles: Legend of the Blades, Blade Warden and Blade Vanguard. First Blades and Blade Seeker are not eligible.",
      flags:
        MessageFlags.Ephemeral
    });

    return;
  }

  await interaction.showModal(
    createWalletModal()
  );
}


async function handleWalletModal(
  interaction
) {
  if (!interaction.guild) {
    await interaction.reply({
      content:
        "❌ Wallet submission is only available inside the Eternal Blades server.",
      flags:
        MessageFlags.Ephemeral
    });

    return;
  }

  if (
    activeWalletSubmissions.has(
      interaction.user.id
    )
  ) {
    await interaction.reply({
      content:
        "⏳ Your wallet submission is already being processed. Please wait for it to finish.",
      flags:
        MessageFlags.Ephemeral
    });

    return;
  }

  const remainingCooldownMs =
    getCooldownRemainingMs(
      walletSubmissionCooldowns,
      WALLET_SUBMISSION_COOLDOWN_MS,
      interaction.user.id
    );

  if (remainingCooldownMs > 0) {
    await interaction.reply({
      content:
        `⏳ Please wait ${Math.ceil(
          remainingCooldownMs / 1000
        )} second(s) before submitting again.`,
      flags:
        MessageFlags.Ephemeral
    });

    return;
  }

  /*
    Start the cooldown before role, address and database checks.
    Invalid addresses and duplicate-wallet attempts therefore cannot
    bypass rate limiting by failing before a successful database write.
  */
  markCooldown(
    walletSubmissionCooldowns,
    interaction.user.id
  );

  activeWalletSubmissions.add(
    interaction.user.id
  );

  try {
    const member =
      await fetchCurrentMember(
        interaction
      );

    const eligibilityRole =
      member &&
      getEligibilityRole(
        member
      );

    if (!eligibilityRole) {
      await interaction.reply({
        content:
          "❌ Your current roles are not eligible for wallet submission. Only Legend of the Blades, Blade Warden and Blade Vanguard are eligible.",
        flags:
          MessageFlags.Ephemeral
      });

      return;
    }

    const walletAddress =
      interaction.fields
        .getTextInputValue(
          WALLET_CUSTOM_IDS.addressInput
        )
        .trim();

    if (
      !isValidEvmAddress(
        walletAddress
      )
    ) {
      await interaction.reply({
        content:
          "❌ Invalid Ethereum / EVM wallet address. Enter a 42-character public address beginning with `0x`. Seed phrases and private keys must never be submitted.",
        flags:
          MessageFlags.Ephemeral
      });

      return;
    }

    await interaction.deferReply({
      flags:
        MessageFlags.Ephemeral
    });

    const normalizedWalletAddress =
      normalizeWalletAddress(
        walletAddress
      );

    const result =
      await upsertWalletSubmission({
        guildId:
          interaction.guild.id,
        userId:
          interaction.user.id,
        username:
          interaction.user.username,
        displayName:
          member.displayName ||
          interaction.user.globalName ||
          interaction.user.username,
        walletAddress,
        normalizedWalletAddress,
        chain:
          WALLET_CHAIN.key,
        eligibilityRoleId:
          eligibilityRole.id,
        eligibilityRoleName:
          eligibilityRole.name
      });

    if (result.status === "already_submitted") {
      await interaction.editReply({
        content:
          "❌ You have already submitted a wallet. Wallet submissions can only be made once and cannot be changed. If you submitted the wrong address, contact Eternal Blades staff.",
        components: []
      });

      return;
    }

    if (result.status === "duplicate") {
      await interaction.editReply({
        content:
          "❌ This wallet is already registered to another Discord account. If you believe this is a mistake, contact Eternal Blades staff.",
        components: []
      });

      return;
    }

    try {
      await sendWalletLog({
        client:
          interaction.client,
        interaction,
        eligibilityRole,
        walletAddress,
        result
      });

    } catch (error) {
      console.error(
        "Wallet log send error:",
        error
      );

      void reportError({
        title:
          "Wallet Log Send Failed",
        error,
        context: {
          userId:
            interaction.user.id,
          guildId:
            interaction.guild.id,
          walletLogChannelId:
            WALLET_LOGS_CHANNEL_ID
        }
      });
    }

    const messages = {
      created:
        `✅ Wallet submitted successfully.\n\n**Wallet:** \`${walletAddress}\`\n**Eligibility:** ${eligibilityRole.name}`
    };

    await interaction.editReply({
      content:
        messages[result.status] ||
        "✅ Wallet submission saved successfully.",
      components: []
    });

  } finally {
    activeWalletSubmissions.delete(
      interaction.user.id
    );
  }
}



export async function setupWalletSystem(
  client
) {
  await setupWalletStore();

  const submissionChannel =
    await client.channels.fetch(
      WALLET_SUBMISSION_CHANNEL_ID
    );

  const logsChannel =
    await client.channels.fetch(
      WALLET_LOGS_CHANNEL_ID
    );

  if (
    !submissionChannel ||
    submissionChannel.type !==
      ChannelType.GuildText
  ) {
    throw new Error(
      "Wallet submission channel was not found or is not a guild text channel."
    );
  }

  if (
    !logsChannel ||
    logsChannel.type !==
      ChannelType.GuildText
  ) {
    throw new Error(
      "Wallet logs channel was not found or is not a guild text channel."
    );
  }

  if (
    submissionChannel.guild.id !==
      logsChannel.guild.id
  ) {
    throw new Error(
      "Wallet submission and wallet logs channels must belong to the same guild."
    );
  }

  walletGuildId =
    submissionChannel.guild.id;

  await validateWalletRoles(
    submissionChannel.guild
  );

  await assertWalletLogPermissions(
    logsChannel
  );

  await setupWalletPanel(
    client
  );

  console.log(
    "Wallet collection system is ready. First Blades and Blade Seeker are excluded from eligibility."
  );
}


export async function handleWalletInteraction(
  interaction
) {
  if (
    interaction.isButton() &&
    interaction.customId ===
      WALLET_CUSTOM_IDS.submitButton
  ) {
    await handleWalletButton(
      interaction
    );

    return true;
  }

  if (
    interaction.isModalSubmit() &&
    interaction.customId ===
      WALLET_CUSTOM_IDS.submitModal
  ) {
    await handleWalletModal(
      interaction
    );

    return true;
  }

  return false;
}


export async function stopWalletSystem() {
  walletButtonCooldowns.clear();
  walletSubmissionCooldowns.clear();
  activeWalletSubmissions.clear();
  walletGuildId =
    null;

  await stopWalletStore();
}
