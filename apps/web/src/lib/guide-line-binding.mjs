// Guide ↔ LINE binding gateway (deep-link + binding-code mechanism).
//
// Flow: the guide console mints a one-time BIND-XXXXXX code and a line.me deep
// link; the guide taps it, LINE opens the bot chat pre-filled with the code,
// and the webhook redeems the code → binds line_user_id ↔ guide_id. Order
// events then resolve order → activity.guide → that guide's line_user_id.
//
// Mirrors line-binding.mjs: delegates to Supabase helpers when env is present,
// otherwise falls back to the in-memory store. PII: only line_user_id +
// guide_id + (optional) display name are stored.

import crypto from 'node:crypto';

import { guideLineMappings, guideLineBindCodes } from './store.mjs';

function hasSupabaseEnv() {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

const CODE_PREFIX = 'BIND-';
// Unambiguous alphabet (no 0/O/1/I) for codes a guide may read aloud / retype.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_BODY_LEN = 6;
const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes

/** Generate a fresh BIND-XXXXXX code string. */
function generateCode() {
  let body = '';
  const bytes = crypto.randomBytes(CODE_BODY_LEN);
  for (let i = 0; i < CODE_BODY_LEN; i += 1) {
    body += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return `${CODE_PREFIX}${body}`;
}

/** Extract a BIND code from arbitrary LINE message text (case-insensitive). */
export function parseGuideBindCode(text) {
  const match = String(text || '').toUpperCase().match(/BIND-[A-Z0-9]{6}/);
  return match ? match[0] : null;
}

// ---------------------------------------------------------------------------
// In-memory implementation
// ---------------------------------------------------------------------------

function findMappingByGuide(guideId) {
  return guideLineMappings.find((m) => m.guideId === guideId) || null;
}

function findMappingByLineUserId(lineUserId) {
  return guideLineMappings.find((m) => m.lineUserId === lineUserId) || null;
}

function upsertMappingInMemory({ guideId, lineUserId, displayName }) {
  const now = new Date().toISOString();
  const existing = findMappingByGuide(guideId);
  if (existing) {
    existing.lineUserId = lineUserId;
    if (displayName !== undefined) existing.displayName = displayName ?? null;
    existing.isBlocked = false;
    existing.updatedAt = now;
    return existing;
  }
  const created = {
    guideId,
    lineUserId,
    displayName: displayName ?? null,
    isBlocked: false,
    boundAt: now,
    updatedAt: now,
  };
  guideLineMappings.push(created);
  return created;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Mint a one-time binding code for a guide (invalidates the guide's prior codes). */
export async function createGuideBindCode(guideId, { ttlMs = DEFAULT_TTL_MS } = {}) {
  const id = String(guideId || '').trim();
  if (!id) throw new Error('createGuideBindCode: guideId required');
  const code = generateCode();
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  if (hasSupabaseEnv()) {
    const { createGuideBindCodeDb } = await import('./db.mjs');
    await createGuideBindCodeDb({ code, guideId: id, expiresAt });
    return { code, expiresAt };
  }
  // Drop any outstanding codes for this guide, then store the new one.
  for (let i = guideLineBindCodes.length - 1; i >= 0; i -= 1) {
    if (guideLineBindCodes[i].guideId === id) guideLineBindCodes.splice(i, 1);
  }
  guideLineBindCodes.push({ code, guideId: id, expiresAt, createdAt: new Date().toISOString() });
  return { code, expiresAt };
}

/**
 * Redeem a binding code captured from the webhook and bind the guide.
 * @returns {Promise<{ ok: true, guideId: string } | { ok: false, reason: string }>}
 */
export async function redeemGuideBindCode(code, { lineUserId, displayName } = {}) {
  const normalized = parseGuideBindCode(code);
  const luid = String(lineUserId || '').trim();
  if (!normalized) return { ok: false, reason: 'invalid_code' };
  if (!luid) return { ok: false, reason: 'no_line_user_id' };

  if (hasSupabaseEnv()) {
    const { consumeGuideBindCodeDb, upsertGuideLineMappingDb } = await import('./db.mjs');
    const consumed = await consumeGuideBindCodeDb(normalized);
    if (!consumed) return { ok: false, reason: 'invalid_code' };
    if (consumed.expired) return { ok: false, reason: 'expired' };
    await upsertGuideLineMappingDb({ guideId: consumed.guideId, lineUserId: luid, displayName });
    return { ok: true, guideId: consumed.guideId };
  }

  const idx = guideLineBindCodes.findIndex((c) => c.code === normalized);
  if (idx === -1) return { ok: false, reason: 'invalid_code' };
  const entry = guideLineBindCodes[idx];
  // Single-use: consume regardless of outcome.
  guideLineBindCodes.splice(idx, 1);
  if (new Date(entry.expiresAt).getTime() <= Date.now()) {
    return { ok: false, reason: 'expired' };
  }
  upsertMappingInMemory({ guideId: entry.guideId, lineUserId: luid, displayName });
  return { ok: true, guideId: entry.guideId };
}

/** Resolve a guide to their LINE userId, or null if unbound/blocked. */
export async function getLineUserIdForGuide(guideId) {
  const id = String(guideId || '').trim();
  if (!id) return null;
  if (hasSupabaseEnv()) {
    const { getLineUserIdForGuideDb } = await import('./db.mjs');
    return getLineUserIdForGuideDb(id);
  }
  const mapping = findMappingByGuide(id);
  return mapping && !mapping.isBlocked ? mapping.lineUserId : null;
}

/** Fetch the guide's binding (for console status display). */
export async function getGuideBinding(guideId) {
  const id = String(guideId || '').trim();
  if (!id) return null;
  if (hasSupabaseEnv()) {
    const { getGuideBindingDb } = await import('./db.mjs');
    return getGuideBindingDb(id);
  }
  return findMappingByGuide(id);
}

/** Flag a guide binding blocked (unfollow) / unblocked (re-follow). */
export async function setGuideLineBlocked(lineUserId, blocked) {
  const luid = String(lineUserId || '').trim();
  if (!luid) return null;
  if (hasSupabaseEnv()) {
    const { setGuideLineBlockedDb } = await import('./db.mjs');
    return setGuideLineBlockedDb(luid, !!blocked);
  }
  const existing = findMappingByLineUserId(luid);
  if (existing) {
    existing.isBlocked = !!blocked;
    existing.updatedAt = new Date().toISOString();
  }
  return existing;
}

/** Test-only: clear the in-memory guide binding + code stores. */
export function __resetGuideLineForTest() {
  guideLineMappings.length = 0;
  guideLineBindCodes.length = 0;
}
