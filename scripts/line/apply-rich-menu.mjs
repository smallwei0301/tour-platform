#!/usr/bin/env node
// 套用 LINE Rich Menu（圖文選單）— Tour Platform
//
// 對應「免費 LINE 通知設計」：前兩格用「文字動作」送出「我的訂單」「付款」，命中
// src/lib/line-order-query.mjs 的 parseOrderQueryIntent → webhook 用免費 Reply 回覆
// 訂單卡片＋付款連結；其餘格用連結（uri）導到網站，全程零 Push 額度成本。
//
// 用法（operator 在能讀到正式 token 的環境執行；token 絕不寫進 repo）：
//   LINE_CHANNEL_ACCESS_TOKEN=xxxxx \
//   NEXT_PUBLIC_APP_URL=https://你的網域 \
//   node scripts/line/apply-rich-menu.mjs [圖片路徑]
//
// 預設圖片：scripts/line/richmenu-midao-1200x810.png（1200×810、<1MB）。
// 旗標：
//   RICHMENU_REPLACE=1  先刪掉帳號上所有既有 rich menu，再建立並設為預設（避免堆積）。
//
// 安全：本腳本只讀環境變數裡的 token，不印出 token；失敗時印出 LINE 回應 body 供除錯。

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'https://api.line.me/v2/bot';
const API_DATA = 'https://api-data.line.me/v2/bot';

const TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
const APP_URL = String(process.env.NEXT_PUBLIC_APP_URL || '').trim().replace(/\/+$/, '');
const REPLACE = process.env.RICHMENU_REPLACE === '1';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const imagePath = process.argv[2] || path.join(__dirname, 'richmenu-midao-1200x810.png');

function die(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

if (!TOKEN) die('缺少 LINE_CHANNEL_ACCESS_TOKEN 環境變數。');
if (!APP_URL) die('缺少 NEXT_PUBLIC_APP_URL 環境變數（連結用絕對網址）。');

const authHeaders = { Authorization: `Bearer ${TOKEN}` };

// 1200×810：兩欄三列，欄寬 600、列高 270。bounds = { x, y, width, height }。
const COL = 600;
const ROW = 270;
const cell = (cx, cy) => ({ x: cx * COL, y: cy * ROW, width: COL, height: ROW });

const richMenu = {
  size: { width: 1200, height: 810 },
  selected: true,
  name: 'Midao main menu',
  chatBarText: '選單',
  areas: [
    // 前兩格用「文字動作」→ 觸發免費 Reply 訂單查詢。
    { bounds: cell(0, 0), action: { type: 'message', text: '我的訂單' } },
    { bounds: cell(1, 0), action: { type: 'message', text: '付款' } },
    // 其餘格用連結導到網站。
    { bounds: cell(0, 1), action: { type: 'uri', uri: `${APP_URL}/activities` } },         // 探索行程
    { bounds: cell(1, 1), action: { type: 'uri', uri: `${APP_URL}/me/profile` } },         // 我的帳號
    { bounds: cell(0, 2), action: { type: 'uri', uri: `${APP_URL}/me/wishlist` } },        // 我的收藏（收藏的行程一鍵回看）
    // 常見問題：自助解答（退款／出團須知…），找不到再在 LINE 直接打字問。
    // 「聯絡客服」已不需獨立按鈕 —— 旅客本就在 OA 聊天室，打字即可找客服。
    { bounds: cell(1, 2), action: { type: 'uri', uri: `${APP_URL}/faq` } },                // 常見問題
  ],
};

async function lineFetch(url, init) {
  const res = await fetch(url, init);
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`${init?.method || 'GET'} ${url} → ${res.status} ${res.statusText}\n${body}`);
  }
  return body ? JSON.parse(body) : {};
}

async function listRichMenus() {
  const data = await lineFetch(`${API}/richmenu/list`, { headers: authHeaders });
  return data.richmenus || [];
}

async function deleteRichMenu(id) {
  await lineFetch(`${API}/richmenu/${id}`, { method: 'DELETE', headers: authHeaders });
}

async function main() {
  const img = await readFile(imagePath);
  console.log(`• 圖片：${imagePath}（${(img.length / 1024).toFixed(0)}KB）`);
  if (img.length > 1024 * 1024) die('圖片超過 1MB，請先壓縮。');

  if (REPLACE) {
    const existing = await listRichMenus();
    for (const m of existing) {
      await deleteRichMenu(m.richMenuId);
      console.log(`• 已刪除舊選單 ${m.richMenuId}`);
    }
  }

  // 1) 建立 rich menu 物件
  const created = await lineFetch(`${API}/richmenu`, {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify(richMenu),
  });
  const richMenuId = created.richMenuId;
  console.log(`• 已建立 richMenuId=${richMenuId}`);

  // 2) 上傳選單圖片
  await lineFetch(`${API_DATA}/richmenu/${richMenuId}/content`, {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'image/png' },
    body: img,
  });
  console.log('• 已上傳選單圖片');

  // 3) 設為所有使用者的預設選單
  await lineFetch(`${API}/user/all/richmenu/${richMenuId}`, {
    method: 'POST',
    headers: authHeaders,
  });
  console.log('• 已設為預設選單');

  console.log(`\n✓ 完成。richMenuId=${richMenuId}`);
  console.log('  在 LINE 重新進入 OA 聊天室即可看到選單（可能需數十秒生效）。');
}

main().catch((err) => die(err.message));
