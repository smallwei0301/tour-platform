/**
 * 首頁精選設定（admin）
 * #1613 db.mjs strangler：整塊自 db.mjs 純搬移（行為零變更；型別債見 #1597）。
 * db.mjs 以 re-export 保持既有 caller 匯入路徑不變。
 */
import { getHomepageFeaturedFallback, setHomepageFeaturedFallback } from './admin.mjs';
import { insertAuditLogDb } from './audit-log.mjs';
import { sanitizeEditorPickCopy, sanitizeMoreFeaturedCopy } from './homepage-featured-copy.mjs';
import { HOMEPAGE_FEATURED_TABLE_MISSING_MESSAGE, isMissingHomepageFeaturedCopyColumn, isMissingHomepageFeaturedTable } from './homepage-featured-error.mjs';
import { normalizeHomepageFeatured } from './homepage-featured.mjs';
import { getSupabase, hasSupabaseEnv } from './supabase-env.mjs';

// ── 首頁精選設定（admin 選擇編輯精選／更多精選行程） ──────────────────────
// singleton row（id='default'），shape 契約見 tests/api/homepage-featured-contract.test.mjs

const HOMEPAGE_FEATURED_EMPTY = { editorPickSlug: null, moreFeaturedSlugs: [], editorPickCopy: {}, moreFeaturedCopy: {}, updatedAt: null, updatedBy: null };

function asPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export async function getHomepageFeaturedDb() {
  if (!hasSupabaseEnv()) return getHomepageFeaturedFallback();

  const supabase = await getSupabase();
  const fullSelect = 'editor_pick_slug, more_featured_slugs, editor_pick_copy, more_featured_copy, updated_at, updated_by';
  let { data, error } = await supabase
    .from('homepage_featured_settings')
    .select(fullSelect)
    .limit(1)
    .maybeSingle();

  // 文案 migration 未套用（欄位不存在）→ 退回不含 copy 的 select，回空 copy。
  if (error && isMissingHomepageFeaturedCopyColumn(error)) {
    ({ data, error } = await supabase
      .from('homepage_featured_settings')
      .select('editor_pick_slug, more_featured_slugs, updated_at, updated_by')
      .limit(1)
      .maybeSingle());
  }

  if (error) {
    // migration 未套用（表不存在）時 fail-open 回未設定狀態：首頁照常渲染預設，
    // admin 頁面也能載入（儲存時才以可執行訊息提示套用 migration）。
    if (isMissingHomepageFeaturedTable(error)) {
      return { ...HOMEPAGE_FEATURED_EMPTY };
    }
    const err = new Error(error.message);
    err.code = error.code;
    throw err;
  }
  if (!data) return { ...HOMEPAGE_FEATURED_EMPTY };
  return {
    editorPickSlug: data.editor_pick_slug ?? null,
    moreFeaturedSlugs: Array.isArray(data.more_featured_slugs) ? data.more_featured_slugs.map(String) : [],
    editorPickCopy: asPlainObject(data.editor_pick_copy),
    moreFeaturedCopy: asPlainObject(data.more_featured_copy),
    updatedAt: data.updated_at ?? null,
    updatedBy: data.updated_by ?? null,
  };
}

export async function setHomepageFeaturedDb(input = {}) {
  const actor = String(input?.actor || 'admin');
  const validSlugs = Array.isArray(input?.validSlugs) ? input.validSlugs : [];
  const { editorPickSlug, moreFeaturedSlugs, errors } = normalizeHomepageFeatured(input, validSlugs);
  if (errors.length > 0) {
    const err = new Error(errors.join('；'));
    err.code = 'HOMEPAGE_FEATURED_INVALID';
    throw err;
  }

  // 文案覆寫：清洗後僅保留有效欄位/slug（更多精選 copy 限定本次選取的 slug）。
  const editorPickCopy = editorPickSlug ? sanitizeEditorPickCopy(input?.editorPickCopy) : {};
  const moreFeaturedCopy = sanitizeMoreFeaturedCopy(input?.moreFeaturedCopy, moreFeaturedSlugs);

  if (!hasSupabaseEnv()) return setHomepageFeaturedFallback({ editorPickSlug, moreFeaturedSlugs, editorPickCopy, moreFeaturedCopy, actor });

  const before = await getHomepageFeaturedDb();
  const supabase = await getSupabase();
  const payload = {
    id: 'default',
    editor_pick_slug: editorPickSlug,
    more_featured_slugs: moreFeaturedSlugs,
    editor_pick_copy: editorPickCopy,
    more_featured_copy: moreFeaturedCopy,
    updated_at: new Date().toISOString(),
    updated_by: actor,
  };
  let { error } = await supabase.from('homepage_featured_settings').upsert(payload);

  // 文案 migration 未套用（copy 欄位不存在）→ 退回只寫 slug 欄位，仍能儲存選取。
  if (error && isMissingHomepageFeaturedCopyColumn(error)) {
    const { editor_pick_copy, more_featured_copy, ...slugOnly } = payload;
    ({ error } = await supabase.from('homepage_featured_settings').upsert(slugOnly));
  }

  if (error) {
    // 表不存在（migration 未套用）→ 以可執行繁中訊息提示 operator，而非丟英文原訊息。
    if (isMissingHomepageFeaturedTable(error)) {
      const err = new Error(HOMEPAGE_FEATURED_TABLE_MISSING_MESSAGE);
      err.code = 'HOMEPAGE_FEATURED_TABLE_MISSING';
      throw err;
    }
    const err = new Error(error.message);
    err.code = error.code;
    throw err;
  }

  const after = await getHomepageFeaturedDb();
  await insertAuditLogDb(supabase, {
    actor,
    action: 'homepage_featured_update',
    metadata: { actorRole: 'admin', before, after },
  }).catch(() => {}); // audit 失敗不阻斷設定本身
  return after;
}

