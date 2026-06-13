/**
 * 首頁精選（homepage_featured_settings）missing-table 偵測 + operator 訊息。
 *
 * 線上事故：admin /admin/homepage 讀寫設定時，PostgREST 回
 *   "Could not find the table 'public.homepage_featured_settings' in the schema cache"
 * 代表 migration「20260612090000_homepage_featured_settings.sql」尚未套用到該環境的
 * Supabase（schema cache 沒有此表）。此時應 fail-open（首頁照常渲染預設）並把
 * admin 的儲存錯誤換成可執行的繁中提示，而非把英文 PostgREST 原訊息丟給使用者。
 *
 * 純函式、無 Supabase 依賴（比照 activity-plan-seasons-error.mjs）。
 */

export const HOMEPAGE_FEATURED_TABLE = 'homepage_featured_settings';

/**
 * 判斷 Supabase / PostgREST 錯誤是否為「homepage_featured_settings 表不存在」。
 * 同時涵蓋 PostgREST schema-cache（PGRST205）與 Postgres undefined_table（42P01）。
 * @param {{ code?: string, message?: string }|null|undefined} error
 * @returns {boolean}
 */
export function isMissingHomepageFeaturedTable(error) {
  if (!error) return false;
  const code = String(error.code ?? '').trim();
  const msg = String(error.message ?? '').toLowerCase();

  // 必須與本表有關，避免誤判其他表的 schema-cache / undefined_table 錯誤。
  const mentionsTable = msg.includes(HOMEPAGE_FEATURED_TABLE);
  if (!mentionsTable) return false;

  // PostgREST：找不到表（schema cache 未含此表）
  if (code === 'PGRST205') return true;
  if (msg.includes('schema cache')) return true;

  // Postgres：undefined_table（42P01）/ relation ... does not exist
  if (code === '42P01') return true;
  if (msg.includes('does not exist')) return true;

  return false;
}

/**
 * 判斷錯誤是否為「editor_pick_copy / more_featured_copy 欄位不存在」
 * （文案 migration 20260613090000 尚未套用）。用於讀取時 fail-open 回空 copy。
 * @param {{ code?: string, message?: string }|null|undefined} error
 * @returns {boolean}
 */
export function isMissingHomepageFeaturedCopyColumn(error) {
  if (!error) return false;
  const code = String(error.code ?? '').trim();
  const msg = String(error.message ?? '').toLowerCase();
  const mentionsCopy = msg.includes('editor_pick_copy') || msg.includes('more_featured_copy');
  if (!mentionsCopy) return false;
  if (code === '42703' || code === 'PGRST204') return true;
  if (msg.includes('does not exist') || msg.includes('schema cache') || msg.includes('could not find')) return true;
  return false;
}

export const HOMEPAGE_FEATURED_TABLE_MISSING_MESSAGE =
  '首頁精選資料表尚未建立，請先把 migration「20260612090000_homepage_featured_settings.sql」套用到此環境的 Supabase（套用後重新載入 API schema）再試。在此之前首頁會顯示預設精選。';
