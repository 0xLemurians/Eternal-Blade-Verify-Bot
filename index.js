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

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ==================================================
// IDS
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

// Aynı ticketın aynı anda iki kez kapatılmasını engeller.
const closingTickets = new Set();

// ==================================================
// TICKET PANEL
// ==================================================

function createTicketPanel() {
  return {
    embeds: [
      new EmbedBuilder()
        .setTitle("🎫 Open a Ticket")
        .setDescription(
          "Select a ticket category below."
        )
        .setColor("#ff0000")
    ],

    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("ticket_select")
          .setPlaceholder("▼ Select Menu")
          .addOptions(
            new StringSelectMenuOptionBuilder()
              .setLabel("Support")
              .setDescription(
                "Get help from the Eternal Blades team."
              )
              .setValue("support"),

            new StringSelectMenuOptionBuilder()
              .setLabel("Collab")
              .setDescription(
                "Contact us for collaborations and partnerships."
              )
              .setValue("collab")
          )
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
      timeZone: "Europe/Istanbul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }
  );
}

function truncate(value, maxLength) {
  const text = String(value ?? "");

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(
    0,
    Math.max(0, maxLength - 3)
  )}...`;
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
        ? Number(openedAtMatch[1])
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

// ==================================================
// FETCH ALL TICKET MESSAGES
// ==================================================

async function fetchAllMessages(channel) {
  const messages = [];

  let before;

  while (true) {
    const batch =
      await channel.messages.fetch({
        limit: 100,

        ...(before
          ? { before }
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

/*
  Botun ticket açılırken gönderdiği ilk mesajı bulur.

  Bu mesajın içinde CLOSE düğmesi bulunduğu için
  gerçek kullanıcı konuşmalarından ayrılabilir.
*/

function isOpeningBotMessage(message) {
  if (
    message.author.id !==
    client.user.id
  ) {
    return false;
  }

  return message.components.some(row =>
    row.components.some(
      component =>
        component.customId ===
        "close_ticket"
    )
  );
}

// ==================================================
// DISCORD THREAD TRANSCRIPT HELPERS
// ==================================================

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
        `**Embed:** ${embed.title}`
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

  return parts.join("\n\n");
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
    .join("\n");
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
    .join("\n");
}

/*
  Orijinal Discord mesajını transcript
  thread'i için bir karta dönüştürür.
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
      sections.join("\n\n") ||
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
            extension: "png",
            size: 64
          })
    })
    .setDescription(
      description
    )
    .setColor(
      "#ff0000"
    )
    .setFooter({
      text:
        `Original message ID: ${message.id}`
    })
    .setTimestamp(
      message.createdAt
    );
}

/*
  Mesajı transcript thread'ine kopyalar.

  Görsel ve dosyaları yeniden yüklemeye çalışır.
  Yükleyemezse dosyanın bağlantısını gösterir.
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
  Kapanış kartının altında transcript thread'i açar.

  Ekstra bir "Collab Transcript" veya
  "Support Transcript" kartı göndermez.
  Böylece aynı bilgiler iki kez görünmez.
*/

async function createDiscordThreadTranscript({
  logMessage,
  ticketChannel,
  messages
}) {
  const threadName =
    truncate(
      `${ticketChannel.name}-transcript`,
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
    Burada ekstra özet mesajı gönderilmiyor.

    Discord kapanış kartını thread'in
    en üstünde zaten otomatik gösteriyor.
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
// BOT READY
// ==================================================

client.once(
  Events.ClientReady,

  async () => {
    console.log(
      `${client.user.tag} online!`
    );

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

      const recentMessages =
        await ticketPanelChannel.messages.fetch({
          limit: 100
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

      if (existingPanels.size > 0) {
        const panels =
          [
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

          } catch (error) {
            console.error(
              "Duplicate panel delete error:",
              error
            );
          }
        }

      } else {
        await ticketPanelChannel.send(
          createTicketPanel()
        );

        console.log(
          "New ticket panel sent."
        );
      }

    } catch (error) {
      console.error(
        "Ticket panel setup error:",
        error
      );
    }
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
              "❌ This command can only be used in a server.",

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
          Kullanıcının aynı kategoride
          açık ticketı olup olmadığını kontrol eder.
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

          // @everyone ticket kanalını göremez
          {
            id:
              interaction.guild.id,

            deny: [
              PermissionsBitField
                .Flags
                .ViewChannel
            ]
          },

          // Eternal Blades botu
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

          // Ticketı açan kullanıcı
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
              "CLOSE"
            )
            .setEmoji(
              "🗑️"
            )
            .setStyle(
              ButtonStyle.Danger
            );

        const ticketTitle =
          type === "support"
            ? "🎫 SUPPORT Ticket"
            : "🤝 COLLAB Ticket";

        const ticketDescription =
          type === "support"

            ? (
              "Please explain the issue " +
              "you need help with.\n\n" +
              "Our team will assist you shortly."
            )

            : (
              "Please introduce your project " +
              "and explain your collaboration proposal.\n\n" +
              "Our team will review it shortly."
            );

        await ticketChannel.send({
          content:
            `${interaction.user}`,

          allowedMentions: {
            users: [
              interaction.user.id
            ]
          },

          embeds: [
            new EmbedBuilder()
              .setTitle(
                ticketTitle
              )
              .setDescription(
                ticketDescription
              )
              .setColor(
                "#ff0000"
              )
              .setFooter({
                text:
                  "Eternal Blades Support"
              })
              .setTimestamp()
          ],

          components: [
            new ActionRowBuilder()
              .addComponents(
                closeButton
              )
          ]
        });

        return interaction.editReply({
          content:
            `✅ Ticket created: ${ticketChannel}`
        });
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
          Ticketı açan normal kullanıcı kapatamaz.
        */

        if (!isStaff) {
          return interaction.reply({
            content:
              "❌ Only authorized staff members can close this ticket.",

            flags:
              MessageFlags.Ephemeral
          });
        }

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
            Ticket içerisindeki bütün
            mesajları toplar.
          */

          const allMessages =
            await fetchAllMessages(
              ticketChannel
            );

          /*
            Botun ticket açılış kartını kaldırır.

            Böylece thread içinde yalnızca
            gerçek kullanıcı ve yetkili mesajları kalır.
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

            ticketChannel
              .createdTimestamp;

          const ownerText =
            metadata.ownerId

              ? (
                `<@${metadata.ownerId}> ` +
                `(${metadata.ownerId})`
              )

              : "Unknown";

          /*
            Transcript kanalına gönderilen
            tek kapanış kartı.
          */

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
            HTML veya TXT dosyası gönderilmez.
            Yalnızca kapanış kartı gönderilir.
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
            Discord transcript thread'i açılır.
          */

          transcriptThread =
            await createDiscordThreadTranscript({
              logMessage,

              ticketChannel,

              messages:
                transcriptMessages
            });

          /*
            Thread'e giden buton.
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
            Transcript tamamlanmadıysa
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
          Transcript başarıyla oluşturulduktan
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
