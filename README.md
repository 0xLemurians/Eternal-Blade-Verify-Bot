# Eternal Blades Discord Bot

Custom Discord bot for the Eternal Blades community.

## Main Features

- Support and collaboration ticket system
- Ticket close confirmation and transcript archive flow
- Official links panel
- Community roles panel
- Community rules panel
- Ticket statistics and bot status panels
- Automatic reactions
- Persistent wallet collection for eligible community roles
- Railway-friendly graceful shutdown and bounded panel recovery

## Wallet Collection

The wallet system collects public Ethereum / EVM addresses through a Discord modal.
Members do not post wallet addresses directly into the channel.

### Eligible roles

Wallet submission is allowed only for these role IDs:

- Legend of the Blades — `1532166665482276964`
- Blade Warden — `1506664105459585115`
- Blade Vanguard — `1506660264584679584`
- First Blades — `1531702413545963651`

`Blade Seeker` is intentionally excluded.

### Channels

- `#wallet-submission` — `1550988251081211935`
- `#wallet-logs` — `1550988980554694727`

The submission channel contains one bot panel with a **Submit Wallet** button. The logs channel should remain private to authorized staff and the bot.

### Wallet rules

- Ethereum / EVM public addresses only: `0x` + 40 hexadecimal characters
- Zero address is rejected
- One wallet record per Discord account
- Submitting again updates the existing record
- The same wallet cannot be registered to multiple Discord accounts
- Seed phrases, private keys and recovery phrases are never requested

The bot validates address format only. It does not cryptographically prove wallet ownership.

### Storage

Wallet submissions are stored in PostgreSQL. The table is created automatically on startup.
The database stores Discord user ID, username/display-name snapshot, public wallet address, chain, eligibility role snapshot, and timestamps.

## Installation

Requirements:

- Node.js 18.17.0 or newer
- Discord bot token
- PostgreSQL database for wallet collection

Install dependencies:

```bash
npm ci
```

Run syntax checks:

```bash
npm run check
```

Start:

```bash
npm start
```

## Railway Variables

Required for the bot:

```text
TOKEN=your_discord_bot_token
DATABASE_URL=your_railway_postgresql_connection_string
RAILWAY_DEPLOYMENT_DRAINING_SECONDS=30
```

Panel/status message IDs should also be configured after their first successful creation:

```text
TICKET_PANEL_MESSAGE_ID=...
LINKS_PANEL_MESSAGE_ID=...
ROLES_PANEL_MESSAGE_ID=...
COMMUNITY_RULES_PANEL_MESSAGE_ID=...
TICKET_STATS_MESSAGE_ID=...
BOT_STATUS_MESSAGE_ID=...
WALLET_PANEL_MESSAGE_ID=...
```

Never put `TOKEN` or `DATABASE_URL` directly into GitHub source files.

## Wallet Panel First Deploy

1. Add Railway PostgreSQL to the same project/service environment.
2. Make sure `DATABASE_URL` is available to the bot service.
3. Deploy the bot.
4. Check the Railway logs for:

```text
Wallet PostgreSQL store is ready.
Wallet panel message ID: 123456789012345678
Wallet collection system is ready. Blade Seeker is excluded from eligibility.
```

5. Add the printed message ID to Railway:

```text
WALLET_PANEL_MESSAGE_ID=123456789012345678
```

6. Redeploy once. Future starts should update the same panel directly instead of creating duplicates.

## Discord Permissions

### `#wallet-submission`

Bot needs:

- View Channel
- Send Messages
- Embed Links
- Read Message History

Members can be denied **Send Messages** because wallet submission uses the button/modal.

### `#wallet-logs`

Bot needs:

- View Channel
- Send Messages
- Embed Links
- Read Message History

Keep this channel private to Eternal Founder, Community Manager and the Eternal Blades Bots role.

## Safety Notes

- Authorization is based on Discord role IDs, not role names.
- Eligibility is rechecked when the button is pressed and again when the modal is submitted.
- Duplicate public wallet addresses across Discord accounts are blocked.
- Wallet log failure does not erase a successfully stored database submission; the failure is reported through the bot error reporter.
- A 3-second per-user button cooldown prevents repeated modal opens.
- Every modal submission attempt starts a 15-second cooldown, including invalid-address and duplicate-wallet attempts.
- Only one wallet submission per user can be processed at a time, preventing concurrent database writes.

## Project Structure

```text
Eternal-Blade-Verify-Bot/
├── config/
│   └── wallet.js
├── panels/
│   ├── communityRulesPanel.js
│   ├── linksPanel.js
│   ├── rolesPanel.js
│   └── walletPanel.js
├── services/
│   ├── autoReactions.js
│   ├── errorReporter.js
│   ├── ticketStats.js
│   ├── walletService.js
│   └── walletStore.js
├── utils/
│   └── panelMessage.js
├── index.js
├── package.json
└── package-lock.json
```
