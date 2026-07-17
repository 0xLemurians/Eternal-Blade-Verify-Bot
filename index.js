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
// CHANNEL IDS
// ==================================================

const OPEN_TICKET_CHANNEL_ID =
  "1506778989736493106";

const SUPPORT_CATEGORY_ID =
  "1506778963392069734";

const SUPPORT_TRANSCRIPT_CHANNEL_ID =
  "1527352998936707193";

const COLLAB_TRANSCRIPT_CHANNEL_ID =
  "1527352927960698994";


// ==================================================
// SETTINGS
// ==================================================

const STAFF_ROLES = [
  "👁️ Community Manager",
  "Eternal Founder"
];

const ALLOWED_TICKET_TYPES = [
  "support",
  "collab"
];

/*
  Bir ticketın aynı anda iki defa
  kapatılmasını engeller.
*/

const closingTickets = new Set();


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


// ==================================================
// GENERAL HELPERS
// ==================================================

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


/*
  Transcript thread adına eklenecek
  benzersiz tarih ve saat.

  Örnek:
  20260717-145500
*/

function formatThreadTimestamp(timestamp) {
  const dateParts =
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

  for (const part of dateParts) {
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


/*
  Ticket kanal konusundaki bilgileri okur.

  Örnek kanal konusu:

  Ticket Owner: username
  User ID: 123456
  Type: support
  Opened At: 1784300000000
*/

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


/*
  Ticket türüne göre transcript
  kanalını seçer.
*/

function getTranscriptChannelId(type) {
  if (type === "support") {
    return SUPPORT_TRANSCRIPT_CHANNEL_ID;
  }

  if (type === "collab") {
    return COLLAB_TRANSCRIPT_CHANNEL_ID;
  }

  return null;
}


// ==================================================
// FETCH ALL TICKET MESSAGES
// ==================================================

async function fetchAllMessages(channel) {
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

  /*
    Mesajları eskiden yeniye sıralar.
  */

  return messages.sort(
    (first, second) =>
      first.createdTimestamp -
      second.createdTimestamp
  );
}


/*
  Ticket açıldığında botun gönderdiği
  CLOSE TICKET düğmeli başlangıç kartını bulur.

  Bu mesaj transcript içine alınmaz.
*/

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


// ==================================================
// THREAD TRANSCRIPT HELPERS
// ==================================================

function getMessageDisplayName(message) {
  return (
    message.member?.displayName ||
    message.author.globalName ||
    message.author.username
  );
}


/*
  Bir kullanıcının gönderdiği embed
  içeriklerini okunabilir metne çevirir.
*/

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


/*
  Sticker bilgilerini transcript
  içine ekler.
*/

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


/*
  Görsel veya dosya Discord'a yeniden
  yüklenemezse bağlantısını gösterir.
*/

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


/*
  Orijinal Discord mesajını transcript
  thread'i için temiz bir embed'e dönüştürür.
*/

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
        message.author
          .displayAvatarURL({
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


/*
  Ticket mesajını transcript thread'ine aktarır.

  Görsel ve dosyaları yeniden yükler.
  Yükleme başarısız olursa bağlantılarını gösterir.
*/

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


/*
  Ticket kapanış kartının altında
  transcript thread'i oluşturur.

  Thread adı örneği:

  support-username-123456-20260717-145500
*/

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

  /*
    Ekstra ikinci bir özet kartı gönderilmez.

    Discord kapanış kartını thread'in
    üstünde zaten otomatik gösterir.
  */

  for (const message of messages) {
    await copyMessageToThread(
      thread,
      message
    );
  }

  return thread;
}


// ==================================================
// TICKET PANEL SETUP
// ==================================================

async function setupTicketPanel() {
  try {
    const ticketPanelChannel =
      await client.channels.fetch(
        OPEN_TICKET_CHANNEL_ID
      );

    if (
      !ticketPanelChannel ||
      !ticketPanelChannel.isTextBased()
    ) {
      console.error(
        "Ticket panel channel was not found."
      );

      return;
    }

    /*
      Son 100 mesaj içinde mevcut
      ticket panelini arar.
    */

    const recentMessages =
      await ticketPanelChannel.messages.fetch({
        limit:
          100
      });

    const existingPanels =
      recentMessages.filter(
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
          )
      );

    /*
      Panel varsa günceller.

      Yanlışlıkla birden fazla panel oluşmuşsa
      fazladan olanları siler.
    */

    if (existingPanels.size > 0) {
      const panels = [
        ...existingPanels.values()
      ];

      const panelToKeep =
        panels[0];

      await panelToKeep.edit(
        createTicketPanel()
      );

      console.log(
        "Existing ticket panel updated."
      );

      for (
        const duplicatePanel
        of panels.slice(1)
      ) {
        try {
          await duplicatePanel.delete();

          console.log(
            "Duplicate ticket panel deleted."
          );

        } catch (deleteError) {
          console.error(
            "Duplicate ticket panel delete error:",
            deleteError
          );
        }
      }

      return;
    }

    /*
      Daha önce panel yoksa yenisini gönderir.
    */

    await ticketPanelChannel.send(
      createTicketPanel()
    );

    console.log(
      "New ticket panel sent."
    );

  } catch (error) {
    console.error(
      "Ticket panel setup error:",
      error
    );
  }
}


// ==================================================
// BOT READY
// ==================================================

client.once(
  Events.ClientReady,

  async () => {
    console.log(
      `${client.user.tag} online!`
    );

    /*
      #links kanalındaki Official Links
      panelini kurar veya günceller.

      Kod panels/linksPanel.js
      dosyasından çalışır.
    */

    await setupLinksPanel(
      client
    );

    /*
      Ticket panelini kurar veya günceller.
    */

    await setupTicketPanel();
  }
);


// ==================================================
// INTERACTIONS
// ==================================================

client.on(
  Events.InteractionCreate,

  async interaction => {
    try {

      // ==============================================
      // CREATE TICKET
      // ==============================================

      if (
        interaction.isStringSelectMenu() &&
        interaction.customId ===
          "ticket_select"
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

        /*
          Kullanıcının aynı türde
          açık ticketı var mı kontrol eder.
        */

        const existingTicket =
          interaction.guild.channels.cache.find(
            channel =>
              channel.type ===
                ChannelType.GuildText &&

              channel.topic?.includes(
                `User ID: ${interaction.user.id}`
              ) &&

              channel.topic?.includes(
                `Type: ${type}`
              )
          );

        if (existingTicket) {
          return interaction.editReply({
            content:
              `❌ You already have an open ${type} ticket: ${existingTicket}`
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


        // ==============================================
        // TICKET CHANNEL PERMISSIONS
        // ==============================================

        const permissionOverwrites = [

          /*
            @everyone ticket kanalını göremez.
          */

          {
            id:
              interaction.guild.id,

            deny: [
              PermissionsBitField
                .Flags
                .ViewChannel
            ]
          },

          /*
            Eternal Blades botunun izinleri.
          */

          {
            id:
              client.user.id,

            allow: [
              PermissionsBitField
                .Flags
                .ViewChannel,

              PermissionsBitField
                .Flags
                .SendMessages,

              PermissionsBitField
                .Flags
                .ReadMessageHistory,

              PermissionsBitField
                .Flags
                .ManageChannels,

              PermissionsBitField
                .Flags
                .EmbedLinks,

              PermissionsBitField
                .Flags
                .AttachFiles
            ]
          },

          /*
            Ticketı açan kullanıcının izinleri.
          */

          {
            id:
              interaction.user.id,

            allow: [
              PermissionsBitField
                .Flags
                .ViewChannel,

              PermissionsBitField
                .Flags
                .SendMessages,

              PermissionsBitField
                .Flags
                .ReadMessageHistory,

              PermissionsBitField
                .Flags
                .EmbedLinks,

              PermissionsBitField
                .Flags
                .AttachFiles
            ]
          }
        ];


        // ==============================================
        // STAFF ACCESS
        // ==============================================

        for (
          const roleName
          of STAFF_ROLES
        ) {
          const staffRole =
            interaction.guild.roles.cache.find(
              role =>
                role.name === roleName
            );

          if (staffRole) {
            permissionOverwrites.push({
              id:
                staffRole.id,

              allow: [
                PermissionsBitField
                  .Flags
                  .ViewChannel,

                PermissionsBitField
                  .Flags
                  .SendMessages,

                PermissionsBitField
                  .Flags
                  .ReadMessageHistory,

                PermissionsBitField
                  .Flags
                  .EmbedLinks,

                PermissionsBitField
                  .Flags
                  .AttachFiles
              ]
            });

          } else {
            console.warn(
              `Staff role not found: ${roleName}`
            );
          }
        }


        // ==============================================
        // CREATE TICKET CHANNEL
        // ==============================================

        const openedAt =
          Date.now();

        const ticketChannel =
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


        // ==============================================
        // CLOSE BUTTON
        // ==============================================

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


        // ==============================================
        // SUPPORT TICKET MESSAGE
        // ==============================================

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
                "Only authorized staff members can close this ticket."
            })
            .setTimestamp();


        // ==============================================
        // COLLAB TICKET MESSAGE
        // ==============================================

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
                "Only authorized staff members can close this ticket."
            })
            .setTimestamp();


        const selectedTicketEmbed =
          type === "support"
            ? supportEmbed
            : collabEmbed;


        await ticketChannel.send({
          content:
            `${interaction.user}`,

          allowedMentions: {
            users: [
              interaction.user.id
            ]
          },

          embeds: [
            selectedTicketEmbed
          ],

          components: [
            new ActionRowBuilder()
              .addComponents(
                closeButton
              )
          ]
        });


        /*
          Ticket oluşturuldu mesajını gösterir.
        */

        await interaction.editReply({
          content:
            `✅ Ticket created: ${ticketChannel}`
        });


        /*
          Ticket oluşturuldu mesajı
          5 saniye sonra otomatik kaybolur.
        */

        setTimeout(
          () => {
            interaction
              .deleteReply()
              .catch(
                () => {}
              );
          },

          5000
        );

        return;
      }


      // ==============================================
      // CLOSE TICKET + THREAD TRANSCRIPT
      // ==============================================

      if (
        interaction.isButton() &&
        interaction.customId ===
          "close_ticket"
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

        /*
          Düğmeye basan kişinin
          güncel rollerini Discord'dan çeker.
        */

        const member =
          await interaction.guild.members.fetch(
            interaction.user.id
          );

        const isStaff =
          member.roles.cache.some(
            role =>
              STAFF_ROLES.includes(
                role.name
              )
          );

        /*
          Ticketı yalnızca yetkililer kapatabilir.

          Ticketı açan normal kullanıcı
          kapatma işlemi yapamaz.
        */

        if (!isStaff) {
          return interaction.reply({
            content:
              "❌ Only authorized staff members can close this ticket.",

            flags:
              MessageFlags.Ephemeral
          });
        }

        /*
          Ticket zaten kapanıyorsa
          ikinci kapatma işlemini engeller.
        */

        if (
          closingTickets.has(
            interaction.channel.id
          )
        ) {
          return interaction.reply({
            content:
              "⏳ This ticket is already being closed.",

            flags:
              MessageFlags.Ephemeral
          });
        }

        const ticketChannel =
          interaction.channel;

        const ticketChannelId =
          ticketChannel.id;

        closingTickets.add(
          ticketChannelId
        );

        await interaction.deferReply({
          flags:
            MessageFlags.Ephemeral
        });

        let logMessage = null;

        let transcriptThread = null;

        try {
          const metadata =
            parseTicketMetadata(
              ticketChannel.topic ||
              ""
            );

          if (
            !metadata.type ||
            !ALLOWED_TICKET_TYPES.includes(
              metadata.type
            )
          ) {
            throw new Error(
              "Ticket type could not be determined from the channel topic."
            );
          }

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
            !transcriptChannel.isTextBased()
          ) {
            throw new Error(
              "Transcript channel was not found or is not a text channel."
            );
          }

          /*
            Ticket kanalındaki bütün
            mesajları toplar.
          */

          const allMessages =
            await fetchAllMessages(
              ticketChannel
            );

          /*
            Botun ticket başlangıç kartını
            transcript içinden çıkarır.
          */

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
            metadata.ownerId
              ? (
                  `<@${metadata.ownerId}> ` +
                  `(${metadata.ownerId})`
                )
              : "Unknown";


          // ==============================================
          // TRANSCRIPT LOG EMBED
          // ==============================================

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


          /*
            Transcript kanalına tek
            kapanış kartını gönderir.
          */

          logMessage =
            await transcriptChannel.send({
              allowedMentions: {
                parse: []
              },

              embeds: [
                logEmbed
              ]
            });


          /*
            Kapanış kartının altında
            benzersiz transcript thread'i oluşturur.
          */

          transcriptThread =
            await createDiscordThreadTranscript({
              logMessage,

              ticketChannel,

              messages:
                transcriptMessages,

              closedAt
            });


          /*
            Transcript thread'ine
            doğrudan giden bağlantı düğmesi.
          */

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

        } catch (archiveError) {
          console.error(
            "Transcript creation error:",
            archiveError
          );

          /*
            Thread yarım oluşturulduysa siler.
          */

          if (transcriptThread) {
            await transcriptThread
              .delete()
              .catch(
                () => {}
              );
          }

          /*
            Kapanış kartı yarım oluşturulduysa siler.
          */

          if (logMessage) {
            await logMessage
              .delete()
              .catch(
                () => {}
              );
          }

          closingTickets.delete(
            ticketChannelId
          );

          /*
            Transcript tamamlanamadığı için
            ticket kanalını silmez.
          */

          return interaction.editReply({
            content:
              "❌ The Discord transcript could not be completed, so the ticket was NOT deleted. Check the transcript-channel permissions and Railway logs."
          });
        }


        await interaction.editReply({
          content:
            "✅ Discord transcript saved successfully. This ticket will close in 3 seconds."
        });


        await new Promise(
          resolve =>
            setTimeout(
              resolve,
              3000
            )
        );


        /*
          Transcript başarılı şekilde oluşturulduktan
          sonra ticket kanalını siler.
        */

        try {
          await ticketChannel.delete(
            `Ticket closed by ${interaction.user.tag}`
          );

          closingTickets.delete(
            ticketChannelId
          );

        } catch (deleteError) {
          console.error(
            "Ticket delete error:",
            deleteError
          );

          closingTickets.delete(
            ticketChannelId
          );

          return interaction.editReply({
            content:
              "⚠️ The transcript was saved, but the ticket channel could not be deleted. Check the bot's Manage Channels permission."
          }).catch(
            () => {}
          );
        }
      }

    } catch (error) {
      console.error(
        "Interaction error:",
        error
      );

      if (interaction.deferred) {
        return interaction.editReply({
          content:
            "❌ Something went wrong."
        }).catch(
          () => {}
        );
      }

      if (!interaction.replied) {
        return interaction.reply({
          content:
            "❌ Something went wrong.",

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
// BOT LOGIN
// ==================================================

client.login(
  process.env.TOKEN
);
