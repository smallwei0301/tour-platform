import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const src = readFileSync(new URL('../../src/lib/db.mjs', import.meta.url), 'utf8');
const mapperSource = src.slice(src.indexOf('function normalizeActivityDetailFormalPlan('), src.indexOf('\n}', src.indexOf('function normalizeActivityDetailFormalPlan(')) + 2);
const mapper = vm.runInNewContext(`(${mapperSource})`);
for (const value of [null, undefined, 0, 7]) {
  test(`formal plan mapper preserves nullable days: ${value}`, () => {
    const result = mapper({ confirm_by_days: value, free_cancel_days: value });
    assert.equal(result.confirmByDays, value);
    assert.equal(result.freeCancelDays, value);
  });
}
test('public copy expresses all V2 boundaries in both languages', async () => {
  const { publicRefundRules, formatPlanConfirmation } = await import('../../src/lib/public-policy/copy.mjs');
  for (const locale of ['zh-Hant', 'en']) {
    const rules = publicRefundRules(locale);
    assert.equal(rules.length, 3);
    assert.match(rules[0], /168.*100%/);
    assert.match(rules[1], /72.*168.*70%/);
    assert.match(rules[2], /72.*0%/);
    for (const missing of [null, undefined]) assert.equal(formatPlanConfirmation(locale, missing), null);
    for (const days of [0, 7]) assert.ok(formatPlanConfirmation(locale, days).includes(String(days)));
  }
});

// Verify precise boundaries against the existing production calculator without changing it.
test('V2 display percentages agree with the calculator at exact millisecond boundaries', async () => {
  const { calculateRefundAmount } = await import('../../src/lib/refund-policy.ts');
  const { publicRefundRules } = await import('../../src/lib/public-policy/copy.mjs');
  const policy = { version: 'v2', tiers: [
    { cutoff_hours: 168, label: '7d+', refund_pct: 100 },
    { cutoff_hours: 72, label: '3-7d', refund_pct: 70 },
    { cutoff_hours: 0, label: '<=72h', refund_pct: 0 },
  ] };
  const now = new Date('2026-10-04T00:00:00Z');
  for (const [ms, index, percentage] of [
    [168 * 3600000, 0, 100], [168 * 3600000 - 1, 1, 70],
    [72 * 3600000 + 1, 1, 70], [72 * 3600000, 2, 0], [72 * 3600000 - 1, 2, 0],
  ]) {
    assert.equal(calculateRefundAmount(1000, new Date(now.getTime() + ms), policy, now).refund_pct, percentage);
    for (const locale of ['zh-Hant', 'en']) assert.ok(publicRefundRules(locale)[index].includes(`${percentage}%`));
  }
});
