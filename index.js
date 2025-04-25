const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');

const GAS_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbyPFUqQRmsWENwpTzzRlb06xcG793LQMlBzOUXNOpIRfPgMmSUjPxSGr__eMm5altMu/exec'; // ←GASのURLをここに入れてね
const ALLOWED_CHANNEL_ID = '1365277821743927296'; // ←反応させたいチャンネルのID

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers // ← これで表示名（nickname）が取得できるようになる！
  ],
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (message.channel.id !== ALLOWED_CHANNEL_ID) return;

  const args = message.content.trim().split(/[\s\u3000]+/);
  if (args.length < 2) return;

  const [item, quantity, ...memoParts] = args;
  const memo = memoParts.join(' ') || '';
  
  const displayName = message.member?.nickname || message.author.username;
  console.log("🔍 displayName:", displayName);
  console.log("🧩 member:", message.member);

  const payload = {
    name: displayName,
    item,
    quantity,
    memo,
  };

try {
  await axios.post(GAS_WEBHOOK_URL, payload);
  console.log('✅ GASに送信しました');
  await message.react('📘'); // ← 成功したらリアクションつける
} catch (error) {
  console.error('❌ 送信エラー:', error);
  await message.react('❌'); // ← 失敗したら赤バツつける
}

});

client.login(process.env.DISCORD_TOKEN);
