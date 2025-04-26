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
const MASTER_SHEET = 'list'; // 必ず半角小文字で
const LOG_SHEET = 'ログ';
const TARGET_CHANNEL_ID = '1365277821743927296'; // ← 実際のIDに置き換えてね
const pendingUsers = new Map();

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

// === Discord Bot ===
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
});

// === 起動時にボタン表示 ===
client.once(Events.ClientReady, async () => {
  console.log(`🚀 Bot is ready!`);
  console.log("📦 Channel ID:", TARGET_CHANNEL_ID);
  console.log("📄 Loading items from Google Sheets...");

  const channel = await client.channels.fetch(TARGET_CHANNEL_ID);
  if (!channel) return console.error("❌ チャンネルが見つかりません");

  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${MASTER_SHEET}!A:A`,
    });

    const items = res.data.values?.flat().filter(Boolean);
    console.log("✅ Items loaded:", items);

    const buttons = items.slice(0, 5).map(item =>
      new ButtonBuilder()
        .setCustomId(`item_${item}`)
        .setLabel(item)
        .setStyle(ButtonStyle.Primary)
    );

    const row = new ActionRowBuilder().addComponents(buttons);

    await channel.send({
      content: '記録する項目を選んでください',
      components: [row],
    });
  } catch (err) {
    console.error('❌ スプレッドシートの読み込み失敗:', err);
  }
});

// === ボタンが押されたとき ===
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

// === ユーザーが数量＋メモを送信したら記録 ===
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const pending = pendingUsers.get(message.author.id);
  if (!pending) return;

  const args = message.content.trim().split(/\s+/);
  const quantity = args[0] || '';
  const memo = args.slice(1).join(' ') || '';

  const now = new Date();
  const formattedDate = now.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${LOG_SHEET}!A:E`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[formattedDate, pending.name, pending.item, quantity, memo]],
      },
    });

    await message.react('✅'); // ← ここでリアクション追加！
    pendingUsers.delete(message.author.id);
  } catch (err) {
    console.error('❌ 書き込みエラー:', err);
  }
});



client.login(process.env.DISCORD_TOKEN);
