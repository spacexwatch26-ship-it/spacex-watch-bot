require('dotenv').config();

const fs = require('fs');
const path = require('path');
const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    Client,
    ChannelType,
    EmbedBuilder,
    GatewayIntentBits,
    ModalBuilder,
    PermissionsBitField,
    StringSelectMenuBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');

const PREFIX = process.env.COMMAND_PREFIX || '-';
const STAFF_ROLE_ID = '1549523456478023810';
const DATA_FILE = path.join(__dirname, 'punishments.json');
const BRAND = 'SpaceX Watch';
const COLORS = { blue: 0x2563eb, green: 0x16a34a, amber: 0xd97706 };
const polls = new Map();
const pendingModeration = new Map();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

function emptyStore() {
    return { version: 1, nextId: 1, punishments: [] };
}

function loadStore() {
    try {
        if (!fs.existsSync(DATA_FILE)) return emptyStore();
        const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        return {
            version: 1,
            nextId: Number(parsed.nextId) || 1,
            punishments: Array.isArray(parsed.punishments) ? parsed.punishments : []
        };
    } catch (error) {
        console.error('[store] Could not read punishments.json:', error.message);
        return emptyStore();
    }
}

function saveStore(store) {
    const temporaryFile = `${DATA_FILE}.tmp`;
    fs.writeFileSync(temporaryFile, JSON.stringify(store, null, 2));
    fs.renameSync(temporaryFile, DATA_FILE);
}

function parseExpiration(input) {
    const value = input.trim();
    if (value.toLowerCase() === 'never') return null;

    const relative = value.match(/^(\d+)\s*(minute|minutes|hour|hours|day|days|week|weeks)$/i);
    if (relative) {
        const units = {
            minute: 60000, minutes: 60000,
            hour: 3600000, hours: 3600000,
            day: 86400000, days: 86400000,
            week: 604800000, weeks: 604800000
        };
        return new Date(Date.now() + Number(relative[1]) * units[relative[2].toLowerCase()]);
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
}

function statusFor(expiration) {
    return expiration && new Date(expiration).getTime() <= Date.now() ? 'Expired' : 'Active';
}

function refreshStatuses(store) {
    let changed = false;
    for (const record of store.punishments) {
        const nextStatus = statusFor(record.expiration);
        if (record.status !== nextStatus) {
            record.status = nextStatus;
            changed = true;
        }
    }
    if (changed) saveStore(store);
    return store;
}

function discordDate(value) {
    return value ? `<t:${Math.floor(new Date(value).getTime() / 1000)}:f>` : 'Never';
}

function brandedEmbed(title, description, color = COLORS.blue) {
    return new EmbedBuilder()
        .setAuthor({ name: BRAND, iconURL: client.user?.displayAvatarURL() })
        .setTitle(title)
        .setDescription(description)
        .setColor(color)
        .setTimestamp()
        .setFooter({ text: `${BRAND} • moderation desk` });
}

async function findMember(guild, value) {
    const id = value.replace(/[<@!>]/g, '').trim();
    if (!/^\d+$/.test(id)) return null;
    try {
        return await guild.members.fetch(id);
    } catch {
        return null;
    }
}

function hasPermission(member, permission) {
    return member?.permissions?.has(permission);
}

function isStaff(member) {
    return member?.roles?.cache?.has(STAFF_ROLE_ID) === true;
}

function permissionMessage(permissionName) {
    return `You need **${permissionName}** permission to use this command.`;
}

client.once('ready', readyClient => {
    console.log(`[ready] ${readyClient.user.tag} is online in ${readyClient.guilds.cache.size} server(s).`);
    readyClient.user.setPresence({
        activities: [{ name: `${PREFIX}help`, type: 0 }],
        status: 'online'
    });
    saveStore(loadStore());
});

client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild || !message.content.startsWith(PREFIX)) return;

    const parts = message.content.slice(PREFIX.length).trim().split(/\s+/);
    const command = (parts.shift() || '').toLowerCase();
    const argument = parts.join(' ').trim();

    try {
        const staffCommands = new Set(['announce', 'moderate', 'logs', 'poll', 'claim', 'close', 'clear', 'lock', 'unlock', 'slowmode', 'ticket']);
        if (staffCommands.has(command) && !isStaff(message.member)) {
            return message.reply('This command is restricted to staff.');
        }

        if (command === 'ping') {
            return message.reply(`Pong. Gateway latency: **${client.ws.ping}ms**`);
        }

        if (command === 'userinfo') {
            const target = argument ? await findMember(message.guild, argument) : message.member;
            if (!target) return message.reply('Provide a valid member mention or Discord ID.');
            const embed = brandedEmbed(`User information • ${target.user.tag}`, `Details for <@${target.id}>.`)
                .setThumbnail(target.user.displayAvatarURL({ size: 256 }))
                .addFields(
                    { name: 'User ID', value: target.id, inline: true },
                    { name: 'Joined server', value: discordDate(target.joinedAt), inline: true },
                    { name: 'Account created', value: discordDate(target.user.createdAt), inline: true },
                    { name: 'Highest role', value: target.roles.highest.toString(), inline: true }
                );
            return message.reply({ embeds: [embed] });
        }

        if (command === 'serverinfo') {
            const embed = brandedEmbed(`Server information • ${message.guild.name}`, 'Current server details.')
                .addFields(
                    { name: 'Owner', value: `<@${message.guild.ownerId}>`, inline: true },
                    { name: 'Members', value: String(message.guild.memberCount), inline: true },
                    { name: 'Channels', value: String(message.guild.channels.cache.size), inline: true },
                    { name: 'Created', value: discordDate(message.guild.createdAt), inline: true }
                );
            const icon = message.guild.iconURL({ size: 256 });
            if (icon) embed.setThumbnail(icon);
            return message.reply({ embeds: [embed] });
        }

        if (command === 'avatar') {
            const target = argument ? await findMember(message.guild, argument) : message.member;
            if (!target) return message.reply('Provide a valid member mention or Discord ID.');
            const avatar = target.user.displayAvatarURL({ size: 1024, extension: 'png' });
            const embed = brandedEmbed(`${target.user.tag}'s avatar`, `[Open full size](${avatar})`).setImage(avatar);
            return message.reply({ embeds: [embed] });
        }

        if (command === 'help') {
            const embed = brandedEmbed('Command center', 'A clean, focused toolkit for staff and server updates.')
                .addFields(
                    { name: `${PREFIX}announce <message>`, value: 'Publish an official announcement. Requires Manage Messages.' },
                    { name: `${PREFIX}moderate`, value: 'Open the guided moderation form. Requires Moderate Members.' },
                    { name: `${PREFIX}logs [@user|id]`, value: 'View the five most recent records for a member.' },
                    { name: `${PREFIX}poll <question> | <option> | <option>`, value: 'Create a staff poll with up to five choices.' },
                    { name: `${PREFIX}claim`, value: 'Claim the current channel for staff work.' },
                    { name: `${PREFIX}close`, value: 'Close and remove the current channel.' },
                    { name: `${PREFIX}clear <1-100>`, value: 'Delete recent messages in this channel.' },
                    { name: `${PREFIX}lock` , value: 'Lock this channel for members.' },
                    { name: `${PREFIX}unlock`, value: 'Unlock this channel for members.' },
                    { name: `${PREFIX}slowmode <seconds>`, value: 'Set channel slowmode from 0 to 21600 seconds.' },
                    { name: `${PREFIX}ticket`, value: 'Post a public panel that anyone can use to open a private staff ticket.' },
                    { name: `${PREFIX}userinfo [@user]`, value: 'Show member details.' },
                    { name: `${PREFIX}serverinfo`, value: 'Show server details.' },
                    { name: `${PREFIX}avatar [@user]`, value: 'Show a member avatar.' },
                    { name: `${PREFIX}ping`, value: 'Check bot and gateway health.' }
                );
            return message.reply({ embeds: [embed] });
        }

        if (command === 'announce') {
            if (!hasPermission(message.member, PermissionsBitField.Flags.ManageMessages)) {
                return message.reply(permissionMessage('Manage Messages'));
            }
            if (!argument) return message.reply('Add the announcement text after the command.');
            const embed = brandedEmbed('Official announcement', argument, COLORS.blue)
                .setFooter({ text: `${BRAND} • issued by ${message.author.tag}` });
            await message.channel.send({ embeds: [embed] });
            return message.delete().catch(() => undefined);
        }

        if (command === 'clear') {
            if (!hasPermission(message.member, PermissionsBitField.Flags.ManageMessages)) {
                return message.reply(permissionMessage('Manage Messages'));
            }
            const amount = Number(argument);
            if (!Number.isInteger(amount) || amount < 1 || amount > 100) {
                return message.reply(`Usage: \`${PREFIX}clear 1-100\``);
            }
            const deleted = await message.channel.bulkDelete(amount, true);
            const confirmation = await message.channel.send(`Deleted **${deleted.size}** message(s).`);
            return setTimeout(() => confirmation.delete().catch(() => undefined), 3000);
        }

        if (command === 'lock' || command === 'unlock') {
            if (!hasPermission(message.member, PermissionsBitField.Flags.ManageChannels)) {
                return message.reply(permissionMessage('Manage Channels'));
            }
            const everyone = message.guild.roles.everyone;
            await message.channel.permissionOverwrites.edit(everyone, {
                SendMessages: command === 'unlock'
            });
            return message.reply({
                embeds: [brandedEmbed(command === 'lock' ? 'Channel locked' : 'Channel unlocked', `${message.channel} is now ${command === 'lock' ? 'staff-only' : 'open to members'}.`, COLORS.green)]
            });
        }

        if (command === 'slowmode') {
            if (!hasPermission(message.member, PermissionsBitField.Flags.ManageChannels)) {
                return message.reply(permissionMessage('Manage Channels'));
            }
            const seconds = Number(argument);
            if (!Number.isInteger(seconds) || seconds < 0 || seconds > 21600) {
                return message.reply(`Usage: \`${PREFIX}slowmode 0-21600\``);
            }
            await message.channel.setRateLimitPerUser(seconds);
            return message.reply(`Slowmode set to **${seconds} seconds**.`);
        }

        if (command === 'ticket') {
            const button = new ButtonBuilder()
                .setCustomId('ticket:create')
                .setLabel('Open a ticket')
                .setStyle(ButtonStyle.Primary);
            const embed = brandedEmbed('Need help?', 'Click the button below to open a private ticket with the staff team.', COLORS.blue)
                .addFields({ name: 'What happens next?', value: 'A private channel is created for you and the staff team. Please explain what you need help with.' });
            return message.channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(button)] });
        }

        if (command === 'moderate') {
            if (!hasPermission(message.member, PermissionsBitField.Flags.ModerateMembers)) {
                return message.reply(permissionMessage('Moderate Members'));
            }
            const button = new ButtonBuilder()
                .setCustomId(`moderate:${message.guildId}:${message.author.id}`)
                .setLabel('Open moderation form')
                .setStyle(ButtonStyle.Primary);
            const embed = brandedEmbed('Moderation desk', 'Record a warning, advisory, timeout, kick, or ban with one guided form.', COLORS.amber)
                .addFields(
                    { name: 'Required', value: 'Target, action, reason, and expiration' },
                    { name: 'Expiration examples', value: '`Never` • `30 minutes` • `7 days` • `09/30/2026`' }
                );
            try {
                await message.author.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(button)] });
            } catch {
                return message.reply('I could not DM you the private moderation panel. Please enable DMs from server members.');
            }
            await message.reply('I sent the private moderation panel to your DMs.');
            return message.delete().catch(() => undefined);
        }

        if (command === 'logs') {
            const target = argument ? await findMember(message.guild, argument) : message.member;
            if (!target) return message.reply('Provide a valid member mention or Discord ID.');
            const records = refreshStatuses(loadStore()).punishments
                .filter(record => record.guildId === message.guildId && record.targetId === target.id)
                .sort((a, b) => new Date(b.issuedAt) - new Date(a.issuedAt))
                .slice(0, 5);
            if (!records.length) return message.reply(`No moderation history found for ${target.user.tag}.`);
            const embed = brandedEmbed(`Moderation log • ${target.user.tag}`, `Showing ${records.length} recent record(s).`, COLORS.green);
            for (const record of records) {
                embed.addFields({
                    name: `#${String(record.id).padStart(4, '0')} • ${record.type}`,
                    value: `**Reason:** ${record.reason}\n**Status:** ${record.status}\n**Expires:** ${discordDate(record.expiration)}`
                });
            }
            return message.reply({ embeds: [embed] });
        }

        if (command === 'poll') {
            const pollParts = argument.split('|').map(value => value.trim()).filter(Boolean);
            const question = pollParts.shift();
            if (!question || pollParts.length < 2 || pollParts.length > 5) {
                return message.reply(`Usage: \`${PREFIX}poll Question | Option 1 | Option 2\` (2-5 options).`);
            }

            const pollId = `${message.id}-${Date.now()}`;
            polls.set(pollId, { question, options: pollParts, votes: new Map() });
            const embed = brandedEmbed('Staff poll', question, COLORS.blue)
                .setFooter({ text: `${BRAND} • one vote per member` });
            const row = new ActionRowBuilder().addComponents(pollParts.map((option, index) => new ButtonBuilder()
                .setCustomId(`poll:${pollId}:${index}`)
                .setLabel(option.slice(0, 80))
                .setStyle(ButtonStyle.Secondary)));
            return message.channel.send({ embeds: [embed], components: [row] });
        }

        if (command === 'claim') {
            const topic = message.channel.topic || '';
            const cleanedTopic = topic.replace(/\s*\|\s*Claimed by <@\d+>/, '').trim();
            await message.channel.setTopic(`${cleanedTopic}${cleanedTopic ? ' | ' : ''}Claimed by <@${message.author.id}>`);
            return message.reply({ embeds: [brandedEmbed('Channel claimed', `${message.channel} is now claimed by <@${message.author.id}>.`, COLORS.green)] });
        }

        if (command === 'close') {
            await message.reply({ embeds: [brandedEmbed('Channel closing', 'This channel will be removed in 5 seconds.', COLORS.amber)] });
            return setTimeout(() => message.channel.delete().catch(() => undefined), 5000);
        }
    } catch (error) {
        console.error('[command]', error);
        return message.reply('Something went wrong while handling that command.');
    }
});

client.on('interactionCreate', async interaction => {
    try {
        if (interaction.isButton() && interaction.customId === 'ticket:create') {
            const existingTicket = interaction.guild.channels.cache.find(channel =>
                channel.type === ChannelType.GuildText && channel.topic === `ticket-owner:${interaction.user.id}`
            );
            if (existingTicket) {
                return interaction.reply({ content: `You already have an open ticket: ${existingTicket}`, ephemeral: true });
            }

            const safeName = interaction.user.username.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 60) || interaction.user.id;
            const channel = await interaction.guild.channels.create({
                name: `ticket-${safeName}`,
                type: ChannelType.GuildText,
                parent: interaction.channel.parentId,
                topic: `ticket-owner:${interaction.user.id}`,
                permissionOverwrites: [
                    { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                    { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
                    { id: STAFF_ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.ManageChannels] },
                    { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.ManageChannels] }
                ]
            });
            const closeButton = new ButtonBuilder().setCustomId('ticket:close').setLabel('Close ticket').setStyle(ButtonStyle.Danger);
            await channel.send({
                content: `<@${interaction.user.id}> <@&${STAFF_ROLE_ID}>`,
                embeds: [brandedEmbed('Ticket opened', 'Please describe your question or issue. A staff member will be with you shortly.', COLORS.green)],
                components: [new ActionRowBuilder().addComponents(closeButton)]
            });
            return interaction.reply({ content: `Your private ticket is ready: ${channel}`, ephemeral: true });
        }

        if (interaction.isButton() && interaction.customId === 'ticket:close') {
            if (!isStaff(interaction.member) && interaction.channel.topic !== `ticket-owner:${interaction.user.id}`) {
                return interaction.reply({ content: 'Only staff or the ticket owner can close this ticket.', ephemeral: true });
            }
            await interaction.reply('This ticket will close in 5 seconds.');
            return setTimeout(() => interaction.channel.delete().catch(() => undefined), 5000);
        }

        if (interaction.isStringSelectMenu() && interaction.customId.startsWith('moderation-action:')) {
            const pending = pendingModeration.get(interaction.user.id);
            const moderationGuild = pending ? await client.guilds.fetch(pending.guildId).catch(() => null) : null;
            const moderationMember = moderationGuild ? await moderationGuild.members.fetch(interaction.user.id).catch(() => null) : null;
            if (interaction.customId !== `moderation-action:${interaction.user.id}` || !isStaff(moderationMember)) {
                return interaction.reply({ content: 'This moderation menu is restricted to the staff member who opened it.', ephemeral: true });
            }
            if (!pending) return interaction.reply({ content: 'This moderation form expired. Run `-moderate` again.', ephemeral: true });
            pending.action = interaction.values[0];
            return interaction.deferUpdate();
        }

        if (interaction.isStringSelectMenu() && interaction.customId.startsWith('moderation-duration:')) {
            const pending = pendingModeration.get(interaction.user.id);
            const moderationGuild = pending ? await client.guilds.fetch(pending.guildId).catch(() => null) : null;
            const moderationMember = moderationGuild ? await moderationGuild.members.fetch(interaction.user.id).catch(() => null) : null;
            if (interaction.customId !== `moderation-duration:${interaction.user.id}` || !isStaff(moderationMember)) {
                return interaction.reply({ content: 'This moderation menu is restricted to the staff member who opened it.', ephemeral: true });
            }
            if (!pending) return interaction.reply({ content: 'This moderation form expired. Run `-moderate` again.', ephemeral: true });
            pending.duration = interaction.values[0];
            return interaction.deferUpdate();
        }

        if (interaction.isButton() && interaction.customId.startsWith('moderation-confirm:')) {
            const pending = pendingModeration.get(interaction.user.id);
            const moderationGuild = pending ? await client.guilds.fetch(pending.guildId).catch(() => null) : null;
            const moderationMember = moderationGuild ? await moderationGuild.members.fetch(interaction.user.id).catch(() => null) : null;
            if (interaction.customId !== `moderation-confirm:${interaction.user.id}` || !isStaff(moderationMember)) {
                return interaction.reply({ content: 'This moderation form is restricted to staff.', ephemeral: true });
            }
            if (!pending?.action || !pending.duration) {
                return interaction.reply({ content: 'Choose both an action and a duration first.', ephemeral: true });
            }

            const member = await findMember(moderationGuild, pending.targetId);
            if (!member) {
                pendingModeration.delete(interaction.user.id);
                return interaction.reply({ content: 'That member is no longer available.', ephemeral: true });
            }

            const durationMs = { '30m': 1800000, '1h': 3600000, '6h': 21600000, '1d': 86400000, '7d': 604800000, '14d': 1209600000, '28d': 2419200000 }[pending.duration];
            const expiration = pending.duration === 'never' ? null : new Date(Date.now() + durationMs);
            try {
                if (pending.action === 'timeout') {
                    if (!expiration) return interaction.reply({ content: 'A mute/timeout requires a duration. Choose a duration other than Permanent / never.', ephemeral: true });
                    await member.timeout(durationMs, pending.reason);
                } else if (pending.action === 'kick') {
                    await member.kick(pending.reason);
                } else if (pending.action === 'ban') {
                    await member.ban({ reason: pending.reason });
                }
            } catch (error) {
                console.error('[moderation]', error);
                return interaction.reply({ content: 'I could not complete that action. Check my permissions and role position.', ephemeral: true });
            }

            const store = loadStore();
            const record = {
                id: store.nextId++, guildId: pending.guildId, targetId: member.id,
                targetTag: member.user.tag, issuerId: interaction.user.id, issuerTag: interaction.user.tag,
                type: pending.action, reason: pending.reason, issuedAt: new Date().toISOString(),
                expiration: expiration ? expiration.toISOString() : null, status: statusFor(expiration)
            };
            store.punishments.push(record);
            saveStore(store);
            pendingModeration.delete(interaction.user.id);
            return interaction.update({
                embeds: [brandedEmbed('Action recorded', `Successfully recorded a **${pending.action}** for <@${member.id}>.`, COLORS.green)
                    .addFields(
                        { name: 'Reason', value: pending.reason },
                        { name: 'Duration', value: pending.duration === 'never' ? 'Permanent / never' : discordDate(record.expiration) },
                        { name: 'Record', value: `#${String(record.id).padStart(4, '0')}` }
                    )],
                components: []
            });
        }

        if (interaction.isButton() && interaction.customId.startsWith('poll:')) {
            const [, pollId, optionIndex] = interaction.customId.split(':');
            const poll = polls.get(pollId);
            if (!poll || !poll.options[Number(optionIndex)]) {
                return interaction.reply({ content: 'This poll is no longer active.', ephemeral: true });
            }

            poll.votes.set(interaction.user.id, Number(optionIndex));
            const counts = poll.options.map((_, index) => [...poll.votes.values()].filter(value => value === index).length);
            const embed = brandedEmbed('Staff poll', poll.question, COLORS.blue)
                .setFooter({ text: `${BRAND} • ${poll.votes.size} vote(s)` });
            const row = new ActionRowBuilder().addComponents(poll.options.map((option, index) => new ButtonBuilder()
                .setCustomId(`poll:${pollId}:${index}`)
                .setLabel(`${option.slice(0, 65)} (${counts[index]})`)
                .setStyle(ButtonStyle.Secondary)));
            return interaction.update({ embeds: [embed], components: [row] });
        }

        if (interaction.isButton() && interaction.customId.startsWith('moderate:')) {
            const [, guildId, staffId] = interaction.customId.split(':');
            const moderationGuild = await client.guilds.fetch(guildId).catch(() => null);
            const moderationMember = moderationGuild ? await moderationGuild.members.fetch(interaction.user.id).catch(() => null) : null;
            if (staffId !== interaction.user.id || !moderationGuild || !moderationMember) {
                return interaction.reply({ content: 'Only the staff member who opened this form can use it.', ephemeral: true });
            }
            if (!isStaff(moderationMember)) {
                return interaction.reply({ content: 'This moderation form is restricted to staff.', ephemeral: true });
            }
            if (!hasPermission(moderationMember, PermissionsBitField.Flags.ModerateMembers)) {
                return interaction.reply({ content: permissionMessage('Moderate Members'), ephemeral: true });
            }
            const modal = new ModalBuilder().setCustomId(`moderation:${guildId}:${interaction.user.id}`).setTitle(`${BRAND} moderation`);
            const field = (id, label, placeholder, style = TextInputStyle.Short) => new TextInputBuilder()
                .setCustomId(id).setLabel(label).setPlaceholder(placeholder).setStyle(style).setRequired(true);
            modal.addComponents(
                new ActionRowBuilder().addComponents(field('target', 'Target user', '@User or Discord ID')),
                new ActionRowBuilder().addComponents(field('reason', 'Reason', 'Why is this action being taken?', TextInputStyle.Paragraph))
            );
            return interaction.showModal(modal);
        }

        if (!interaction.isModalSubmit() || !interaction.customId.startsWith('moderation:')) return;
        const [, modalGuildId, modalStaffId] = interaction.customId.split(':');
        const moderationGuild = await client.guilds.fetch(modalGuildId).catch(() => null);
        const moderationMember = moderationGuild ? await moderationGuild.members.fetch(interaction.user.id).catch(() => null) : null;
        if (modalStaffId !== interaction.user.id || !moderationGuild || !moderationMember || !isStaff(moderationMember)) {
            return interaction.reply({ content: 'This moderation form is restricted to staff.', ephemeral: true });
        }
        if (!hasPermission(moderationMember, PermissionsBitField.Flags.ModerateMembers)) {
            return interaction.reply({ content: permissionMessage('Moderate Members'), ephemeral: true });
        }

        const targetInput = interaction.fields.getTextInputValue('target').trim();
        const reason = interaction.fields.getTextInputValue('reason').trim();
        const member = await findMember(moderationGuild, targetInput);
        if (!member) return interaction.reply({ content: 'I could not find that member.', ephemeral: true });
        if (member.id === interaction.user.id || member.id === interaction.guild.ownerId) {
            return interaction.reply({ content: 'That member cannot be targeted by this action.', ephemeral: true });
        }
        if (moderationMember.roles.highest.position <= member.roles.highest.position) {
            return interaction.reply({ content: 'Your highest role must be above the target member.', ephemeral: true });
        }

        pendingModeration.set(interaction.user.id, {
            guildId: modalGuildId,
            targetId: member.id,
            targetTag: member.user.tag,
            reason,
            action: null,
            duration: null
        });

        const actionMenu = new StringSelectMenuBuilder()
            .setCustomId(`moderation-action:${interaction.user.id}`)
            .setPlaceholder('Choose an action')
            .addOptions(
                { label: 'Warning', value: 'warning', description: 'Record a warning only' },
                { label: 'Advisory', value: 'advisory', description: 'Record an advisory only' },
                { label: 'Mute / Timeout', value: 'timeout', description: 'Temporarily restrict the member' },
                { label: 'Kick', value: 'kick', description: 'Remove the member from the server' },
                { label: 'Ban', value: 'ban', description: 'Ban the member from the server' }
            );
        const durationMenu = new StringSelectMenuBuilder()
            .setCustomId(`moderation-duration:${interaction.user.id}`)
            .setPlaceholder('Choose a duration')
            .addOptions(
                { label: '30 minutes', value: '30m' },
                { label: '1 hour', value: '1h' },
                { label: '6 hours', value: '6h' },
                { label: '1 day', value: '1d' },
                { label: '7 days', value: '7d' },
                { label: '14 days', value: '14d' },
                { label: '28 days', value: '28d' },
                { label: 'Permanent / never', value: 'never' }
            );
        const confirm = new ButtonBuilder()
            .setCustomId(`moderation-confirm:${interaction.user.id}`)
            .setLabel('Apply moderation action')
            .setStyle(ButtonStyle.Danger);
        return interaction.reply({
            embeds: [brandedEmbed('Choose moderation action', `Target: <@${member.id}>\nReason: ${reason}\n\nChoose an action and duration, then confirm.`, COLORS.amber)],
            components: [
                new ActionRowBuilder().addComponents(actionMenu),
                new ActionRowBuilder().addComponents(durationMenu),
                new ActionRowBuilder().addComponents(confirm)
            ],
            ephemeral: true
        });
    } catch (error) {
        console.error('[interaction]', error);
        const response = { content: 'I could not complete that action. Check my role position and permissions.', ephemeral: true };
        if (interaction.replied || interaction.deferred) return interaction.followUp(response);
        return interaction.reply(response);
    }
});

const token = process.env.DISCORD_TOKEN || process.env.BOT_TOKEN;
if (!token) {
    console.error('Missing DISCORD_TOKEN or BOT_TOKEN in .env.');
    process.exit(1);
}

process.on('SIGINT', () => client.destroy());
process.on('SIGTERM', () => client.destroy());

client.login(token).catch(error => {
    console.error('[login] Discord login failed:', error.message);
    process.exitCode = 1;
});
