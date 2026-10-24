/**
 * #1916：Midao 導遊端三個 command 的 idempotency-key 必須「同一次使用者操作重用同一把」，
 * 而不是每次呼叫 requests.api 都 crypto.randomUUID()（那會讓 server 端冪等永遠不會命中）。
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  conversionFingerprint,
  decideFingerprint,
  getKeyForPayload,
  getOrCreateKey,
  resetKey,
} from '../../src/features/midao/requests/idempotency-key.ts';
import {
  convertInquiry,
  decideBookingRequest,
  markInquiryReplied,
} from '../../src/features/midao/requests/requests.api.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

function stubFetch(t, { status = 200, body = { success: true, data: null } } = {}) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, headers: init.headers });
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  };
  t.after(() => { globalThis.fetch = original; });
  return calls;
}

const convertInput = {
  inquiryId: '11111111-1111-4111-8111-111111111111',
  activityPlanId: '55555555-5555-4555-8555-555555555555',
  confirmationTtlHours: 24,
  endAt: '2026-08-20T10:00:00.000Z',
  participants: 2,
  quotedTotalTwd: 3000,
  startAt: '2026-08-20T08:00:00.000Z',
};

test('getOrCreateKey 同一次操作重試沿用同一把 key，resetKey 之後換新', () => {
  const ref = { current: null };
  const first = getOrCreateKey(ref);
  assert.match(first, UUID);
  assert.equal(getOrCreateKey(ref), first);
  assert.equal(getOrCreateKey(ref), first);
  resetKey(ref);
  assert.equal(ref.current, null);
  const next = getOrCreateKey(ref);
  assert.match(next, UUID);
  assert.notEqual(next, first);
});

test('getKeyForPayload：payload 不變沿用 key，payload 改變換新 key', () => {
  const ref = { current: null };
  const first = getKeyForPayload(ref, { participants: 2, quotedTotalTwd: 3000 });
  assert.match(first, UUID);
  assert.equal(getKeyForPayload(ref, { participants: 2, quotedTotalTwd: 3000 }), first);
  const changed = getKeyForPayload(ref, { participants: 3, quotedTotalTwd: 3000 });
  assert.notEqual(changed, first);
  assert.equal(getKeyForPayload(ref, { participants: 3, quotedTotalTwd: 3000 }), changed);
  resetKey(ref);
  assert.notEqual(getKeyForPayload(ref, { participants: 3, quotedTotalTwd: 3000 }), changed);
});

test('requests.api：傳入 idempotencyKey 時 header 必須等於傳入值', async (t) => {
  const calls = stubFetch(t, { body: { success: true, data: { created: true, replayed: false, inquiryId: 'i', bookingId: 'b', orderId: 'o' } } });
  await decideBookingRequest({ bookingId: 'b1', action: 'approve', idempotencyKey: 'key-decide' });
  await markInquiryReplied({ inquiryId: 'i1', idempotencyKey: 'key-replied' });
  await convertInquiry({ ...convertInput, idempotencyKey: 'key-convert' });
  assert.deepEqual(calls.map((call) => call.headers['idempotency-key']), ['key-decide', 'key-replied', 'key-convert']);
});

test('requests.api：沒傳 idempotencyKey 時向下相容，自動產生 UUID 且每次不同', async (t) => {
  const calls = stubFetch(t);
  await decideBookingRequest({ bookingId: 'b1', action: 'approve' });
  await markInquiryReplied({ inquiryId: 'i1' });
  await markInquiryReplied({ inquiryId: 'i1' });
  await convertInquiry(convertInput);
  const keys = calls.map((call) => call.headers['idempotency-key']);
  assert.equal(keys.length, 4);
  for (const key of keys) assert.match(key, UUID);
  assert.equal(new Set(keys).size, 4);
});

test('三個呼叫端都把 key 傳進 requests.api，並用 ref 保存', async () => {
  const progress = await read('src/features/midao/requests/RequestProgressActions.tsx');
  const contact = await read('src/features/midao/requests/TravelerContactActions.tsx');
  const sheet = await read('src/features/midao/requests/InquiryConversionSheet.tsx');

  assert.match(progress, /idempotency-key['"]|from '\.\/idempotency-key'/u);
  assert.match(progress, /getKeyForPayload\(/u);
  assert.match(progress, /resetKey\(/u);
  assert.match(progress, /decideBookingRequest\(\{[\s\S]*?idempotencyKey/u);

  assert.match(contact, /from '\.\/idempotency-key'/u);
  assert.match(contact, /getOrCreateKey\(/u);
  assert.match(contact, /resetKey\(/u);
  assert.match(contact, /markInquiryReplied\(\{[\s\S]*?idempotencyKey/u);
  assert.match(contact, /pendingRef = useRef\(false\)/u, '防連點需要 pendingRef');
  assert.match(contact, /if \(pendingRef\.current\) return;/u);
  assert.match(contact, /finally \{[\s\S]*?pendingRef\.current = false;[\s\S]*?setPending\(false\);/u);

  assert.match(sheet, /from '\.\/idempotency-key'/u);
  assert.match(sheet, /getKeyForPayload\(/u);
  assert.match(sheet, /resetKey\(/u);
  assert.match(sheet, /convertInquiry\(\{[\s\S]*?idempotencyKey/u);
});

test('RequestProgressActions：openConfirmation 產生 key，取消／成功／衝突時清掉', async () => {
  const progress = await read('src/features/midao/requests/RequestProgressActions.tsx');
  const open = progress.slice(progress.indexOf('const openConfirmation'), progress.indexOf('const submit'));
  assert.match(open, /resetKey\(keyRef\)/u, '開新對話框前先清舊 key（action 改變）');
  assert.equal((progress.match(/resetKey\(keyRef\)/gu) ?? []).length >= 4, true, '取消×2、成功、衝突皆清除');
});

test('decideFingerprint：note 不同則不同；trim 後相同則相同，且與實際送出的 body 一致', async (t) => {
  const reject = (note) => decideFingerprint({ action: 'reject', note });
  assert.notEqual(reject('原因甲'), reject('原因乙'));
  assert.equal(reject('原因甲'), reject('  原因甲 \n'));
  assert.notEqual(decideFingerprint({ action: 'approve' }), reject('原因甲'));
  assert.equal(decideFingerprint({ action: 'approve', note: 'ignored' }), decideFingerprint({ action: 'approve' }));

  const original = globalThis.fetch;
  let sent = null;
  globalThis.fetch = async (_url, init) => {
    sent = init.body;
    return new Response('{}', { status: 200 });
  };
  t.after(() => { globalThis.fetch = original; });
  await decideBookingRequest({ bookingId: 'b1', action: 'reject', note: '  原因甲 ' });
  assert.equal(sent, reject('  原因甲 '));
  await decideBookingRequest({ bookingId: 'b1', action: 'approve' });
  assert.equal(sent, decideFingerprint({ action: 'approve' }));
});

test('conversionFingerprint：每個會送出的欄位改變都會改變 fingerprint，guideNote 以 trim 比對', () => {
  const base = { ...convertInput, guideNote: '備註' };
  const baseline = conversionFingerprint(base);
  const changes = {
    inquiryId: 'other', activityPlanId: 'other', confirmationTtlHours: 48,
    endAt: '2026-08-20T11:00:00.000Z', participants: 3, quotedTotalTwd: 3100,
    startAt: '2026-08-20T07:00:00.000Z', guideNote: '另一則備註',
  };
  for (const [field, value] of Object.entries(changes)) {
    assert.notEqual(conversionFingerprint({ ...base, [field]: value }), baseline, field);
  }
  assert.equal(conversionFingerprint({ ...base, guideNote: '  備註  ' }), baseline);
  assert.equal(conversionFingerprint({ ...base, guideNote: undefined }), conversionFingerprint({ ...base, guideNote: '   ' }));
});

test('元件改用 fingerprint 純函式；MARK_REPLIED_ERRORS 涵蓋 server 實際回的 INVALID_INQUIRY_STATE', async () => {
  const progress = await read('src/features/midao/requests/RequestProgressActions.tsx');
  const sheet = await read('src/features/midao/requests/InquiryConversionSheet.tsx');
  const contact = await read('src/features/midao/requests/TravelerContactActions.tsx');
  assert.match(progress, /getKeyForPayload\(keyRef, decideFingerprint\(/u);
  assert.match(sheet, /getKeyForPayload\(keyRef, conversionFingerprint\(/u);
  const table = contact.slice(contact.indexOf('MARK_REPLIED_ERRORS'), contact.indexOf('};'));
  assert.match(table, /INVALID_INQUIRY_STATE:\s*'[^']+'/u);
});
