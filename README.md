# Eternal Blades Discord Bot

A custom Discord bot built for the Eternal Blades community.

## Current Features

### Ticket System

- Professional ticket panel with a dropdown menu
- Support tickets
- Collaboration tickets
- Private ticket channels
- One active ticket per user and category
- Duplicate-ticket protection
- Staff-only ticket closing
- Ticket metadata validation
- Automatic rollback if ticket creation fails

### Discord Transcript System

- Saves closed tickets to dedicated transcript channels
- Creates a public thread for each transcript
- Copies ticket messages in chronological order
- Re-uploads attachments when possible
- Uses attachment links as a fallback
- Adds a direct **VIEW TRANSCRIPT** button
- Keeps the ticket open if transcript creation fails

### Official Links Panel

- Website, Twitter / X and Discord sections
- Support channel shortcut
- Displays **Coming Soon** when a link is not configured
- Updates the existing panel instead of sending duplicates

### Scalable Panel Updates

Panel messages are updated directly by Discord message ID through Railway variables:

```text
TICKET_PANEL_MESSAGE_ID
LINKS_PANEL_MESSAGE_ID
```

When these variables are configured, the bot does not scan the full channel history.

### Reliability and Safety

- Staff authorization uses Discord role IDs
- Discord permissions are validated before important actions
- Login and token errors are handled clearly
- Global promise and process errors are logged
- Graceful shutdown support for Railway deployments
- Active ticket operations receive time to finish before shutdown
- Independent startup handling for ticket and links panels

## Verification

Member CAPTCHA and verification are handled by Vulcan.

The Eternal Blades custom bot currently manages:

- Tickets
- Ticket transcripts
- Official links panel

## Project Structure

```text
Eternal-Blade-Verify-Bot/
├── index.js
├── package.json
├── package-lock.json
├── README.md
├── panels/
│   └── linksPanel.js
└── utils/
    └── panelMessage.js
```

## Requirements

- Node.js 18.17.0 or newer
- A Discord bot token
- Discord.js 14.27.0

## Installation

```bash
npm ci
```

Run the syntax checks:

```bash
npm run check
```

Start the bot:

```bash
npm start
```

## Railway Variables

Required:

```text
TOKEN=your_discord_bot_token
TICKET_PANEL_MESSAGE_ID=your_ticket_panel_message_id
LINKS_PANEL_MESSAGE_ID=your_links_panel_message_id
RAILWAY_DEPLOYMENT_DRAINING_SECONDS=30
```

Never place the Discord bot token inside GitHub files.

## Discord Permissions

### Links Channel

- View Channel
- Send Messages
- Embed Links
- Read Message History

### Open Ticket Channel

- View Channel
- Send Messages
- Embed Links
- Read Message History

### Ticket Category

- View Channel
- Send Messages
- Read Message History
- Embed Links
- Attach Files
- Manage Channels

### Transcript Channels

- View Channel
- Send Messages
- Embed Links
- Read Message History
- Attach Files
- Create Public Threads
- Send Messages in Threads

## Staff Roles

Ticket closing is restricted to the configured staff role IDs:

- Eternal Founder
- Community Manager

Role names may be changed without breaking authorization because the bot checks role IDs.

## Successful Startup Logs

```text
Eternal Blades#1049 online!
Staff role IDs validated successfully.
Existing ticket panel updated directly by message ID.
Existing links panel updated directly by message ID.
```

## Deployment Shutdown

During a Railway redeploy, the old bot process may receive `SIGTERM`. The bot handles this signal, stops accepting new operations, waits briefly for active ticket work to finish and then closes the Discord connection safely.

## Status

Active development.
