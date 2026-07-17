import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType
} from "discord.js";



// ==================================================
// LINKS PANEL SETTINGS
// ==================================================

/*
  Discord'daki #links kanalına sağ tıkla:
  Kanal Kimliğini Kopyala

  Sonra aşağıdaki tırnakların içine yapıştır.
*/

const LINKS_CHANNEL_ID =
  "1506653753569447956";



/*
  Linkler hazır olduğunda aşağıdaki alanlara ekle.

  Link henüz hazır değilse boş bırak:
  const WEBSITE_URL = "";
*/

const WEBSITE_URL =
  "";

const TWITTER_URL =
  "";

const DISCORD_INVITE_URL =
  "";



/*
  Mevcut open-ticket kanalının ID'si.
  Bunu değiştirmene gerek yok.
*/

const OPEN_TICKET_CHANNEL_ID =
  "1506778989736493106";



/*
  Botun daha önce gönderdiği paneli
  tanımak için kullanılan sabit başlık.
*/

const LINKS_PANEL_TITLE =
  "🔗 Eternal Blades Official Links";



// ==================================================
// HELPERS
// ==================================================

function isValidUrl(value) {
  if (!value) {
    return false;
  }

  try {
    const url =
      new URL(value);

    return (
      url.protocol === "https:" ||
      url.protocol === "http:"
    );

  } catch {
    return false;
  }
}



function createLinkField({
  configuredUrl,
  linkText,
  comingSoonText
}) {
  if (isValidUrl(configuredUrl)) {
    return `[${linkText}](${configuredUrl})`;
  }

  return comingSoonText;
}



// ==================================================
// CREATE LINKS PANEL
// ==================================================

function createLinksPanel(client) {
  const websiteField =
    createLinkField({
      configuredUrl:
        WEBSITE_URL,

      linkText:
        "Visit our official website",

      comingSoonText:
        "Coming Soon"
    });



  const twitterField =
    createLinkField({
      configuredUrl:
        TWITTER_URL,

      linkText:
        "Follow Eternal Blades on X",

      comingSoonText:
        "Coming Soon"
    });



  const discordField =
    createLinkField({
      configuredUrl:
        DISCORD_INVITE_URL,

      linkText:
        "Join the Eternal Blades Discord",

      comingSoonText:
        "Coming Soon"
    });



  const embed =
    new EmbedBuilder()
      .setTitle(
        LINKS_PANEL_TITLE
      )
      .setDescription(
        [
          "Welcome to Eternal Blades.",
          "",
          "Please use only the official links listed below."
        ].join("\n")
      )
      .setColor(
        "#ff0000"
      )
      .setThumbnail(
        client.user.displayAvatarURL({
          extension:
            "png",

          size:
            256
        })
      )
      .addFields(
        {
          name:
            "🌐 Website",

          value:
            websiteField,

          inline:
            false
        },

        {
          name:
            "🐦 Twitter / X",

          value:
            twitterField,

          inline:
            false
        },

        {
          name:
            "💬 Discord",

          value:
            discordField,

          inline:
            false
        },

        {
          name:
            "🛠 Support",

          value:
            `Need assistance? Open a ticket in <#${OPEN_TICKET_CHANNEL_ID}>.`,

          inline:
            false
        }
      )
      .setFooter({
        text:
          "Eternal Blades • Official Channels"
      });



  /*
    Geçerli olan linkler için embed'in altında
    tıklanabilir Discord butonları oluşturur.

    Link boş bırakılmışsa o buton gösterilmez.
  */

  const linkButtons = [];



  if (isValidUrl(WEBSITE_URL)) {
    linkButtons.push(
      new ButtonBuilder()
        .setLabel(
          "Website"
        )
        .setEmoji(
          "🌐"
        )
        .setStyle(
          ButtonStyle.Link
        )
        .setURL(
          WEBSITE_URL
        )
    );
  }



  if (isValidUrl(TWITTER_URL)) {
    linkButtons.push(
      new ButtonBuilder()
        .setLabel(
          "Twitter / X"
        )
        .setEmoji(
          "🐦"
        )
        .setStyle(
          ButtonStyle.Link
        )
        .setURL(
          TWITTER_URL
        )
    );
  }



  if (isValidUrl(DISCORD_INVITE_URL)) {
    linkButtons.push(
      new ButtonBuilder()
        .setLabel(
          "Discord"
        )
        .setEmoji(
          "💬"
        )
        .setStyle(
          ButtonStyle.Link
        )
        .setURL(
          DISCORD_INVITE_URL
        )
    );
  }



  const components =
    linkButtons.length > 0
      ? [
          new ActionRowBuilder()
            .addComponents(
              linkButtons
            )
        ]
      : [];



  return {
    embeds: [
      embed
    ],

    components,

    allowedMentions: {
      parse: []
    }
  };
}



// ==================================================
// SETUP LINKS PANEL
// ==================================================

export async function setupLinksPanel(
  client
) {
  try {

    /*
      Kanal ID henüz eklenmediyse botu çökertmez.
    */

    if (
      !LINKS_CHANNEL_ID ||
      LINKS_CHANNEL_ID.includes(
        "PASTE_"
      )
    ) {
      console.warn(
        "Links panel skipped: LINKS_CHANNEL_ID has not been configured."
      );

      return;
    }



    const linksChannel =
      await client.channels.fetch(
        LINKS_CHANNEL_ID
      );



    if (
      !linksChannel ||
      linksChannel.type !==
        ChannelType.GuildText
    ) {
      console.error(
        "Links panel channel was not found or is not a text channel."
      );

      return;
    }



    /*
      Son 100 mesajda daha önce gönderilmiş
      Eternal Blades link panelini arar.
    */

    const recentMessages =
      await linksChannel.messages.fetch({
        limit:
          100
      });



    const existingPanels =
      recentMessages.filter(
        message =>

          message.author.id ===
            client.user.id &&

          message.embeds.some(
            embed =>
              embed.title ===
              LINKS_PANEL_TITLE
          )
      );



    /*
      Panel daha önce gönderilmişse
      yeni mesaj oluşturmak yerine günceller.
    */

    if (existingPanels.size > 0) {
      const panels = [
        ...existingPanels.values()
      ];



      const panelToKeep =
        panels[0];



      await panelToKeep.edit(
        createLinksPanel(
          client
        )
      );



      console.log(
        "Existing links panel updated."
      );



      /*
        Yanlışlıkla birden fazla panel oluşmuşsa
        fazlalıkları otomatik olarak siler.
      */

      for (
        const duplicatePanel
        of panels.slice(1)
      ) {
        try {
          await duplicatePanel.delete();

          console.log(
            "Duplicate links panel deleted."
          );

        } catch (deleteError) {
          console.error(
            "Duplicate links panel delete error:",
            deleteError
          );
        }
      }



      return;
    }



    /*
      Daha önce panel yoksa ilk kez gönderir.
    */

    await linksChannel.send(
      createLinksPanel(
        client
      )
    );



    console.log(
      "New links panel sent."
    );

  } catch (error) {
    console.error(
      "Links panel setup error:",
      error
    );
  }
}
