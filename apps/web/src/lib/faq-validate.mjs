/**
 * FAQ validation utilities for Issue #342
 * Validates FAQ entries shape and constraints before saving to activities.faq
 */

const MAX_CHARS = 500;

/**
 * Validate an array of FAQ entries.
 * Accepts both {question, answer} and legacy {q, a} shapes.
 *
 * @param {unknown} entries
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateFaqEntries(entries) {
  if (!Array.isArray(entries)) {
    return { ok: false, errors: ['faq must be an array'] };
  }

  const errors = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const question = entry.question ?? entry.q ?? '';
    const answer = entry.answer ?? entry.a ?? '';

    if (!question || !question.trim()) {
      errors.push(`entry[${i}]: question must not be empty`);
    } else if (question.length > MAX_CHARS) {
      errors.push(`entry[${i}]: question exceeds ${MAX_CHARS} characters (got ${question.length})`);
    }

    if (!answer || !answer.trim()) {
      errors.push(`entry[${i}]: answer must not be empty`);
    } else if (answer.length > MAX_CHARS) {
      errors.push(`entry[${i}]: answer exceeds ${MAX_CHARS} characters (got ${answer.length})`);
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Returns the Next.js cache tag for an activity by slug.
 * Matches the tag used in unstable_cache in the activity detail page.
 *
 * @param {string} slug
 * @returns {string}
 */
export function getFaqRevalidationTag(slug) {
  return `activity:${slug}`;
}
