const { Client, GatewayIntentBits } = require('discord.js');
const { google } = require('googleapis');
const credentials = require('./credentials.json'); // サービスアカウントのキー

// スプレッドシート情報
const SPREADSHEET_ID = '1HixtxBa4Zph88RZSY0ffh8XXB0sVlSCuDI8MWnq_6f8';
const SHEET_NAME = 'ログ';

// チャンネルIDを指定（ここにだけ反応）
const ALLOWED_CHANNEL_ID = '1365277821743927296';

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

client.on('messageCreate', async (message) => {
  // Botのメッセージは無視
  if (message.author.bot) return;

  // 指定チャンネル以外は無視
  if (message.channel.id !== ALLOWED_CHANNEL_ID) return;

  // 全角・半角スペースで分割
  const args = message.content.trim().split(/[\s\u3000]+/);
  if (args.length < 2) return; // 項目と数量は必須

  const [item, quantity, ...memoParts] = args;
  const memo = memoParts.join(' ') || '';
  const displayName = message.member?.nickname || message.author.username;

  const now = new Date();
  const formattedDate = now.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:E`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[formattedDate, displayName, item, quantity, memo]],
      },
    });
    console.log('✅ スプレッドシートに追加しました');
  } catch (err) {
    console.error('❌ スプレッドシートへの書き込み失敗:', err);
  }
});

client.login(process.env.DISCORD_TOKEN);
