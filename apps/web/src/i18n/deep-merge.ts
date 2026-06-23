/**
 * Deep-merge for i18n message catalogs（#multilingual Phase 0）。
 *
 * `zh-Hant` 是 source of truth；其他語言缺鍵時回退到 zh-Hant 的對應值，
 * 確保畫面永遠不會出現空字串或裸鍵（`nav.explore` 之類）。純函式、不依賴
 * next-intl runtime，方便用 node --test 直接驗證。
 */
export type MessageTree = { [key: string]: string | MessageTree };

function isPlainObject(value: unknown): value is MessageTree {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 以 `base`（zh-Hant）為底，用 `override`（目標語言）覆蓋。
 * - override 有的鍵用 override 值；override 缺的鍵保留 base 值。
 * - 巢狀物件遞迴合併；型別衝突（一邊 string 一邊物件）以 override 為準。
 * 不變動傳入物件，回傳新樹。
 */
export function deepMergeMessages(base: MessageTree, override: MessageTree | undefined | null): MessageTree {
  if (!override) return { ...base };
  const out: MessageTree = { ...base };
  for (const key of Object.keys(override)) {
    const o = override[key];
    const b = out[key];
    if (isPlainObject(o) && isPlainObject(b)) {
      out[key] = deepMergeMessages(b, o);
    } else {
      out[key] = o;
    }
  }
  return out;
}
