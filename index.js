const fs = require('fs');
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, Events } = require('discord.js');
const { google } = require('googleapis');
const axios = require('axios');

// === credentials.json を.envから復元 ===
const credentialsB64 = process.env.GOOGLE_CREDENTIALS_B64;
if (credentialsB64) {
  const credentialsJson = Buffer.from(credentialsB64, 'base64').toString('utf-8');
  fs.writeFileSync('./credentials.json', credentialsJson);
}

const credentials = require('./credentials.json');

// === 各種設定 ===
const SPREADSHEET_ID = '1HixtxBa4Zph88RZSY0ffh8XXB0sVlSCuDI8MWnq_6f8';
const MASTER_SHEET = 'list';
const LOG_SHEET = 'ログ';
const TARGET_CHANNEL_ID = '1365277821743927296';
const pendingUsers = new Map();

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

let lastButtonMessage = null;

async function sendButtons(channel, items) {
  if (lastButtonMessage) {
    try {
      await lastButtonMessage.delete();
    } catch (e) {
      console.warn("⚠️ ボタン削除に失敗:", e.message);
    }
  }

  const rows = [];
  for (let i = 0; i < items.length; i += 5) {
    const row = new ActionRowBuilder().addComponents(
      items.slice(i, i + 5).map(item =>
        new ButtonBuilder()
          .setCustomId(`item_${item}`)
          .setLabel(item)
          .setStyle(ButtonStyle.Primary)
      )
    );
    rows.push(row);
  }

  lastButtonMessage = await channel.send({
    content: '記録する項目を選んでください',
    components: rows,
  });
}

client.once(Events.ClientReady, async () => {
  console.log("🚀 Bot is ready!");

  const channel = await client.channels.fetch(TARGET_CHANNEL_ID);

  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${MASTER_SHEET}!A:A`,
    });

    const items = res.data.values?.flat().filter(Boolean);
    console.log("✅ Items loaded:", items);

    await sendButtons(channel, items);

    setInterval(async () => {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${MASTER_SHEET}!A:A`,
      });
      const items = res.data.values?.flat().filter(Boolean);
      await sendButtons(channel, items);
    }, 1000 * 60 * 5);
  } catch (err) {
    console.error('❌ スプレッドシートの読み込み失敗:', err);
  }
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isButton()) return;

  const item = interaction.customId.replace('item_', '');
  const displayName = interaction.member?.nickname || interaction.user.username;

  pendingUsers.set(interaction.user.id, { item, name: displayName });

  await interaction.reply({
    content: `**${item}** を選択しました。\n次に「数量 メモ（任意）」を入力してください。\n例：\`3 重要アイテム\``,
    ephemeral: true,
  });
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const now = new Date();
  const formattedDate = now.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
  const displayName = message.member?.nickname || message.author.username;

  let item = '';
  let quantity = '';
  let memo = '';

  const pending = pendingUsers.get(message.author.id);
  if (pending) {
    item = pending.item;
    const args = message.content.trim().split(/\s+/);
    quantity = args[0] || '';
    memo = args.slice(1).join(' ') || '';
  } else {
    const args = message.content.trim().split(/\s+/);
    if (args.length < 2) return;
    item = args[0];
    quantity = args[1];
    memo = args.slice(2).join(' ') || '';
  }

  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${MASTER_SHEET}!A:I`,
    });

    const rows = res.data.values || [];
    const matchedRow = rows.find(r => r[0] === item);

    const logs = [];

    logs.push([formattedDate, displayName, item, quantity, memo]);

    if (matchedRow) {
      for (let i = 1; i < matchedRow.length; i += 2) {
        const materialName = matchedRow[i];
        const requiredPerUnit = matchedRow[i + 1];

        if (materialName && requiredPerUnit) {
          const totalRequired = Number(requiredPerUnit) * Number(quantity);
          logs.push([formattedDate, displayName, materialName, -totalRequired, `【${item}作成用】`]);
        }
      }
    }

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${LOG_SHEET}!A:E`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: logs,
      },
    });
    await message.react('📦');
  } catch (err) {
    console.error('❌ 書き込みエラー:', err);
  }

  pendingUsers.delete(message.author.id);
});

client.login(process.env.DISCORD_TOKEN);
