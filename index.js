const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  ChannelType,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages
  ]
});



// ================= CONFIG =================

const VERIFY_CHANNEL_ID = "1506684679473070292";

const VERIFIED_ROLE_NAME = "⚔️ Blade Seeker";

const TICKET_CATEGORY_ID = "1506700800263459008";

const STAFF_ROLES = [
  "👁️ Community Manager",
  "Eternal Founder"
];

// ==========================================



client.once("ready", async () => {
  console.log(`${client.user.tag} online!`);

  // VERIFY MESSAGE
  try {
    const verifyChannel = await client.channels.fetch(VERIFY_CHANNEL_ID);

    const verifyEmbed = new EmbedBuilder()
      .setColor("Red")
      .setTitle("⚔️ Eternal Blades Verification")
      .setDescription(
        "Click the button below to access the server."
      );

    const verifyButton = new ButtonBuilder()
      .setCustomId("verify_button")
      .setLabel("Verify")
      .setStyle(ButtonStyle.Danger);

    const verifyRow = new ActionRowBuilder().addComponents(
      verifyButton
    );

    await verifyChannel.send({
      embeds: [verifyEmbed],
      components: [verifyRow]
    });

    console.log("Verify message sent.");
  } catch (err) {
    console.log("Verify message error:", err);
  }
});



// ================= INTERACTIONS =================

client.on("interactionCreate", async (interaction) => {

  // VERIFY BUTTON
  if (interaction.isButton()) {

    if (interaction.customId === "verify_button") {

      const role = interaction.guild.roles.cache.find(
        r => r.name === VERIFIED_ROLE_NAME
      );

      if (!role) {
        return interaction.reply({
          content: "❌ Verify role not found.",
          ephemeral: true
        });
      }

      await interaction.member.roles.add(role);

      return interaction.reply({
        content: "✅ You are verified.",
        ephemeral: true
      });
    }



    // CLOSE TICKET
    if (interaction.customId === "close_ticket") {

      await interaction.reply({
        content: "🗑️ Ticket closing...",
        ephemeral: true
      });

      setTimeout(async () => {
        await interaction.channel.delete();
      }, 2000);
    }
  }



  // TICKET SELECT MENU
  if (interaction.isStringSelectMenu()) {

    if (interaction.customId === "ticket_select") {

      const selected = interaction.values[0];

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


      // STAFF ROLES
      STAFF_ROLES.forEach(roleName => {

        const role = interaction.guild.roles.cache.find(
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
      });



      // CREATE CHANNEL
      const channel = await interaction.guild.channels.create({
        name: `${selected}-${interaction.user.username}`,
        type: ChannelType.GuildText,
        parent: TICKET_CATEGORY_ID,
        permissionOverwrites: overwrites
      });



      // CLOSE BUTTON
      const closeButton = new ButtonBuilder()
        .setCustomId("close_ticket")
        .setLabel("Close Ticket")
        .setStyle(ButtonStyle.Danger);

      const closeRow = new ActionRowBuilder().addComponents(
        closeButton
      );



      const ticketEmbed = new EmbedBuilder()
        .setColor("Red")
        .setTitle("🎫 Ticket Opened")
        .setDescription(
          `Welcome ${interaction.user}\n\nStaff will assist you shortly.`
        );



      await channel.send({
        embeds: [ticketEmbed],
        components: [closeRow]
      });



      return interaction.reply({
        content: `✅ Ticket created: ${channel}`,
        ephemeral: true
      });
    }
  }
});



// ================= SEND TICKET PANEL =================

client.on("messageCreate", async (message) => {

  if (message.content === "!ticketpanel") {

    const embed = new EmbedBuilder()
      .setColor("Red")
      .setTitle("🎫 Open a Ticket")
      .setDescription(
        "Select a ticket category below."
      );



    const menu = new StringSelectMenuBuilder()
      .setCustomId("ticket_select")
      .setPlaceholder("▼ Select Menu")
      .addOptions([
        {
          label: "Support",
          value: "support"
        },
        {
          label: "Collab",
          value: "collab"
        },
        {
          label: "Report",
          value: "report"
        },
        {
          label: "WL Help",
          value: "wl-help"
        }
      ]);



    const row = new ActionRowBuilder().addComponents(
      menu
    );



    await message.channel.send({
      embeds: [embed],
      components: [row]
    });
  }
});



client.login(process.env.TOKEN);
