import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Events
} from "discord.js";

const TOKEN = process.env.TOKEN;
const VERIFY_CHANNEL_ID = "1506684679473070292";
const VERIFY_ROLE_NAME = "Verified Blade";

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once(Events.ClientReady, async () => {
  console.log(`${client.user.tag} online!`);

  const channel = await client.channels.fetch(VERIFY_CHANNEL_ID);

  const embed = new EmbedBuilder()
    .setTitle("⚔️ Eternal Blades Verification")
    .setDescription("Press the button below to verify and enter the realm.")
    .setColor("#ff0000");

  const button = new ButtonBuilder()
    .setCustomId("verify")
    .setLabel("VERIFY")
    .setStyle(ButtonStyle.Success);

  const row = new ActionRowBuilder().addComponents(button);

  await channel.send({
    embeds: [embed],
    components: [row]
  });
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;
  if (interaction.customId !== "verify") return;

  const role = interaction.guild.roles.cache.find(
    (r) => r.name === VERIFY_ROLE_NAME
  );

  if (!role) {
    return interaction.reply({
      content: "Role not found.",
      ephemeral: true
    });
  }

  await interaction.member.roles.add(role);

  await interaction.reply({
    content: "⚔️ You are now verified!",
    ephemeral: true
  });
});

client.login(TOKEN);