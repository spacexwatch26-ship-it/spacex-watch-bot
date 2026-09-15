require('dotenv').config();

const fs = require('fs');
const path = require('path');
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

const PREFIX = process.env.COMMAND_PREFIX || '-';
const STAFF_ROLE_ID = '1549523456478023810';
const DATA_FILE = path.join(__dirname, 'punishments.json');
const BRAND = 'SPACE X WATCH';
const COLORS = { blue: 0x1d4ed8, cyan: 0x06b6d4, green: 0x16a34a, amber: 0xf59e0b, red: 0xdc2626, ink: 0x111827 };
const startedAt = Date.now();
const polls = new Map();
const pendingModeration = new Map();

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

const slashCommands = [
    new SlashCommandBuilder().setName('help').setDescription('Open the private command guide.'),
    new SlashCommandBuilder().setName('ping').setDescription('Check private system status.'),
    new SlashCommandBuilder().setName('dashboard').setDescription('Open the private staff dashboard.'),
    new SlashCommandBuilder().setName('stats').setDescription('View private staff statistics.'),
    new SlashCommandBuilder().setName('userinfo').setDescription('View private member information.')
        .addUserOption(option => option.setName('user').setDescription('Member to inspect')),
    new SlashCommandBuilder().setName('serverinfo').setDescription('View private server information.'),
    new SlashCommandBuilder().setName('avatar').setDescription('View a private member avatar.')
        .addUserOption(option => option.setName('user').setDescription('Member to inspect'))
].map(command => command.toJSON());

function newStore() {
    return { version: 4, nextCase: 1, cases: [] };
}

function loadStore() {
    try {
        if (!fs.existsSync(DATA_FILE)) return newStore();
        const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        return {
            version: 4,
            nextCase: Number(data.nextCase || data.nextPunishmentId || 1),
            cases: Array.isArray(data.cases) ? data.cases : Array.isArray(data.punishments) ? data.punishments : []
        };
    } catch (error) {
        console.error('[store] read failed:', error.message);
        return newStore();
    }
}

function saveStore(store) {
    const temporary = `${DATA_FILE}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(store, null, 2));
    fs.renameSync(temporary, DATA_FILE);
}

function refreshCases(store) {
    let changed = false;
    for (const item of store.cases) {
        const status = item.expiration && new Date(item.expiration).getTime() <= Date.now() ? 'Expired' : 'Active';
        if (item.status !== status) {
            item.status = status;
            changed = true;
        }
    }
    if (changed) saveStore(store);
    return store;
}

function date(value) {
    return value ? `<t:${Math.floor(new Date(value).getTime() / 1000)}:f>` : 'Never';
}

function uptime() {
    const total = Math.floor((Date.now() - startedAt) / 1000);
    return `${Math.floor(total / 3600)}h ${Math.floor((total % 3600) / 60)}m ${total % 60}s`;
}

function embed(title, description, color = COLORS.blue) {
    return new EmbedBuilder()
        .setAuthor({ name: BRAND, iconURL: client.user?.displayAvatarURL() })
        .setTitle(title)
        .setDescription(description)
        .setColor(color)
        .setTimestamp()
        .setFooter({ text: 'Space X Watch • operations system' });
}

function isStaff(member) {
    return member?.roles?.cache?.has(STAFF_ROLE_ID) === true;
}

function can(member, permission) {
    return member?.permissions?.has(permission) === true;
}

function permission(name) {
    return `You need **${name}** permission for that.`;
}

async function memberFrom(guild, input) {
    const id = input.replace(/[<@!>]/g, '').trim();
    if (!/^\d+$/.test(id)) return null;
    return guild.members.fetch(id).catch(() => null);
}

function parseDuration(value) {
    const match = value.trim().match(/^(\d+)\s*(minute|minutes|hour|hours|day|days|week|weeks)$/i);
    if (!match) return value.trim().toLowerCase() === 'never' ? null : undefined;
    const units = { minute: 60000, minutes: 60000, hour: 3600000, hours: 3600000, day: 86400000, days: 86400000, week: 604800000, weeks: 604800000 };
    return new Date(Date.now() + Number(match[1]) * units[match[2].toLowerCase()]);
}

function durationValue(value) {
    return { '30m': 1800000, '1h': 3600000, '6h': 21600000, '1d': 86400000, '7d': 604800000, '14d': 1209600000, '28d': 2419200000 }[value];
}

function dashboard(guild) {
    const store = refreshCases(loadStore());
    const cases = store.cases.filter(item => item.guildId === guild.id);
    const tickets = guild.channels.cache.filter(channel => channel.topic?.startsWith('ticket-owner:')).size;
    return embed('Staff command center', 'A private overview of this server.', COLORS.cyan).addFields(
        { name: 'Members', value: String(guild.memberCount), inline: true },
        { name: 'Open tickets', value: String(tickets), inline: true },
        { name: 'Active cases', value: String(cases.filter(item => item.status === 'Active').length), inline: true },
        { name: 'Total cases', value: String(cases.length), inline: true },
        { name: 'Uptime', value: uptime(), inline: true },
        { name: 'Quick access', value: '`-moderate` `-ticket` `-poll` `-announce`\n`-claim` `-close` `-case <id>` `-stats`' }
    );
}

function addCase(store, details) {
    const record = {
        id: store.nextCase++,
        issuedAt: new Date().toISOString(),
        status: details.expiration && details.expiration.getTime() <= Date.now() ? 'Expired' : 'Active',
        expiration: details.expiration?.toISOString() || null,
        ...details
    };
    store.cases.push(record);
    saveStore(store);
    return record;
}

async function registerCommands() {
    const token = process.env.DISCORD_TOKEN || process.env.BOT_TOKEN;
    if (!token || !process.env.CLIENT_ID) return console.warn('[slash] CLIENT_ID or token missing; slash registration skipped.');
    const rest = new REST({ version: '10' }).setToken(token);
    const route = process.env.GUILD_ID ? Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID) : Routes.applicationCommands(process.env.CLIENT_ID);
    await rest.put(route, { body: slashCommands });
    console.log(`[slash] ${slashCommands.length} private commands registered.`);
}

client.once('ready', async readyClient => {
    console.log(`[ready] ${readyClient.user.tag} online in ${readyClient.guilds.cache.size} server(s).`);
    readyClient.user.setPresence({ activities: [{ name: `${PREFIX}help • ${readyClient.guilds.cache.size} server(s)`, type: 0 }], status: 'online' });
    saveStore(loadStore());
    await registerCommands().catch(error => console.error('[slash] registration failed:', error.message));
});

setInterval(() => refreshCases(loadStore()), 30000);

client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild || !message.content.startsWith(PREFIX)) return;
    const tokens = message.content.slice(PREFIX.length).trim().split(/\s+/);
    const command = (tokens.shift() || '').toLowerCase();
    const args = tokens.join(' ').trim();
    const staffCommands = new Set(['announce', 'moderate', 'mute', 'unmute', 'kick', 'ban', 'logs', 'poll', 'claim', 'close', 'clear', 'lock', 'unlock', 'slowmode', 'ticket', 'dashboard', 'stats', 'case']);

    try {
        if (staffCommands.has(command) && !isStaff(message.member)) return message.reply('This command is restricted to staff.');
        if (command === 'ping') return message.reply({ embeds: [embed('System check', `Gateway: **${client.ws.ping}ms**\nUptime: **${uptime()}**\nStatus: **Operational**`, COLORS.green)] });

        if (command === 'help') {
            return message.reply({ embeds: [embed('Command guide', 'Use slash commands for private replies, or keep using the server prefix commands.', COLORS.cyan).addFields(
                { name: 'Private slash commands', value: '`/help` `/ping` `/userinfo` `/serverinfo` `/avatar` `/dashboard` `/stats`' },
                { name: 'Staff prefix commands', value: '`-announce` `-moderate` `-mute` `-unmute` `-kick` `-ban`\n`-ticket` `-poll` `-claim` `-close` `-clear` `-lock` `-unlock` `-slowmode`' }
            )] });
        }

        if (command === 'announce') {
            if (!can(message.member, PermissionsBitField.Flags.ManageMessages)) return message.reply(permission('Manage Messages'));
            if (!args) return message.reply('Add announcement text after the command.');
            await message.channel.send({ embeds: [embed('Official announcement', args, COLORS.blue).setFooter({ text: `${BRAND} • issued by ${message.author.tag}` })] });
            return message.delete().catch(() => undefined);
        }

        if (command === 'dashboard') return message.reply({ embeds: [dashboard(message.guild)] });

        if (command === 'stats') {
            const records = refreshCases(loadStore()).cases.filter(item => item.guildId === message.guildId);
            const breakdown = records.reduce((out, item) => { out[item.type] = (out[item.type] || 0) + 1; return out; }, {});
            return message.reply({ embeds: [embed('Live staff statistics', 'Current server activity.', COLORS.green).addFields(
                { name: 'Cases', value: String(records.length), inline: true },
                { name: 'Active', value: String(records.filter(item => item.status === 'Active').length), inline: true },
                { name: 'Tickets', value: String(message.guild.channels.cache.filter(channel => channel.topic?.startsWith('ticket-owner:')).size), inline: true },
                { name: 'Action mix', value: Object.entries(breakdown).map(([type, count]) => `**${type}:** ${count}`).join('\n') || 'No records yet.' }
            )] });
        }

        if (command === 'case') {
            const id = Number(args.replace(/^#/, ''));
            const record = refreshCases(loadStore()).cases.find(item => item.guildId === message.guildId && item.id === id);
            if (!record) return message.reply('That case was not found.');
            return message.reply({ embeds: [embed(`Case #${String(record.id).padStart(4, '0')}`, `Record for <@${record.targetId}>.`, COLORS.amber).addFields(
                { name: 'Action', value: record.type, inline: true }, { name: 'Status', value: record.status, inline: true },
                { name: 'Issuer', value: `<@${record.issuerId}>`, inline: true }, { name: 'Issued', value: date(record.issuedAt), inline: true },
                { name: 'Expires', value: date(record.expiration), inline: true }, { name: 'Reason', value: record.reason }
            )] });
        }

        if (command === 'userinfo' || command === 'avatar') {
            const target = args ? await memberFrom(message.guild, args) : message.member;
            if (!target) return message.reply('Provide a valid member mention or ID.');
            if (command === 'avatar') return message.reply({ embeds: [embed(`${target.user.tag} • avatar`, `[Open full size](${target.user.displayAvatarURL({ size: 1024 })})`).setImage(target.user.displayAvatarURL({ size: 1024 }))] });
            return message.reply({ embeds: [embed(`User information • ${target.user.tag}`, `Details for <@${target.id}>.`).setThumbnail(target.user.displayAvatarURL()).addFields(
                { name: 'User ID', value: target.id, inline: true }, { name: 'Joined', value: date(target.joinedAt), inline: true }, { name: 'Created', value: date(target.user.createdAt), inline: true }, { name: 'Highest role', value: target.roles.highest.toString(), inline: true }
            )] });
        }

        if (command === 'serverinfo') return message.reply({ embeds: [embed(`Server information • ${message.guild.name}`, 'Current server details.').addFields(
            { name: 'Owner', value: `<@${message.guild.ownerId}>`, inline: true }, { name: 'Members', value: String(message.guild.memberCount), inline: true },
            { name: 'Channels', value: String(message.guild.channels.cache.size), inline: true }, { name: 'Created', value: date(message.guild.createdAt), inline: true }
        )] });

        if (['mute', 'unmute', 'kick', 'ban'].includes(command)) {
            if (!can(message.member, PermissionsBitField.Flags.ModerateMembers) && command === 'mute') return message.reply(permission('Moderate Members'));
            if (command === 'kick' && !can(message.member, PermissionsBitField.Flags.KickMembers)) return message.reply(permission('Kick Members'));
            if (command === 'ban' && !can(message.member, PermissionsBitField.Flags.BanMembers)) return message.reply(permission('Ban Members'));
            if (command === 'unmute' && !can(message.member, PermissionsBitField.Flags.ModerateMembers)) return message.reply(permission('Moderate Members'));

            const parts = args.split(/\s+/);
            const target = await memberFrom(message.guild, parts.shift() || '');
            if (!target || target.id === message.author.id || target.id === message.guild.ownerId || message.member.roles.highest.position <= target.roles.highest.position) {
                return message.reply('Provide a valid lower-ranked member. You cannot moderate yourself, the owner, or an equal/higher role.');
            }
            const durationInput = command === 'mute' ? parts.shift() : null;
            const reason = parts.join(' ').trim() || 'No reason provided';
            try {
                if (command === 'mute') {
                    const expiration = parseDuration(durationInput || '');
                    if (!expiration || expiration === undefined || expiration.getTime() <= Date.now()) return message.reply(`Usage: ${PREFIX}mute @user 30 minutes reason`);
                    const duration = expiration.getTime() - Date.now();
                    if (duration > 28 * 86400000) return message.reply('Discord timeouts cannot exceed 28 days.');
                    await target.timeout(duration, reason);
                    const record = addCase(loadStore(), { guildId: message.guildId, targetId: target.id, targetTag: target.user.tag, issuerId: message.author.id, issuerTag: message.author.tag, type: 'timeout', reason, expiration });
                    return message.reply({ embeds: [embed('Member muted', `<@${target.id}> is timed out until ${date(record.expiration)}.`, COLORS.amber).addFields({ name: 'Reason', value: reason }, { name: 'Case', value: `#${String(record.id).padStart(4, '0')}` })] });
                }
                if (command === 'unmute') {
                    await target.timeout(null, reason);
                    return message.reply({ embeds: [embed('Member unmuted', `<@${target.id}> can speak again.`, COLORS.green)] });
                }
                if (command === 'kick') {
                    await target.kick(reason);
                    const record = addCase(loadStore(), { guildId: message.guildId, targetId: target.id, targetTag: target.user.tag, issuerId: message.author.id, issuerTag: message.author.tag, type: 'kick', reason, expiration: null });
                    return message.reply({ embeds: [embed('Member kicked', `**${target.user.tag}** was removed from the server.`, COLORS.red).addFields({ name: 'Reason', value: reason }, { name: 'Case', value: `#${String(record.id).padStart(4, '0')}` })] });
                }
                await target.ban({ reason });
                const record = addCase(loadStore(), { guildId: message.guildId, targetId: target.id, targetTag: target.user.tag, issuerId: message.author.id, issuerTag: message.author.tag, type: 'ban', reason, expiration: null });
                return message.reply({ embeds: [embed('Member banned', `**${target.user.tag}** was banned from the server.`, COLORS.red).addFields({ name: 'Reason', value: reason }, { name: 'Case', value: `#${String(record.id).padStart(4, '0')}` })] });
            } catch (error) {
                console.error('[direct moderation]', error);
                return message.reply('That action failed. Check my role position and Discord permissions.');
            }
        }

        if (command === 'clear') {
            if (!can(message.member, PermissionsBitField.Flags.ManageMessages)) return message.reply(permission('Manage Messages'));
            const amount = Number(args);
            if (!Number.isInteger(amount) || amount < 1 || amount > 100) return message.reply(`Usage: ${PREFIX}clear 1-100`);
            const deleted = await message.channel.bulkDelete(amount, true);
            const notice = await message.channel.send(`Deleted **${deleted.size}** message(s).`);
            return setTimeout(() => notice.delete().catch(() => undefined), 3000);
        }

        if (command === 'lock' || command === 'unlock') {
            if (!can(message.member, PermissionsBitField.Flags.ManageChannels)) return message.reply(permission('Manage Channels'));
            await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: command === 'unlock' });
            return message.reply({ embeds: [embed(command === 'lock' ? 'Channel locked' : 'Channel unlocked', `${message.channel} is now ${command === 'lock' ? 'staff-only' : 'open to members'}.`, COLORS.green)] });
        }

        if (command === 'slowmode') {
            if (!can(message.member, PermissionsBitField.Flags.ManageChannels)) return message.reply(permission('Manage Channels'));
            const seconds = Number(args);
            if (!Number.isInteger(seconds) || seconds < 0 || seconds > 21600) return message.reply(`Usage: ${PREFIX}slowmode 0-21600`);
            await message.channel.setRateLimitPerUser(seconds);
            return message.reply(`Slowmode set to **${seconds} seconds**.`);
        }

        if (command === 'ticket') {
            const button = new ButtonBuilder().setCustomId('ticket:create').setLabel('Open private support ticket').setEmoji('🎫').setStyle(ButtonStyle.Primary);
            const panel = embed('SPACE X WATCH • SUPPORT DESK', 'Need a hand? Open a private support room with the staff team.', COLORS.blue)
                .addFields(
                    { name: '01 • Open', value: 'Click the button below. You receive one private channel.' },
                    { name: '02 • Explain', value: 'Tell staff what happened and include useful details.' },
                    { name: '03 • Resolve', value: 'Close the room when your request is complete.' }
                ).setFooter({ text: 'Support desk • private channels • staff monitored' });
            return message.channel.send({ embeds: [panel], components: [new ActionRowBuilder().addComponents(button)] });
        }

        if (command === 'poll') {
            const parts = args.split('|').map(value => value.trim()).filter(Boolean);
            const question = parts.shift();
            if (!question || parts.length < 2 || parts.length > 5) return message.reply(`Usage: ${PREFIX}poll Question | Option 1 | Option 2`);
            const id = `${message.id}-${Date.now()}`;
            polls.set(id, { question, options: parts, votes: new Map() });
            const row = new ActionRowBuilder().addComponents(parts.map((option, index) => new ButtonBuilder().setCustomId(`poll:${id}:${index}`).setLabel(option.slice(0, 80)).setStyle(ButtonStyle.Secondary)));
            return message.channel.send({ embeds: [embed('Staff poll', question, COLORS.cyan).setFooter({ text: 'One vote per member • live results' })], components: [row] });
        }

        if (command === 'claim') {
            const topic = (message.channel.topic || '').replace(/\s*\|\s*Claimed by <@\d+>/, '').trim();
            await message.channel.setTopic(`${topic}${topic ? ' | ' : ''}Claimed by <@${message.author.id}>`);
            return message.reply({ embeds: [embed('Channel claimed', `${message.channel} is now claimed by <@${message.author.id}>.`, COLORS.green)] });
        }

        if (command === 'close') {
            await message.reply({ embeds: [embed('Channel closing', 'This channel will be removed in 5 seconds.', COLORS.amber)] });
            return setTimeout(() => message.channel.delete().catch(() => undefined), 5000);
        }

        if (command === 'logs') {
            const target = args ? await memberFrom(message.guild, args) : message.member;
            if (!target) return message.reply('Provide a valid member mention or ID.');
            const records = refreshCases(loadStore()).cases.filter(item => item.guildId === message.guildId && item.targetId === target.id).slice(-5).reverse();
            if (!records.length) return message.reply(`No moderation history found for ${target.user.tag}.`);
            return message.reply({ embeds: [embed(`Moderation log • ${target.user.tag}`, 'Five most recent cases.', COLORS.green).addFields(records.map(item => ({ name: `#${String(item.id).padStart(4, '0')} • ${item.type}`, value: `**Reason:** ${item.reason}\n**Status:** ${item.status}\n**Expires:** ${date(item.expiration)}` })))] });
        }

        if (command === 'moderate') return openModerationDM(message);
    } catch (error) {
        console.error('[command]', error);
        return message.reply('The command could not be completed. Check my permissions and try again.');
    }
});

async function openModerationDM(message) {
    if (!can(message.member, PermissionsBitField.Flags.ModerateMembers)) return message.reply(permission('Moderate Members'));
    const button = new ButtonBuilder().setCustomId(`moderate:${message.guildId}:${message.author.id}`).setLabel('Open private moderation form').setEmoji('⚖️').setStyle(ButtonStyle.Primary);
    const panel = embed('STAFF MODERATION DESK', 'This panel is private. Choose a member and reason, then select the action and duration from menus.', COLORS.amber)
        .addFields({ name: 'Available actions', value: 'Warning • Advisory • Mute / Timeout • Kick • Ban' }, { name: 'Safety', value: 'Role hierarchy and Discord permission checks are applied before execution.' });
    try {
        await message.author.send({ embeds: [panel], components: [new ActionRowBuilder().addComponents(button)] });
        await message.reply('Your private moderation desk was sent to your DMs.');
        return message.delete().catch(() => undefined);
    } catch {
        return message.reply('I could not DM you. Enable DMs from server members and run the command again.');
    }
}

client.on('interactionCreate', async interaction => {
    try {
        if (interaction.isChatInputCommand()) return handleSlash(interaction);

        if (interaction.isButton() && interaction.customId === 'ticket:create') {
            const existing = interaction.guild.channels.cache.find(channel => channel.type === ChannelType.GuildText && channel.topic === `ticket-owner:${interaction.user.id}`);
            if (existing) return interaction.reply({ content: `You already have an open ticket: ${existing}`, ephemeral: true });
            const safeName = interaction.user.username.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 60) || interaction.user.id;
            const channel = await interaction.guild.channels.create({
                name: `ticket-${safeName}`, type: ChannelType.GuildText, parent: interaction.channel.parentId, topic: `ticket-owner:${interaction.user.id}`,
                permissionOverwrites: [
                    { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                    { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
                    { id: STAFF_ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.ManageChannels] },
                    { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.ManageChannels] }
                ]
            });
            const close = new ButtonBuilder().setCustomId('ticket:close').setLabel('Close ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger);
            await channel.send({ content: `<@${interaction.user.id}> <@&${STAFF_ROLE_ID}>`, embeds: [embed('PRIVATE SUPPORT ROOM', `Welcome <@${interaction.user.id}>.\n\nDescribe your request clearly and staff will respond here.`, COLORS.green).addFields({ name: 'Owner', value: `<@${interaction.user.id}>`, inline: true }, { name: 'Status', value: 'Open', inline: true })], components: [new ActionRowBuilder().addComponents(close)] });
            return interaction.reply({ content: `Your private ticket is ready: ${channel}`, ephemeral: true });
        }

        if (interaction.isButton() && interaction.customId === 'ticket:close') {
            if (!isStaff(interaction.member) && interaction.channel.topic !== `ticket-owner:${interaction.user.id}`) return interaction.reply({ content: 'Only staff or the ticket owner can close this ticket.', ephemeral: true });
            await interaction.reply('This ticket will close in 5 seconds.');
            return setTimeout(() => interaction.channel.delete().catch(() => undefined), 5000);
        }

        if (interaction.isButton() && interaction.customId.startsWith('moderate:')) return showModerationModal(interaction);
        if (interaction.isModalSubmit() && interaction.customId.startsWith('moderation:')) return receiveModerationForm(interaction);
        if (interaction.isStringSelectMenu() && interaction.customId.startsWith('moderation-')) return chooseModerationOption(interaction);
        if (interaction.isButton() && interaction.customId.startsWith('moderation-confirm:')) return confirmModeration(interaction);

        if (interaction.isButton() && interaction.customId.startsWith('poll:')) {
            const [, id, index] = interaction.customId.split(':');
            const poll = polls.get(id);
            if (!poll || !poll.options[Number(index)]) return interaction.reply({ content: 'This poll is no longer active.', ephemeral: true });
            poll.votes.set(interaction.user.id, Number(index));
            const counts = poll.options.map((_, optionIndex) => [...poll.votes.values()].filter(value => value === optionIndex).length);
            const row = new ActionRowBuilder().addComponents(poll.options.map((option, optionIndex) => new ButtonBuilder().setCustomId(`poll:${id}:${optionIndex}`).setLabel(`${option.slice(0, 65)} (${counts[optionIndex]})`).setStyle(ButtonStyle.Secondary)));
            return interaction.update({ embeds: [embed('Staff poll', poll.question, COLORS.cyan).setFooter({ text: `${poll.votes.size} vote(s) • one vote per member` })], components: [row] });
        }
    } catch (error) {
        console.error('[interaction]', error);
        const response = { content: 'The interaction could not be completed. Check bot permissions.', ephemeral: true };
        if (interaction.replied || interaction.deferred) return interaction.followUp(response);
        return interaction.reply(response);
    }
});

async function handleSlash(interaction) {
    const staffOnly = new Set(['dashboard', 'stats']);
    if (staffOnly.has(interaction.commandName) && !isStaff(interaction.member)) return interaction.reply({ content: 'This private command is staff-only.', ephemeral: true });
    if (interaction.commandName === 'ping') return interaction.reply({ embeds: [embed('System check', `Gateway: **${client.ws.ping}ms**\nUptime: **${uptime()}**\nStatus: **Operational**`, COLORS.green)], ephemeral: true });
    if (interaction.commandName === 'help') return interaction.reply({ embeds: [embed('Private command guide', 'Only you can see this response.', COLORS.cyan).addFields({ name: 'Private', value: '`/help` `/ping` `/userinfo` `/serverinfo` `/avatar`' }, { name: 'Staff', value: '`/dashboard` `/stats`' }, { name: 'Prefix workflows', value: '`-announce` `-moderate` `-ticket` `-poll` `-claim` `-close`' })], ephemeral: true });
    if (interaction.commandName === 'dashboard') return interaction.reply({ embeds: [dashboard(interaction.guild)], ephemeral: true });
    if (interaction.commandName === 'stats') {
        const records = refreshCases(loadStore()).cases.filter(item => item.guildId === interaction.guildId);
        return interaction.reply({ embeds: [embed('Private staff statistics', 'Only you can see this report.', COLORS.green).addFields({ name: 'Cases', value: String(records.length), inline: true }, { name: 'Active', value: String(records.filter(item => item.status === 'Active').length), inline: true }, { name: 'Tickets', value: String(interaction.guild.channels.cache.filter(channel => channel.topic?.startsWith('ticket-owner:')).size), inline: true })], ephemeral: true });
    }
    if (interaction.commandName === 'serverinfo') return interaction.reply({ embeds: [embed(`Server information • ${interaction.guild.name}`, 'Only you can see this response.').addFields({ name: 'Owner', value: `<@${interaction.guild.ownerId}>`, inline: true }, { name: 'Members', value: String(interaction.guild.memberCount), inline: true }, { name: 'Channels', value: String(interaction.guild.channels.cache.size), inline: true }, { name: 'Created', value: date(interaction.guild.createdAt), inline: true })], ephemeral: true });
    if (interaction.commandName === 'userinfo' || interaction.commandName === 'avatar') {
        const user = interaction.options.getUser('user') || interaction.user;
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);
        if (!member) return interaction.reply({ content: 'That user is not in this server.', ephemeral: true });
        if (interaction.commandName === 'avatar') return interaction.reply({ embeds: [embed(`${user.tag} • avatar`, `[Open full size](${user.displayAvatarURL({ size: 1024 })})`).setImage(user.displayAvatarURL({ size: 1024 }))], ephemeral: true });
        return interaction.reply({ embeds: [embed(`User information • ${user.tag}`, 'Only you can see this response.').setThumbnail(user.displayAvatarURL()).addFields({ name: 'User ID', value: user.id, inline: true }, { name: 'Joined', value: date(member.joinedAt), inline: true }, { name: 'Created', value: date(user.createdAt), inline: true }, { name: 'Highest role', value: member.roles.highest.toString(), inline: true })], ephemeral: true });
    }
}

async function showModerationModal(interaction) {
    const [, guildId, staffId] = interaction.customId.split(':');
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    const staff = guild ? await guild.members.fetch(interaction.user.id).catch(() => null) : null;
    if (staffId !== interaction.user.id || !guild || !staff || !isStaff(staff) || !can(staff, PermissionsBitField.Flags.ModerateMembers)) return interaction.reply({ content: 'This private moderation form is no longer available.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId(`moderation:${guildId}:${interaction.user.id}`).setTitle('Staff moderation desk');
    const input = (id, label, placeholder, style = TextInputStyle.Short) => new TextInputBuilder().setCustomId(id).setLabel(label).setPlaceholder(placeholder).setStyle(style).setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(input('target', 'Target user', '@User or Discord ID')), new ActionRowBuilder().addComponents(input('reason', 'Reason', 'Why is this action being taken?', TextInputStyle.Paragraph)));
    return interaction.showModal(modal);
}

async function receiveModerationForm(interaction) {
    const [, guildId, staffId] = interaction.customId.split(':');
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    const staff = guild ? await guild.members.fetch(interaction.user.id).catch(() => null) : null;
    if (staffId !== interaction.user.id || !guild || !staff || !isStaff(staff)) return interaction.reply({ content: 'This moderation form is restricted to staff.', ephemeral: true });
    const member = await memberFrom(guild, interaction.fields.getTextInputValue('target'));
    if (!member) return interaction.reply({ content: 'I could not find that member.', ephemeral: true });
    if (member.id === interaction.user.id || member.id === guild.ownerId || staff.roles.highest.position <= member.roles.highest.position) return interaction.reply({ content: 'That member cannot be targeted by your role.', ephemeral: true });
    pendingModeration.set(interaction.user.id, { guildId, targetId: member.id, reason: interaction.fields.getTextInputValue('reason').trim(), action: null, duration: null });
    const action = new StringSelectMenuBuilder().setCustomId(`moderation-action:${interaction.user.id}`).setPlaceholder('Choose an action').addOptions({ label: 'Warning', value: 'warning' }, { label: 'Advisory', value: 'advisory' }, { label: 'Mute / Timeout', value: 'timeout' }, { label: 'Kick', value: 'kick' }, { label: 'Ban', value: 'ban' });
    const duration = new StringSelectMenuBuilder().setCustomId(`moderation-duration:${interaction.user.id}`).setPlaceholder('Choose a duration').addOptions({ label: '30 minutes', value: '30m' }, { label: '1 hour', value: '1h' }, { label: '6 hours', value: '6h' }, { label: '1 day', value: '1d' }, { label: '7 days', value: '7d' }, { label: '14 days', value: '14d' }, { label: '28 days', value: '28d' }, { label: 'Permanent / never', value: 'never' });
    const confirm = new ButtonBuilder().setCustomId(`moderation-confirm:${interaction.user.id}`).setLabel('Apply action').setEmoji('⚡').setStyle(ButtonStyle.Danger);
    return interaction.reply({ embeds: [embed('Choose action and duration', `Target: <@${member.id}>\nReason: ${pendingModeration.get(interaction.user.id).reason}`, COLORS.amber)], components: [new ActionRowBuilder().addComponents(action), new ActionRowBuilder().addComponents(duration), new ActionRowBuilder().addComponents(confirm)], ephemeral: true });
}

async function chooseModerationOption(interaction) {
    const pending = pendingModeration.get(interaction.user.id);
    const guild = pending ? await client.guilds.fetch(pending.guildId).catch(() => null) : null;
    const staff = guild ? await guild.members.fetch(interaction.user.id).catch(() => null) : null;
    if (!pending || !staff || !isStaff(staff)) return interaction.reply({ content: 'This moderation form expired.', ephemeral: true });
    if (interaction.customId.startsWith('moderation-action:')) pending.action = interaction.values[0];
    else pending.duration = interaction.values[0];
    return interaction.deferUpdate();
}

async function confirmModeration(interaction) {
    const pending = pendingModeration.get(interaction.user.id);
    const guild = pending ? await client.guilds.fetch(pending.guildId).catch(() => null) : null;
    const staff = guild ? await guild.members.fetch(interaction.user.id).catch(() => null) : null;
    if (!pending || !guild || !staff || !isStaff(staff)) return interaction.reply({ content: 'This moderation form expired.', ephemeral: true });
    if (!pending.action || !pending.duration) return interaction.reply({ content: 'Choose both an action and duration first.', ephemeral: true });
    const member = await memberFrom(guild, pending.targetId);
    if (!member) return interaction.reply({ content: 'That member is no longer available.', ephemeral: true });
    const durationMs = durationValue(pending.duration);
    const expiration = pending.duration === 'never' ? null : new Date(Date.now() + durationMs);
    try {
        if (pending.action === 'timeout') {
            if (!durationMs) return interaction.reply({ content: 'A timeout requires a duration other than Permanent / never.', ephemeral: true });
            await member.timeout(durationMs, pending.reason);
        } else if (pending.action === 'kick') await member.kick(pending.reason);
        else if (pending.action === 'ban') await member.ban({ reason: pending.reason });
    } catch (error) {
        console.error('[moderation]', error);
        return interaction.reply({ content: 'The action failed. Check bot permissions and role position.', ephemeral: true });
    }
    const store = loadStore();
    const record = { id: store.nextCase++, guildId: pending.guildId, targetId: member.id, targetTag: member.user.tag, issuerId: interaction.user.id, issuerTag: interaction.user.tag, type: pending.action, reason: pending.reason, issuedAt: new Date().toISOString(), expiration: expiration?.toISOString() || null, status: expiration && expiration <= new Date() ? 'Expired' : 'Active' };
    store.cases.push(record);
    saveStore(store);
    pendingModeration.delete(interaction.user.id);
    return interaction.update({ embeds: [embed('Action recorded', `Successfully recorded **${pending.action}** for <@${member.id}>.`, COLORS.green).addFields({ name: 'Duration', value: pending.duration === 'never' ? 'Permanent' : date(record.expiration) }, { name: 'Case', value: `#${String(record.id).padStart(4, '0')}` })], components: [] });
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
