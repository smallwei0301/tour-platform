/**
 * FAQ route helper utilities for Issue #342 — TypeScript entry point.
 * Re-exports from the canonical .mjs module (single source of truth, #1376):
 * node --test 的 .mjs 測試與 production route 因此測／跑同一份實作。
 */

export type FaqEntry = { question: string; answer: string };

export type FaqPatchSuccess = { ok: true; normalised: FaqEntry[] };
export type FaqPatchError = { ok: false; statusCode: 400; message: string };
export type FaqPatchResult = FaqPatchSuccess | FaqPatchError;

export { buildFaqPatch } from './faq-route-helpers.mjs';
