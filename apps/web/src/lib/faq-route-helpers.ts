/**
 * FAQ route helper utilities for Issue #342 — TypeScript entry point.
 * Re-exports from the canonical .mjs module for use in Next.js API routes.
 */

export type FaqEntry = { question: string; answer: string };

export type FaqPatchSuccess = { ok: true; normalised: FaqEntry[] };
export type FaqPatchError = { ok: false; statusCode: 400; message: string };
export type FaqPatchResult = FaqPatchSuccess | FaqPatchError;

const MAX_CHARS = 500;

function validateFaqEntries(entries: unknown): { ok: boolean; errors: string[] } {
  if (!Array.isArray(entries)) {
    return { ok: false, errors: ['faq must be an array'] };
  }
  const errors: string[] = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i] as Record<string, unknown>;
    const question = (entry.question ?? entry.q ?? '') as string;
    const answer = (entry.answer ?? entry.a ?? '') as string;
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

export function buildFaqPatch(faq: unknown): FaqPatchResult {
  const validation = validateFaqEntries(faq);
  if (!validation.ok) {
    return { ok: false, statusCode: 400, message: validation.errors.join('; ') };
  }
  const arr = faq as Array<Record<string, unknown>>;
  const normalised: FaqEntry[] = arr.map((entry) => ({
    question: (entry.question ?? entry.q ?? '') as string,
    answer: (entry.answer ?? entry.a ?? '') as string,
  }));
  return { ok: true, normalised };
}

export function getFaqRevalidationTag(slug: string): string {
  return `activity:${slug}`;
}
