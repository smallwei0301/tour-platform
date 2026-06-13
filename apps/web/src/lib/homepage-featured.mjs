// 首頁精選設定的純邏輯（#admin 首頁精選功能）
// - normalizeHomepageFeatured：驗證 + 去重 + 衝突排除（編輯精選不得重複出現在更多精選）
// - resolveHomepageSelection：把設定值解析成首頁實際要渲染的 slug 清單（fail-open 預設柴山）
// 純函式、無 Supabase 依賴，依 db.mjs strangler 準則獨立成檔以便單測。

export const HOMEPAGE_DEFAULT_EDITOR_PICK = 'kaohsiung-chaishan-cave-experience';
export const HOMEPAGE_MORE_FEATURED_LIMIT = 4;

/**
 * 正規化 admin 送進來的精選設定。
 * @param {{ editorPickSlug?: string|null, moreFeaturedSlugs?: string[] }} input
 * @param {string[]} validSlugs 可選擇的行程 slug 清單（空陣列 = 不驗證存在性）
 * @returns {{ editorPickSlug: string|null, moreFeaturedSlugs: string[], errors: string[] }}
 */
export function normalizeHomepageFeatured(input = {}, validSlugs = []) {
  const valid = new Set(validSlugs);
  const errors = [];

  const rawPick = input.editorPickSlug;
  const editorPickSlug = rawPick == null || String(rawPick).trim() === '' ? null : String(rawPick).trim();
  if (editorPickSlug && valid.size > 0 && !valid.has(editorPickSlug)) {
    errors.push(`editorPickSlug 不存在：${editorPickSlug}`);
  }

  const rawList = Array.isArray(input.moreFeaturedSlugs) ? input.moreFeaturedSlugs : [];
  const seen = new Set();
  const moreFeaturedSlugs = [];
  for (const raw of rawList) {
    const slug = String(raw ?? '').trim();
    if (!slug || seen.has(slug)) continue; // 去重
    seen.add(slug);
    if (valid.size > 0 && !valid.has(slug)) {
      errors.push(`moreFeaturedSlugs 不存在：${slug}`);
      continue;
    }
    if (slug === editorPickSlug) continue; // 衝突：編輯精選自動從更多精選排除
    moreFeaturedSlugs.push(slug);
  }

  if (moreFeaturedSlugs.length > HOMEPAGE_MORE_FEATURED_LIMIT) {
    errors.push(`更多精選最多 ${HOMEPAGE_MORE_FEATURED_LIMIT} 個（目前 ${moreFeaturedSlugs.length} 個）`);
  }

  return { editorPickSlug, moreFeaturedSlugs, errors };
}

/**
 * 把儲存的設定解析成首頁渲染清單。任何缺漏（未設定、slug 已下架）都
 * fail-open 回預設行為：編輯精選 = 柴山、更多精選 = 目錄中其餘前 2 個。
 * @param {{ editorPickSlug?: string|null, moreFeaturedSlugs?: string[] }|null} settings
 * @param {string[]} catalogSlugs 目前可渲染的行程 slug（依目錄順序）
 * @returns {{ editorPickSlug: string, tourSlugs: string[] }}
 */
export function resolveHomepageSelection(settings, catalogSlugs = []) {
  const catalog = new Set(catalogSlugs);
  const fallbackPick = catalog.has(HOMEPAGE_DEFAULT_EDITOR_PICK)
    ? HOMEPAGE_DEFAULT_EDITOR_PICK
    : (catalogSlugs[0] ?? HOMEPAGE_DEFAULT_EDITOR_PICK);

  const editorPickSlug = settings?.editorPickSlug && catalog.has(settings.editorPickSlug)
    ? settings.editorPickSlug
    : fallbackPick;

  let tourSlugs = (Array.isArray(settings?.moreFeaturedSlugs) ? settings.moreFeaturedSlugs : [])
    .filter((slug) => catalog.has(slug) && slug !== editorPickSlug);

  if (tourSlugs.length === 0) {
    tourSlugs = catalogSlugs.filter((slug) => slug !== editorPickSlug).slice(0, 2);
  }

  return { editorPickSlug, tourSlugs };
}
