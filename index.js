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



// ================= IDS =================

// blade-gate
const VERIFY_CHANNEL_ID = "1506779053342855249";

// open-ticket
const OPEN_TICKET_CHANNEL_ID = "1506778989736493106";

// SUPPORT kategori ID
const SUPPORT_CATEGORY_ID = "1506778963392069734";



// ================= ROLES =================

const VERIFY_ROLE_NAME = "⚔️ Blade Seeker";

const STAFF_ROLES = [
  "👁️ Community Manager",
  "Eternal Founder"
];



// ================= READY =================

client.once(Events.ClientReady, async () => {
  console.log(`${client.user.tag} online!`);

  try {

    // VERIFY PANEL

    const verifyChannel = await client.channels.fetch(
      VERIFY_CHANNEL_ID
    );

    await verifyChannel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle("⚔️ Eternal Blades Verification")
          .setDescription(
            "Press the button below to verify and access the server."
          )
          .setColor("#ff0000")
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("verify")
            .setLabel("VERIFY")
            .setStyle(ButtonStyle.Success)
        )
      ]
    });



    // TICKET PANEL

    const ticketChannel = await client.channels.fetch(
      OPEN_TICKET_CHANNEL_ID
    );

    await ticketChannel.send({
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
                .setValue("support"),

              new StringSelectMenuOptionBuilder()
                .setLabel("Collab")
                .setValue("collab"),

              new StringSelectMenuOptionBuilder()
                .setLabel("Report")
                .setValue("report"),

              new StringSelectMenuOptionBuilder()
                .setLabel("WL Help")
                .setValue("wlhelp")
            )
        )
      ]
    });

    console.log("Panels sent.");

  } catch (err) {
    console.log(err);
  }
});



// ================= INTERACTIONS =================

client.on(Events.InteractionCreate, async (interaction) => {

  try {

    // VERIFY

    if (
      interaction.isButton() &&
      interaction.customId === "verify"
    ) {

      const role = interaction.guild.roles.cache.find(
        r => r.name === VERIFY_ROLE_NAME
      );

      if (!role) {

        return interaction.reply({
          content: "❌ Verify role not found.",
          flags: MessageFlags.Ephemeral
        });
      }

      await interaction.member.roles.add(role);

      return interaction.reply({
        content: "⚔️ Verification successful.",
        flags: MessageFlags.Ephemeral
      });
    }



    // TICKET CREATE

    if (
      interaction.isStringSelectMenu() &&
      interaction.customId === "ticket_select"
    ) {

      await interaction.deferReply({
        flags: MessageFlags.Ephemeral
      });

      const type = interaction.values[0];

      const safeUsername = interaction.user.username
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");




      // EXISTING TICKET CHECK

      const existing =
        interaction.guild.channels.cache.find(
          c =>
            c.name === `${type}-${safeUsername}`
        );

      if (existing) {

        return interaction.editReply({
          content:
            "❌ You already have an open ticket."
        });
      }




      // PERMISSIONS

      const overwrites = [

        {
          id: interaction.guild.id,
          deny: [
            PermissionsBitField.Flags.ViewChannel
          ]
        },

        {
          id: client.user.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
            PermissionsBitField.Flags.ManageChannels
          ]
        },

        {
          id: interaction.user.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory
          ]
        }

      ];



      // STAFF ACCESS

      for (const roleName of STAFF_ROLES) {

        const role =
          interaction.guild.roles.cache.find(
            r => r.name === roleName
          );

        if (role) {

          overwrites.push({
            id: role.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory
            ]
          });
        }
      }




      // CREATE CHANNEL

      const ticket =
        await interaction.guild.channels.create({

          name: `${type}-${safeUsername}`,

          type: ChannelType.GuildText,

          parent: SUPPORT_CATEGORY_ID,

          permissionOverwrites: overwrites
        });




      // CLOSE BUTTON

      const closeButton =
        new ButtonBuilder()
          .setCustomId("close_ticket")
          .setLabel("CLOSE")
          .setStyle(ButtonStyle.Danger);




      // TICKET MESSAGE

      await ticket.send({

        content: `${interaction.user}`,

        embeds: [

          new EmbedBuilder()
            .setTitle(
              `🎫 ${type.toUpperCase()} Ticket`
            )
            .setDescription(
              "Please explain your issue.\nStaff will assist you shortly."
            )
            .setColor("#ff0000")
        ],

        components: [

          new ActionRowBuilder().addComponents(
            closeButton
          )
        ]
      });




      return interaction.editReply({
        content:
          `✅ Ticket created: ${ticket}`
      });
    }




    // CLOSE TICKET

    if (
      interaction.isButton() &&
      interaction.customId === "close_ticket"
    ) {

      await interaction.reply({
        content: "🗑️ Closing ticket...",
        flags: MessageFlags.Ephemeral
      });

      setTimeout(async () => {

        await interaction.channel.delete();

      }, 3000);
    }

  } catch (err) {

    console.log(err);

    if (interaction.deferred) {

      return interaction.editReply({
        content:
          "❌ Something went wrong."
      });
    }

    if (!interaction.replied) {

      return interaction.reply({
        content:
          "❌ Something went wrong.",
        flags: MessageFlags.Ephemeral
      });
    }
  }
});



client.login(process.env.TOKEN);
