# SpaceX Watch V2

A rebuilt Discord operations bot for announcements, staff moderation, private tickets, polls, and case tracking.

The GitHub-ready root contains `bot.js`, `package.json`, `package-lock.json`, `railway.json`, `.env.example`, `.gitignore`, and this README. Upload all of them except any real `.env` file.

## Commands

Public prefix commands:

- `-help`
- `-ping`
- `-userinfo [@user]`
- `-serverinfo`
- `-avatar [@user]`

Staff-only prefix commands require role `1548881045066092584`.

The `-announce` command is restricted to management role `1548891821348888596` and also requires Manage Messages permission:

- `-announce <message>`
- `/moderate` - private in-server moderation desk
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

Music slash commands (members must be in a voice channel for `/play`):

- `/play <YouTube, Spotify, Apple Music link, or song name>`
- `/queue`
- `/skip`
- `/pause`
- `/resume`
- `/stop`

Discord Player handles search, queueing, voice connection, and playback. YouTube, Spotify, and Apple Music extractors are loaded on startup. YouTube playlists are supported; Spotify and Apple Music playlist support depends on extractor availability.

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
GUILD_ID=1548790612877250756
COMMAND_PREFIX=-
NODE_ENV=production
```

Enable the Discord intents `Guilds`, `Guild Members`, `Guild Messages`, `Message Content`, and `Guild Voice States`. The bot role needs appropriate moderation and channel permissions and must be above members it moderates.

Do not commit `.env`, `node_modules`, or `spacex-watch-data.json`.
