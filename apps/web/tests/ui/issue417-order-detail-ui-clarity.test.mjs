/**
 * RED tests for issue #417: UI clarity fixes for /me/orders/[orderId]
 *
 * AC1: scheduleStartAt rendered in 訂單資訊 card as zh-TW formatted date; shows "—" if null
 * AC2: When status ∈ {paid,confirmed} AND departure passed → info block "行程已開始/結束，無法線上申請退款，請聯絡客服"
 * AC3: When not yet completed AND not terminal → show "行程完成後即可撰寫評價" hint (no form)
 * AC4: Existing flows unchanged: completed review form still shows; paid + future departure refund button still shows
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

async function readSource(relPath) {
  return readFile(path.join(ROOT, relPath), 'utf8');
}

const PAGE = 'app/me/orders/[orderId]/page.tsx';

// #multilingual: 面向使用者的文案已移到 messages/zh-Hant.json 的 orderDetail namespace；
// 頁面改用 m.<key> 引用。內容類斷言改讀（page + 繁中 catalog），結構類斷言改 key 名定位。
async function readCopy() {
  const page = await readSource(PAGE);
  const zh = await readSource('messages/zh-Hant.json');
  return page + '\n' + zh;
}

// ─── AC1: scheduleStartAt displayed in 訂單資訊 card ─────────────────────────

test('AC1: 訂單資訊 card renders 出發時間 label', async () => {
  const src = await readCopy();
  assert.match(src, /出發時間/, '訂單資訊 card must have a 出發時間 label row');
});

test('AC1: scheduleStartAt is formatted with toLocaleString zh-TW', async () => {
  const src = await readSource(PAGE);
  // #multilingual: 日期格式改為依 locale 切換（zh-Hant→zh-TW / en→en-US），
  // 頁面用 toLocaleString(dateLocale)；繁中仍輸出 zh-TW。
  assert.match(
    src,
    /scheduleStartAt[\s\S]{0,120}toLocaleString\s*\(\s*(?:dateLocale|['"]zh-TW['"])/,
    'scheduleStartAt must be formatted via toLocaleString(dateLocale) (zh-TW for zh-Hant)'
  );
  assert.match(
    src,
    /const\s+dateLocale\s*=\s*locale\s*===\s*['"]zh-Hant['"]\s*\?\s*['"]zh-TW['"]/,
    'dateLocale must resolve to zh-TW for the zh-Hant locale'
  );
});

test('AC1: scheduleStartAt row shows "—" when value is null/falsy', async () => {
  const src = await readSource(PAGE);
  // The row must show a fallback dash when scheduleStartAt is falsy
  // Pattern: scheduleStartAt ? ... : '—' or similar conditional near the label
  assert.match(
    src,
    /scheduleStartAt[\s\S]{0,200}['"]—['"]/,
    'scheduleStartAt display must fall back to "—" when null'
  );
});

// ─── AC2: departure-passed info block ────────────────────────────────────────

test('AC2: catalog contains "行程已開始/結束，無法線上申請退款，請聯絡客服" copy', async () => {
  // #multilingual: 文案已移到 orderDetail.departurePassedNoRefund；頁面引用 m.departurePassedNoRefund。
  const zh = JSON.parse(await readSource('messages/zh-Hant.json'));
  assert.match(
    zh.orderDetail.departurePassedNoRefund,
    /行程已開始[\s\S]{0,10}結束，無法線上申請退款，請聯絡客服/,
    'orderDetail.departurePassedNoRefund must hold departure-passed info copy'
  );
  const src = await readSource(PAGE);
  assert.match(src, /m\.departurePassedNoRefund/, 'page must reference m.departurePassedNoRefund');
});

test('AC2: departure-passed block is shown when departureNotPassed is false AND status is paid/confirmed', async () => {
  const src = await readSource(PAGE);
  // The block must be gated on departureNotPassed being false (i.e. !departureNotPassed)
  // and must be inside the paid/confirmed status flow
  const hasDeparturePassed = /!departureNotPassed[\s\S]{0,400}m\.departurePassedNoRefund|m\.departurePassedNoRefund[\s\S]{0,400}!departureNotPassed/.test(src);
  const hasDeparturePassedAlt = /departureNotPassed\s*===\s*false[\s\S]{0,400}m\.departurePassedNoRefund|m\.departurePassedNoRefund[\s\S]{0,400}departureNotPassed\s*===\s*false/.test(src);
  assert.ok(
    hasDeparturePassed || hasDeparturePassedAlt,
    'departure-passed info block must be conditionally rendered when departureNotPassed is false'
  );
});

test('AC2: departure-passed block only applies to paid/confirmed statuses', async () => {
  const src = await readSource(PAGE);
  // The departure-passed message must be near the paid/confirmed status logic
  // Either within the canRefund-related block or via a new isDeparturePassed variable
  assert.match(
    src,
    /\[['"]paid['"],\s*['"]confirmed['"]\][\s\S]{0,500}m\.departurePassedNoRefund|m\.departurePassedNoRefund[\s\S]{0,500}\[['"]paid['"],\s*['"]confirmed['"]\]/,
    'departure-passed copy must be scoped to paid/confirmed status check'
  );
});

// ─── AC3: pre-completion review hint ─────────────────────────────────────────

test('AC3: catalog contains "行程完成後即可撰寫評價" hint text', async () => {
  // #multilingual: 文案已移到 orderDetail.reviewHint；頁面引用 m.reviewHint。
  const zh = JSON.parse(await readSource('messages/zh-Hant.json'));
  assert.match(
    zh.orderDetail.reviewHint,
    /行程完成後即可撰寫評價/,
    'orderDetail.reviewHint must hold the pre-completion review hint'
  );
  const src = await readSource(PAGE);
  assert.match(src, /m\.reviewHint/, 'page must reference m.reviewHint for non-completed orders');
});

test('AC3: hint is shown when NOT completed AND NOT terminal', async () => {
  const src = await readSource(PAGE);
  // The hint must be rendered in the NOT-completed, NOT-terminal branch
  // It must not be inside the status === 'completed' block
  // Look for: isTerminal or !isTerminal near the hint, outside the completed block
  const hintNearTerminal = /!isTerminal[\s\S]{0,600}m\.reviewHint|m\.reviewHint[\s\S]{0,600}!isTerminal/.test(src);
  assert.ok(
    hintNearTerminal,
    'hint m.reviewHint must appear in a block guarded by !isTerminal'
  );
});

test('AC3: hint does NOT appear inside the status=completed block (review form handles completed)', async () => {
  const src = await readSource(PAGE);
  // Review form section starts with `status === 'completed'`
  // The hint must be OUTSIDE that block, i.e., it should be in a separate condition
  // We check that the hint is not ONLY inside status=completed block by ensuring
  // there is a conditional other than status === 'completed' guarding it
  assert.match(
    src,
    /status\s*!==\s*['"]completed['"][\s\S]{0,400}m\.reviewHint|m\.reviewHint[\s\S]{0,400}status\s*!==\s*['"]completed['"]/,
    'hint must be rendered outside the status===completed block'
  );
});

// ─── AC4: Existing flows unchanged ───────────────────────────────────────────

test('AC4: completed status still shows 撰寫評價 button (review form unchanged)', async () => {
  const src = await readSource(PAGE);
  assert.match(src, /status\s*===\s*['"]completed['"]/, 'review form must still be gated on status === completed');
  // #multilingual: 撰寫評價 文案已移到 orderDetail.reviewOpenBtn；頁面引用 m.reviewOpenBtn。
  const zh = JSON.parse(await readSource('messages/zh-Hant.json'));
  assert.match(zh.orderDetail.reviewOpenBtn, /撰寫評價/, 'orderDetail.reviewOpenBtn must hold review button text');
  assert.match(src, /m\.reviewOpenBtn/, 'page must reference m.reviewOpenBtn');
});

test('AC4: canRefund still evaluates true for paid/confirmed with future departure', async () => {
  const src = await readSource(PAGE);
  // canRefund must still use departureNotPassed (true) for future departures
  assert.match(
    src,
    /canRefund\s*=[\s\S]{0,100}departureNotPassed/,
    'canRefund must still reference departureNotPassed'
  );
  assert.match(
    src,
    /\[['"]paid['"],\s*['"]confirmed['"]\]\.includes\(status\)/,
    'canRefund must still require paid or confirmed status'
  );
});

test('AC4: refund button 申請取消/退款 still present for canRefund case', async () => {
  // #multilingual: 申請取消/退款 文案已移到 orderDetail.applyRefund；頁面引用 m.applyRefund。
  const zh = JSON.parse(await readSource('messages/zh-Hant.json'));
  assert.match(zh.orderDetail.applyRefund, /申請取消\/退款|申請取消.退款/, 'orderDetail.applyRefund must hold refund button text');
  const src = await readSource(PAGE);
  assert.match(src, /m\.applyRefund/, 'page must reference m.applyRefund');
});
