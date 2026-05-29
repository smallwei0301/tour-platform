// LINE user binding gateway.
//
// Resolves order → traveler → line_user_id and upserts bindings captured from
// the LINE webhook / LIFF idToken verification. Mirrors db.mjs's pattern: when
// SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are present we delegate to the
// Supabase-backed helpers (dynamically imported so tests / edge never load the
// full db.mjs graph); otherwise we fall back to the in-memory store.
//
// PII note: only line_user_id + the keys needed to resolve an order are stored.

import { lineUserMappings } from './store.mjs';

function hasSupabaseEnv() {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return email || null;
}

function orderUserId(order) {
  return order?.userId ?? order?.user_id ?? null;
}

function orderEmail(order) {
  return normalizeEmail(order?.contactEmail ?? order?.contact_email);
}

// ---------------------------------------------------------------------------
// In-memory implementation (store.mjs fallback)
// ---------------------------------------------------------------------------

function findInMemory(lineUserId) {
  return lineUserMappings.find((m) => m.lineUserId === lineUserId) || null;
}

function upsertInMemory({ lineUserId, userId, contactEmail, displayName }) {
  const now = new Date().toISOString();
  const existing = findInMemory(lineUserId);
  if (existing) {
    if (userId !== undefined) existing.userId = userId ?? null;
    if (contactEmail !== undefined) existing.contactEmail = normalizeEmail(contactEmail);
    if (displayName !== undefined) existing.displayName = displayName ?? null;
    existing.updatedAt = now;
    return existing;
  }
  const created = {
    lineUserId,
    userId: userId ?? null,
    contactEmail: normalizeEmail(contactEmail),
    displayName: displayName ?? null,
    isBlocked: false,
    boundAt: now,
    updatedAt: now,
  };
  lineUserMappings.push(created);
  return created;
}

function resolveInMemory(order) {
  const userId = orderUserId(order);
  const email = orderEmail(order);
  // user_id is the primary key; contact_email is the guest fallback.
  if (userId) {
    const byUser = lineUserMappings.find((m) => !m.isBlocked && m.userId && m.userId === userId);
    if (byUser) return byUser.lineUserId;
  }
  if (email) {
    const byEmail = lineUserMappings.find((m) => !m.isBlocked && m.contactEmail === email);
    if (byEmail) return byEmail.lineUserId;
  }
  return null;
}

function setBlockedInMemory(lineUserId, blocked) {
  const existing = findInMemory(lineUserId);
  if (existing) {
    existing.isBlocked = !!blocked;
    existing.updatedAt = new Date().toISOString();
  }
  return existing;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Upsert a LINE binding (idempotent on lineUserId). */
export async function upsertLineMapping(input = {}) {
  const lineUserId = String(input?.lineUserId || '').trim();
  if (!lineUserId) throw new Error('upsertLineMapping: lineUserId required');
  if (hasSupabaseEnv()) {
    const { upsertLineMappingDb } = await import('./db.mjs');
    return upsertLineMappingDb({ ...input, lineUserId });
  }
  return upsertInMemory({ ...input, lineUserId });
}

/** Resolve an order's traveler to a LINE userId, or null if unbound/blocked. */
export async function getLineUserIdForOrder(order) {
  if (hasSupabaseEnv()) {
    const { getLineUserIdForOrderDb } = await import('./db.mjs');
    return getLineUserIdForOrderDb(order);
  }
  return resolveInMemory(order);
}

/** Fetch a binding by lineUserId (for webhook follow/unfollow handling). */
export async function getLineMappingByLineUserId(lineUserId) {
  const id = String(lineUserId || '').trim();
  if (!id) return null;
  if (hasSupabaseEnv()) {
    const { getLineMappingByLineUserIdDb } = await import('./db.mjs');
    return getLineMappingByLineUserIdDb(id);
  }
  return findInMemory(id);
}

/** Flag a binding blocked (unfollow) / unblocked (re-follow). */
export async function setLineBlocked(lineUserId, blocked) {
  const id = String(lineUserId || '').trim();
  if (!id) return null;
  if (hasSupabaseEnv()) {
    const { setLineBlockedDb } = await import('./db.mjs');
    return setLineBlockedDb(id, !!blocked);
  }
  return setBlockedInMemory(id, blocked);
}

/** Test-only: clear the in-memory mapping store. */
export function __resetLineMappingsForTest() {
  lineUserMappings.length = 0;
}
