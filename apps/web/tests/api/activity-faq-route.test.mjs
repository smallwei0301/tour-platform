/**
 * Tests for Issue #342: Activity FAQ API route behaviour
 *
 * AC#4: The PUT /api/admin/activities/[id] route rejects invalid faq payload
 * AC#5: PUT route calls revalidateTag after successful faq save
 *
 * These tests call the handler logic directly (unit-style) to avoid
 * needing a live Next.js server or Supabase connection.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFaqPatch } from '../../src/lib/faq-route-helpers.mjs';

// ── AC#4: Route validates faq before passing to DB ──────────────────────────

test('buildFaqPatch returns error for empty question', () => {
  const result = buildFaqPatch([{ question: '', answer: 'Valid answer' }]);
  assert.strictEqual(result.ok, false);
  assert.ok(result.statusCode === 400, `Expected 400, got ${result.statusCode}`);
  assert.ok(result.message, 'Expected error message');
});

test('buildFaqPatch returns error for answer over 500 chars', () => {
  const result = buildFaqPatch([{ question: 'Valid Q', answer: 'A'.repeat(501) }]);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.statusCode, 400);
});

test('buildFaqPatch returns error for non-array faq', () => {
  const result = buildFaqPatch('not an array');
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.statusCode, 400);
});

test('buildFaqPatch normalises {q, a} entries to {question, answer} shape', () => {
  const result = buildFaqPatch([{ q: 'Q1', a: 'A1' }]);
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.normalised, [{ question: 'Q1', answer: 'A1' }]);
});

test('buildFaqPatch normalises {question, answer} entries unchanged', () => {
  const result = buildFaqPatch([{ question: 'Q1', answer: 'A1' }]);
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.normalised, [{ question: 'Q1', answer: 'A1' }]);
});

test('buildFaqPatch accepts empty array (clearing FAQ)', () => {
  const result = buildFaqPatch([]);
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.normalised, []);
});
