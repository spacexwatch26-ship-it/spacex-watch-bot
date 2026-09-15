# SpaceX Watch Bot

The current bot entry point is `bot.js`. Railway starts it with `npm start`.

## Commands

Public commands:

- `-help`
- `-ping`
- `-userinfo [@user]`
- `-serverinfo`
- `-avatar [@user]`

Private slash commands:

- `/help`
- `/ping`
- `/userinfo [user]`
- `/serverinfo`
- `/avatar [user]`
- `/dashboard` (staff)
- `/stats` (staff)

Staff commands require role `1549523456478023810`:

- `-announce <message>`
- `-moderate`
- `-logs [@user|id]`
- `-poll Question | Option 1 | Option 2`
- `-claim`
- `-close`
- `-clear <1-100>`
- `-lock`
- `-unlock`
- `-slowmode <0-21600>`
- `-ticket` (posts the public ticket panel)
- `-dashboard` (shows the staff command center in the current channel)
- `-stats` (live case and ticket statistics)
- `-case <id>` (inspect a moderation case)

Moderation expiration can be `Never`, a duration such as `7 days`, or a calendar date. Discord limits actual native timeouts to 28 days; longer choices work as record expiration dates for warnings and advisories.

## Railway 24-hour hosting without GitHub

Railway can upload this local folder directly with its CLI.

1. Open PowerShell and move into this folder:

   ```powershell
   cd "$HOME\Desktop\SpaceX Watch Bot"
   ```

2. Install the Railway CLI:

   ```powershell
   npm.cmd install --global @railway/cli
   ```

3. Sign in. A browser window will open:

   ```powershell
   railway login
   ```

4. Create and link a new Railway project:

   ```powershell
   railway init
   ```

5. Add the bot variables. Paste the new Discord token when prompted for `DISCORD_TOKEN`:

   ```powershell
   railway variable set DISCORD_TOKEN=your_new_discord_token
   railway variable set COMMAND_PREFIX=-
   railway variable set NODE_ENV=production
   railway variable set CLIENT_ID=your_discord_application_id
   railway variable set GUILD_ID=your_server_id
   ```

6. Upload the current folder and deploy it:

   ```powershell
   railway up
   ```

7. Watch the logs:

   ```powershell
   railway logs
   ```

You should see `SpaceX Watch ... is online`. Railway will keep the service running and restart it after a crash. You do not need to expose a port for this Discord bot.

Railway services run continuously while the project has available usage. This bot does not need a web server or public port.

### Persistence note

`punishments.json` is local file storage. Railway's normal filesystem can be replaced during redeploys, so use a Railway Volume mounted at the project directory or move punishment records to Postgres if the records must survive every redeploy.

### Discord configuration

The bot needs the `Guilds`, `Guild Members`, `Guild Messages`, and `Message Content` intents enabled in the Discord Developer Portal. Its role must also be above members it needs to timeout, kick, or ban.

The staff role ID is configured in the source as `1549523456478023810`.

## Updating the bot

After changing the files, deploy the updated Desktop folder again:

```powershell
cd "$HOME\Desktop\SpaceX Watch Bot"
railway up
```

Railway will build the new version and restart the service. Check it with `railway logs`.
