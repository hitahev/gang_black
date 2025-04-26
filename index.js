const fs = require('fs');
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, Events } = require('discord.js');
const { google } = require('googleapis');

// credentials.json を.envから復元
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

// Google Sheets 認証
const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

// Discord Bot 設定
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

// Bot起動時
client.once(Events.ClientReady, async () => {
  console.log(`🚀 Bot is ready!`);
  const channel = await client.channels.fetch(TARGET_CHANNEL_ID);
  if (!channel) return console.error("❌ チャンネルが見つかりません");

  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${MASTER_SHEET}!A2:A`, // A列: 項目名（ヘッダー除く）
    });
    const items = res.data.values?.flat().filter(Boolean);
    console.log("✅ Items loaded:", items);

    const rows = [];
    for (let i = 0; i < items.length; i += 5) {
      const rowButtons = items.slice(i, i + 5).map(item =>
        new ButtonBuilder()
          .setCustomId(`item_${item}`)
          .setLabel(item)
          .setStyle(ButtonStyle.Primary)
      );
      rows.push(new ActionRowBuilder().addComponents(rowButtons));
    }

    // 古いメッセージ削除＆ボタン再表示
    const messages = await channel.messages.fetch({ limit: 10 });
    for (const msg of messages.values()) {
      if (msg.author.id === client.user.id) await msg.delete();
    }

    // 少し待機してから投稿（安定化）
    await new Promise(resolve => setTimeout(resolve, 500));

    await channel.send({
      content: '記録する項目を選んでください',
      components: rows,
    });
  } catch (err) {
    console.error('❌ スプレッドシートの読み込み失敗:', err);
  }
});

// ボタンが押されたとき
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

// メッセージ受信時
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const pending = pendingUsers.get(message.author.id);
  const parts = message.content.trim().split(/\s+/);
  const amountStr = parts[0];
  const quantity = parseInt(amountStr);
  const memo = parts.slice(1).join(' ');
  const name = message.member?.nickname || message.author.username;
  const date = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
  const logs = [];

  if (pending && !isNaN(quantity)) {
    // ボタンからの入力
    const selected = pending.item;
    pendingUsers.delete(message.author.id);

    try {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${MASTER_SHEET}!A2:J`,
      });
      const rows = res.data.values || [];
      const row = rows.find(r => r[0] === selected);
      if (!row) return message.reply('❌ 該当アイテムが見つかりません');

      const createPer = parseInt(row[1]) || 1;
      const finalAmount = quantity * createPer;

      // 完成品ログ
      logs.push([date, name, selected, finalAmount, memo ? `[${selected}作成用] ${memo}` : `[${selected}作成用]`]);

      // 材料ログ
      for (let i = 0; i < 4; i++) {
        const material = row[2 + i * 2];
        const materialQty = parseInt(row[3 + i * 2]);
        if (material && materialQty) {
          logs.push([date, name, material, -materialQty * quantity, `[${selected}作成用]`]);
        }
      }
    } catch (err) {
      console.error("❌ データ取得失敗:", err);
      return;
    }

  } else {
    // 手入力形式（例: 選択肢1 3 メモ）
    const item = parts[0];
    const qty = parseInt(parts[1]);
    const rawMemo = parts.slice(2).join(' ');
    if (!isNaN(qty)) {
      logs.push([date, name, item, qty, rawMemo]);
    } else {
      return; // 無効入力（無視）
    }
  }

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${LOG_SHEET}!A:E`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: logs },
    });

    await message.react('📦');
  } catch (err) {
    console.error("❌ 書き込み失敗:", err);
  }
});

client.login(process.env.DISCORD_TOKEN);
