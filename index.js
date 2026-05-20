import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
  ChannelType,
  Events
} from "discord.js";

const TOKEN = process.env.TOKEN;

/* =========================
   VERIFY SETTINGS
========================= */

const VERIFY_CHANNEL_ID = "1506684679473070292";
const VERIFY_ROLE_NAME = "⚔️ Blade Seeker";

/* =========================
   TICKET SETTINGS
========================= */

const OPEN_TICKET_CHANNEL_ID = "1506700860300726462";
const SUPPORT_CATEGORY_ID = "1506700800263459008";

const STAFF_ROLES = [
  "👁️ Community Manager",
  "Eternal Founder"
];

/* =========================
   CLIENT
========================= */

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

/* =========================
   BOT READY
========================= */

client.once(Events.ClientReady, async () => {
  console.log(`${client.user.tag} online!`);

  /* =========================
     VERIFY MESSAGE
  ========================= */

  const verifyChannel = await client.channels.fetch(
    VERIFY_CHANNEL_ID
  );

  const verifyEmbed = new EmbedBuilder()
    .setTitle("⚔️ Eternal Blades Verification")
    .setDescription(
      "Press the button below to verify and access the server."
    )
    .setColor("#ff0000");

  const verifyButton =
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("verify")
        .setLabel("VERIFY")
        .setStyle(ButtonStyle.Success)
    );

  await verifyChannel.send({
    embeds: [verifyEmbed],
    components: [verifyButton]
  });

  /* =========================
     TICKET MESSAGE
  ========================= */

  const ticketChannel = await client.channels.fetch(
    OPEN_TICKET_CHANNEL_ID
  );

  const ticketEmbed = new EmbedBuilder()
    .setTitle("🎫 Eternal Blades Support")
    .setDescription(
      "Press the button below to open a support ticket."
    )
    .setColor("#ff0000");

  const ticketButton =
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("open_ticket")
        .setLabel("OPEN TICKET")
        .setStyle(ButtonStyle.Danger)
    );

  await ticketChannel.send({
    embeds: [ticketEmbed],
    components: [ticketButton]
  });
});

/* =========================
   BUTTON EVENTS
========================= */

client.on(
  Events.InteractionCreate,
  async (interaction) => {
    if (!interaction.isButton()) return;

    /* =========================
       VERIFY BUTTON
    ========================= */

    if (interaction.customId === "verify") {
      const role =
        interaction.guild.roles.cache.find(
          (r) =>
            r.name === VERIFY_ROLE_NAME
        );

      if (!role) {
        return interaction.reply({
          content:
            "❌ Verify role not found.",
          ephemeral: true
        });
      }

      await interaction.member.roles.add(
        role
      );

      return interaction.reply({
        content:
          "⚔️ You are now verified!",
        ephemeral: true
      });
    }

    /* =========================
       OPEN TICKET
    ========================= */

    if (
      interaction.customId ===
      "open_ticket"
    ) {
      const existing =
        interaction.guild.channels.cache.find(
          (c) =>
            c.name ===
            `ticket-${interaction.user.username.toLowerCase()}`
        );

      if (existing) {
        return interaction.reply({
          content:
            "❌ You already have an open ticket.",
          ephemeral: true
        });
      }

      const overwrites = [
        {
          id: interaction.guild.id,
          deny: [
            PermissionsBitField.Flags
              .ViewChannel
          ]
        },
        {
          id: interaction.user.id,
          allow: [
            PermissionsBitField.Flags
              .ViewChannel,
            PermissionsBitField.Flags
              .SendMessages,
            PermissionsBitField.Flags
              .ReadMessageHistory
          ]
        }
      ];

      for (const roleName of STAFF_ROLES) {
        const staffRole =
          interaction.guild.roles.cache.find(
            (r) =>
              r.name === roleName
          );

        if (staffRole) {
          overwrites.push({
            id: staffRole.id,
            allow: [
              PermissionsBitField.Flags
                .ViewChannel,
              PermissionsBitField.Flags
                .SendMessages,
              PermissionsBitField.Flags
                .ReadMessageHistory
            ]
          });
        }
      }

      const ticket =
        await interaction.guild.channels.create(
          {
            name: `ticket-${interaction.user.username}`,
            type:
              ChannelType.GuildText,
            parent:
              SUPPORT_CATEGORY_ID,
            permissionOverwrites:
              overwrites
          }
        );

      const closeButton =
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(
              "close_ticket"
            )
            .setLabel("CLOSE")
            .setStyle(
              ButtonStyle.Secondary
            )
        );

      await ticket.send({
        content: `Welcome ${interaction.user} 👋`,
        embeds: [
          new EmbedBuilder()
            .setTitle(
              "🎫 Support Ticket"
            )
            .setDescription(
              "Please explain your issue and wait for staff."
            )
            .setColor("#ff0000")
        ],
        components: [closeButton]
      });

      return interaction.reply({
        content: `✅ Ticket created: ${ticket}`,
        ephemeral: true
      });
    }

    /* =========================
       CLOSE TICKET
    ========================= */

    if (
      interaction.customId ===
      "close_ticket"
    ) {
      await interaction.reply({
        content:
          "🗑️ Closing ticket...",
        ephemeral: true
      });

      setTimeout(() => {
        interaction.channel.delete();
      }, 3000);
    }
  }
);

/* =========================
   LOGIN
========================= */

client.login(TOKEN);