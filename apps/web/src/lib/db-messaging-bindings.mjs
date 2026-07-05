/**
 * LINE／Telegram 綁定與通知覆寫
 * #1613 db.mjs strangler：整塊自 db.mjs 純搬移（行為零變更；型別債見 #1597）。
 * db.mjs 以 re-export 保持既有 caller 匯入路徑不變。
 */
import { isMissingTableError } from './missing-table-error.mjs';
import { getSupabase, hasSupabaseEnv } from './supabase-env.mjs';

// ---------------------------------------------------------------------------
// LINE user binding (line_user_mapping) — Supabase path.
// In-memory fallback lives in line-binding.mjs (which only calls these when
// hasSupabaseEnv() is true). Resolution mirrors listMyOrdersDb's user_id-first,
// contact_email-fallback convention.
// ---------------------------------------------------------------------------

function mapLineMappingRow(row) {
  if (!row) return null;
  return {
    lineUserId: row.line_user_id,
    userId: row.user_id ?? null,
    contactEmail: row.contact_email ?? null,
    displayName: row.display_name ?? null,
    isBlocked: !!row.is_blocked,
    boundAt: row.bound_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export async function upsertLineMappingDb({ lineUserId, userId, contactEmail, displayName } = {}) {
  if (!hasSupabaseEnv()) return null;
  const supabase = await getSupabase();
  const now = new Date().toISOString();
  const row = { line_user_id: lineUserId, updated_at: now };
  if (userId !== undefined) row.user_id = userId ?? null;
  if (contactEmail !== undefined) {
    row.contact_email = contactEmail ? String(contactEmail).trim().toLowerCase() : null;
  }
  if (displayName !== undefined) row.display_name = displayName ?? null;
  const { data, error } = await supabase
    .from('line_user_mapping')
    .upsert(row, { onConflict: 'line_user_id' })
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  return mapLineMappingRow(data);
}

export async function getLineMappingByLineUserIdDb(lineUserId) {
  if (!hasSupabaseEnv()) return null;
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('line_user_mapping')
    .select('*')
    .eq('line_user_id', lineUserId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return mapLineMappingRow(data);
}

export async function setLineBlockedDb(lineUserId, blocked) {
  if (!hasSupabaseEnv()) return null;
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('line_user_mapping')
    .update({ is_blocked: !!blocked, updated_at: new Date().toISOString() })
    .eq('line_user_id', lineUserId)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  return mapLineMappingRow(data);
}

export async function markLineWebhookEventDb(webhookEventId, meta = {}) {
  if (!hasSupabaseEnv()) return { firstTime: true };
  const supabase = await getSupabase();
  // Insert; a unique-violation on the PK means we've already seen this event.
  const { error } = await supabase
    .from('line_webhook_events')
    .insert({
      webhook_event_id: webhookEventId,
      event_type: meta.eventType ?? null,
      line_user_id: meta.lineUserId ?? null,
    });
  if (error) {
    // 23505 = unique_violation (duplicate delivery)
    if (error.code === '23505') return { firstTime: false };
    throw new Error(error.message);
  }
  return { firstTime: true };
}

export async function getLineUserIdForOrderDb(order) {
  if (!hasSupabaseEnv()) return null;
  const supabase = await getSupabase();
  const userId = order?.userId ?? order?.user_id ?? null;
  const email = (order?.contactEmail ?? order?.contact_email ?? '').toString().trim().toLowerCase();

  // user_id is the primary key; contact_email is the guest fallback.
  if (userId) {
    const { data, error } = await supabase
      .from('line_user_mapping')
      .select('line_user_id')
      .eq('user_id', userId)
      .eq('is_blocked', false)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data?.line_user_id) return data.line_user_id;
  }
  if (email) {
    const { data, error } = await supabase
      .from('line_user_mapping')
      .select('line_user_id')
      .eq('contact_email', email)
      .eq('is_blocked', false)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data?.line_user_id) return data.line_user_id;
  }
  return null;
}

/** Mint a one-time traveler LINE bind code (clears the traveler's prior codes). */
export async function createLineBindCodeDb({ code, userId, contactEmail, expiresAt } = {}) {
  if (!hasSupabaseEnv()) return null;
  const supabase = await getSupabase();
  if (userId) await supabase.from('line_bind_code').delete().eq('user_id', userId);
  if (contactEmail) await supabase.from('line_bind_code').delete().eq('contact_email', contactEmail);
  const { error } = await supabase
    .from('line_bind_code')
    .insert({ code, user_id: userId ?? null, contact_email: contactEmail ?? null, expires_at: expiresAt });
  if (error) throw new Error(error.message);
  return { code, userId: userId ?? null, contactEmail: contactEmail ?? null, expiresAt };
}

/**
 * Atomically consume a traveler bind code: returns { userId, contactEmail, expired }
 * or null when the code does not exist. The row is always deleted (single-use).
 */
export async function consumeLineBindCodeDb(code) {
  if (!hasSupabaseEnv()) return null;
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('line_bind_code')
    .delete()
    .eq('code', code)
    .select('user_id, contact_email, expires_at')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const expired = new Date(data.expires_at).getTime() <= Date.now();
  return { userId: data.user_id ?? null, contactEmail: data.contact_email ?? null, expired };
}

// ---------------------------------------------------------------------------
// Guide ↔ LINE binding (guide_line_mapping + guide_line_bind_code) — Supabase.
// In-memory fallback lives in guide-line-binding.mjs. Used for per-guide push.
// ---------------------------------------------------------------------------

function mapGuideLineRow(row) {
  if (!row) return null;
  return {
    guideId: row.guide_id,
    lineUserId: row.line_user_id,
    displayName: row.display_name ?? null,
    isBlocked: !!row.is_blocked,
    boundAt: row.bound_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

/** Upsert the guide's LINE binding (idempotent on guide_id). */
export async function upsertGuideLineMappingDb({ guideId, lineUserId, displayName } = {}) {
  if (!hasSupabaseEnv()) return null;
  const supabase = await getSupabase();
  const now = new Date().toISOString();
  const row = {
    guide_id: guideId,
    line_user_id: lineUserId,
    is_blocked: false,
    updated_at: now,
  };
  if (displayName !== undefined) row.display_name = displayName ?? null;
  const { data, error } = await supabase
    .from('guide_line_mapping')
    .upsert(row, { onConflict: 'guide_id' })
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  return mapGuideLineRow(data);
}

/** Resolve a guide to their LINE userId, or null if unbound/blocked. */
export async function getLineUserIdForGuideDb(guideId) {
  if (!hasSupabaseEnv()) return null;
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('guide_line_mapping')
    .select('line_user_id')
    .eq('guide_id', guideId)
    .eq('is_blocked', false)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.line_user_id ?? null;
}

/** Fetch the guide's binding row (for console status). */
export async function getGuideBindingDb(guideId) {
  if (!hasSupabaseEnv()) return null;
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('guide_line_mapping')
    .select('*')
    .eq('guide_id', guideId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return mapGuideLineRow(data);
}

/** Flag a guide binding blocked/unblocked by line_user_id. */
export async function setGuideLineBlockedDb(lineUserId, blocked) {
  if (!hasSupabaseEnv()) return null;
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('guide_line_mapping')
    .update({ is_blocked: !!blocked, updated_at: new Date().toISOString() })
    .eq('line_user_id', lineUserId)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  return mapGuideLineRow(data);
}

/** Store a one-time guide binding code (replaces the guide's prior codes). */
export async function createGuideBindCodeDb({ code, guideId, expiresAt } = {}) {
  if (!hasSupabaseEnv()) return null;
  const supabase = await getSupabase();
  // Clear outstanding codes for this guide so only the latest is valid.
  await supabase.from('guide_line_bind_code').delete().eq('guide_id', guideId);
  const { error } = await supabase
    .from('guide_line_bind_code')
    .insert({ code, guide_id: guideId, expires_at: expiresAt });
  if (error) throw new Error(error.message);
  return { code, guideId, expiresAt };
}

/**
 * Atomically consume a binding code: returns { guideId, expired } or null when
 * the code does not exist. The row is always deleted (single-use).
 */
export async function consumeGuideBindCodeDb(code) {
  if (!hasSupabaseEnv()) return null;
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('guide_line_bind_code')
    .delete()
    .eq('code', code)
    .select('guide_id, expires_at')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const expired = new Date(data.expires_at).getTime() <= Date.now();
  return { guideId: data.guide_id, expired };
}

/** Resolve an order's activity → owning guide_id (for per-guide push). */
export async function getGuideIdForOrderDb({ activityId } = {}) {
  if (!hasSupabaseEnv() || !activityId) return null;
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('activities')
    .select('guide_id')
    .eq('id', activityId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.guide_id ?? null;
}

// ---------------------------------------------------------------------------
// Telegram chat binding (telegram_chat_mapping + telegram_bind_code +
// telegram_webhook_events) — Supabase. In-memory fallback in telegram-binding.mjs.
// ---------------------------------------------------------------------------

function mapTelegramRow(row) {
  if (!row) return null;
  return {
    role: row.role,
    subjectId: row.subject_id ?? null,
    contactEmail: row.contact_email ?? null,
    chatId: row.chat_id,
    displayName: row.display_name ?? null,
    isBlocked: !!row.is_blocked,
    boundAt: row.bound_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

/** Upsert a Telegram binding (idempotent on (role, subject_id)). */
export async function upsertTelegramMappingDb({ role, subjectId, contactEmail, chatId, displayName } = {}) {
  if (!hasSupabaseEnv()) return null;
  const supabase = await getSupabase();
  const now = new Date().toISOString();
  const row = { role, subject_id: subjectId ?? null, chat_id: chatId, is_blocked: false, updated_at: now };
  if (contactEmail !== undefined) row.contact_email = contactEmail ? String(contactEmail).trim().toLowerCase() : null;
  if (displayName !== undefined) row.display_name = displayName ?? null;
  const { data, error } = await supabase
    .from('telegram_chat_mapping')
    .upsert(row, { onConflict: 'role,subject_id' })
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  return mapTelegramRow(data);
}

export async function getTelegramChatForGuideDb(guideId) {
  if (!hasSupabaseEnv()) return null;
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('telegram_chat_mapping')
    .select('chat_id')
    .eq('role', 'guide').eq('subject_id', guideId).eq('is_blocked', false)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.chat_id ?? null;
}

export async function getTelegramChatForTravelerDb({ userId, contactEmail } = {}) {
  if (!hasSupabaseEnv()) return null;
  const supabase = await getSupabase();
  if (userId) {
    const { data, error } = await supabase
      .from('telegram_chat_mapping')
      .select('chat_id')
      .eq('role', 'traveler').eq('subject_id', userId).eq('is_blocked', false)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data?.chat_id) return data.chat_id;
  }
  if (contactEmail) {
    const { data, error } = await supabase
      .from('telegram_chat_mapping')
      .select('chat_id')
      .eq('role', 'traveler').eq('contact_email', contactEmail).eq('is_blocked', false)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data?.chat_id) return data.chat_id;
  }
  return null;
}

export async function setTelegramBlockedDb(chatId, blocked) {
  if (!hasSupabaseEnv()) return null;
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('telegram_chat_mapping')
    .update({ is_blocked: !!blocked, updated_at: new Date().toISOString() })
    .eq('chat_id', chatId)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  return mapTelegramRow(data);
}

/** Store a one-time Telegram binding code (replaces the subject's prior codes). */
export async function createTelegramBindCodeDb({ code, role, subjectId, contactEmail, expiresAt } = {}) {
  if (!hasSupabaseEnv()) return null;
  const supabase = await getSupabase();
  let del = supabase.from('telegram_bind_code').delete().eq('role', role);
  del = subjectId == null ? del.is('subject_id', null) : del.eq('subject_id', subjectId);
  await del;
  const { error } = await supabase
    .from('telegram_bind_code')
    .insert({ code, role, subject_id: subjectId ?? null, contact_email: contactEmail ?? null, expires_at: expiresAt });
  if (error) throw new Error(error.message);
  return { code };
}

/** Atomically consume a Telegram bind code (single-use). */
export async function consumeTelegramBindCodeDb(code) {
  if (!hasSupabaseEnv()) return null;
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('telegram_bind_code')
    .delete()
    .eq('code', code)
    .select('role, subject_id, contact_email, expires_at')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const expired = new Date(data.expires_at).getTime() <= Date.now();
  return { role: data.role, subjectId: data.subject_id, contactEmail: data.contact_email, expired };
}

export async function markTelegramUpdateDb(updateId) {
  if (!hasSupabaseEnv()) return { firstTime: true };
  const supabase = await getSupabase();
  const { error } = await supabase.from('telegram_webhook_events').insert({ update_id: String(updateId) });
  if (error) {
    if (error.code === '23505') return { firstTime: false };
    throw new Error(error.message);
  }
  return { firstTime: true };
}

// ---------------------------------------------------------------------------
// Notification matrix (notification_event_settings) — Supabase singleton row.
// Stores a sparse override map { "event:recipient:channel": boolean } in a
// JSONB column; absence of a key means "use default" (= enabled). In-memory
// fallback lives in notification-settings.mjs / store.mjs.
// ---------------------------------------------------------------------------

const NOTIFICATION_SETTINGS_SINGLETON_ID = 'singleton';

/** Read the sparse override map; returns {} when unset / no DB / table absent. */
export async function getNotificationOverridesDb() {
  if (!hasSupabaseEnv()) return {};
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('notification_event_settings')
    .select('overrides')
    .eq('id', NOTIFICATION_SETTINGS_SINGLETON_ID)
    .maybeSingle();
  if (error) {
    // Fail-open before the migration is applied: a missing table = no overrides
    // = matrix defaults all-on (the documented pre-migration behaviour).
    if (isMissingTableError(error)) return {};
    throw new Error(error.message);
  }
  const overrides = data?.overrides;
  return overrides && typeof overrides === 'object' ? overrides : {};
}

/** Merge cell toggles into the override map (idempotent upsert of the singleton). */
export async function setNotificationCellsDb(cells = [], { actor = 'admin' } = {}) {
  if (!hasSupabaseEnv()) return {};
  const supabase = await getSupabase();
  const current = await getNotificationOverridesDb();
  const next = { ...current };
  for (const cell of cells) {
    next[`${cell.event}:${cell.recipient}:${cell.channel}`] = !!cell.enabled;
  }
  const { error } = await supabase
    .from('notification_event_settings')
    .upsert(
      {
        id: NOTIFICATION_SETTINGS_SINGLETON_ID,
        overrides: next,
        updated_by: actor,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    );
  if (error) {
    // Unlike reads, writes can't fail-open — the toggle can't persist without
    // the table. Surface an actionable, taggable error for the API to map.
    if (isMissingTableError(error)) {
      throw new Error('notification_settings_migration_missing: notification_event_settings 表尚未建立，請先套用 migration（見 docs/operations/line-telegram-prod-migrations.md）');
    }
    throw new Error(error.message);
  }
  return next;
}

