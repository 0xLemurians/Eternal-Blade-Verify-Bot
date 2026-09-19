import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionsBitField
} from "discord.js";

import {
  WALLET_CHAIN,
  WALLET_CUSTOM_IDS,
  WALLET_ELIGIBLE_ROLES,
  WALLET_PANEL_MESSAGE_ID,
  WALLET_PANEL_TITLE,
  WALLET_SUBMISSION_CHANNEL_ID
} from "../config/wallet.js";

import {
  upsertPanelMessage
} from "../utils/panelMessage.js";


const BLANK_LINE =
  "\u200B";


async function assertWalletPanelPermissions(
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
      "Wallet submission channel is missing bot permissions: " +
      missingPermissions
        .map(
          permission =>
            permission.name
        )
        .join(", ")
    );
  }
}


function createWalletPanel(
  client,
  { suppressNotifications = false } = {}
) {
  const eligibleRoleNames =
    WALLET_ELIGIBLE_ROLES
      .map(
        role =>
          `• ${role.name}`
      )
      .join("\n");

  const embed =
    new EmbedBuilder()
      .setTitle(
        WALLET_PANEL_TITLE
      )
      .setDescription(
        [
          `Submit the ${WALLET_CHAIN.label} wallet address you want to use for Eternal Blades eligibility and future allocations.`,
          BLANK_LINE,
          "**Eligible roles**",
          eligibleRoleNames,
          BLANK_LINE,
          "First Blades and Blade Seeker are not eligible for wallet submission.",
          BLANK_LINE,
          "**Before submitting**",
          "• Submit only a public wallet address you control.",
          "• One wallet is stored per Discord account.",
          "• Submitting again updates your existing wallet.",
          "• The same wallet cannot be registered to multiple Discord accounts.",
          "• Never share your seed phrase, private key or recovery phrase. Eternal Blades will never ask for them."
        ].join("\n")
      )
      .setColor(
        "#f1c40f"
      )
      .setThumbnail(
        client.user.displayAvatarURL({
          size:
            256
        })
      )
      .setFooter({
        text:
          "Wallet submissions are visible only to authorized Eternal Blades staff."
      });

  const button =
    new ButtonBuilder()
      .setCustomId(
        WALLET_CUSTOM_IDS.submitButton
      )
      .setLabel(
        "Submit Wallet"
      )
      .setStyle(
        ButtonStyle.Primary
      )
      .setEmoji(
        "🛡️"
      );

  const row =
    new ActionRowBuilder()
      .addComponents(
        button
      );

  const payload = {
    embeds: [
      embed
    ],
    components: [
      row
    ],
    allowedMentions: {
      parse: []
    }
  };

  if (suppressNotifications) {
    payload.flags =
      MessageFlags.SuppressNotifications;
  }

  return payload;
}


export async function setupWalletPanel(
  client
) {
  const channel =
    await client.channels.fetch(
      WALLET_SUBMISSION_CHANNEL_ID
    );

  if (
    !channel ||
    channel.type !==
      ChannelType.GuildText
  ) {
    throw new Error(
      "Wallet submission channel was not found or is not a guild text channel."
    );
  }

  await assertWalletPanelPermissions(
    channel
  );

  return upsertPanelMessage({
    channel,
    configuredMessageId:
      WALLET_PANEL_MESSAGE_ID,
    environmentVariableName:
      "WALLET_PANEL_MESSAGE_ID",
    panelName:
      "Wallet panel",
    isExpectedPanel:
      message =>
        message.author.id ===
          client.user.id &&
        message.embeds.some(
          embed =>
            embed.title ===
              WALLET_PANEL_TITLE
        ),
    buildPayload:
      ({ mode }) =>
        createWalletPanel(
          client,
          {
            suppressNotifications:
              mode === "send"
          }
        )
  });
}
