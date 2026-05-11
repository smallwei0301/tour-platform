/**
 * FAQ route helper utilities for Issue #342
 * Used by the admin activity PUT route to validate and normalise faq payload.
 */
import { validateFaqEntries } from './faq-validate.mjs';

/**
 * Validate and normalise a faq payload from the request body.
 *
 * Accepts both {question, answer} and legacy {q, a} shapes.
 * Normalises all entries to {question, answer} before saving.
 *
 * @param {unknown} faq
 * @returns {{ ok: true, normalised: Array<{question: string, answer: string}> }
 *          | { ok: false, statusCode: 400, message: string }}
 */
export function buildFaqPatch(faq) {
  const validation = validateFaqEntries(faq);
  if (!validation.ok) {
    return {
      ok: false,
      statusCode: 400,
      message: validation.errors.join('; '),
    };
  }

  // Normalise to canonical {question, answer} shape
  const normalised = faq.map((entry) => ({
    question: entry.question ?? entry.q ?? '',
    answer: entry.answer ?? entry.a ?? '',
  }));

  return { ok: true, normalised };
}
