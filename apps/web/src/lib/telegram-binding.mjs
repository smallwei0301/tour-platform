// Telegram chat binding gateway (deep-link `/start <code>` mechanism).
//
// Flow: a guide/traveler console mints a one-time code + t.me deep link
// (https://t.me/<bot>?start=<code>); tapping it opens the bot and sends
// `/start <code>`; the webhook redeems the code → binds chat_id ↔ subject.
// Order events then resolve subject → chat_id and push.
//
// One bot, two roles: role='guide' (subjectId = guide_id) and role='traveler'
// (subjectId = user_id, with contactEmail as the guest fallback key), mirroring
// line-binding / guide-line-binding. Delegates to Supabase when env present,
// else falls back to the in-memory store. PII: only chat_id + subject keys.

import crypto from 'node:crypto';

import { telegramChatMappings, telegramBindCodes, telegramWebhookEvents } from './store.mjs';

function hasSupabaseEnv() {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return email || null;
}

// Telegram `/start` payload allows [A-Za-z0-9_-], max 64 chars.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
const CODE_LEN = 10;
const DEFAULT_TTL_MS = 10 * 60 * 1000;

function generateCode() {
  const bytes = crypto.randomBytes(CODE_LEN);
  let code = '';
  for (let i = 0; i < CODE_LEN; i += 1) code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return code;
}

/** Extract the start payload (code) from a `/start <code>` message. */
export function parseStartPayload(text) {
  const m = String(text || '').trim().match(/^\/start(?:@\w+)?\s+([A-Za-z0-9_-]{1,64})/);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------------------
// In-memory implementation
// ---------------------------------------------------------------------------

function findByChat(chatId) {
  return telegramChatMappings.find((m) => m.chatId === chatId) || null;
}

function upsertMappingInMemory({ role, subjectId, contactEmail, chatId, displayName }) {
  const now = new Date().toISOString();
  // A binding is keyed by (role, subjectId). Re-binding updates chatId.
  const existing = telegramChatMappings.find((m) => m.role === role && m.subjectId === subjectId);
  if (existing) {
    existing.chatId = chatId;
    if (contactEmail !== undefined) existing.contactEmail = normalizeEmail(contactEmail);
    if (displayName !== undefined) existing.displayName = displayName ?? null;
    existing.isBlocked = false;
    existing.updatedAt = now;
    return existing;
  }
  const created = {
    role,
    subjectId: subjectId ?? null,
    contactEmail: normalizeEmail(contactEmail),
    chatId,
    displayName: displayName ?? null,
    isBlocked: false,
    boundAt: now,
    updatedAt: now,
  };
  telegramChatMappings.push(created);
  return created;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Mint a one-time binding code for a subject (invalidates their prior codes).
 * @param {{ role: 'guide'|'traveler', subjectId?: string|null, contactEmail?: string|null, ttlMs?: number }} input
 */
export async function createTelegramBindCode(input = {}) {
  const { role, subjectId, contactEmail, ttlMs = DEFAULT_TTL_MS } = input;
  if (role !== 'guide' && role !== 'traveler') throw new Error('createTelegramBindCode: invalid role');
  const code = generateCode();
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  if (hasSupabaseEnv()) {
    const { createTelegramBindCodeDb } = await import('./db.mjs');
    await createTelegramBindCodeDb({ code, role, subjectId: subjectId ?? null, contactEmail: normalizeEmail(contactEmail), expiresAt });
    return { code, expiresAt };
  }
  for (let i = telegramBindCodes.length - 1; i >= 0; i -= 1) {
    const c = telegramBindCodes[i];
    if (c.role === role && c.subjectId === (subjectId ?? null)) telegramBindCodes.splice(i, 1);
  }
  telegramBindCodes.push({ code, role, subjectId: subjectId ?? null, contactEmail: normalizeEmail(contactEmail), expiresAt, createdAt: new Date().toISOString() });
  return { code, expiresAt };
}

/**
 * Redeem a code captured from the webhook and bind the chat.
 * @returns {Promise<{ ok: true, role: string, subjectId: string|null } | { ok: false, reason: string }>}
 */
export async function redeemTelegramBindCode(code, { chatId, displayName } = {}) {
  const normalized = String(code || '').trim();
  const chat = String(chatId || '').trim();
  if (!normalized) return { ok: false, reason: 'invalid_code' };
  if (!chat) return { ok: false, reason: 'no_chat_id' };

  if (hasSupabaseEnv()) {
    const { consumeTelegramBindCodeDb, upsertTelegramMappingDb } = await import('./db.mjs');
    const consumed = await consumeTelegramBindCodeDb(normalized);
    if (!consumed) return { ok: false, reason: 'invalid_code' };
    if (consumed.expired) return { ok: false, reason: 'expired' };
    await upsertTelegramMappingDb({ role: consumed.role, subjectId: consumed.subjectId, contactEmail: consumed.contactEmail, chatId: chat, displayName });
    return { ok: true, role: consumed.role, subjectId: consumed.subjectId };
  }

  const idx = telegramBindCodes.findIndex((c) => c.code === normalized);
  if (idx === -1) return { ok: false, reason: 'invalid_code' };
  const entry = telegramBindCodes[idx];
  telegramBindCodes.splice(idx, 1); // single-use
  if (new Date(entry.expiresAt).getTime() <= Date.now()) return { ok: false, reason: 'expired' };
  upsertMappingInMemory({ role: entry.role, subjectId: entry.subjectId, contactEmail: entry.contactEmail, chatId: chat, displayName });
  return { ok: true, role: entry.role, subjectId: entry.subjectId };
}

/** Resolve a guide → Telegram chat id, or null if unbound/blocked. */
export async function getTelegramChatForGuide(guideId) {
  const id = String(guideId || '').trim();
  if (!id) return null;
  if (hasSupabaseEnv()) {
    const { getTelegramChatForGuideDb } = await import('./db.mjs');
    return getTelegramChatForGuideDb(id);
  }
  const m = telegramChatMappings.find((x) => x.role === 'guide' && x.subjectId === id && !x.isBlocked);
  return m?.chatId ?? null;
}

/** Resolve a traveler (user_id primary, contact_email fallback) → chat id. */
export async function getTelegramChatForTraveler({ userId, contactEmail } = {}) {
  const uid = userId ? String(userId).trim() : null;
  const email = normalizeEmail(contactEmail);
  if (hasSupabaseEnv()) {
    const { getTelegramChatForTravelerDb } = await import('./db.mjs');
    return getTelegramChatForTravelerDb({ userId: uid, contactEmail: email });
  }
  if (uid) {
    const byUser = telegramChatMappings.find((x) => x.role === 'traveler' && x.subjectId === uid && !x.isBlocked);
    if (byUser) return byUser.chatId;
  }
  if (email) {
    const byEmail = telegramChatMappings.find((x) => x.role === 'traveler' && x.contactEmail === email && !x.isBlocked);
    if (byEmail) return byEmail.chatId;
  }
  return null;
}

/** Flag a chat binding blocked (user blocked/stopped the bot) / unblocked. */
export async function setTelegramBlocked(chatId, blocked) {
  const chat = String(chatId || '').trim();
  if (!chat) return null;
  if (hasSupabaseEnv()) {
    const { setTelegramBlockedDb } = await import('./db.mjs');
    return setTelegramBlockedDb(chat, !!blocked);
  }
  const existing = findByChat(chat);
  if (existing) {
    existing.isBlocked = !!blocked;
    existing.updatedAt = new Date().toISOString();
  }
  return existing;
}

/** Record a Telegram update_id for idempotency. */
export async function markTelegramUpdateProcessed(updateId) {
  const id = updateId == null ? '' : String(updateId);
  if (!id) return { firstTime: true };
  if (hasSupabaseEnv()) {
    const { markTelegramUpdateDb } = await import('./db.mjs');
    return markTelegramUpdateDb(id);
  }
  if (telegramWebhookEvents.some((e) => e.updateId === id)) return { firstTime: false };
  telegramWebhookEvents.push({ updateId: id, receivedAt: new Date().toISOString() });
  return { firstTime: true };
}

/** Test-only: clear the in-memory Telegram stores. */
export function __resetTelegramForTest() {
  telegramChatMappings.length = 0;
  telegramBindCodes.length = 0;
  telegramWebhookEvents.length = 0;
}
