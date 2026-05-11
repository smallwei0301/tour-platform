/**
 * Tests for Issue #342: Activity FAQ management
 *
 * AC#4: FAQ entries validate {question, answer} non-empty, max 500 chars
 * AC#5: Activity detail page cache revalidated after FAQ update
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateFaqEntries } from '../../src/lib/faq-validate.mjs';
import { getFaqRevalidationTag } from '../../src/lib/faq-validate.mjs';

// ── AC#4: FAQ validation ────────────────────────────────────────────────────

test('validateFaqEntries accepts valid {question, answer} entries', () => {
  const result = validateFaqEntries([
    { question: '集合地點在哪裡？', answer: '在台北車站東三門外集合' },
    { question: '需要自備裝備嗎？', answer: '不需要，所有裝備由導遊提供' },
  ]);
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.errors, []);
});

test('validateFaqEntries accepts valid {q, a} entries (legacy shape)', () => {
  const result = validateFaqEntries([
    { q: '集合地點在哪裡？', a: '在台北車站東三門外集合' },
  ]);
  assert.strictEqual(result.ok, true);
});

test('validateFaqEntries rejects empty question', () => {
  const result = validateFaqEntries([
    { question: '', answer: '有效回答' },
  ]);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some(e => /question/.test(e) || /問題/.test(e)), `Expected question error, got: ${JSON.stringify(result.errors)}`);
});

test('validateFaqEntries rejects empty answer', () => {
  const result = validateFaqEntries([
    { question: '有效問題', answer: '' },
  ]);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some(e => /answer/.test(e) || /回答/.test(e)), `Expected answer error, got: ${JSON.stringify(result.errors)}`);
});

test('validateFaqEntries rejects question exceeding 500 chars', () => {
  const longQuestion = 'Q'.repeat(501);
  const result = validateFaqEntries([
    { question: longQuestion, answer: '有效回答' },
  ]);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some(e => /500/.test(e) || /question/.test(e)), `Expected length error, got: ${JSON.stringify(result.errors)}`);
});

test('validateFaqEntries rejects answer exceeding 500 chars', () => {
  const longAnswer = 'A'.repeat(501);
  const result = validateFaqEntries([
    { question: '有效問題', answer: longAnswer },
  ]);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some(e => /500/.test(e) || /answer/.test(e)), `Expected length error, got: ${JSON.stringify(result.errors)}`);
});

test('validateFaqEntries accepts entries at exactly 500 chars boundary', () => {
  const result = validateFaqEntries([
    { question: 'Q'.repeat(500), answer: 'A'.repeat(500) },
  ]);
  assert.strictEqual(result.ok, true);
});

test('validateFaqEntries rejects non-array input', () => {
  const result = validateFaqEntries('not an array');
  assert.strictEqual(result.ok, false);
});

test('validateFaqEntries accepts empty array (clearing all FAQs)', () => {
  const result = validateFaqEntries([]);
  assert.strictEqual(result.ok, true);
});

// ── AC#5: Cache revalidation tag ────────────────────────────────────────────

test('getFaqRevalidationTag returns correct cache tag for activity slug', () => {
  const tag = getFaqRevalidationTag('taipei-night-tour');
  assert.strictEqual(tag, 'activity:taipei-night-tour');
});

test('getFaqRevalidationTag returns tag for any slug', () => {
  const tag = getFaqRevalidationTag('kaohsiung-chaishan-cave-experience');
  assert.strictEqual(tag, 'activity:kaohsiung-chaishan-cave-experience');
});
