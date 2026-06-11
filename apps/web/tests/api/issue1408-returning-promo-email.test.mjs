/**
 * Issue #1408 — 會員回購起步版：review invitation 信掛老客專屬碼
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { buildReturningPromoEmailBlock, fetchReturningPromoEmailBlock } from '../../src/lib/returning-promo.mjs';

const NOW = '2026-06-11T00:00:00.000Z';

const VALID_ROW = {
  code: 'COMEBACK15',
  discount_type: 'percentage',
  discount_value: 15,
  active: true,
  expires_at: '2026-12-31T00:00:00.000Z',
  max_uses: 100,
  used_count: 3,
  public_label: '老客回歸 85 折',
};

// ── 純函式：信件區塊組裝 ─────────────────────────────────────────────────────

test('有效碼 + 未 opt-out → 產生含 code 與文案的 HTML 區塊', () => {
  const block = buildReturningPromoEmailBlock({ promoRow: VALID_ROW, marketingEmailOptIn: true, now: NOW });
  assert.ok(block, '應產生區塊');
  assert.equal(block.code, 'COMEBACK15');
  assert.match(block.html, /COMEBACK15/);
  assert.match(block.html, /老客回歸 85 折/);
});

test('opt-out（marketing_email_opt_in=false）→ null（交易內容不受影響由呼叫端保證）', () => {
  assert.equal(buildReturningPromoEmailBlock({ promoRow: VALID_ROW, marketingEmailOptIn: false, now: NOW }), null);
});

test('未設定碼 / 停用 / 過期 / 用罄 → null', () => {
  assert.equal(buildReturningPromoEmailBlock({ promoRow: null, marketingEmailOptIn: true, now: NOW }), null);
  assert.equal(buildReturningPromoEmailBlock({ promoRow: { ...VALID_ROW, active: false }, marketingEmailOptIn: true, now: NOW }), null);
  assert.equal(buildReturningPromoEmailBlock({ promoRow: { ...VALID_ROW, expires_at: '2026-06-10T00:00:00.000Z' }, marketingEmailOptIn: true, now: NOW }), null);
  assert.equal(buildReturningPromoEmailBlock({ promoRow: { ...VALID_ROW, used_count: 100 }, marketingEmailOptIn: true, now: NOW }), null);
});

test('max_uses<=0 視為不限量；無 public_label 以折扣內容組預設文案', () => {
  const block = buildReturningPromoEmailBlock({
    promoRow: { ...VALID_ROW, max_uses: 0, used_count: 999, public_label: null },
    marketingEmailOptIn: true,
    now: NOW,
  });
  assert.ok(block);
  assert.match(block.html, /COMEBACK15/);
  assert.ok(block.label, '應有 fallback 文案');
});

// ── 注入 client 的 resolver ─────────────────────────────────────────────────

test('fetchReturningPromoEmailBlock: env 未設定 → null（功能關閉，零查詢）', async () => {
  const calls = [];
  const fakeSupabase = { from: (t) => { calls.push(t); throw new Error('should not query'); } };
  const r = await fetchReturningPromoEmailBlock(fakeSupabase, { userId: 'u1', configuredCode: '', now: NOW });
  assert.equal(r, null);
  assert.equal(calls.length, 0);
});

test('fetchReturningPromoEmailBlock: 取碼+取 profile，opt-out 時回 null', async () => {
  const fakeSupabase = {
    from(table) {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => {
          if (table === 'promo_codes') return { data: VALID_ROW };
          if (table === 'traveler_profiles') return { data: { marketing_email_opt_in: false } };
          return { data: null };
        },
      };
      return chain;
    },
  };
  const r = await fetchReturningPromoEmailBlock(fakeSupabase, { userId: 'u1', configuredCode: 'COMEBACK15', now: NOW });
  assert.equal(r, null);
});

test('fetchReturningPromoEmailBlock: 有效碼 + 無 profile（視為未 opt-out）→ 區塊', async () => {
  const fakeSupabase = {
    from(table) {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => (table === 'promo_codes' ? { data: VALID_ROW } : { data: null }),
      };
      return chain;
    },
  };
  const r = await fetchReturningPromoEmailBlock(fakeSupabase, { userId: 'u1', configuredCode: 'COMEBACK15', now: NOW });
  assert.ok(r);
  assert.equal(r.code, 'COMEBACK15');
});

// ── source-contract：email 與兩個寄送點接線 ─────────────────────────────────

test('email.ts: ReviewInvitationData 支援 returningPromoHtml 並渲染於信件', () => {
  const src = readFileSync(path.resolve('src/lib/email.ts'), 'utf8');
  assert.match(src, /returningPromoHtml\?:\s*string/, 'interface 應有 optional returningPromoHtml');
  assert.match(src, /data\.returningPromoHtml/, '模板應插入區塊');
});

test('兩個寄送點皆接 fetchReturningPromoEmailBlock（fail-safe）', () => {
  for (const file of [
    'app/api/v2/admin/orders/[orderId]/send-review-invitation/route.ts',
    'app/api/internal/reviews/review-invitation-sweep/route.ts',
  ]) {
    const src = readFileSync(path.resolve(file), 'utf8');
    assert.match(src, /fetchReturningPromoEmailBlock/, `${file} 應接回購碼區塊`);
    assert.match(src, /RETURNING_CUSTOMER_PROMO_CODE/, `${file} 應讀 env 開關`);
  }
});
