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
    // listシートから材料を探す
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${MASTER_SHEET}!A:I`, // A列～I列まで取得（完成品名＋材料名×4＋必要数×4）
    });

    const rows = res.data.values || [];
    const matchedRow = rows.find(r => r[0] === item);

    const logs = [];

    // 完成品の記録
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

    // まとめてスプレッドシートに追記
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
