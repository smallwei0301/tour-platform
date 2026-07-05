/**
 * Issue #1411 — 站內訊息 gateway 契約測試
 *
 * in-memory fallback 與 Supabase 實作的契約：「同輸入 → 同輸出 shape／同狀態轉移」。
 * - in-memory 分支：透過 db.mjs gateway 直接實測
 * - Supabase 分支：source-contract 鎖定 db.mjs 對應實作的 table、ownership、
 *   窗口檢查在 insert 之前（NOT_VERIFIED-live：未連真 DB）
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// 強制 in-memory path（操作環境可能帶 SUPABASE_*）
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

import {
  listOrderMessagesDb,
  createOrderMessageDb,
  listGuideMessageThreadsDb,
} from '../../src/lib/db.mjs';

const dbSrc = readFileSync(new URL('../../src/lib/db-order-messages.mjs', import.meta.url), 'utf8'); // #1613 strangler 後實作所在（以測試檔為錨點，任何 cwd 皆可跑）

// 兩邊實作都必須提供的留言欄位（shape 契約）
const MESSAGE_SHAPE_KEYS = ['id', 'orderId', 'senderRole', 'senderId', 'body', 'createdAt'];
const THREAD_SHAPE_KEYS = [
  'orderId', 'orderStatus', 'activityTitle', 'contactName',
  'scheduleStartAt', 'lastMessage', 'messageCount', 'needsReply',
];

// fixtures（store.mjs）：
//   ord_mock_001 paid / chaishan / guide andy-lee / wang@example.com
//   ord_mock_004 pending_payment / chaishan
//   ord_mock_005 completed（>14 天前）/ dadaocheng / guide chen-jian-zhi

test('contract/create: traveler 發言 → 契約 shape ＋ 第一則 shouldNotify=true', async () => {
  const result = await createOrderMessageDb({
    orderId: 'ord_mock_001',
    senderRole: 'traveler',
    senderId: 'wang-uid',
    body: '請問當天要準備什麼裝備？',
    contactEmail: 'wang@example.com',
  });
  for (const key of MESSAGE_SHAPE_KEYS) {
    assert.ok(key in result.message, `message 缺 ${key}`);
  }
  assert.equal(result.message.orderId, 'ord_mock_001');
  assert.equal(result.message.senderRole, 'traveler');
  assert.equal(result.message.body, '請問當天要準備什麼裝備？');
  assert.equal(result.shouldNotify, true, '第一則留言必通知');
});

test('contract/create: 同角色 15 分鐘內第二則 → shouldNotify=false（仍寫入）', async () => {
  const result = await createOrderMessageDb({
    orderId: 'ord_mock_001',
    senderRole: 'traveler',
    senderId: 'wang-uid',
    body: '補充：我們有兩位成人。',
    contactEmail: 'wang@example.com',
  });
  assert.ok(result.message.id, '節流只影響通知，留言仍應寫入');
  assert.equal(result.shouldNotify, false);
});

test('contract/create: guide 回覆（不同角色不受節流）＋ guide ownership 放行', async () => {
  const result = await createOrderMessageDb({
    orderId: 'ord_mock_001',
    senderRole: 'guide',
    senderId: 'andy-lee',
    body: '帶防滑鞋與手電筒即可！',
    guideSlug: 'andy-lee',
  });
  assert.equal(result.message.senderRole, 'guide');
  assert.equal(result.shouldNotify, true);
});

test('contract/list: traveler 讀串 → orderStatus/canView/canPost ＋ createdAt 升冪', async () => {
  const thread = await listOrderMessagesDb({
    orderId: 'ord_mock_001',
    contactEmail: 'wang@example.com',
  });
  assert.equal(thread.orderId, 'ord_mock_001');
  assert.equal(thread.orderStatus, 'paid');
  assert.equal(thread.canView, true);
  assert.equal(thread.canPost, true);
  assert.equal(thread.messages.length, 3);
  for (const key of MESSAGE_SHAPE_KEYS) {
    assert.ok(key in thread.messages[0], `messages[] 缺 ${key}`);
  }
  const times = thread.messages.map((m) => new Date(m.createdAt).getTime());
  assert.deepEqual(times, [...times].sort((a, b) => a - b), '留言應依 createdAt 升冪');
});

test('contract/ownership: 別人的 email → ORDER_NOT_FOUND（不洩漏存在性）', async () => {
  await assert.rejects(
    () => createOrderMessageDb({
      orderId: 'ord_mock_001',
      senderRole: 'traveler',
      senderId: 'evil',
      body: 'hi',
      contactEmail: 'evil@example.com',
    }),
    /ORDER_NOT_FOUND/
  );
  await assert.rejects(
    () => listOrderMessagesDb({ orderId: 'ord_mock_001', contactEmail: 'evil@example.com' }),
    /ORDER_NOT_FOUND/
  );
});

test('contract/ownership: guide 摸別人活動的訂單 → FORBIDDEN', async () => {
  await assert.rejects(
    () => listOrderMessagesDb({ orderId: 'ord_mock_001', guideSlug: 'chen-jian-zhi' }),
    /FORBIDDEN/
  );
  await assert.rejects(
    () => createOrderMessageDb({
      orderId: 'ord_mock_001',
      senderRole: 'guide',
      senderId: 'chen-jian-zhi',
      body: 'hi',
      guideSlug: 'chen-jian-zhi',
    }),
    /FORBIDDEN/
  );
});

test('contract/window: pending_payment 不可發言（MESSAGE_WINDOW_CLOSED）', async () => {
  await assert.rejects(
    () => createOrderMessageDb({
      orderId: 'ord_mock_004',
      senderRole: 'traveler',
      senderId: 'chang-uid',
      body: 'hi',
      contactEmail: 'chang@example.com',
    }),
    /MESSAGE_WINDOW_CLOSED/
  );
});

test('contract/window: completed 超過 14 天 → 唯讀（canView true / canPost false / POST 403）', async () => {
  const thread = await listOrderMessagesDb({
    orderId: 'ord_mock_005',
    contactEmail: 'wu@example.com',
  });
  assert.equal(thread.canView, true);
  assert.equal(thread.canPost, false);

  await assert.rejects(
    () => createOrderMessageDb({
      orderId: 'ord_mock_005',
      senderRole: 'traveler',
      senderId: 'wu-uid',
      body: 'hi',
      contactEmail: 'wu@example.com',
    }),
    /MESSAGE_WINDOW_CLOSED/
  );
});

test('contract/validate: 空 body 與 >1000 字 → BAD_REQUEST / MESSAGE_TOO_LONG', async () => {
  await assert.rejects(
    () => createOrderMessageDb({
      orderId: 'ord_mock_001',
      senderRole: 'traveler',
      senderId: 'wang-uid',
      body: '   ',
      contactEmail: 'wang@example.com',
    }),
    /BAD_REQUEST/
  );
  await assert.rejects(
    () => createOrderMessageDb({
      orderId: 'ord_mock_001',
      senderRole: 'traveler',
      senderId: 'wang-uid',
      body: 'a'.repeat(1001),
      contactEmail: 'wang@example.com',
    }),
    /MESSAGE_TOO_LONG/
  );
});

test('contract/admin: 不帶 ownership 參數（service-role 路徑）可唯讀整串', async () => {
  const thread = await listOrderMessagesDb({ orderId: 'ord_mock_001' });
  assert.equal(thread.messages.length, 3);
});

test('contract/guide-threads: 清單 shape ＋ needsReply 旗標隨最後發言者翻轉', async () => {
  // 此刻 ord_mock_001 最後一則是 guide → needsReply false
  let threads = await listGuideMessageThreadsDb({ guideSlug: 'andy-lee' });
  assert.equal(threads.length, 1, 'andy-lee 名下只有 ord_mock_001 有留言');
  for (const key of THREAD_SHAPE_KEYS) {
    assert.ok(key in threads[0], `thread 缺 ${key}`);
  }
  assert.equal(threads[0].orderId, 'ord_mock_001');
  assert.equal(threads[0].needsReply, false);
  assert.equal(threads[0].messageCount, 3);
  assert.equal(threads[0].lastMessage.senderRole, 'guide');

  // traveler 再發一則 → needsReply true
  await createOrderMessageDb({
    orderId: 'ord_mock_001',
    senderRole: 'traveler',
    senderId: 'wang-uid',
    body: '了解，謝謝！',
    contactEmail: 'wang@example.com',
  });
  threads = await listGuideMessageThreadsDb({ guideSlug: 'andy-lee' });
  assert.equal(threads[0].needsReply, true);
  assert.equal(threads[0].messageCount, 4);

  // 別的 guide 看不到 andy-lee 的串
  const others = await listGuideMessageThreadsDb({ guideSlug: 'chen-jian-zhi' });
  assert.equal(others.some((t) => t.orderId === 'ord_mock_001'), false);
});

// ── Supabase 分支 source-contract ────────────────────────────────────────────

test('contract/supabase: 三個 gateway 都走 order_messages 表並共用 serialise（source-contract）', () => {
  for (const fn of ['listOrderMessagesDb', 'createOrderMessageDb', 'listGuideMessageThreadsDb']) {
    const fnStart = dbSrc.indexOf(`export async function ${fn}`);
    assert.ok(fnStart > 0, `db.mjs 缺 ${fn}`);
    const fnSrc = dbSrc.slice(fnStart, fnStart + 6000);
    assert.match(fnSrc, /hasSupabaseEnv\(\)/, `${fn} 缺 in-memory fallback 分支`);
    assert.match(fnSrc, /order_messages/, `${fn} Supabase 分支應查 order_messages`);
  }
});

test('contract/supabase: create 的窗口與 ownership 檢查在 insert 之前（source-contract）', () => {
  // ownership 與窗口邏輯收斂在共用 helper
  const helperStart = dbSrc.indexOf('async function fetchOrderForMessages');
  assert.ok(helperStart > 0, 'db.mjs 缺 fetchOrderForMessages helper');
  const helperSrc = dbSrc.slice(helperStart, helperStart + 2500);
  assert.match(helperSrc, /ORDER_NOT_FOUND/, 'traveler ownership 不符應擲 ORDER_NOT_FOUND');
  assert.match(helperSrc, /FORBIDDEN/, 'guide ownership 不符應擲 FORBIDDEN');
  assert.match(dbSrc.slice(dbSrc.indexOf('function orderMessageWindowForRow')), /getOrderMessageWindow/);

  // createOrderMessageDb：ownership → 窗口 → insert 的順序
  const fnStart = dbSrc.indexOf('export async function createOrderMessageDb');
  const fnSrc = dbSrc.slice(fnStart, dbSrc.indexOf('export async function', fnStart + 10));
  const ownershipIdx = fnSrc.indexOf('fetchOrderForMessages');
  const windowIdx = fnSrc.indexOf('orderMessageWindowForRow');
  const insertIdx = fnSrc.indexOf('.insert(');
  assert.ok(ownershipIdx > 0, 'Supabase 分支應呼叫 fetchOrderForMessages');
  assert.ok(windowIdx > ownershipIdx, '窗口檢查必須在 ownership 之後');
  assert.ok(insertIdx > windowIdx, 'insert 必須在窗口檢查之後');
  assert.match(fnSrc, /MESSAGE_WINDOW_CLOSED/, '窗口外發言應擲 MESSAGE_WINDOW_CLOSED');
});

test('contract/supabase: guide threads 以 activities.guide_id 過濾（source-contract）', () => {
  const fnStart = dbSrc.indexOf('export async function listGuideMessageThreadsDb');
  const fnSrc = dbSrc.slice(fnStart, fnStart + 6000);
  assert.match(fnSrc, /guide_id/, 'Supabase 分支應以 guide_id 過濾 guide 名下活動');
});
