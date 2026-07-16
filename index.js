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
  MessageFlags
} from "discord.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages
  ]
});



// ==================================================
// IDS
// ==================================================

// open-ticket kanal ID
const OPEN_TICKET_CHANNEL_ID = "1506778989736493106";

// Ticket kanallarının oluşturulacağı kategori ID
const SUPPORT_CATEGORY_ID = "1506778963392069734";



// ==================================================
// STAFF ROLES
// ==================================================

const STAFF_ROLES = [
  "👁️ Community Manager",
  "Eternal Founder"
];



// ==================================================
// TICKET TYPES
// ==================================================

const ALLOWED_TICKET_TYPES = [
  "support",
  "collab"
];



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
// READY
// ==================================================

client.once(Events.ClientReady, async () => {
  console.log(`${client.user.tag} online!`);

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
      Son 100 mesaj içinde bota ait ticket panellerini bulur.
      Eski panel varsa yeni seçeneklerle günceller.
      Birden fazla panel varsa fazlalıkları siler.
    */

    const recentMessages =
      await ticketPanelChannel.messages.fetch({
        limit: 100
      });

    const existingPanels =
      recentMessages.filter(message =>
        message.author.id === client.user.id &&
        message.components.some(row =>
          row.components.some(component =>
            component.customId === "ticket_select"
          )
        )
      );



    if (existingPanels.size > 0) {
      const panels = [...existingPanels.values()];

      const panelToKeep = panels[0];

      await panelToKeep.edit(
        createTicketPanel()
      );

      console.log(
        "Existing ticket panel updated."
      );



      // Fazladan oluşturulmuş ticket panellerini siler
      const duplicatePanels = panels.slice(1);

      for (const duplicatePanel of duplicatePanels) {
        try {
          await duplicatePanel.delete();

          console.log(
            "Duplicate ticket panel deleted."
          );
        } catch (deleteError) {
          console.error(
            "Duplicate panel delete error:",
            deleteError
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
});



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
        interaction.customId === "ticket_select"
      ) {
        await interaction.deferReply({
          flags: MessageFlags.Ephemeral
        });



        const type = interaction.values[0];



        // Yalnızca Support ve Collab kabul edilir
        if (!ALLOWED_TICKET_TYPES.includes(type)) {
          return interaction.editReply({
            content:
              "❌ Invalid ticket category."
          });
        }



        const safeUsername =
          interaction.user.username
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "")
            .slice(0, 20);



        const ticketUsername =
          safeUsername ||
          `user-${interaction.user.id.slice(-6)}`;



        const ticketName =
          `${type}-${ticketUsername}`;



        /*
          Kullanıcının aynı kategoride açık ticketı
          olup olmadığını kullanıcı ID üzerinden kontrol eder.
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



        // ==============================================
        // CHANNEL PERMISSIONS
        // ==============================================

        const permissionOverwrites = [

          // @everyone ticket kanalını göremez
          {
            id: interaction.guild.id,

            deny: [
              PermissionsBitField.Flags.ViewChannel
            ]
          },



          // Eternal Blades botunun izinleri
          {
            id: client.user.id,

            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory,
              PermissionsBitField.Flags.ManageChannels,
              PermissionsBitField.Flags.EmbedLinks,
              PermissionsBitField.Flags.AttachFiles
            ]
          },



          // Ticketı açan kullanıcının izinleri
          {
            id: interaction.user.id,

            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory,
              PermissionsBitField.Flags.EmbedLinks,
              PermissionsBitField.Flags.AttachFiles
            ]
          }
        ];



        // ==============================================
        // STAFF ACCESS
        // ==============================================

        for (const roleName of STAFF_ROLES) {
          const staffRole =
            interaction.guild.roles.cache.find(
              role => role.name === roleName
            );



          if (staffRole) {
            permissionOverwrites.push({
              id: staffRole.id,

              allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory,
                PermissionsBitField.Flags.EmbedLinks,
                PermissionsBitField.Flags.AttachFiles
              ]
            });
          } else {
            console.warn(
              `Staff role not found: ${roleName}`
            );
          }
        }



        // ==============================================
        // CREATE CHANNEL
        // ==============================================

        const ticketChannel =
          await interaction.guild.channels.create({
            name: ticketName,

            type: ChannelType.GuildText,

            parent: SUPPORT_CATEGORY_ID,

            permissionOverwrites
          });



        /*
          Ticket sahibini ve türünü kanal konusuna kaydeder.
          Böylece kullanıcı adı değişse bile ticket bulunabilir.
        */

        await ticketChannel.setTopic(
          `Ticket Owner: ${interaction.user.tag} | User ID: ${interaction.user.id} | Type: ${type}`
        );



        // ==============================================
        // CLOSE BUTTON
        // ==============================================

        const closeButton =
          new ButtonBuilder()
            .setCustomId("close_ticket")
            .setLabel("CLOSE")
            .setEmoji("🗑️")
            .setStyle(ButtonStyle.Danger);



        // ==============================================
        // TICKET MESSAGE
        // ==============================================

        const ticketTitle =
          type === "support"
            ? "🎫 SUPPORT Ticket"
            : "🤝 COLLAB Ticket";



        const ticketDescription =
          type === "support"
            ? (
              "Please explain the issue you need help with.\n\n" +
              "Our team will assist you shortly."
            )
            : (
              "Please introduce your project and explain your collaboration proposal.\n\n" +
              "Our team will review it shortly."
            );



        await ticketChannel.send({
          content: `${interaction.user}`,

          embeds: [
            new EmbedBuilder()
              .setTitle(ticketTitle)
              .setDescription(
                ticketDescription
              )
              .setColor("#ff0000")
              .setFooter({
                text:
                  "Eternal Blades Support"
              })
              .setTimestamp()
          ],

          components: [
            new ActionRowBuilder()
              .addComponents(closeButton)
          ]
        });



        return interaction.editReply({
          content:
            `✅ Ticket created: ${ticketChannel}`
        });
      }



      // ==============================================
      // CLOSE TICKET
      // ==============================================

      if (
        interaction.isButton() &&
        interaction.customId === "close_ticket"
      ) {
        const channelTopic =
          interaction.channel?.topic || "";



        const isTicketOwner =
          channelTopic.includes(
            `User ID: ${interaction.user.id}`
          );



        const isStaff =
          interaction.member.roles.cache.some(
            role =>
              STAFF_ROLES.includes(role.name)
          );



        /*
          Ticketı yalnızca ticket sahibi veya
          staff rollerinden biri kapatabilir.
        */

        if (!isTicketOwner && !isStaff) {
          return interaction.reply({
            content:
              "❌ You do not have permission to close this ticket.",

            flags: MessageFlags.Ephemeral
          });
        }



        await interaction.reply({
          content:
            "🗑️ Closing ticket in 3 seconds...",

          flags: MessageFlags.Ephemeral
        });



        setTimeout(async () => {
          try {
            if (interaction.channel) {
              await interaction.channel.delete(
                `Ticket closed by ${interaction.user.tag}`
              );
            }
          } catch (deleteError) {
            console.error(
              "Ticket delete error:",
              deleteError
            );
          }
        }, 3000);
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
        }).catch(() => {});
      }



      if (!interaction.replied) {
        return interaction.reply({
          content:
            "❌ Something went wrong.",

          flags: MessageFlags.Ephemeral
        }).catch(() => {});
      }
    }
  }
);



// ==================================================
// BOT LOGIN
// ==================================================

client.login(process.env.TOKEN);
