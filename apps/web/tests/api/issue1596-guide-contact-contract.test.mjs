/**
 * Issue #1596 — 行前導遊聯絡：composeDisclosure 雙閘＋route/db source-contract。
 *
 * 核心安全性質：資格外一律回 null（不外洩電話）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { composeDisclosure } from '../../src/lib/db-pre-tour-contact.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

const START = '2026-08-01T01:00:00Z';
const END = '2026-08-01T06:00:00Z';
const IN_WINDOW = '2026-07-31T12:00:00Z';

test('T1596c.1 — 資格＋同意皆通過 → 回 {name, phone}', () => {
  const r = composeDisclosure({
    status: 'confirmed', scheduleStartAt: START, scheduleEndAt: END, now: IN_WINDOW,
    guideName: '陳嚮導', contactPhone: '0912345678', contactPhoneVisible: true,
  });
  assert.deepEqual(r, { name: '陳嚮導', phone: '0912345678' });
});

test('T1596c.2 — 導遊未同意（visible=false）→ null，即使資格通過', () => {
  const r = composeDisclosure({
    status: 'confirmed', scheduleStartAt: START, scheduleEndAt: END, now: IN_WINDOW,
    guideName: '陳嚮導', contactPhone: '0912345678', contactPhoneVisible: false,
  });
  assert.equal(r, null);
});

test('T1596c.3 — 資格不符（25h 前）→ null，即使同意揭露', () => {
  const r = composeDisclosure({
    status: 'confirmed', scheduleStartAt: START, scheduleEndAt: END, now: '2026-07-31T00:00:00Z',
    guideName: '陳嚮導', contactPhone: '0912345678', contactPhoneVisible: true,
  });
  assert.equal(r, null);
});

test('T1596c.4 — 無電話 → null', () => {
  assert.equal(composeDisclosure({
    status: 'confirmed', scheduleStartAt: START, scheduleEndAt: END, now: IN_WINDOW,
    guideName: '陳嚮導', contactPhone: '', contactPhoneVisible: true,
  }), null);
});

test('T1596c.5 — 無 guideName → 以「導遊」代替', () => {
  const r = composeDisclosure({
    status: 'confirmed', scheduleStartAt: START, scheduleEndAt: END, now: IN_WINDOW,
    guideName: null, contactPhone: '0900000000', contactPhoneVisible: true,
  });
  assert.equal(r?.name, '導遊');
});

test('T1596c.6 — route source-contract：ownership＋資格外回 null、不外洩電話', () => {
  const src = read('app/api/v2/orders/[orderId]/guide-contact/route.ts');
  assert.match(src, /getEligibleGuideContactDb/, 'route 應走 db 領域函式');
  assert.match(src, /guideContact/, '回應欄位為 guideContact');
  // 不得把 phone 直接從 request/order 塞回應（唯一來源是 db 函式的 gated 結果）
  assert.ok(!/contact_phone|contactPhone/.test(src.replace(/guide-contact|getEligibleGuideContactDb/g, '')),
    'route 不得自行組電話欄位，一律由 gated db 函式提供');
});

test('T1596c.7 — db 領域檔走 strangler（不進 db.mjs）＋用資格純函式', () => {
  const src = read('src/lib/db-pre-tour-contact.mjs');
  assert.match(src, /canShowGuideContact/, '應用資格純函式');
  assert.match(src, /contact_phone_visible/, '應檢查導遊同意欄位');
  const dbSrc = read('src/lib/db.mjs');
  assert.ok(!/getEligibleGuideContactDb/.test(dbSrc), '不得寫進 db.mjs 單體');
});
