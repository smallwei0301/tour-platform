// 鎖定「後台訂單詳情狀態下拉」的連動標記與真實 API 行為一致（防漂移）。
//
//  #  ↔ adminStatusToTelegramKind(status) !== null（會發 LINE／Telegram）
//  $  ↔ evaluatePayoutEligibility 只認 completed（會進入出帳 sweep）
//
// 這是 source-contract 測試：讀 app/admin/orders/page.tsx 的 STATUS_MARKS／
// STATUS_EFFECTS，逐狀態比對它們是否與 src/lib 的純函式判定相符。

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { adminStatusToTelegramKind } from '../../src/lib/admin-order-event-kind.mjs';
import { evaluatePayoutEligibility } from '../../src/lib/post-trip/payout-eligibility.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PAGE = resolve(__dirname, '../../app/admin/orders/page.tsx');
const src = readFileSync(PAGE, 'utf8');

const STATUSES = [
  'pending_payment', 'paid', 'confirmed', 'rejected',
  'cancelled_by_user', 'cancelled_by_guide', 'completed',
  'refund_pending', 'refunded',
];

function extractRecord(name) {
  const start = src.indexOf(`const ${name}: Record<string, string> = {`);
  assert.notEqual(start, -1, `找不到 ${name}`);
  const open = src.indexOf('{', start);
  const close = src.indexOf('};', open);
  const body = src.slice(open + 1, close);
  const out = {};
  for (const m of body.matchAll(/(\w+):\s*'([^']*)'/g)) out[m[1]] = m[2];
  return out;
}

const MARKS = extractRecord('STATUS_MARKS');
const EFFECTS = extractRecord('STATUS_EFFECTS');

test('每個狀態都有標記與連動說明', () => {
  for (const s of STATUSES) {
    assert.ok(MARKS[s] != null, `STATUS_MARKS 缺少 ${s}`);
    assert.ok(EFFECTS[s] && EFFECTS[s].length > 0, `STATUS_EFFECTS 缺少 ${s}`);
  }
});

test('# 標記 ⇔ 真的會發 LINE／Telegram（adminStatusToTelegramKind）', () => {
  for (const s of STATUSES) {
    const sendsNotify = adminStatusToTelegramKind(s) !== null;
    const hasHash = MARKS[s].includes('#');
    assert.equal(hasHash, sendsNotify, `${s}: # 標記(${hasHash}) 與通知連動(${sendsNotify}) 不一致`);
  }
});

test('$ 標記 ⇔ 真的會進入出帳 sweep（evaluatePayoutEligibility）', () => {
  for (const s of STATUSES) {
    // 排除其他 hold 因素後，只看「狀態」是否可出帳。
    const payable = evaluatePayoutEligibility({ orderStatus: s }).eligible === true;
    const hasDollar = MARKS[s].includes('$');
    assert.equal(hasDollar, payable, `${s}: $ 標記(${hasDollar}) 與出帳資格(${payable}) 不一致`);
  }
  // 防呆：唯一可出帳的是 completed。
  assert.equal(MARKS.completed.includes('$'), true);
  assert.equal(evaluatePayoutEligibility({ orderStatus: 'completed' }).eligible, true);
});

test('鎖定狀態（terminal）都標 🔒', () => {
  const locked = ['cancelled_by_user', 'cancelled_by_guide', 'completed', 'refund_pending', 'refunded'];
  for (const s of locked) {
    assert.ok(MARKS[s].includes('🔒'), `${s} 應標 🔒（鎖定）`);
  }
});

test('退款連動狀態標 💸', () => {
  for (const s of ['refund_pending', 'refunded']) {
    assert.ok(MARKS[s].includes('💸'), `${s} 應標 💸（退款連動）`);
  }
});

test('下拉 option 與圖例已實際渲染於頁面', () => {
  assert.ok(/STATUS_MARKS\[s\]/.test(src), 'option 應渲染 STATUS_MARKS');
  assert.ok(/STATUS_EFFECTS\[editStatus\]/.test(src), '應渲染選定狀態的連動說明');
  assert.ok(/STATUS_MARK_LEGEND/.test(src), '應渲染圖例 STATUS_MARK_LEGEND');
});
