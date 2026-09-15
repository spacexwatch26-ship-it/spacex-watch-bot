# SpaceX Watch V2

A rebuilt Discord operations bot for announcements, staff moderation, private tickets, polls, and case tracking.

## Commands

Public prefix commands:

- `-help`
- `-ping`
- `-userinfo [@user]`
- `-serverinfo`
- `-avatar [@user]`

Staff-only prefix commands require role `1549523456478023810`:

- `-announce <message>`
- `-moderate` - private DM moderation desk
- `-mute @user 30 minutes reason`
- `-unmute @user reason`
- `-kick @user reason`
- `-ban @user reason`
- `-ticket` - post the support panel
- `-poll Question | Option 1 | Option 2`
- `-dashboard`
- `-stats`
- `-case <id>`
- `-logs [@user]`
- `-clear 1-100`
- `-lock`, `-unlock`
- `-slowmode 0-21600`
- `-close`

Private slash commands:

- `/help`
- `/status`
- `/dashboard`
- `/stats`

## Railway

Deploy this folder directly with Railway CLI:

```powershell
cd "$HOME\Desktop\Space X Watch Bot v4"
railway.cmd up
```

Set these Railway variables:

```text
DISCORD_TOKEN=your_regenerated_bot_token
CLIENT_ID=1549171579903156315
GUILD_ID=1549170941278298212
COMMAND_PREFIX=-
NODE_ENV=production
```

Enable the Discord intents `Guilds`, `Guild Members`, `Guild Messages`, and `Message Content`. The bot role needs appropriate moderation and channel permissions and must be above members it moderates.

Do not commit `.env`, `node_modules`, or `spacex-watch-data.json`.
