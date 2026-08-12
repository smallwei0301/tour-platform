// #1759 Package 4 / Task 41 — checkout gate #2：LINE 詢問單轉來的 booking
// 必須旅客本人透過一次性確認連結接受後才能進付款。
//
// 純函式段對應 Lane A 計畫 §4.2 決策表 R1-R7（T-C1~T-C10）；
// source-contract 段鎖定 checkout route 接線與「不得加 optional-column
// fallback」的 D4 決策（T-S1~T-S7）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { canCheckoutTravelerConfirmation } from '../../src/lib/booking-type-flow.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(
  join(__dirname, '../../app/api/v2/bookings/[bookingId]/checkout/route.ts'),
  'utf8',
);

const INQUIRY_ID = '11111111-1111-4111-8111-111111111111';

// ---------------------------------------------------------------------------
// 純函式段 — §4.2 決策表 R1-R7
// ---------------------------------------------------------------------------

test('T-C1 R1: inquiry booking confirmed → allow', () => {
  const result = canCheckoutTravelerConfirmation({
    sourceInquiryId: INQUIRY_ID,
    travelerConfirmationStatus: 'confirmed',
  });
  assert.equal(result.allowed, true);
});

test('T-C2 R2: inquiry booking pending → block TRAVELER_CONFIRMATION_REQUIRED', () => {
  const result = canCheckoutTravelerConfirmation({
    sourceInquiryId: INQUIRY_ID,
    travelerConfirmationStatus: 'pending',
  });
  assert.equal(result.allowed, false);
  assert.equal(result.code, 'TRAVELER_CONFIRMATION_REQUIRED');
});

test('T-C3 R3: inquiry booking expired → block TRAVELER_CONFIRMATION_EXPIRED', () => {
  const result = canCheckoutTravelerConfirmation({
    sourceInquiryId: INQUIRY_ID,
    travelerConfirmationStatus: 'expired',
  });
  assert.equal(result.allowed, false);
  assert.equal(result.code, 'TRAVELER_CONFIRMATION_EXPIRED');
});

test('T-C4 R4: inquiry booking stuck at not_required → fail-closed block', () => {
  const result = canCheckoutTravelerConfirmation({
    sourceInquiryId: INQUIRY_ID,
    travelerConfirmationStatus: 'not_required',
  });
  assert.equal(result.allowed, false);
  assert.equal(result.code, 'TRAVELER_CONFIRMATION_REQUIRED');
});

test('T-C5 R5: existing non-inquiry booking (null + not_required) → allow（零影響）', () => {
  const result = canCheckoutTravelerConfirmation({
    sourceInquiryId: null,
    travelerConfirmationStatus: 'not_required',
  });
  assert.equal(result.allowed, true);
});

test('T-C6 R7: in-memory fallback booking (both undefined) → allow', () => {
  const result = canCheckoutTravelerConfirmation({
    sourceInquiryId: undefined,
    travelerConfirmationStatus: undefined,
  });
  assert.equal(result.allowed, true);
});

test('T-C7 R6: inquiry booking with unknown/missing status → fail-closed block', () => {
  const missing = canCheckoutTravelerConfirmation({
    sourceInquiryId: INQUIRY_ID,
    travelerConfirmationStatus: undefined,
  });
  assert.equal(missing.allowed, false);
  assert.equal(missing.code, 'TRAVELER_CONFIRMATION_REQUIRED');

  const unknown = canCheckoutTravelerConfirmation({
    sourceInquiryId: INQUIRY_ID,
    travelerConfirmationStatus: 'something_else',
  });
  assert.equal(unknown.allowed, false);
  assert.equal(unknown.code, 'TRAVELER_CONFIRMATION_REQUIRED');

  const nulled = canCheckoutTravelerConfirmation({
    sourceInquiryId: INQUIRY_ID,
    travelerConfirmationStatus: null,
  });
  assert.equal(nulled.allowed, false);
  assert.equal(nulled.code, 'TRAVELER_CONFIRMATION_REQUIRED');
});

test('T-C8: empty-string sourceInquiryId counts as no inquiry → allow', () => {
  const result = canCheckoutTravelerConfirmation({
    sourceInquiryId: '',
    travelerConfirmationStatus: 'not_required',
  });
  assert.equal(result.allowed, true);
});

test('T-C9: null inquiry + confirmed → allow', () => {
  const result = canCheckoutTravelerConfirmation({
    sourceInquiryId: null,
    travelerConfirmationStatus: 'confirmed',
  });
  assert.equal(result.allowed, true);
});

test('T-C10: every block branch returns a non-empty zh message and a known code', () => {
  const blockingInputs = [
    { sourceInquiryId: INQUIRY_ID, travelerConfirmationStatus: 'pending' },
    { sourceInquiryId: INQUIRY_ID, travelerConfirmationStatus: 'expired' },
    { sourceInquiryId: INQUIRY_ID, travelerConfirmationStatus: 'not_required' },
    { sourceInquiryId: INQUIRY_ID, travelerConfirmationStatus: undefined },
    { sourceInquiryId: INQUIRY_ID, travelerConfirmationStatus: 'bogus' },
  ];
  const knownCodes = ['TRAVELER_CONFIRMATION_REQUIRED', 'TRAVELER_CONFIRMATION_EXPIRED'];

  for (const input of blockingInputs) {
    const result = canCheckoutTravelerConfirmation(input);
    assert.equal(result.allowed, false, `expected block for ${JSON.stringify(input)}`);
    assert.ok(knownCodes.includes(result.code), `unexpected code: ${result.code}`);
    assert.equal(typeof result.messageZh, 'string');
    assert.ok(result.messageZh.length > 0, 'messageZh must be non-empty');
    assert.match(result.messageZh, /[\u4e00-\u9fff]/, 'messageZh must contain Chinese');
  }
});

// ---------------------------------------------------------------------------
// source-contract 段 — checkout route 接線
// ---------------------------------------------------------------------------

test('T-S1: checkout route calls canCheckoutTravelerConfirmation', () => {
  assert.match(SRC, /canCheckoutTravelerConfirmation\(/);
});

test('T-S2: booking select includes source_inquiry_id and traveler_confirmation_status', () => {
  const bookingSelect = SRC.slice(
    SRC.indexOf(".from('bookings')"),
    SRC.indexOf('if (bookingError'),
  );
  assert.ok(bookingSelect.length > 0, 'booking select block not found');
  assert.match(bookingSelect, /source_inquiry_id/);
  assert.match(bookingSelect, /traveler_confirmation_status/);
});

test('T-S3: confirmation gate runs after the draft-status check', () => {
  const gateIdx = SRC.indexOf('canCheckoutTravelerConfirmation(');
  const draftCheckIdx = SRC.indexOf("booking.status !== 'draft'");
  assert.ok(draftCheckIdx > -1, 'draft check not found');
  assert.ok(gateIdx > draftCheckIdx, 'confirmation gate must run after draft check');
});

test('T-S4: confirmation gate runs before the order fetch / payment logic', () => {
  const gateIdx = SRC.indexOf('canCheckoutTravelerConfirmation(');
  const orderFetchIdx = SRC.indexOf(".from('orders')");
  assert.ok(orderFetchIdx > -1, 'order fetch not found');
  assert.ok(gateIdx > -1 && gateIdx < orderFetchIdx, 'confirmation gate must run before order logic');
});

test('T-S5: confirmation gate returns 409', () => {
  const gateIdx = SRC.indexOf('canCheckoutTravelerConfirmation(');
  assert.ok(gateIdx > -1, 'confirmation gate not found');
  const gateSlice = SRC.slice(gateIdx, gateIdx + 300);
  assert.match(gateSlice, /status:\s*409/);
});

test('T-S6: confirmation gate sits after the existing canCheckout( gate', () => {
  const legacyGateIdx = SRC.indexOf('canCheckout(');
  const gateIdx = SRC.indexOf('canCheckoutTravelerConfirmation(');
  assert.ok(legacyGateIdx > -1, 'existing canCheckout( call not found');
  assert.ok(gateIdx > legacyGateIdx, 'confirmation gate must come after the approval gate');
});

test('T-S7: booking select must NOT use selectWithOptionalColumnFallback (D4)', () => {
  const startIdx = SRC.indexOf('const { data: booking, error: bookingError }');
  const endIdx = SRC.indexOf('if (bookingError');
  assert.ok(startIdx > -1, 'booking fetch statement not found');
  assert.ok(endIdx > startIdx, 'bookingError check not found after booking fetch');
  const bookingFetch = SRC.slice(startIdx, endIdx);
  assert.doesNotMatch(bookingFetch, /selectWithOptionalColumnFallback/);
});

test('T-S8: checkout binds a named privileged client for service-role-only booking data', () => {
  assert.match(
    SRC,
    /const privilegedDb = paymentDb;/,
    'checkout must make its service-role data-access client explicit',
  );
  assert.match(SRC, /privilegedDb\s*\n?\s*\.from\(\s*['"]bookings['"]\s*\)/);
  assert.match(SRC, /privilegedDb\.from\('orders'\)/);
  assert.match(SRC, /privilegedDb\s*\n?\s*\.from\(\s*['"]booking_status_logs['"]\s*\)/);
  assert.doesNotMatch(
    SRC,
    /supabase\s*\n?\s*\.from\(\s*['"](?:bookings|orders|booking_status_logs)['"]\s*\)/,
    'SSR client is only for auth; service-role-only tables must use privilegedDb',
  );
});

test('T-S9: booking query selects traveler_id for application-layer ownership enforcement', () => {
  const bookingSelect = SRC.slice(
    SRC.indexOf(".from('bookings')"),
    SRC.indexOf('if (bookingError'),
  );
  assert.match(bookingSelect, /traveler_id/);
});

test('T-S10: traveler owner check returns generic 404 before confirmation, order, and payment paths', () => {
  const authIdx = SRC.indexOf('supabase.auth.getUser()');
  const ownershipIdx = SRC.indexOf('booking.traveler_id !== traveler.id');
  const confirmationIdx = SRC.indexOf('canCheckoutTravelerConfirmation(');
  const orderFetchIdx = SRC.indexOf(".from('orders')");
  const paymentIdx = SRC.indexOf(".from('payments')");

  assert.ok(authIdx > -1, 'traveler authentication not found');
  assert.ok(ownershipIdx > authIdx, 'ownership check must follow traveler authentication');
  assert.ok(confirmationIdx > ownershipIdx, 'ownership check must precede confirmation gate');
  assert.ok(orderFetchIdx > ownershipIdx, 'ownership check must precede order lookup');
  assert.ok(paymentIdx > ownershipIdx, 'ownership check must precede payment access');
  const ownershipSlice = SRC.slice(ownershipIdx - 180, ownershipIdx + 240);
  assert.match(ownershipSlice, /NOT_FOUND/);
  assert.match(ownershipSlice, /status:\s*404/);
});
