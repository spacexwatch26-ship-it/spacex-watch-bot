require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { webcrypto } = require('node:crypto');
global.crypto = global.crypto || webcrypto;
const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    Client,
    EmbedBuilder,
    GatewayIntentBits,
    ModalBuilder,
    PermissionsBitField,
    REST,
    Routes,
    SlashCommandBuilder,
    StringSelectMenuBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');
const play = require('play-dl');
const {
    AudioPlayerStatus,
    NoSubscriberBehavior,
    StreamType,
    createAudioPlayer,
    createAudioResource,
    entersState,
    joinVoiceChannel,
    VoiceConnectionStatus
} = require('@discordjs/voice');

const APP_NAME = 'SpaceX Watch V2';
const PREFIX = process.env.COMMAND_PREFIX || '-';
const STAFF_ROLE_ID = '1548881045066092584';
const MANAGEMENT_ROLE_ID = '1548891821348888596';
const RULES_AGREE_ROLE_ID = '1548795225684578437';
const DATA_FILE = path.join(__dirname, 'spacex-watch-data.json');
const RULES_FILE = path.join(__dirname, 'spacex-watch-rules.json');
const DEFAULT_RULES_BODY = `SpaceX Watch is an independent, unofficial community for SpaceX, spaceflight, aerospace technology, launches, Starship, Falcon, Starlink, and the future of space exploration.

By participating in this server, you agree to follow these rules and reasonable instructions from the SpaceX Watch staff team.

━━━━━━━━━━━━━━━━━━━━

01・RESPECT
Treat all members with respect. Harassment, bullying, threats, discrimination, personal attacks, and targeted hostility are prohibited. Healthy debate is welcome, but keep disagreements respectful.

02・NO SPAM
Do not flood channels with repeated messages, emojis, reactions, mentions, images, or commands. Do not intentionally disrupt conversations.

03・NO NSFW
Sexually explicit, pornographic, excessively graphic, or otherwise inappropriate content is prohibited, including profile pictures, usernames, statuses, links, and media.

04・NO ADVERTISING
Advertising Discord servers, communities, websites, products, services, or social media without staff approval is prohibited. Do not use DMs to bypass this rule.

05・USE CHANNELS CORRECTLY
Keep conversations in their appropriate channels. Mission discussions belong in mission channels, Starship discussions in Starship channels, and general conversations in community channels.

06・NO INTENTIONAL MISINFORMATION
Do not knowingly spread false information about launches, missions, spacecraft, or the space industry. Clearly label rumors, leaks, predictions, and speculation as unofficial.

07・NO IMPERSONATION
Do not impersonate SpaceX employees, astronauts, public figures, content creators, staff members, or other community members.

08・NO SCAMS OR MALICIOUS CONTENT
Phishing, malware, fraudulent giveaways, account-stealing attempts, malicious links, harmful files, and other scams are strictly prohibited.

09・RESPECT PRIVACY
Never share another person's private information without permission. This includes addresses, phone numbers, credentials, private social media information, or other sensitive information.

10・NO RAIDING
Raiding, mass spam, coordinated disruption, mass mentions, channel destruction, or organized attempts to interfere with the server are prohibited.

11・APPROPRIATE PROFILES
Usernames, nicknames, profile pictures, statuses, and bios must remain appropriate and must not intentionally mislead or impersonate others.

12・NO UNNECESSARY DRAMA
Do not bring personal conflicts into public channels or intentionally target other members. Contact staff if assistance is needed.

13・STAFF DIRECTIONS
Follow reasonable instructions from staff. If you disagree with a moderation decision, respectfully contact staff rather than creating public conflict.

14・BOT & SYSTEM ABUSE
Do not spam, exploit, or intentionally abuse bots, permissions, server systems, or vulnerabilities. Report security issues privately to staff.

15・CONSTRUCTIVE DISCUSSION
Different opinions are welcome. Keep discussions about SpaceX, spaceflight, engineering, missions, astronomy, and related topics factual, constructive, and respectful.

16・RELIABLE SOURCES
When sharing major breaking news or mission information, use a reliable source whenever possible. Do not fabricate screenshots, quotes, sources, or announcements.

17・NO FAKE ANNOUNCEMENTS
Members may not create fake SpaceX Watch announcements, mission alerts, staff messages, or other content designed to appear official.

18・FOLLOW DISCORD RULES
All members must follow Discord's Terms of Service and Community Guidelines.

19・COMMON SENSE
Not every situation can be covered by written rules. Use reasonable judgment and avoid behavior that intentionally harms, disrupts, or negatively impacts the community.

━━━━━━━━━━━━━━━━━━━━
⚠️ SpaceX Watch is an independent, unofficial community and is not affiliated with, sponsored by, or endorsed by SpaceX.`;
const COLORS = { blue: 0x2563eb, cyan: 0x0891b2, green: 0x16a34a, amber: 0xd97706, red: 0xdc2626, dark: 0x111827 };
const startedAt = Date.now();
const polls = new Map();
const moderationDrafts = new Map();
const musicQueues = new Map();

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildVoiceStates]
});

const slashCommands = [
    new SlashCommandBuilder().setName('help').setDescription('Open the private SpaceX Watch V2 guide.'),
    new SlashCommandBuilder().setName('status').setDescription('View private bot status.'),
    new SlashCommandBuilder().setName('dashboard').setDescription('View the private staff dashboard.'),
    new SlashCommandBuilder().setName('stats').setDescription('View private moderation statistics.'),
    new SlashCommandBuilder().setName('moderate').setDescription('Open the private staff moderation form.'),
    new SlashCommandBuilder().setName('play').setDescription('Play music in your current voice channel.')
        .addStringOption(option => option.setName('query').setDescription('Song name or music URL').setRequired(true)),
    new SlashCommandBuilder().setName('queue').setDescription('Show the current music queue.'),
    new SlashCommandBuilder().setName('skip').setDescription('Skip the current track.'),
    new SlashCommandBuilder().setName('pause').setDescription('Pause the current track.'),
    new SlashCommandBuilder().setName('resume').setDescription('Resume the current track.'),
    new SlashCommandBuilder().setName('stop').setDescription('Stop music and leave the voice channel.')
].map(command => command.toJSON());

function emptyStore() {
    return { version: 2, nextCase: 1, cases: [] };
}

function readStore() {
    try {
        if (!fs.existsSync(DATA_FILE)) return emptyStore();
        const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        return {
            version: 2,
            nextCase: Number(data.nextCase) || 1,
            cases: Array.isArray(data.cases) ? data.cases : []
        };
    } catch (error) {
        console.error('[storage] read failed:', error.message);
        return emptyStore();
    }
}

function writeStore(store) {
    const temporary = `${DATA_FILE}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(store, null, 2));
    fs.renameSync(temporary, DATA_FILE);
}

function readRulesBody() {
    try {
        if (!fs.existsSync(RULES_FILE)) return DEFAULT_RULES_BODY;
        const data = JSON.parse(fs.readFileSync(RULES_FILE, 'utf8'));
        return typeof data.body === 'string' && data.body.trim() ? data.body : DEFAULT_RULES_BODY;
    } catch (error) {
        console.error('[rules] read failed:', error.message);
        return DEFAULT_RULES_BODY;
    }
}

function writeRulesBody(body) {
    const temporary = `${RULES_FILE}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify({ body }, null, 2));
    fs.renameSync(temporary, RULES_FILE);
}

function refreshCases(store) {
    let changed = false;
    for (const record of store.cases) {
        const nextStatus = record.expiration && new Date(record.expiration).getTime() <= Date.now() ? 'Expired' : 'Active';
        if (record.status !== nextStatus) {
            record.status = nextStatus;
            changed = true;
        }
    }
    if (changed) writeStore(store);
    return store;
}

function addCase(details) {
    const store = readStore();
    const record = {
        id: store.nextCase++,
        issuedAt: new Date().toISOString(),
        status: details.expiration && details.expiration.getTime() <= Date.now() ? 'Expired' : 'Active',
        expiration: details.expiration ? details.expiration.toISOString() : null,
        ...details
    };
    store.cases.push(record);
    writeStore(store);
    return record;
}

function discordDate(value) {
    return value ? `<t:${Math.floor(new Date(value).getTime() / 1000)}:f>` : 'Never';
}

function uptime() {
    const seconds = Math.floor((Date.now() - startedAt) / 1000);
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m ${seconds % 60}s`;
}

function card(title, description, color = COLORS.blue) {
    return new EmbedBuilder()
        .setAuthor({ name: APP_NAME, iconURL: client.user?.displayAvatarURL() })
        .setTitle(title)
        .setDescription(description)
        .setColor(color)
        .setTimestamp()
        .setFooter({ text: 'SpaceX Watch V2 • operations system' });
}

function isStaff(member) {
    return member?.roles?.cache?.has(STAFF_ROLE_ID) === true;
}

function isManagement(member) {
    return member?.roles?.cache?.has(MANAGEMENT_ROLE_ID) === true;
}

function rulesEmbed(body) {
    return new EmbedBuilder()
        .setAuthor({ name: APP_NAME, iconURL: client.user?.displayAvatarURL() })
        .setTitle('🚀 Welcome to SpaceX Watch')
        .setDescription(body)
        .setColor(COLORS.blue)
        .setThumbnail(client.user?.displayAvatarURL() || null)
        .setFooter({ text: 'SpaceX Watch • Community Guidelines' })
        .setTimestamp();
}

function rulesAgreeRow() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('rules:agree').setLabel('I Agree').setEmoji('✅').setStyle(ButtonStyle.Success)
    );
}

function hasPermission(member, permission) {
    return member?.permissions?.has(permission) === true;
}

async function findMember(guild, value) {
    const id = value.replace(/[<@!>]/g, '').trim();
    if (!/^\d+$/.test(id)) return null;
    return guild.members.fetch(id).catch(() => null);
}

function parseDuration(value) {
    const match = value.trim().match(/^(\d+)\s*(minute|minutes|hour|hours|day|days|week|weeks)$/i);
    if (!match) return undefined;
    const multipliers = { minute: 60000, minutes: 60000, hour: 3600000, hours: 3600000, day: 86400000, days: 86400000, week: 604800000, weeks: 604800000 };
    return new Date(Date.now() + Number(match[1]) * multipliers[match[2].toLowerCase()]);
}

function durationMs(value) {
    return { '30m': 1800000, '1h': 3600000, '6h': 21600000, '1d': 86400000, '7d': 604800000, '14d': 1209600000, '28d': 2419200000 }[value];
}

function ytDlpCommand() {
    return ['/app/yt-dlp', '/root/.nix-profile/bin/yt-dlp', '/usr/bin/yt-dlp', 'yt-dlp'].find(command => command === 'yt-dlp' || fs.existsSync(command));
}

function staffDashboard(guild) {
    const records = refreshCases(readStore()).cases.filter(record => record.guildId === guild.id);
    const tickets = guild.channels.cache.filter(channel => channel.topic?.startsWith('ticket-owner:')).size;
    return card('Staff command center', 'A focused live view of this server.', COLORS.cyan).addFields(
        { name: 'Members', value: String(guild.memberCount), inline: true },
        { name: 'Open tickets', value: String(tickets), inline: true },
        { name: 'Active cases', value: String(records.filter(record => record.status === 'Active').length), inline: true },
        { name: 'Total cases', value: String(records.length), inline: true },
        { name: 'Uptime', value: uptime(), inline: true },
        { name: 'Tools', value: '`-moderate` `-mute` `-kick` `-ban` `-ticket` `-poll`\n`-announce` `-stats` `-case` `-close`' }
    );
}

async function resolveMusicQuery(input) {
    const value = input.trim();
    const source = /^https?:\/\//i.test(value) ? value : `ytsearch1:${value}`;
    return new Promise((resolve, reject) => {
        const extractor = spawn(ytDlpCommand(), [source, '--flat-playlist', '--playlist-end', '100', '--format', 'best[acodec!=none]/best', '--print', '%(title)s\t%(webpage_url)s\t%(duration_string)s', '--skip-download', '--no-warnings', '--no-cache-dir'], { windowsHide: true });
        let output = '';
        let errors = '';
        extractor.stdout.on('data', chunk => { output += chunk.toString(); });
        extractor.stderr.on('data', chunk => { errors += chunk.toString(); });
        extractor.once('error', reject);
        extractor.once('close', code => {
            if (code !== 0 || !output.trim()) return reject(new Error(errors.trim() || `yt-dlp lookup exited with ${code}`));
            const tracks = output.trim().split(/\r?\n/).map(line => {
                const [title, url, duration] = line.split('\t');
                return title && url ? { title, url, duration: duration || 'Unknown', requested: value } : null;
            }).filter(Boolean);
            if (!tracks.length) return reject(new Error('yt-dlp returned no tracks'));
            resolve(tracks);
        });
    });
}

function musicQueue(guildId) {
    if (!musicQueues.has(guildId)) {
        const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
        player.on(AudioPlayerStatus.Idle, () => playNext(guildId).catch(error => console.error('[music] next track failed:', error.message)));
        player.on('error', error => console.error('[music] player error:', error.message));
        musicQueues.set(guildId, { items: [], player, connection: null, textChannel: null, current: null, playing: false });
    }
    return musicQueues.get(guildId);
}

async function playNext(guildId) {
    const queue = musicQueues.get(guildId);
    if (!queue) return;
    const item = queue.items.shift();
    if (!item) {
        queue.current = null;
        queue.playing = false;
        return queue.textChannel?.send({ embeds: [card('Queue complete', 'No more tracks are waiting.', COLORS.green)] });
    }

    try {
        const extractor = spawn(ytDlpCommand(), ['--no-playlist', '--no-warnings', '--quiet', '--format', 'best[acodec!=none]/best', '--output', '-', '--no-part', '--no-cache-dir', '--extractor-args', 'youtube:player_client=android', item.url], { windowsHide: true });
        const ffmpeg = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-vn', '-f', 's16le', '-ar', '48000', '-ac', '2', 'pipe:1'], { windowsHide: true });
        extractor.stdout.pipe(ffmpeg.stdin);
        extractor.on('error', error => console.error('[music] yt-dlp:', error.message));
        extractor.stderr.on('data', data => console.error('[music] yt-dlp:', data.toString().trim()));
        ffmpeg.stderr.on('data', data => console.error('[music] ffmpeg:', data.toString().trim()));
        ffmpeg.on('error', error => console.error('[music] ffmpeg process:', error.message));
        queue.extractor = extractor;
        queue.ffmpeg = ffmpeg;
        queue.current = item;
        queue.playing = true;
        queue.player.play(createAudioResource(ffmpeg.stdout, { inputType: StreamType.Raw }));
        await entersState(queue.player, AudioPlayerStatus.Playing, 10000);
        await queue.textChannel?.send({ embeds: [card('Music is playing', `**${APP_NAME} is now playing music.**\n\nTrack: **${item.title}**\nRequested by <@${item.requesterId}>`, COLORS.cyan).addFields({ name: 'Length', value: item.duration || 'Unknown', inline: true }, { name: 'Controls', value: '`-pause` `-resume` `-skip` `-stop`', inline: true })] });
    } catch (error) {
        console.error('[music] playback failed:', error.stack || error.message);
        await queue.textChannel?.send({ embeds: [card('Playback failed', `I could not start **${item.title}**. Skipping to the next track.`, COLORS.red)] }).catch(() => undefined);
        queue.playing = false;
        queue.extractor?.kill();
        queue.ffmpeg?.kill();
        queue.current = null;
        return;
    }
}

async function playMusic(message, input) {
    if (!message.member.voice.channel) return message.reply('Join a voice channel first.');
    if (!input) return message.reply(`Usage: ${PREFIX}play <YouTube, Spotify, Apple Music link, or song name>`);
    const queue = musicQueue(message.guildId);
    queue.textChannel = message.channel;
    if (!queue.connection || queue.connection.state.status === VoiceConnectionStatus.Destroyed) {
        queue.connection = joinVoiceChannel({ channelId: message.member.voice.channel.id, guildId: message.guildId, adapterCreator: message.guild.voiceAdapterCreator });
        queue.connection.on('error', error => console.error('[music] voice connection error:', error.message));
        queue.connection.subscribe(queue.player);
        try {
            await entersState(queue.connection, VoiceConnectionStatus.Ready, 15000);
        } catch (error) {
            queue.connection.destroy();
            queue.connection = null;
            return message.reply('I joined the voice channel but Discord did not finish the audio connection. Check my Connect and Speak permissions, then try again.');
        }
    }
    let tracks;
    try {
        tracks = await resolveMusicQuery(input);
    } catch (error) {
        console.error('[music] media lookup failed:', error.stack || error.message);
        return message.reply('I could not find a playable audio source. Try a YouTube link or song title.');
    }
    if (!tracks.length) return message.reply('That playlist did not contain any playable tracks.');
    queue.items.push(...tracks.map(track => ({ ...track, requesterId: message.author.id })));
    const firstTrack = tracks[0];
    await message.reply({ embeds: [card(tracks.length > 1 ? 'Playlist added' : 'Added to queue', tracks.length > 1 ? `Added **${tracks.length}** tracks from the YouTube playlist.` : `**${firstTrack.title}**`, COLORS.green).addFields({ name: 'Position', value: String(queue.items.length + (queue.current ? 1 : 0)), inline: true }, { name: 'Source', value: /spotify|apple/i.test(input) ? 'External link resolved to YouTube audio' : 'YouTube', inline: true })] });
    if (!queue.playing) await playNext(message.guildId);
}

function stopMusic(message) {
    const queue = musicQueues.get(message.guildId);
    if (!queue) return message.reply('There is no active music queue.');
    queue.items = [];
    queue.player.stop();
    queue.extractor?.kill();
    queue.ffmpeg?.kill();
    queue.connection?.destroy();
    musicQueues.delete(message.guildId);
    return message.reply({ embeds: [card('Music stopped', 'The queue was cleared and I left the voice channel.', COLORS.amber)] });
}

async function registerSlashCommands() {
    const token = process.env.DISCORD_TOKEN || process.env.BOT_TOKEN;
    if (!token || !process.env.CLIENT_ID) return console.warn('[slash] Missing token or CLIENT_ID; registration skipped.');
    const rest = new REST({ version: '10' }).setToken(token);
    const route = process.env.GUILD_ID ? Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID) : Routes.applicationCommands(process.env.CLIENT_ID);
    await rest.put(route, { body: slashCommands });
    console.log(`[slash] Registered ${slashCommands.length} private commands.`);
}

client.once('ready', async readyClient => {
    console.log(`[ready] ${APP_NAME} online as ${readyClient.user.tag}.`);
    readyClient.user.setPresence({ activities: [{ name: `${PREFIX}help • V2`, type: 0 }], status: 'online' });
    writeStore(readStore());
    await registerSlashCommands().catch(error => console.error('[slash] registration failed:', error.message));
});

setInterval(() => refreshCases(readStore()), 30000);

client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild || !message.content.startsWith(PREFIX)) return;
    const parts = message.content.slice(PREFIX.length).trim().split(/\s+/);
    const command = (parts.shift() || '').toLowerCase();
    const args = parts.join(' ').trim();
    const staffCommands = new Set(['announce', 'moderate', 'mute', 'unmute', 'kick', 'ban', 'logs', 'poll', 'ticket', 'dashboard', 'stats', 'case', 'clear', 'lock', 'unlock', 'slowmode', 'close']);

    try {
        if (staffCommands.has(command) && !isStaff(message.member)) return message.reply('This command is restricted to staff.');
        if (command === 'help') return message.reply({ embeds: [card('V2 command guide', 'A cleaner command center for SpaceX Watch.', COLORS.cyan).addFields(
            { name: 'Public', value: '`-help` `-ping` `-userinfo` `-serverinfo` `-avatar`' },
            { name: 'Staff', value: '`-announce` `-moderate` `-mute` `-unmute` `-kick` `-ban`\n`-ticket` `-poll` `-dashboard` `-stats` `-case`\n`-clear` `-lock` `-unlock` `-slowmode` `-close`' },
            { name: 'Management', value: '`-rules` `-changerules`' },
            { name: 'Music', value: '`-play <link or song>` `-queue` `-skip` `-pause` `-resume` `-stop`' },
            { name: 'Private slash commands', value: '`/help` `/status` `/dashboard` `/stats`' }
        )] });
        if (command === 'ping' || command === 'status') return message.reply({ embeds: [card('System status', `Gateway latency: **${client.ws.ping}ms**\nUptime: **${uptime()}**\nState: **Operational**`, COLORS.green)] });
        if (command === 'dashboard') return message.reply({ embeds: [staffDashboard(message.guild)] });

        if (command === 'stats') {
            const records = refreshCases(readStore()).cases.filter(record => record.guildId === message.guildId);
            const counts = records.reduce((result, record) => { result[record.type] = (result[record.type] || 0) + 1; return result; }, {});
            return message.reply({ embeds: [card('Live staff statistics', 'Current moderation activity for this server.', COLORS.green).addFields(
                { name: 'Cases', value: String(records.length), inline: true },
                { name: 'Active', value: String(records.filter(record => record.status === 'Active').length), inline: true },
                { name: 'Tickets', value: String(message.guild.channels.cache.filter(channel => channel.topic?.startsWith('ticket-owner:')).size), inline: true },
                { name: 'Action mix', value: Object.entries(counts).map(([type, count]) => `**${type}:** ${count}`).join('\n') || 'No cases yet.' }
            )] });
        }

        if (command === 'case') {
            const id = Number(args.replace(/^#/, ''));
            const record = refreshCases(readStore()).cases.find(item => item.guildId === message.guildId && item.id === id);
            if (!record) return message.reply('That case was not found.');
            return message.reply({ embeds: [card(`Case #${String(record.id).padStart(4, '0')}`, `Moderation record for <@${record.targetId}>.`, COLORS.amber).addFields(
                { name: 'Action', value: record.type, inline: true }, { name: 'Status', value: record.status, inline: true }, { name: 'Issuer', value: `<@${record.issuerId}>`, inline: true },
                { name: 'Issued', value: discordDate(record.issuedAt), inline: true }, { name: 'Expires', value: discordDate(record.expiration), inline: true }, { name: 'Reason', value: record.reason }
            )] });
        }

        if (command === 'announce') {
            if (!isManagement(message.member)) return message.reply('Only the management role can use this command.');
            if (!hasPermission(message.member, PermissionsBitField.Flags.ManageMessages)) return message.reply('You need **Manage Messages** permission.');
            if (!args) return message.reply('Add announcement text after the command.');
            await message.channel.send({ embeds: [card('Official announcement', args, COLORS.blue).setFooter({ text: `${APP_NAME} • issued by ${message.author.tag}` })] });
            return message.delete().catch(() => undefined);
        }

        if (['play', 'stop', 'skip', 'pause', 'resume', 'queue'].includes(command)) return message.reply('Music is now controlled with slash commands: `/play`, `/queue`, `/skip`, `/pause`, `/resume`, and `/stop`.');

        if (['mute', 'unmute', 'kick', 'ban'].includes(command)) return directModeration(message, command, args);
        if (command === 'moderate') return message.reply('Use the private `/moderate` slash command for moderation.');
        if (command === 'ticket') return postTicketPanel(message);
        if (command === 'rules') return postRules(message);
        if (command === 'changerules') return promptRulesEditor(message);
        if (command === 'poll') return createPoll(message, args);
        if (command === 'logs') return showLogs(message, args);
        if (command === 'clear') return clearMessages(message, args);
        if (command === 'lock' || command === 'unlock') return setLock(message, command);
        if (command === 'slowmode') return setSlowmode(message, args);
        if (command === 'close') return closeChannel(message);
        if (command === 'userinfo' || command === 'avatar') return showUser(message, command, args);
        if (command === 'serverinfo') return showServer(message);
    } catch (error) {
        console.error('[command]', error);
        return message.reply('The command could not be completed. Check the bot permissions.');
    }
});

async function directModeration(message, command, rawArgs) {
    const required = { mute: PermissionsBitField.Flags.ModerateMembers, unmute: PermissionsBitField.Flags.ModerateMembers, kick: PermissionsBitField.Flags.KickMembers, ban: PermissionsBitField.Flags.BanMembers }[command];
    if (!hasPermission(message.member, required)) return message.reply(`You need the required permission for **${command}**.`);
    const parts = rawArgs.split(/\s+/);
    const target = await findMember(message.guild, parts.shift() || '');
    if (!target || target.id === message.author.id || target.id === message.guild.ownerId || message.member.roles.highest.position <= target.roles.highest.position) return message.reply('Provide a valid lower-ranked member.');
    const durationInput = command === 'mute' ? parts.shift() : null;
    const reason = parts.join(' ').trim() || 'No reason provided';
    if (command === 'mute') {
        const expiration = parseDuration(durationInput || '');
        if (!expiration || expiration.getTime() <= Date.now()) return message.reply(`Usage: ${PREFIX}mute @user 30 minutes reason`);
        const duration = expiration.getTime() - Date.now();
        if (duration > 28 * 86400000) return message.reply('Discord timeouts cannot exceed 28 days.');
        await target.timeout(duration, reason);
        const record = addCase({ guildId: message.guildId, targetId: target.id, targetTag: target.user.tag, issuerId: message.author.id, issuerTag: message.author.tag, type: 'timeout', reason, expiration });
        return message.reply({ embeds: [card('Member muted', `<@${target.id}> is timed out until ${discordDate(record.expiration)}.`, COLORS.amber).addFields({ name: 'Reason', value: reason }, { name: 'Case', value: `#${String(record.id).padStart(4, '0')}` })] });
    }
    if (command === 'unmute') {
        await target.timeout(null, reason);
        return message.reply({ embeds: [card('Member unmuted', `<@${target.id}> can speak again.`, COLORS.green)] });
    }
    if (command === 'kick') await target.kick(reason);
    if (command === 'ban') await target.ban({ reason });
    const record = addCase({ guildId: message.guildId, targetId: target.id, targetTag: target.user.tag, issuerId: message.author.id, issuerTag: message.author.tag, type: command, reason, expiration: null });
    return message.reply({ embeds: [card(command === 'ban' ? 'Member banned' : 'Member kicked', `**${target.user.tag}** was ${command === 'ban' ? 'banned' : 'removed'}.`, COLORS.red).addFields({ name: 'Reason', value: reason }, { name: 'Case', value: `#${String(record.id).padStart(4, '0')}` })] });
}

async function postTicketPanel(message) {
    const open = new ButtonBuilder().setCustomId('ticket:create').setLabel('Open private support ticket').setEmoji('🎫').setStyle(ButtonStyle.Primary);
    const panel = card('SPACE X WATCH V2 • SUPPORT DESK', 'Need help? Open a private support room with the staff team.', COLORS.blue).addFields(
        { name: '01 • Open', value: 'Click the button below. You receive one private room.' },
        { name: '02 • Explain', value: 'Share the issue and useful details.' },
        { name: '03 • Resolve', value: 'Close the room when everything is handled.' }
    ).setFooter({ text: 'Support desk • private channels • staff monitored' });
    return message.channel.send({ embeds: [panel], components: [new ActionRowBuilder().addComponents(open)] });
}

async function postRules(message) {
    if (!isManagement(message.member)) return message.reply('Only the management role can use this command.');
    await message.channel.send({ embeds: [rulesEmbed(readRulesBody())], components: [rulesAgreeRow()] });
    return message.delete().catch(() => undefined);
}

async function promptRulesEditor(message) {
    if (!isManagement(message.member)) return message.reply('Only the management role can use this command.');
    const open = new ButtonBuilder().setCustomId(`rules-edit:${message.channelId}:${message.author.id}`).setLabel('Open rules editor').setEmoji('📝').setStyle(ButtonStyle.Primary);
    return message.reply({ embeds: [card('Rules editor', 'Click below to open the embed editor and post a brand new rules message with your changes.', COLORS.cyan)], components: [new ActionRowBuilder().addComponents(open)] });
}

async function createPoll(message, args) {
    const parts = args.split('|').map(value => value.trim()).filter(Boolean);
    const question = parts.shift();
    if (!question || parts.length < 2 || parts.length > 5) return message.reply(`Usage: ${PREFIX}poll Question | Option 1 | Option 2`);
    const id = `${message.id}-${Date.now()}`;
    polls.set(id, { question, options: parts, votes: new Map() });
    const row = new ActionRowBuilder().addComponents(parts.map((option, index) => new ButtonBuilder().setCustomId(`poll:${id}:${index}`).setLabel(option.slice(0, 80)).setStyle(ButtonStyle.Secondary)));
    return message.channel.send({ embeds: [card('Staff poll', question, COLORS.cyan).setFooter({ text: 'One vote per member • live results' })], components: [row] });
}

async function showLogs(message, args) {
    const target = args ? await findMember(message.guild, args) : message.member;
    if (!target) return message.reply('Provide a valid member mention or ID.');
    const records = refreshCases(readStore()).cases.filter(record => record.guildId === message.guildId && record.targetId === target.id).slice(-5).reverse();
    if (!records.length) return message.reply(`No moderation history found for ${target.user.tag}.`);
    return message.reply({ embeds: [card(`Moderation log • ${target.user.tag}`, 'Recent cases.', COLORS.green).addFields(records.map(record => ({ name: `#${String(record.id).padStart(4, '0')} • ${record.type}`, value: `**Reason:** ${record.reason}\n**Status:** ${record.status}\n**Expires:** ${discordDate(record.expiration)}` })))] });
}

async function clearMessages(message, args) {
    if (!hasPermission(message.member, PermissionsBitField.Flags.ManageMessages)) return message.reply('You need **Manage Messages** permission.');
    const amount = Number(args);
    if (!Number.isInteger(amount) || amount < 1 || amount > 100) return message.reply(`Usage: ${PREFIX}clear 1-100`);
    const deleted = await message.channel.bulkDelete(amount, true);
    const notice = await message.channel.send(`Deleted **${deleted.size}** message(s).`);
    return setTimeout(() => notice.delete().catch(() => undefined), 3000);
}

async function setLock(message, command) {
    if (!hasPermission(message.member, PermissionsBitField.Flags.ManageChannels)) return message.reply('You need **Manage Channels** permission.');
    await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: command === 'unlock' });
    return message.reply({ embeds: [card(command === 'lock' ? 'Channel locked' : 'Channel unlocked', `${message.channel} is now ${command === 'lock' ? 'staff-only' : 'open to members'}.`, COLORS.green)] });
}

async function setSlowmode(message, args) {
    if (!hasPermission(message.member, PermissionsBitField.Flags.ManageChannels)) return message.reply('You need **Manage Channels** permission.');
    const seconds = Number(args);
    if (!Number.isInteger(seconds) || seconds < 0 || seconds > 21600) return message.reply(`Usage: ${PREFIX}slowmode 0-21600`);
    await message.channel.setRateLimitPerUser(seconds);
    return message.reply(`Slowmode set to **${seconds} seconds**.`);
}

async function closeChannel(message) {
    await message.reply({ embeds: [card('Channel closing', 'This channel will be removed in 5 seconds.', COLORS.amber)] });
    return setTimeout(() => message.channel.delete().catch(() => undefined), 5000);
}

async function showUser(message, command, args) {
    const target = args ? await findMember(message.guild, args) : message.member;
    if (!target) return message.reply('Provide a valid member mention or ID.');
    if (command === 'avatar') return message.reply({ embeds: [card(`${target.user.tag} • avatar`, `[Open full size](${target.user.displayAvatarURL({ size: 1024 })})`).setImage(target.user.displayAvatarURL({ size: 1024 }))] });
    return message.reply({ embeds: [card(`User information • ${target.user.tag}`, `Details for <@${target.id}>.`).setThumbnail(target.user.displayAvatarURL()).addFields({ name: 'User ID', value: target.id, inline: true }, { name: 'Joined', value: discordDate(target.joinedAt), inline: true }, { name: 'Created', value: discordDate(target.user.createdAt), inline: true }, { name: 'Highest role', value: target.roles.highest.toString(), inline: true })] });
}

async function showServer(message) {
    return message.reply({ embeds: [card(`Server information • ${message.guild.name}`, 'Current server details.').addFields({ name: 'Owner', value: `<@${message.guild.ownerId}>`, inline: true }, { name: 'Members', value: String(message.guild.memberCount), inline: true }, { name: 'Channels', value: String(message.guild.channels.cache.size), inline: true }, { name: 'Created', value: discordDate(message.guild.createdAt), inline: true })] });
}

client.on('interactionCreate', async interaction => {
    try {
        if (interaction.isChatInputCommand()) return handleSlash(interaction);
        if (interaction.isButton() && interaction.customId === 'ticket:create') return createTicket(interaction);
        if (interaction.isButton() && interaction.customId === 'ticket:close') return closeTicket(interaction);
        if (interaction.isButton() && interaction.customId.startsWith('moderate:')) return showModerationModal(interaction);
        if (interaction.isModalSubmit() && interaction.customId.startsWith('moderation:')) return receiveModerationForm(interaction);
        if (interaction.isStringSelectMenu() && interaction.customId.startsWith('moderation-')) return chooseModeration(interaction);
        if (interaction.isButton() && interaction.customId.startsWith('moderation-confirm:')) return confirmModeration(interaction);
        if (interaction.isButton() && interaction.customId.startsWith('poll:')) return vote(interaction);
        if (interaction.isButton() && interaction.customId === 'rules:agree') return giveRulesRole(interaction);
        if (interaction.isButton() && interaction.customId.startsWith('rules-edit:')) return showRulesEditorModal(interaction);
        if (interaction.isModalSubmit() && interaction.customId.startsWith('rules-modal:')) return receiveRulesEditor(interaction);
    } catch (error) {
        console.error('[interaction]', error);
        const response = { content: 'The interaction failed. Check bot permissions.', ephemeral: true };
        if (interaction.replied || interaction.deferred) return interaction.followUp(response);
        return interaction.reply(response);
    }
});

async function createTicket(interaction) {
    const existing = interaction.guild.channels.cache.find(channel => channel.type === ChannelType.GuildText && channel.topic === `ticket-owner:${interaction.user.id}`);
    if (existing) return interaction.reply({ content: `You already have an open ticket: ${existing}`, ephemeral: true });
    const safeName = interaction.user.username.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 55) || interaction.user.id;
    const channel = await interaction.guild.channels.create({ name: `ticket-${safeName}`, type: ChannelType.GuildText, parent: interaction.channel.parentId, topic: `ticket-owner:${interaction.user.id}`, permissionOverwrites: [
        { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
        { id: STAFF_ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.ManageChannels] },
        { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.ManageChannels] }
    ] });
    const close = new ButtonBuilder().setCustomId('ticket:close').setLabel('Close ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger);
    await channel.send({ content: `<@${interaction.user.id}> <@&${STAFF_ROLE_ID}>`, embeds: [card('PRIVATE SUPPORT ROOM', `Welcome <@${interaction.user.id}>.\n\nDescribe your request clearly and staff will respond here.`, COLORS.green).addFields({ name: 'Owner', value: `<@${interaction.user.id}>`, inline: true }, { name: 'Status', value: 'Open', inline: true })], components: [new ActionRowBuilder().addComponents(close)] });
    return interaction.reply({ content: `Your private ticket is ready: ${channel}`, ephemeral: true });
}

async function closeTicket(interaction) {
    if (!isStaff(interaction.member) && interaction.channel.topic !== `ticket-owner:${interaction.user.id}`) return interaction.reply({ content: 'Only staff or the ticket owner can close this ticket.', ephemeral: true });
    await interaction.reply('This ticket will close in 5 seconds.');
    return setTimeout(() => interaction.channel.delete().catch(() => undefined), 5000);
}

async function vote(interaction) {
    const [, id, index] = interaction.customId.split(':');
    const poll = polls.get(id);
    if (!poll || !poll.options[Number(index)]) return interaction.reply({ content: 'This poll is no longer active.', ephemeral: true });
    poll.votes.set(interaction.user.id, Number(index));
    const counts = poll.options.map((_, optionIndex) => [...poll.votes.values()].filter(value => value === optionIndex).length);
    const row = new ActionRowBuilder().addComponents(poll.options.map((option, optionIndex) => new ButtonBuilder().setCustomId(`poll:${id}:${optionIndex}`).setLabel(`${option.slice(0, 65)} (${counts[optionIndex]})`).setStyle(ButtonStyle.Secondary)));
    return interaction.update({ embeds: [card('Staff poll', poll.question, COLORS.cyan).setFooter({ text: `${poll.votes.size} vote(s) • one vote per member` })], components: [row] });
}

async function giveRulesRole(interaction) {
    if (interaction.member.roles.cache.has(RULES_AGREE_ROLE_ID)) return interaction.reply({ content: 'You already agreed to the rules.', ephemeral: true });
    try {
        await interaction.member.roles.add(RULES_AGREE_ROLE_ID);
    } catch (error) {
        console.error('[rules] role add failed:', error.message);
        return interaction.reply({ content: 'I could not give you the role. Contact staff — my role may need to be positioned above the agree role.', ephemeral: true });
    }
    return interaction.reply({ content: 'Thanks for agreeing to the SpaceX Watch rules! ✅', ephemeral: true });
}

async function showRulesEditorModal(interaction) {
    const [, channelId, authorId] = interaction.customId.split(':');
    if (authorId !== interaction.user.id || !isManagement(interaction.member)) return interaction.reply({ content: 'This rules editor is unavailable.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId(`rules-modal:${channelId}:${interaction.user.id}`).setTitle('SpaceX Watch • Rules editor');
    const body = new TextInputBuilder().setCustomId('body').setLabel('Rules content').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(4000).setValue(readRulesBody());
    modal.addComponents(new ActionRowBuilder().addComponents(body));
    return interaction.showModal(modal);
}

async function receiveRulesEditor(interaction) {
    const [, channelId, authorId] = interaction.customId.split(':');
    if (authorId !== interaction.user.id || !isManagement(interaction.member)) return interaction.reply({ content: 'This rules editor is restricted to management.', ephemeral: true });
    const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return interaction.reply({ content: 'That channel is no longer available.', ephemeral: true });
    const body = interaction.fields.getTextInputValue('body').trim();
    writeRulesBody(body);
    await channel.send({ embeds: [rulesEmbed(body)], components: [rulesAgreeRow()] });
    return interaction.reply({ content: `Posted a brand new rules embed in ${channel}.`, ephemeral: true });
}

async function showModerationModal(interaction) {
    const [, guildId, staffId] = interaction.customId.split(':');
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    const staff = guild ? await guild.members.fetch(interaction.user.id).catch(() => null) : null;
    if (staffId !== interaction.user.id || !guild || !staff || !isStaff(staff)) return interaction.reply({ content: 'This private moderation form is unavailable.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId(`moderation:${guildId}:${interaction.user.id}`).setTitle(`${APP_NAME} moderation`);
    const field = (id, label, placeholder, style = TextInputStyle.Short) => new TextInputBuilder().setCustomId(id).setLabel(label).setPlaceholder(placeholder).setStyle(style).setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(field('target', 'Target user', '@User or Discord ID')), new ActionRowBuilder().addComponents(field('reason', 'Reason', 'Why is this action being taken?', TextInputStyle.Paragraph)));
    return interaction.showModal(modal);
}

async function receiveModerationForm(interaction) {
    const [, guildId, staffId] = interaction.customId.split(':');
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    const staff = guild ? await guild.members.fetch(interaction.user.id).catch(() => null) : null;
    if (staffId !== interaction.user.id || !guild || !staff || !isStaff(staff)) return interaction.reply({ content: 'This moderation form is restricted to staff.', ephemeral: true });
    const target = await findMember(guild, interaction.fields.getTextInputValue('target'));
    if (!target || target.id === interaction.user.id || target.id === guild.ownerId || staff.roles.highest.position <= target.roles.highest.position) return interaction.reply({ content: 'That member cannot be targeted by your role.', ephemeral: true });
    moderationDrafts.set(interaction.user.id, { guildId, targetId: target.id, reason: interaction.fields.getTextInputValue('reason').trim(), action: null, duration: null });
    const action = new StringSelectMenuBuilder().setCustomId(`moderation-action:${interaction.user.id}`).setPlaceholder('Choose an action').addOptions({ label: 'Warning', value: 'warning' }, { label: 'Advisory', value: 'advisory' }, { label: 'Mute / Timeout', value: 'timeout' }, { label: 'Kick', value: 'kick' }, { label: 'Ban', value: 'ban' });
    const duration = new StringSelectMenuBuilder().setCustomId(`moderation-duration:${interaction.user.id}`).setPlaceholder('Choose a duration').addOptions({ label: '30 minutes', value: '30m' }, { label: '1 hour', value: '1h' }, { label: '6 hours', value: '6h' }, { label: '1 day', value: '1d' }, { label: '7 days', value: '7d' }, { label: '14 days', value: '14d' }, { label: '28 days', value: '28d' }, { label: 'Permanent / never', value: 'never' });
    const confirm = new ButtonBuilder().setCustomId(`moderation-confirm:${interaction.user.id}`).setLabel('Apply action').setEmoji('⚡').setStyle(ButtonStyle.Danger);
    return interaction.reply({ embeds: [card('Choose action and duration', `Target: <@${target.id}>\nReason: ${moderationDrafts.get(interaction.user.id).reason}`, COLORS.amber)], components: [new ActionRowBuilder().addComponents(action), new ActionRowBuilder().addComponents(duration), new ActionRowBuilder().addComponents(confirm)], ephemeral: true });
}

async function chooseModeration(interaction) {
    const draft = moderationDrafts.get(interaction.user.id);
    if (!draft) return interaction.reply({ content: 'This moderation form expired.', ephemeral: true });
    if (interaction.customId.startsWith('moderation-action:')) draft.action = interaction.values[0];
    else draft.duration = interaction.values[0];
    return interaction.deferUpdate();
}

async function confirmModeration(interaction) {
    const draft = moderationDrafts.get(interaction.user.id);
    const guild = draft ? await client.guilds.fetch(draft.guildId).catch(() => null) : null;
    const staff = guild ? await guild.members.fetch(interaction.user.id).catch(() => null) : null;
    if (!draft || !guild || !staff || !isStaff(staff)) return interaction.reply({ content: 'This moderation form expired.', ephemeral: true });
    if (!draft.action || !draft.duration) return interaction.reply({ content: 'Choose both an action and duration first.', ephemeral: true });
    const target = await findMember(guild, draft.targetId);
    if (!target) return interaction.reply({ content: 'That member is no longer available.', ephemeral: true });
    const duration = durationMs(draft.duration);
    const expiration = draft.duration === 'never' ? null : new Date(Date.now() + duration);
    try {
        if (draft.action === 'timeout') {
            if (!duration) return interaction.reply({ content: 'A timeout needs a duration.', ephemeral: true });
            await target.timeout(duration, draft.reason);
        } else if (draft.action === 'kick') await target.kick(draft.reason);
        else if (draft.action === 'ban') await target.ban({ reason: draft.reason });
    } catch (error) {
        console.error('[moderation]', error);
        return interaction.reply({ content: 'The action failed. Check bot permissions and role position.', ephemeral: true });
    }
    const record = addCase({ guildId: draft.guildId, targetId: target.id, targetTag: target.user.tag, issuerId: interaction.user.id, issuerTag: interaction.user.tag, type: draft.action, reason: draft.reason, expiration });
    moderationDrafts.delete(interaction.user.id);
    return interaction.update({ embeds: [card('Action recorded', `Successfully recorded **${draft.action}** for <@${target.id}>.`, COLORS.green).addFields({ name: 'Duration', value: draft.duration === 'never' ? 'Permanent' : discordDate(record.expiration) }, { name: 'Case', value: `#${String(record.id).padStart(4, '0')}` })], components: [] });
}

async function handleSlash(interaction) {
    if (interaction.commandName === 'help') return interaction.reply({ embeds: [card('Private V2 guide', 'Only you can see this response.', COLORS.cyan).addFields({ name: 'Private commands', value: '`/help` `/status` `/moderate` `/dashboard` `/stats`' }, { name: 'Server workflows', value: '`-announce` `-mute` `-kick` `-ban` `-ticket` `-poll`' })], ephemeral: true });
    if (interaction.commandName === 'status') return interaction.reply({ embeds: [card('Private system status', `Gateway: **${client.ws.ping}ms**\nUptime: **${uptime()}**\nState: **Operational**`, COLORS.green)], ephemeral: true });
    if (interaction.commandName === 'moderate') {
        if (!isStaff(interaction.member) || !hasPermission(interaction.member, PermissionsBitField.Flags.ModerateMembers)) {
            return interaction.reply({ content: 'You need the configured staff role and **Moderate Members** permission.', ephemeral: true });
        }
        const modal = new ModalBuilder().setCustomId(`moderation:${interaction.guildId}:${interaction.user.id}`).setTitle(`${APP_NAME} moderation`);
        const field = (id, label, placeholder, style = TextInputStyle.Short) => new TextInputBuilder().setCustomId(id).setLabel(label).setPlaceholder(placeholder).setStyle(style).setRequired(true);
        modal.addComponents(
            new ActionRowBuilder().addComponents(field('target', 'Target user', '@User or Discord ID')),
            new ActionRowBuilder().addComponents(field('reason', 'Reason', 'Why is this action being taken?', TextInputStyle.Paragraph))
        );
        return interaction.showModal(modal);
    }
    if (['play', 'queue', 'skip', 'pause', 'resume', 'stop'].includes(interaction.commandName)) return handleMusicSlash(interaction);
    if (interaction.commandName === 'dashboard') {
        if (!isStaff(interaction.member)) return interaction.reply({ content: 'This private command is staff-only.', ephemeral: true });
        return interaction.reply({ embeds: [staffDashboard(interaction.guild)], ephemeral: true });
    }
    if (interaction.commandName === 'stats') {
        if (!isStaff(interaction.member)) return interaction.reply({ content: 'This private command is staff-only.', ephemeral: true });
        const records = refreshCases(readStore()).cases.filter(record => record.guildId === interaction.guildId);
        return interaction.reply({ embeds: [card('Private staff statistics', 'Only you can see this report.', COLORS.green).addFields({ name: 'Cases', value: String(records.length), inline: true }, { name: 'Active', value: String(records.filter(record => record.status === 'Active').length), inline: true }, { name: 'Open tickets', value: String(interaction.guild.channels.cache.filter(channel => channel.topic?.startsWith('ticket-owner:')).size), inline: true })], ephemeral: true });
    }
}

async function handleMusicSlash(interaction) {
    const command = interaction.commandName;
    if (command === 'play') {
        const voiceChannel = interaction.member.voice.channel;
        if (!voiceChannel) return interaction.reply({ content: 'Join a voice channel first.', ephemeral: true });
        await interaction.deferReply();
        try {
            const query = normalizeMusicQuery(interaction.options.getString('query', true));
            const context = {
                member: interaction.member,
                guild: interaction.guild,
                guildId: interaction.guildId,
                channel: interaction.channel,
                author: interaction.user,
                reply: payload => interaction.editReply(payload)
            };
            return playMusic(context, query);
        } catch (error) {
            console.error('[music] slash play failed:', error.stack || error.message);
            return interaction.editReply('I could not find or play that song. Try a YouTube URL or a plain song title.');
        }
    }

    const queue = musicQueues.get(interaction.guildId);
    if (!queue) return interaction.reply({ content: 'There is no active music queue.', ephemeral: true });
    try {
        if (command === 'queue') {
            const current = queue.current ? `Now playing: **${queue.current.title}**` : 'Nothing is currently playing.';
            const upcoming = queue.items.slice(0, 10).map((track, index) => `${index + 1}. **${track.title}**`).join('\n') || 'No upcoming tracks.';
            return interaction.reply({ embeds: [card('Music queue', `${current}\n\n${upcoming}`, COLORS.cyan)] });
        }
        if (command === 'skip') {
            queue.extractor?.kill();
            queue.ffmpeg?.kill();
            queue.player.stop();
            return interaction.reply('Skipped the current track.');
        }
        if (command === 'pause') {
            queue.player.pause();
            return interaction.reply('Music paused.');
        }
        if (command === 'resume') {
            queue.player.unpause();
            return interaction.reply('Music resumed.');
        }
        queue.items = [];
        queue.extractor?.kill();
        queue.ffmpeg?.kill();
        queue.player.stop();
        queue.connection?.destroy();
        musicQueues.delete(interaction.guildId);
        return interaction.reply('Music stopped and I left the voice channel.');
    } catch (error) {
        console.error('[music] slash control failed:', error.message);
        return interaction.reply({ content: 'That music control could not be completed.', ephemeral: true });
    }
}

function normalizeMusicQuery(query) {
    try {
        const url = new URL(query);
        if (url.hostname.includes('youtube.com') && url.pathname === '/watch' && url.searchParams.has('v')) {
            return `https://www.youtube.com/watch?v=${url.searchParams.get('v')}`;
        }
        if (url.hostname === 'youtu.be') {
            return `https://www.youtube.com/watch?v=${url.pathname.slice(1)}`;
        }
    } catch {
        // Treat non-URL input as a song search.
    }
    return query;
}

process.on('SIGINT', () => client.destroy());
process.on('SIGTERM', () => client.destroy());
process.on('unhandledRejection', error => console.error('[unhandled rejection]', error));
process.on('uncaughtException', error => console.error('[uncaught exception]', error));

const token = process.env.DISCORD_TOKEN || process.env.BOT_TOKEN;
if (!token) {
    console.error('Missing DISCORD_TOKEN or BOT_TOKEN. Add it to Railway Variables.');
    process.exit(1);
}

client.login(token).catch(error => {
    console.error('[login] failed:', error.message);
    process.exitCode = 1;
});
