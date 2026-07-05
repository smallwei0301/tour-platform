/**
 * Issue #1596 — canShowGuideContact 純函式邊界測試。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { canShowGuideContact } from '../../src/lib/pre-tour-contact-eligibility.mjs';

const START = '2026-08-01T01:00:00Z'; // 活動開始
const END = '2026-08-01T06:00:00Z';

test('T1596.1 — confirmed 且在 24h 內 → 可顯示', () => {
  assert.equal(canShowGuideContact({
    status: 'confirmed', scheduleStartAt: START, scheduleEndAt: END,
    now: '2026-07-31T12:00:00Z', // 開始前 13h
  }), true);
});

test('T1596.2 — 恰好 24h 前的邊界 → 可顯示', () => {
  assert.equal(canShowGuideContact({
    status: 'confirmed', scheduleStartAt: START, scheduleEndAt: END,
    now: '2026-07-31T01:00:00Z', // 開始前恰 24h
  }), true);
});

test('T1596.3 — 24h 之前（25h）→ 不顯示', () => {
  assert.equal(canShowGuideContact({
    status: 'confirmed', scheduleStartAt: START, scheduleEndAt: END,
    now: '2026-07-31T00:00:00Z', // 開始前 25h
  }), false);
});

test('T1596.4 — 活動結束後 → 不顯示', () => {
  assert.equal(canShowGuideContact({
    status: 'confirmed', scheduleStartAt: START, scheduleEndAt: END,
    now: '2026-08-01T07:00:00Z', // 結束後 1h
  }), false);
});

test('T1596.5 — 活動進行中（start 與 end 之間）→ 可顯示', () => {
  assert.equal(canShowGuideContact({
    status: 'confirmed', scheduleStartAt: START, scheduleEndAt: END,
    now: '2026-08-01T03:00:00Z',
  }), true);
});

test('T1596.6 — 非 confirmed 狀態一律不顯示', () => {
  for (const status of ['paid', 'pending', 'completed', 'canceled', 'refund_pending']) {
    assert.equal(canShowGuideContact({
      status, scheduleStartAt: START, scheduleEndAt: END, now: '2026-07-31T12:00:00Z',
    }), false, `${status} 不應顯示`);
  }
});

test('T1596.7 — 缺時間/非法時間 → 不顯示（不丟錯）', () => {
  assert.equal(canShowGuideContact({ status: 'confirmed', now: '2026-07-31T12:00:00Z' }), false);
  assert.equal(canShowGuideContact({ status: 'confirmed', scheduleStartAt: 'bad', now: 'also-bad' }), false);
  assert.equal(canShowGuideContact({}), false);
});

test('T1596.8 — 無 end：以 start+24h 為保守結束', () => {
  assert.equal(canShowGuideContact({
    status: 'confirmed', scheduleStartAt: START, scheduleEndAt: null,
    now: '2026-08-01T20:00:00Z', // 開始後 19h，仍在 start+24h 內
  }), true);
  assert.equal(canShowGuideContact({
    status: 'confirmed', scheduleStartAt: START, scheduleEndAt: null,
    now: '2026-08-02T02:00:00Z', // 開始後 25h，超過 start+24h
  }), false);
});
