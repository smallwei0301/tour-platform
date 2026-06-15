// LINE user binding gateway.
//
// Resolves order → traveler → line_user_id and upserts bindings captured from
// the LINE webhook / LIFF idToken verification. Mirrors db.mjs's pattern: when
// SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are present we delegate to the
// Supabase-backed helpers (dynamically imported so tests / edge never load the
// full db.mjs graph); otherwise we fall back to the in-memory store.
//
// PII note: only line_user_id + the keys needed to resolve an order are stored.

import crypto from 'node:crypto';

import { lineUserMappings, lineWebhookEvents, lineBindCodes } from './store.mjs';

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

/**
 * Record a webhook event for idempotency. Returns { firstTime: true } the first
 * time an eventId is seen, { firstTime: false } on any replay so callers can skip.
 */
export async function markWebhookEventProcessed(webhookEventId, meta = {}) {
  const id = String(webhookEventId || '').trim();
  if (!id) return { firstTime: true }; // no id → cannot dedupe, process once
  if (hasSupabaseEnv()) {
    const { markLineWebhookEventDb } = await import('./db.mjs');
    return markLineWebhookEventDb(id, meta);
  }
  if (lineWebhookEvents.some((e) => e.webhookEventId === id)) {
    return { firstTime: false };
  }
  lineWebhookEvents.push({
    webhookEventId: id,
    eventType: meta.eventType ?? null,
    lineUserId: meta.lineUserId ?? null,
    receivedAt: new Date().toISOString(),
  });
  return { firstTime: true };
}

// ---------------------------------------------------------------------------
// Traveler LINE binding by one-time code (mirrors the guide BIND-XXXXXX flow).
// The /me console mints a code; the traveler sends it to the bot; the webhook
// redeems it → upsertLineMapping with this traveler's user_id / contact_email.
// This gives a binding path outside LIFF (which only works inside the LINE app).
// ---------------------------------------------------------------------------

const TRAVELER_CODE_PREFIX = 'TBIND-';
// Unambiguous alphabet (no 0/O/1/I) so a code can be read aloud / retyped.
const TRAVELER_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TRAVELER_CODE_BODY_LEN = 6;
const TRAVELER_CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function generateTravelerCode() {
  let body = '';
  const bytes = crypto.randomBytes(TRAVELER_CODE_BODY_LEN);
  for (let i = 0; i < TRAVELER_CODE_BODY_LEN; i += 1) {
    body += TRAVELER_CODE_ALPHABET[bytes[i] % TRAVELER_CODE_ALPHABET.length];
  }
  return `${TRAVELER_CODE_PREFIX}${body}`;
}

/** Extract a TBIND code from arbitrary LINE message text (case-insensitive). */
export function parseTravelerLineBindCode(text) {
  const match = String(text || '').toUpperCase().match(/TBIND-[A-Z0-9]{6}/);
  return match ? match[0] : null;
}

/** Mint a one-time traveler binding code (invalidates the traveler's prior codes). */
export async function createTravelerLineBindCode({ userId, contactEmail } = {}, { ttlMs = TRAVELER_CODE_TTL_MS } = {}) {
  const uid = userId ? String(userId).trim() : null;
  const email = normalizeEmail(contactEmail);
  if (!uid && !email) throw new Error('createTravelerLineBindCode: userId or contactEmail required');
  const code = generateTravelerCode();
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  if (hasSupabaseEnv()) {
    const { createLineBindCodeDb } = await import('./db.mjs');
    await createLineBindCodeDb({ code, userId: uid, contactEmail: email, expiresAt });
    return { code, expiresAt };
  }
  // Drop any outstanding codes for this traveler, then store the new one.
  for (let i = lineBindCodes.length - 1; i >= 0; i -= 1) {
    const c = lineBindCodes[i];
    if ((uid && c.userId === uid) || (email && c.contactEmail === email)) lineBindCodes.splice(i, 1);
  }
  lineBindCodes.push({ code, userId: uid, contactEmail: email, expiresAt, createdAt: new Date().toISOString() });
  return { code, expiresAt };
}

/**
 * Redeem a traveler binding code captured from the webhook.
 * @returns {Promise<{ ok: true, userId: string|null } | { ok: false, reason: string }>}
 */
export async function redeemTravelerLineBindCode(code, { lineUserId, displayName } = {}) {
  const normalized = parseTravelerLineBindCode(code);
  const luid = String(lineUserId || '').trim();
  if (!normalized) return { ok: false, reason: 'invalid_code' };
  if (!luid) return { ok: false, reason: 'no_line_user_id' };

  if (hasSupabaseEnv()) {
    const { consumeLineBindCodeDb } = await import('./db.mjs');
    const consumed = await consumeLineBindCodeDb(normalized);
    if (!consumed) return { ok: false, reason: 'invalid_code' };
    if (consumed.expired) return { ok: false, reason: 'expired' };
    await upsertLineMapping({ lineUserId: luid, userId: consumed.userId, contactEmail: consumed.contactEmail, displayName });
    return { ok: true, userId: consumed.userId ?? null };
  }

  const idx = lineBindCodes.findIndex((c) => c.code === normalized);
  if (idx === -1) return { ok: false, reason: 'invalid_code' };
  const entry = lineBindCodes[idx];
  lineBindCodes.splice(idx, 1); // single-use: consume regardless of outcome
  if (new Date(entry.expiresAt).getTime() <= Date.now()) {
    return { ok: false, reason: 'expired' };
  }
  await upsertLineMapping({ lineUserId: luid, userId: entry.userId, contactEmail: entry.contactEmail, displayName });
  return { ok: true, userId: entry.userId ?? null };
}

/** Test-only: clear the in-memory mapping store. */
export function __resetLineMappingsForTest() {
  lineUserMappings.length = 0;
}

/** Test-only: clear the in-memory traveler bind-code store. */
export function __resetLineBindCodesForTest() {
  lineBindCodes.length = 0;
}

/** Test-only: clear the in-memory webhook idempotency store. */
export function __resetWebhookEventsForTest() {
  lineWebhookEvents.length = 0;
}
