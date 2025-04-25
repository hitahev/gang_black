const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, Events } = require('discord.js');
const { google } = require('googleapis');
const credentials = require('./credentials.json');
const axios = require('axios');

// === 各種設定 ===
const SPREADSHEET_ID = '1HixtxBa4Zph88RZSY0ffh8XXB0sVlSCuDI8MWnq_6f8'; // シートID
const MASTER_SHEET = 'マスタ';
const LOG_SHEET = 'ログ';
const TARGET_CHANNEL_ID = '1365277821743927296'; // 起動時に送信するチャンネル
const pendingUsers = new Map(); // ユーザーの一時保存用（項目 → 次の入力で使う）

// === Google Sheets 認証 ===
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

// === 起動時：項目リストを読み込んでボタン表示 ===
client.once(Events.ClientReady, async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  const channel = await client.channels.fetch(TARGET_CHANNEL_ID);
  if (!channel) return console.error("❌ チャンネルが見つかりません");

  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${MASTER_SHEET}!A:A`,
    });

    const items = res.data.values?.flat().filter(Boolean).slice(0, 5); // 先頭5個までに制限（必要に応じて調整）

    const buttons = items.map(item =>
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
    ephemeral: true, // 他の人には見えない
  });
});

// === ユーザーが数量＋メモ
