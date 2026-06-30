// 免費 LINE 訂單查詢（Reply API）契約測試 — Tour Platform (#302b / #926)
//
// LINE Push API 會吃方案額度；Reply API（回覆使用者主動傳來的訊息）免費且不限量。
// 本檔鎖定「旅客傳『我的訂單／付款』→ webhook 用 Reply 回覆最新訂單狀態＋付款連結」
// 這條零額度成本的 pull 流程：意圖解析、回覆內容、未綁定／查無訂單退路，以及 webhook 接線。

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  parseOrderQueryIntent,
  buildOrderQueryReplyMessages,
} from '../../src/lib/line-order-query.mjs';
import {
  upsertLineMapping,
  __resetLineMappingsForTest,
} from '../../src/lib/line-binding.mjs';
import { orders } from '../../src/lib/store.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_WEB = path.resolve(__dirname, '../..');

const SEED_EMAIL = 'line-query-traveler@example.com';
const LINE_USER = 'Uorderquery0001';
let removeIds = [];

function seedOrder(partial) {
  const id = partial.id;
  removeIds.push(id);
  orders.push({
    id,
    experienceId: 'exp_query_test',
    experienceSlug: 'query-test-trip',
    scheduleId: 'sch_query_test',
    scheduleStartAt: '2026-08-15T09:00:00+08:00',
    contactName: '查單旅客',
    contactPhone: '0900000000',
    contactEmail: SEED_EMAIL,
    peopleCount: 2,
    totalTwd: 4200,
    adminNote: null,
    createdAt: new Date().toISOString(),
    paidAt: null,
    updatedAt: new Date().toISOString(),
    ...partial,
  });
}

beforeEach(() => {
  __resetLineMappingsForTest();
  removeIds = [];
  process.env.NEXT_PUBLIC_APP_URL = 'https://test.midao.tw';
});

afterEach(() => {
  // 清掉本檔 push 進 in-memory store 的測試訂單，避免污染其他套件。
  for (const id of removeIds) {
    const idx = orders.findIndex((o) => o.id === id);
    if (idx !== -1) orders.splice(idx, 1);
  }
  __resetLineMappingsForTest();
});

describe('parseOrderQueryIntent', () => {
  test('查詢／付款相關字句回傳 true', () => {
    for (const t of ['我的訂單', '查詢訂單', '幫我看一下訂單', '我要付款', '我的預約']) {
      assert.equal(parseOrderQueryIntent(t), true, `expected intent for: ${t}`);
    }
  });

  test('一般閒聊與空字串回傳 false', () => {
    for (const t of ['你好', '謝謝', '', '   ', null, undefined]) {
      assert.equal(parseOrderQueryIntent(t), false, `expected no intent for: ${JSON.stringify(t)}`);
    }
  });

  test('綁定碼不可被當成訂單查詢（讓綁定流程優先）', () => {
    assert.equal(parseOrderQueryIntent('TBIND-ABC234'), false);
    assert.equal(parseOrderQueryIntent('BIND-XYZ789'), false);
  });
});

describe('buildOrderQueryReplyMessages（Flex 卡片）', () => {
  // 回覆改用 Flex：斷言 altText（通知預覽文字）與序列化後的 contents（卡片內容）。
  const json = (msg) => JSON.stringify(msg.contents);

  test('一律回 Flex 訊息（type=flex + altText + contents）', async () => {
    const msgs = await buildOrderQueryReplyMessages({ lineUserId: 'Uunbound999' });
    assert.equal(Array.isArray(msgs), true);
    assert.equal(msgs.length, 1);
    assert.equal(msgs[0].type, 'flex');
    assert.equal(typeof msgs[0].altText, 'string');
    assert.ok(msgs[0].contents && typeof msgs[0].contents === 'object');
  });

  test('未綁定的 lineUserId → 引導去綁定（含綁定碼步驟），不洩漏任何訂單', async () => {
    const msgs = await buildOrderQueryReplyMessages({ lineUserId: 'Uunbound999' });
    assert.match(msgs[0].altText, /綁定/);
    const body = json(msgs[0]);
    assert.match(body, /綁定/);
    assert.match(body, /綁定碼|TBIND/); // 卡片需說明取得綁定碼的步驟
    assert.match(body, /\/me\/profile/);
  });

  test('已綁定但查無訂單 → 友善退路 + 探索行程連結', async () => {
    await upsertLineMapping({ lineUserId: LINE_USER, contactEmail: SEED_EMAIL });
    const msgs = await buildOrderQueryReplyMessages({ lineUserId: LINE_USER });
    assert.match(msgs[0].altText, /查無/);
    assert.match(json(msgs[0]), /\/activities/);
  });

  test('未付款訂單 → 顯示待付款狀態並附「前往付款」連結', async () => {
    seedOrder({ id: 'ord_query_pending', status: 'pending_payment', totalTwd: 4200 });
    await upsertLineMapping({ lineUserId: LINE_USER, contactEmail: SEED_EMAIL });

    const msgs = await buildOrderQueryReplyMessages({ lineUserId: LINE_USER });
    const body = json(msgs[0]);
    assert.match(msgs[0].altText, /待付款/);
    assert.match(body, /待付款/);
    assert.match(body, /前往付款/);
    assert.match(body, /\/me\/orders/);
    assert.match(body, /4,200/);
    assert.match(body, /ORD_QUER/); // shortId = 前 8 碼大寫
  });

  test('已確認訂單 → 顯示已確認、不出現催繳付款連結', async () => {
    seedOrder({ id: 'ord_query_confirmed', status: 'confirmed', totalTwd: 1500 });
    await upsertLineMapping({ lineUserId: LINE_USER, contactEmail: SEED_EMAIL });

    const msgs = await buildOrderQueryReplyMessages({ lineUserId: LINE_USER });
    const body = json(msgs[0]);
    assert.match(body, /已確認/);
    assert.doesNotMatch(body, /前往付款/);
  });

  test('多筆訂單 → carousel，最多 3 張卡，最新在前', async () => {
    seedOrder({ id: 'ord_q_a', status: 'pending_payment', totalTwd: 1000, createdAt: new Date(Date.now() - 1000).toISOString() });
    seedOrder({ id: 'ord_q_b', status: 'confirmed', totalTwd: 2000, createdAt: new Date(Date.now() - 2000).toISOString() });
    seedOrder({ id: 'ord_q_c', status: 'completed', totalTwd: 3000, createdAt: new Date(Date.now() - 3000).toISOString() });
    seedOrder({ id: 'ord_q_d', status: 'refunded', totalTwd: 4000, createdAt: new Date(Date.now() - 4000).toISOString() });
    await upsertLineMapping({ lineUserId: LINE_USER, contactEmail: SEED_EMAIL });

    const msgs = await buildOrderQueryReplyMessages({ lineUserId: LINE_USER });
    assert.equal(msgs[0].contents.type, 'carousel');
    assert.equal(msgs[0].contents.contents.length, 3); // 4 筆只顯示最近 3 筆
    assert.match(msgs[0].altText, /共 4 筆/);
  });
});

describe('webhook 接線（source-contract）', () => {
  const webhookSrc = readFileSync(path.join(REPO_WEB, 'src/lib/line-webhook.mjs'), 'utf8');

  test('line-webhook 匯入並使用免費訂單查詢 helper', () => {
    assert.match(webhookSrc, /from '\.\/line-order-query\.mjs'/);
    assert.match(webhookSrc, /parseOrderQueryIntent|buildOrderQueryReplyMessages/);
  });

  test('訂單查詢以 Reply（非 Push）回覆，且排在綁定碼之後、bare upsert 之前', () => {
    // Reply API 免費；確保查詢走 replyMessage 而非 pushMessage。
    assert.match(webhookSrc, /tryOrderQuery/);
    const guideIdx = webhookSrc.indexOf('tryGuideBinding(ev');
    const travelerIdx = webhookSrc.indexOf('tryTravelerBinding(ev');
    const queryIdx = webhookSrc.indexOf('tryOrderQuery(ev');
    const upsertIdx = webhookSrc.indexOf('upsertLineMapping({ lineUserId })');
    assert.ok(queryIdx > travelerIdx && travelerIdx > guideIdx, '順序：guide → traveler → query');
    assert.ok(upsertIdx > queryIdx, 'bare upsert 必須在訂單查詢之後');
  });
});
