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
import path from 'node:path';

const ROOT = process.cwd();

async function readSource(relPath) {
  return readFile(path.join(ROOT, relPath), 'utf8');
}

const PAGE = 'app/me/orders/[orderId]/page.tsx';

// ─── AC1: scheduleStartAt displayed in 訂單資訊 card ─────────────────────────

test('AC1: 訂單資訊 card renders 出發時間 label', async () => {
  const src = await readSource(PAGE);
  assert.match(src, /出發時間/, '訂單資訊 card must have a 出發時間 label row');
});

test('AC1: scheduleStartAt is formatted with toLocaleString zh-TW', async () => {
  const src = await readSource(PAGE);
  // Must call toLocaleString with zh-TW locale on scheduleStartAt
  assert.match(
    src,
    /scheduleStartAt[\s\S]{0,120}toLocaleString\s*\(\s*['"]zh-TW['"]/,
    'scheduleStartAt must be formatted via toLocaleString("zh-TW")'
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

test('AC2: page contains "行程已開始/結束，無法線上申請退款，請聯絡客服" copy', async () => {
  const src = await readSource(PAGE);
  assert.match(
    src,
    /行程已開始[\s\S]{0,10}結束，無法線上申請退款，請聯絡客服/,
    'must contain departure-passed info copy "行程已開始/結束，無法線上申請退款，請聯絡客服"'
  );
});

test('AC2: departure-passed block is shown when departureNotPassed is false AND status is paid/confirmed', async () => {
  const src = await readSource(PAGE);
  // The block must be gated on departureNotPassed being false (i.e. !departureNotPassed)
  // and must be inside the paid/confirmed status flow
  const hasDeparturePassed = /!departureNotPassed[\s\S]{0,400}行程已開始|行程已開始[\s\S]{0,400}!departureNotPassed/.test(src);
  const hasDeparturePassedAlt = /departureNotPassed\s*===\s*false[\s\S]{0,400}行程已開始|行程已開始[\s\S]{0,400}departureNotPassed\s*===\s*false/.test(src);
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
    /\[['"]paid['"],\s*['"]confirmed['"]\][\s\S]{0,500}行程已開始|行程已開始[\s\S]{0,500}\[['"]paid['"],\s*['"]confirmed['"]\]/,
    'departure-passed copy must be scoped to paid/confirmed status check'
  );
});

// ─── AC3: pre-completion review hint ─────────────────────────────────────────

test('AC3: page contains "行程完成後即可撰寫評價" hint text', async () => {
  const src = await readSource(PAGE);
  assert.match(
    src,
    /行程完成後即可撰寫評價/,
    'must have hint "行程完成後即可撰寫評價" for non-completed orders'
  );
});

test('AC3: hint is shown when NOT completed AND NOT terminal', async () => {
  const src = await readSource(PAGE);
  // The hint must be rendered in the NOT-completed, NOT-terminal branch
  // It must not be inside the status === 'completed' block
  // Look for: isTerminal or !isTerminal near the hint, outside the completed block
  const hintNearTerminal = /!isTerminal[\s\S]{0,600}行程完成後即可撰寫評價|行程完成後即可撰寫評價[\s\S]{0,600}!isTerminal/.test(src);
  assert.ok(
    hintNearTerminal,
    'hint "行程完成後即可撰寫評價" must appear in a block guarded by !isTerminal'
  );
});

test('AC3: hint does NOT appear inside the review-eligible block (review form handles paid/confirmed/completed)', async () => {
  const src = await readSource(PAGE);
  // Review form section is now gated by ['paid','confirmed','completed'].includes(status)
  // The hint must be OUTSIDE that block, i.e., guarded by the negation of that condition
  // Pattern: !['paid','confirmed','completed'].includes(status) near the hint
  assert.match(
    src,
    /!\s*\[['"]paid['"],\s*['"]confirmed['"],\s*['"]completed['"]\]\.includes\(status\)[\s\S]{0,400}行程完成後即可撰寫評價|行程完成後即可撰寫評價[\s\S]{0,400}!\s*\[['"]paid['"],\s*['"]confirmed['"],\s*['"]completed['"]\]\.includes\(status\)/,
    'hint must be rendered outside the [paid,confirmed,completed].includes(status) block'
  );
});

// ─── AC4: Existing flows unchanged ───────────────────────────────────────────

test('AC4: completed status still shows 撰寫評價 button (review form includes completed)', async () => {
  const src = await readSource(PAGE);
  // Review form is now gated on ['paid','confirmed','completed'].includes(status) — completed is still included
  assert.match(
    src,
    /\[['"]paid['"],\s*['"]confirmed['"],\s*['"]completed['"]\]\.includes\(status\)/,
    'review form must be gated on [\'paid\',\'confirmed\',\'completed\'].includes(status) — completed still covered'
  );
  assert.match(src, /撰寫評價/, 'review button text 撰寫評價 must still exist');
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
  const src = await readSource(PAGE);
  assert.match(src, /申請取消\/退款|申請取消.退款/, 'refund button text must remain');
});
