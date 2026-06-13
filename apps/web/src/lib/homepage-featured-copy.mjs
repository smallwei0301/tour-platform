// 首頁精選「文案覆寫」純邏輯（admin 可選真實行程並手動編輯首頁卡片文案）。
// - derive*：從真實行程自動帶入預設文案（admin 按「產生預設簡介」或未填時用）。
// - sanitize*：清洗 admin 傳入的覆寫值（限定欄位、型別、長度、難度 1–5）。
// - merge*：覆寫值優先，留空則回退自動帶入 → 首頁實際渲染用的最終文案。
// 純函式、無 Supabase 依賴（依 db.mjs strangler 準則獨立成檔以便單測）。

export const EDITOR_PICK_COPY_FIELDS = ['title', 'subtitle', 'desc', 'tagLabel', 'difficulty', 'imageUrl', 'ratingScore', 'ratingCount'];
export const MORE_FEATURED_COPY_FIELDS = ['title', 'tagline', 'imageUrl'];

const LIMITS = { title: 80, subtitle: 120, desc: 400, tagLabel: 20, tagline: 120, imageUrl: 1000, ratingScore: 8 };

function trimStr(v, max) {
  if (v == null) return '';
  return String(v).trim().slice(0, max);
}

function clampDifficulty(v) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return null;
  return Math.min(5, Math.max(1, n));
}

function clampCount(v) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function formatScore(avg) {
  const n = Number(avg);
  if (!Number.isFinite(n) || n <= 0) return '';
  return n.toFixed(1);
}

/** 把行程時長（分鐘）格式化為顯示字串（與站內既有「約 N 小時」風格一致）。 */
export function formatDurationDisplay(minutes) {
  const n = Number(minutes);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n < 60) return `${Math.round(n)} 分鐘`;
  const hours = n / 60;
  const rounded = Number.isInteger(hours) ? hours : Math.round(hours);
  return `約 ${rounded} 小時`;
}

/** 從真實行程自動帶入「編輯精選大卡」預設文案。 */
export function deriveEditorPickCopy(activity = {}) {
  const title = trimStr(activity.title, LIMITS.title);
  return {
    title: title.split('｜')[0].trim() || title,
    subtitle: trimStr(activity.tagline, LIMITS.subtitle),
    desc: trimStr(activity.shortDescription, LIMITS.desc),
    tagLabel: trimStr(activity.region, LIMITS.tagLabel),
    difficulty: 2,
    imageUrl: trimStr(activity.coverImageUrl ?? activity.imageUrl, LIMITS.imageUrl),
    ratingScore: formatScore(activity.ratingAvg),
    ratingCount: clampCount(activity.reviewCount) ?? 0,
  };
}

/** 從真實行程自動帶入「更多精選」卡片預設文案。 */
export function deriveMoreFeaturedCopy(activity = {}) {
  return {
    title: trimStr(activity.title, LIMITS.title),
    tagline: trimStr(activity.tagline, LIMITS.tagline),
    imageUrl: trimStr(activity.coverImageUrl ?? activity.imageUrl, LIMITS.imageUrl),
  };
}

/** 清洗 admin 傳入的編輯精選覆寫值：只留已知欄位、限制型別/長度，空字串＝不覆寫（移除）。 */
export function sanitizeEditorPickCopy(input = {}) {
  const src = input && typeof input === 'object' ? input : {};
  const out = {};
  const title = trimStr(src.title, LIMITS.title);
  if (title) out.title = title;
  const subtitle = trimStr(src.subtitle, LIMITS.subtitle);
  if (subtitle) out.subtitle = subtitle;
  const desc = trimStr(src.desc, LIMITS.desc);
  if (desc) out.desc = desc;
  const tagLabel = trimStr(src.tagLabel, LIMITS.tagLabel);
  if (tagLabel) out.tagLabel = tagLabel;
  const difficulty = clampDifficulty(src.difficulty);
  if (difficulty != null) out.difficulty = difficulty;
  const imageUrl = trimStr(src.imageUrl, LIMITS.imageUrl);
  if (imageUrl) out.imageUrl = imageUrl;
  const ratingScore = trimStr(src.ratingScore, LIMITS.ratingScore);
  if (ratingScore) out.ratingScore = ratingScore;
  const ratingCount = clampCount(src.ratingCount);
  if (ratingCount != null) out.ratingCount = ratingCount;
  return out;
}

/** 清洗「更多精選」覆寫值：key = slug，value = { title, tagline, imageUrl }（僅保留 validSlugs）。 */
export function sanitizeMoreFeaturedCopy(input = {}, validSlugs = []) {
  const src = input && typeof input === 'object' ? input : {};
  const valid = validSlugs.length > 0 ? new Set(validSlugs) : null;
  const out = {};
  for (const [slug, raw] of Object.entries(src)) {
    if (valid && !valid.has(slug)) continue;
    const v = raw && typeof raw === 'object' ? raw : {};
    const entry = {};
    const title = trimStr(v.title, LIMITS.title);
    if (title) entry.title = title;
    const tagline = trimStr(v.tagline, LIMITS.tagline);
    if (tagline) entry.tagline = tagline;
    const imageUrl = trimStr(v.imageUrl, LIMITS.imageUrl);
    if (imageUrl) entry.imageUrl = imageUrl;
    if (Object.keys(entry).length > 0) out[slug] = entry;
  }
  return out;
}

/** 合併：覆寫值優先，留空回退自動帶入。回傳首頁渲染用的最終編輯精選文案。 */
export function mergeEditorPickCopy(derived = {}, override = {}) {
  const o = override && typeof override === 'object' ? override : {};
  return {
    title: o.title || derived.title || '',
    subtitle: o.subtitle || derived.subtitle || '',
    desc: o.desc || derived.desc || '',
    tagLabel: o.tagLabel || derived.tagLabel || '',
    difficulty: o.difficulty != null ? o.difficulty : (derived.difficulty ?? 2),
    imageUrl: o.imageUrl || derived.imageUrl || '',
    ratingScore: o.ratingScore || derived.ratingScore || '',
    ratingCount: o.ratingCount != null ? o.ratingCount : (derived.ratingCount ?? 0),
  };
}

/** 合併「更多精選」單張卡：覆寫值優先，留空回退自動帶入。 */
export function mergeMoreFeaturedCopy(derived = {}, override = {}) {
  const o = override && typeof override === 'object' ? override : {};
  return {
    title: o.title || derived.title || '',
    tagline: o.tagline || derived.tagline || '',
    imageUrl: o.imageUrl || derived.imageUrl || '',
  };
}

/**
 * 把 admin 設定（slug + copy 覆寫）＋真實行程目錄解析成首頁渲染用 view-model。
 * 任何缺漏（未設定、slug 已下架）都 fail-open：編輯精選＝目錄第一個、更多精選＝其餘前 2。
 * 目錄為空（DB 不可用）時回 null，交由元件退回 fixtures 後備。
 * @param {{ editorPickSlug?: string|null, moreFeaturedSlugs?: string[], editorPickCopy?: object, moreFeaturedCopy?: object }|null} settings
 * @param {Array} catalog 真實已發布行程（listPublishedActivitiesDb 形狀）
 * @param {number} moreLimit 更多精選張數上限
 * @returns {{ editorPickSlug: string|null, editorPick: {activity:any, copy:any}|null, tours: Array<{activity:any, copy:any}> }}
 */
export function resolveHomepageFeaturedView(settings, catalog = [], moreLimit = 4) {
  const list = Array.isArray(catalog) ? catalog.filter((a) => a && a.slug) : [];
  if (list.length === 0) return { editorPickSlug: null, editorPick: null, tours: [] };

  const bySlug = new Map(list.map((a) => [a.slug, a]));
  const wantPick = settings?.editorPickSlug;
  const pickSlug = wantPick && bySlug.has(wantPick) ? wantPick : list[0].slug;
  const pickActivity = bySlug.get(pickSlug);
  const editorPick = {
    activity: pickActivity,
    copy: mergeEditorPickCopy(deriveEditorPickCopy(pickActivity), asObj(settings?.editorPickCopy)),
  };

  let tourSlugs = (Array.isArray(settings?.moreFeaturedSlugs) ? settings.moreFeaturedSlugs : [])
    .filter((s) => bySlug.has(s) && s !== pickSlug);
  if (tourSlugs.length === 0) {
    tourSlugs = list.filter((a) => a.slug !== pickSlug).slice(0, 2).map((a) => a.slug);
  }
  tourSlugs = tourSlugs.slice(0, moreLimit);

  const moreCopy = asObj(settings?.moreFeaturedCopy);
  const tours = tourSlugs.map((s) => {
    const a = bySlug.get(s);
    return { activity: a, copy: mergeMoreFeaturedCopy(deriveMoreFeaturedCopy(a), asObj(moreCopy[s])) };
  });

  return { editorPickSlug: pickSlug, editorPick, tours };
}

function asObj(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}
