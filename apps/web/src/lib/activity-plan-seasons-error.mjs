/**
 * Issue #1238 — map Supabase insert errors raised by
 * POST /api/v2/admin/activities/:activityId/plans/:planId/seasons
 * into actionable error codes + operator-facing zh messages.
 *
 * The route previously masked every failure (auth, RLS, schema drift,
 * FK violation, unique violation) as a single 500
 * `Failed to create season`, which gave operators no way to tell why
 * the season manager refused to save.
 *
 * This helper is intentionally pure — no Supabase client, no logging.
 * The route still calls console.error(...) with the raw object so the
 * detailed error stays in server logs; the helper only shapes the
 * client-facing response.
 */

/**
 * @param error A Supabase / PostgREST error-like object (or null/undefined).
 * @returns { code, status, message, messageZh } — message is short English
 *          for logs/clients that expect EN; messageZh is operator-facing
 *          actionable Traditional Chinese.
 */
export function mapActivityPlanSeasonInsertError(error) {
  const pgCode = String(error?.code ?? '').trim();
  const rawMessage = String(error?.message ?? '');
  const msg = rawMessage.toLowerCase();

  // PostgreSQL: insufficient_privilege (42501) → RLS / GRANT denied.
  // Or Supabase fall-through message containing 'row-level security' / 'permission denied'.
  if (
    pgCode === '42501' ||
    msg.includes('row-level security') ||
    msg.includes('row level security') ||
    msg.includes('permission denied')
  ) {
    return {
      code: 'RLS_DENIED',
      status: 403,
      message: 'Insert blocked by row-level security or insufficient privilege',
      messageZh:
        '此操作被資料庫權限策略阻擋，請確認 service-role 設定或聯絡技術支援。',
    };
  }

  // undefined_table (42P01) — table missing or schema cache out of date.
  if (pgCode === '42P01' || msg.includes('relation') && msg.includes('does not exist')) {
    return {
      code: 'SCHEMA_MISSING_TABLE',
      status: 500,
      message: 'activity_plan_seasons table not present in this environment',
      messageZh:
        '伺服器找不到開放季節資料表，請確認 migration 已套用到此環境後再試。',
    };
  }

  // undefined_column (42703) — schema drift between migrations and code.
  if (pgCode === '42703' || (msg.includes('column') && msg.includes('does not exist'))) {
    return {
      code: 'SCHEMA_COLUMN_MISSING',
      status: 500,
      message: rawMessage || 'Expected column missing in activity_plan_seasons',
      messageZh:
        '伺服器資料表欄位與程式不一致，請確認 migration 已套用到此環境後再試。',
    };
  }

  // foreign_key_violation (23503) — referenced plan disappeared.
  if (pgCode === '23503') {
    return {
      code: 'PLAN_FK_VIOLATION',
      status: 422,
      message: rawMessage || 'Referenced activity_plan does not exist',
      messageZh:
        '指定的方案不存在或已被刪除，請重新整理方案列表後再試。',
    };
  }

  // unique_violation (23505) — duplicate season name / window.
  if (pgCode === '23505') {
    return {
      code: 'DUPLICATE_SEASON',
      status: 409,
      message: rawMessage || 'Duplicate season for this plan',
      messageZh:
        '此方案已有相同設定的開放季節，請使用不同的名稱或日期範圍。',
    };
  }

  // check_violation (23514) — CHECK CONSTRAINT failed (e.g. month range).
  if (pgCode === '23514') {
    return {
      code: 'INVALID_SEASON_RANGE',
      status: 422,
      message: rawMessage || 'Season range failed a database CHECK constraint',
      messageZh:
        '季節月/日範圍不符合規則（月份須為 1–12，日須為 1–31），請修正欄位後再試。',
    };
  }

  // PGRST116 — no rows / not found via PostgREST.
  if (pgCode === 'PGRST116') {
    return {
      code: 'NOT_FOUND',
      status: 404,
      message: rawMessage || 'No rows returned',
      messageZh: '伺服器找不到對應資料，請重新整理頁面後再試。',
    };
  }

  // PGRST204 — PostgREST schema cache says the column does not exist
  // (e.g. Supabase hasn't reloaded after a migration, or a column the API
  // expects was never added). This was the actual GH-1238 root cause: the
  // original activity_plan_seasons migration omitted `name`, so every POST
  // hit this path. Surface it as actionable rather than masking as 500.
  if (pgCode === 'PGRST204' || msg.includes('schema cache')) {
    return {
      code: 'SCHEMA_COLUMN_MISSING',
      status: 500,
      message: rawMessage || 'PostgREST schema cache missing expected column',
      messageZh:
        '伺服器資料表欄位與程式不一致（Supabase schema cache 找不到欄位），請確認 migration 已套用並重新載入 Supabase API schema 後再試。',
    };
  }

  // Default — keep the historic 500 + generic English so old log greps
  // continue to work, but add a generic zh message instead of leaving
  // the UI showing raw English.
  return {
    code: 'INTERNAL_ERROR',
    status: 500,
    message: 'Failed to create season',
    messageZh: '建立開放季節時發生伺服器錯誤，請稍後再試或聯絡技術支援。',
  };
}
