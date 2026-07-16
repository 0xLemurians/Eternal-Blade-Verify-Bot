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
  AttachmentBuilder
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

const OPEN_TICKET_CHANNEL_ID = "1506778989736493106";

const SUPPORT_CATEGORY_ID = "1506778963392069734";

const SUPPORT_TRANSCRIPT_CHANNEL_ID =
  "1527352998936707193";

const COLLAB_TRANSCRIPT_CHANNEL_ID =
  "1527352927960698994";



// ==================================================
// STAFF ROLES
// ==================================================

const STAFF_ROLES = [
  "👁️ Community Manager",
  "Eternal Founder"
];



// ==================================================
// TICKET SETTINGS
// ==================================================

const ALLOWED_TICKET_TYPES = [
  "support",
  "collab"
];

/*
  Aynı ticket için iki yetkilinin aynı anda
  CLOSE düğmesine basmasını engeller.
*/

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
// HTML HELPERS
// ==================================================

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}



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



/*
  Ticket kanalının konusundaki bilgileri okur.

  Örnek konu:

  Ticket Owner: User | User ID: 12345 |
  Type: support | Opened At: 123456789
*/

function parseTicketMetadata(topic = "") {
  const ownerMatch =
    topic.match(/User ID:\s*(\d+)/i);

  const typeMatch =
    topic.match(/Type:\s*(support|collab)/i);

  const openedAtMatch =
    topic.match(/Opened At:\s*(\d+)/i);

  return {
    ownerId:
      ownerMatch?.[1] || null,

    type:
      typeMatch?.[1]?.toLowerCase() || null,

    openedAt:
      openedAtMatch?.[1]
        ? Number(openedAtMatch[1])
        : null
  };
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

  /*
    Mesajları eskiden yeniye doğru sıralar.
  */

  return messages.sort(
    (first, second) =>
      first.createdTimestamp -
      second.createdTimestamp
  );
}



// ==================================================
// HTML ATTACHMENT
// ==================================================

function renderAttachment(attachment) {
  const safeName =
    escapeHtml(
      attachment.name ||
      "attachment"
    );

  const safeUrl =
    escapeHtml(
      attachment.url
    );

  const contentType =
    attachment.contentType || "";

  const isImage =
    contentType.startsWith("image/") ||

    /\.(png|jpe?g|gif|webp)$/i.test(
      attachment.name || ""
    );



  if (isImage) {
    return `
      <div class="attachment">

        <a
          href="${safeUrl}"
          target="_blank"
          rel="noopener noreferrer"
        >
          <img
            src="${safeUrl}"
            alt="${safeName}"
          >
        </a>

        <a
          class="attachment-link"
          href="${safeUrl}"
          target="_blank"
          rel="noopener noreferrer"
        >
          ${safeName}
        </a>

      </div>
    `;
  }



  return `
    <div class="attachment file">

      📎

      <a
        href="${safeUrl}"
        target="_blank"
        rel="noopener noreferrer"
      >
        ${safeName}
      </a>

    </div>
  `;
}



// ==================================================
// HTML EMBED
// ==================================================

function renderEmbed(embed) {
  const title =
    embed.title
      ? `
        <div class="embed-title">
          ${escapeHtml(embed.title)}
        </div>
      `
      : "";



  const description =
    embed.description
      ? `
        <div class="embed-description">

          ${escapeHtml(
            embed.description
          ).replaceAll(
            "\n",
            "<br>"
          )}

        </div>
      `
      : "";



  const fields =
    embed.fields?.length
      ? `
        <div class="embed-fields">

          ${embed.fields
            .map(
              field => `
                <div class="embed-field">

                  <strong>
                    ${escapeHtml(
                      field.name
                    )}
                  </strong>

                  <div>
                    ${escapeHtml(
                      field.value
                    ).replaceAll(
                      "\n",
                      "<br>"
                    )}
                  </div>

                </div>
              `
            )
            .join("")}

        </div>
      `
      : "";



  const image =
    embed.image?.url
      ? `
        <img
          class="embed-image"
          src="${escapeHtml(
            embed.image.url
          )}"
          alt="Embed image"
        >
      `
      : "";



  return `
    <div class="discord-embed">

      ${title}

      ${description}

      ${fields}

      ${image}

    </div>
  `;
}



// ==================================================
// HTML MESSAGE
// ==================================================

function renderMessage(message) {
  const displayName =
    message.member?.displayName ||
    message.author.globalName ||
    message.author.username;



  const avatarUrl =
    message.author.displayAvatarURL({
      extension: "png",
      size: 64
    });



  const content =
    message.content
      ? `
        <div class="message-content">

          ${escapeHtml(
            message.content
          ).replaceAll(
            "\n",
            "<br>"
          )}

        </div>
      `
      : "";



  const attachments =
    message.attachments.size
      ? `
        <div class="attachments">

          ${message.attachments
            .map(renderAttachment)
            .join("")}

        </div>
      `
      : "";



  const embeds =
    message.embeds.length
      ? `
        <div class="embeds">

          ${message.embeds
            .map(renderEmbed)
            .join("")}

        </div>
      `
      : "";



  const stickers =
    message.stickers?.size
      ? `
        <div class="stickers">

          ${message.stickers
            .map(
              sticker => `
                <a
                  href="${escapeHtml(
                    sticker.url
                  )}"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Sticker:
                  ${escapeHtml(
                    sticker.name
                  )}
                </a>
              `
            )
            .join("<br>")}

        </div>
      `
      : "";



  return `
    <article class="message">

      <img
        class="avatar"
        src="${escapeHtml(
          avatarUrl
        )}"
        alt="Avatar"
      >

      <div class="message-body">

        <div class="message-header">

          <span class="author">
            ${escapeHtml(
              displayName
            )}
          </span>

          ${
            message.author.bot
              ? `
                <span class="bot-badge">
                  BOT
                </span>
              `
              : ""
          }

          <span class="timestamp">

            ${escapeHtml(
              formatDate(
                message.createdTimestamp
              )
            )}

          </span>

        </div>

        ${content}

        ${attachments}

        ${embeds}

        ${stickers}

      </div>

    </article>
  `;
}



// ==================================================
// BUILD COMPLETE HTML TRANSCRIPT
// ==================================================

function buildTranscriptHtml({
  guildName,
  channelName,
  ticketType,
  ownerId,
  closedBy,
  openedAt,
  closedAt,
  messages
}) {
  const messageHtml =
    messages.length
      ? messages
          .map(renderMessage)
          .join("\n")
      : `
        <div class="empty">
          Bu ticket içinde kayıtlı
          mesaj bulunamadı.
        </div>
      `;



  return `
<!doctype html>

<html lang="tr">

<head>

  <meta charset="utf-8">

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1"
  >

  <title>
    ${escapeHtml(channelName)} transcript
  </title>

  <style>

    :root {
      color-scheme: dark;

      --background: #0d1117;
      --panel: #161b22;
      --panel-2: #1f2630;
      --border: #30363d;
      --text: #e6edf3;
      --muted: #8b949e;
      --accent: #ff3030;
      --link: #58a6ff;
    }



    * {
      box-sizing: border-box;
    }



    body {
      margin: 0;

      background:
        var(--background);

      color:
        var(--text);

      font-family:
        Inter,
        ui-sans-serif,
        system-ui,
        -apple-system,
        BlinkMacSystemFont,
        "Segoe UI",
        sans-serif;
    }



    .container {
      width:
        min(
          1100px,
          calc(100% - 32px)
        );

      margin:
        32px auto;
    }



    .summary {
      background:
        var(--panel);

      border:
        1px solid
        var(--border);

      border-left:
        4px solid
        var(--accent);

      border-radius:
        10px;

      padding:
        20px;

      margin-bottom:
        20px;
    }



    .summary h1 {
      margin:
        0 0 14px;

      font-size:
        24px;
    }



    .summary-grid {
      display:
        grid;

      grid-template-columns:
        repeat(
          auto-fit,
          minmax(
            220px,
            1fr
          )
        );

      gap:
        10px;

      color:
        var(--muted);
    }



    .summary-grid strong {
      color:
        var(--text);
    }



    .messages {
      background:
        var(--panel);

      border:
        1px solid
        var(--border);

      border-radius:
        10px;

      overflow:
        hidden;
    }



    .message {
      display:
        flex;

      gap:
        14px;

      padding:
        16px 18px;

      border-bottom:
        1px solid
        var(--border);
    }



    .message:last-child {
      border-bottom:
        0;
    }



    .message:hover {
      background:
        rgba(
          255,
          255,
          255,
          0.02
        );
    }



    .avatar {
      width:
        42px;

      height:
        42px;

      border-radius:
        50%;

      flex:
        0 0 auto;
    }



    .message-body {
      min-width:
        0;

      flex:
        1;
    }



    .message-header {
      display:
        flex;

      align-items:
        center;

      flex-wrap:
        wrap;

      gap:
        8px;

      margin-bottom:
        5px;
    }



    .author {
      font-weight:
        700;
    }



    .timestamp {
      color:
        var(--muted);

      font-size:
        12px;
    }



    .bot-badge {
      background:
        #5865f2;

      color:
        white;

      border-radius:
        3px;

      padding:
        1px 5px;

      font-size:
        10px;

      font-weight:
        700;
    }



    .message-content {
      line-height:
        1.55;

      overflow-wrap:
        anywhere;
    }



    a {
      color:
        var(--link);
    }



    .attachments,
    .embeds,
    .stickers {
      margin-top:
        10px;
    }



    .attachment {
      margin-top:
        8px;
    }



    .attachment img,
    .embed-image {
      display:
        block;

      max-width:
        min(
          560px,
          100%
        );

      max-height:
        500px;

      object-fit:
        contain;

      border-radius:
        8px;

      border:
        1px solid
        var(--border);

      margin-bottom:
        5px;
    }



    .attachment-link {
      display:
        inline-block;

      font-size:
        13px;
    }



    .discord-embed {
      max-width:
        620px;

      background:
        var(--panel-2);

      border:
        1px solid
        var(--border);

      border-left:
        4px solid
        var(--accent);

      border-radius:
        5px;

      padding:
        12px;

      margin-top:
        8px;
    }



    .embed-title {
      font-weight:
        700;

      margin-bottom:
        6px;
    }



    .embed-description {
      line-height:
        1.45;
    }



    .embed-fields {
      display:
        grid;

      grid-template-columns:
        repeat(
          auto-fit,
          minmax(
            180px,
            1fr
          )
        );

      gap:
        10px;

      margin-top:
        10px;
    }



    .embed-field {
      background:
        rgba(
          0,
          0,
          0,
          0.14
        );

      border-radius:
        5px;

      padding:
        8px;
    }



    .empty {
      padding:
        24px;

      color:
        var(--muted);

      text-align:
        center;
    }



    footer {
      color:
        var(--muted);

      text-align:
        center;

      padding:
        18px 0 4px;

      font-size:
        12px;
    }

  </style>

</head>



<body>

  <main class="container">

    <section class="summary">

      <h1>
        ⚔️ Eternal Blades
        Ticket Transcript
      </h1>

      <div class="summary-grid">

        <div>
          <strong>Sunucu:</strong>
          ${escapeHtml(guildName)}
        </div>

        <div>
          <strong>Kanal:</strong>
          #${escapeHtml(channelName)}
        </div>

        <div>
          <strong>Tür:</strong>
          ${escapeHtml(
            ticketType.toUpperCase()
          )}
        </div>

        <div>
          <strong>Ticket sahibi ID:</strong>
          ${escapeHtml(
            ownerId ||
            "Bilinmiyor"
          )}
        </div>

        <div>
          <strong>Kapatan yetkili:</strong>
          ${escapeHtml(closedBy)}
        </div>

        <div>
          <strong>Açılış:</strong>
          ${escapeHtml(
            formatDate(openedAt)
          )}
        </div>

        <div>
          <strong>Kapanış:</strong>
          ${escapeHtml(
            formatDate(closedAt)
          )}
        </div>

        <div>
          <strong>Mesaj sayısı:</strong>
          ${messages.length}
        </div>

      </div>

    </section>



    <section class="messages">

      ${messageHtml}

    </section>



    <footer>

      Eternal Blades tarafından
      otomatik oluşturulmuştur.

    </footer>

  </main>

</body>

</html>
  `;
}



// ==================================================
// TRANSCRIPT CHANNEL SELECTOR
// ==================================================

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



      /*
        Son 100 mesajda mevcut ticket
        panelini arar.
      */

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



      /*
        Panel varsa günceller.
        Birden fazla varsa fazlalıkları siler.
      */

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

            ephemeral:
              true
          });
        }



        await interaction.deferReply({
          ephemeral:
            true
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
          Kullanıcının aynı türde açık
          ticketı var mı kontrol eder.
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



        /*
          Kullanıcı ID'sinin son 6 hanesi
          kanal adına eklenir.
        */

        const ticketName =
          `${type}-${usernamePart}-${interaction.user.id.slice(-6)}`;



        // ==============================================
        // CHANNEL PERMISSIONS
        // ==============================================

        const permissionOverwrites = [

          // @everyone ticketı göremez
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



          // Ticket açan kullanıcı
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
      // CLOSE TICKET + HTML TRANSCRIPT
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

            ephemeral:
              true
          });
        }



        /*
          Düğmeye basan kişinin rollerini
          güncel şekilde Discord'dan çeker.
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
          Ticket sahibi kapatamaz.
          Yalnızca staff kapatabilir.
        */

        if (!isStaff) {
          return interaction.reply({
            content:
              "❌ Only authorized staff members can close this ticket.",

            ephemeral:
              true
          });
        }



        /*
          Ticket zaten kapanıyorsa
          ikinci işlemi engeller.
        */

        if (
          closingTickets.has(
            interaction.channel.id
          )
        ) {
          return interaction.reply({
            content:
              "⏳ This ticket is already being closed.",

            ephemeral:
              true
          });
        }



        closingTickets.add(
          interaction.channel.id
        );



        await interaction.deferReply({
          ephemeral:
            true
        });



        try {
          const topic =
            interaction.channel.topic || "";



          const metadata =
            parseTicketMetadata(
              topic
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

          const messages =
            await fetchAllMessages(
              interaction.channel
            );



          const closedAt =
            Date.now();



          const openedAt =
            metadata.openedAt ||

            interaction.channel
              .createdTimestamp;



          /*
            HTML dosyasını oluşturur.
          */

          const html =
            buildTranscriptHtml({
              guildName:
                interaction.guild.name,

              channelName:
                interaction.channel.name,

              ticketType:
                metadata.type,

              ownerId:
                metadata.ownerId,

              closedBy:
                `${interaction.user.tag} (${interaction.user.id})`,

              openedAt,

              closedAt,

              messages
            });



          const transcriptBuffer =
            Buffer.from(
              html,
              "utf8"
            );



          /*
            Discord dosya boyutu sınırına
            yaklaşırsa ticketı silmez.
          */

          if (
            transcriptBuffer.length >
            24 * 1024 * 1024
          ) {
            throw new Error(
              "Transcript file is larger than 24 MB."
            );
          }



          const safeFileName =
            interaction.channel.name
              .replace(
                /[^a-z0-9-_]/gi,
                "-"
              )
              .toLowerCase();



          const fileName =
            `${safeFileName}-${closedAt}.html`;



          const attachment =
            new AttachmentBuilder(
              transcriptBuffer,
              {
                name:
                  fileName,

                description:
                  `Transcript for ${interaction.channel.name}`
              }
            );



          const ownerText =
            metadata.ownerId

              ? (
                `<@${metadata.ownerId}> ` +
                `(${metadata.ownerId})`
              )

              : "Unknown";



          /*
            Transcript log mesajını
            ilgili kanala gönderir.
          */

          await transcriptChannel.send({
            allowedMentions: {
              parse: []
            },

            embeds: [
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
                      `#${interaction.channel.name}`,

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
                        messages.length
                      ),

                    inline:
                      true
                  }
                )
                .setFooter({
                  text:
                    "Eternal Blades Ticket Logs"
                })
                .setTimestamp()
            ],

            files: [
              attachment
            ]
          });



          /*
            Transcript başarılı şekilde
            kaydedildikten sonra ticketı siler.
          */

          await interaction.editReply({
            content:
              "✅ HTML transcript saved successfully. This ticket will close in 3 seconds."
          });



          await new Promise(
            resolve =>
              setTimeout(
                resolve,
                3000
              )
          );



          await interaction.channel.delete(
            `Ticket closed by ${interaction.user.tag}`
          );



        } catch (error) {
          console.error(
            "Transcript or ticket close error:",
            error
          );



          closingTickets.delete(
            interaction.channel.id
          );



          /*
            Transcript kaydedilmediyse
            ticket kanalı silinmez.
          */

          return interaction.editReply({
            content:
              "❌ The transcript could not be saved, so the ticket was NOT deleted. Check the bot permissions and Railway logs."
          });
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

          ephemeral:
            true
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
