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
  StringSelectMenuOptionBuilder
} from "discord.js";

const TOKEN = process.env.TOKEN;

// VERIFY
const VERIFY_CHANNEL_ID = "1506684679473070292";
const VERIFY_ROLE_NAME = "⚔️ Blade Seeker";

// TICKET
const OPEN_TICKET_CHANNEL_ID = "1506700860300726462";
const SUPPORT_CATEGORY_ID = "1506700800263459008";

const STAFF_ROLES = [
  "👁️ Community Manager",
  "Eternal Founder"
];

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once(Events.ClientReady, async () => {
  console.log(`${client.user.tag} online!`);

  // Verify message
  const verifyChannel = await client.channels.fetch(VERIFY_CHANNEL_ID);

  await verifyChannel.send({
    embeds: [
      new EmbedBuilder()
        .setTitle("⚔️ Eternal Blades Verification")
        .setDescription("Press the button below to verify and access the server.")
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

  // Ticket dropdown message
  const ticketChannel = await client.channels.fetch(OPEN_TICKET_CHANNEL_ID);

  await ticketChannel.send({
    embeds: [
      new EmbedBuilder()
        .setTitle("🎫 Open a Ticket")
        .setDescription("Select a ticket category below.")
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
});

client.on(Events.InteractionCreate, async (interaction) => {
  // VERIFY BUTTON
  if (interaction.isButton() && interaction.customId === "verify") {
    const role = interaction.guild.roles.cache.find(
      (r) => r.name === VERIFY_ROLE_NAME
    );

    if (!role) {
      return interaction.reply({
        content: "❌ Verify role not found.",
        ephemeral: true
      });
    }

    await interaction.member.roles.add(role);

    return interaction.reply({
      content: "⚔️ You are now verified!",
      ephemeral: true
    });
  }

  // TICKET DROPDOWN
  if (interaction.isStringSelectMenu() && interaction.customId === "ticket_select") {
    const type = interaction.values[0];

    const existing = interaction.guild.channels.cache.find(
      (c) => c.name === `${type}-${interaction.user.username.toLowerCase()}`
    );

    if (existing) {
      return interaction.reply({
        content: "❌ You already have an open ticket.",
        ephemeral: true
      });
    }

    const overwrites = [
      {
        id: interaction.guild.id,
        deny: [PermissionsBitField.Flags.ViewChannel]
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

    for (const roleName of STAFF_ROLES) {
      const staffRole = interaction.guild.roles.cache.find(
        (r) => r.name === roleName
      );

      if (staffRole) {
        overwrites.push({
          id: staffRole.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory
          ]
        });
      }
    }

    const ticket = await interaction.guild.channels.create({
      name: `${type}-${interaction.user.username}`,
      type: ChannelType.GuildText,
      parent: SUPPORT_CATEGORY_ID,
      permissionOverwrites: overwrites
    });

    await ticket.send({
      content: `Welcome ${interaction.user} 👋`,
      embeds: [
        new EmbedBuilder()
          .setTitle(`🎫 ${type.toUpperCase()} Ticket`)
          .setDescription("Please explain your issue and wait for staff.")
          .setColor("#ff0000")
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("close_ticket")
            .setLabel("CLOSE")
            .setStyle(ButtonStyle.Secondary)
        )
      ]
    });

    return interaction.reply({
      content: `✅ Ticket created: ${ticket}`,
      ephemeral: true
    });
  }

  // CLOSE TICKET
  if (interaction.isButton() && interaction.customId === "close_ticket") {
    await interaction.reply({
      content: "🗑️ Closing ticket...",
      ephemeral: true
    });

    setTimeout(() => {
      interaction.channel.delete();
    }, 3000);
  }
});

client.login(TOKEN);
