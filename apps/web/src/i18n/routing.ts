import { defineRouting } from 'next-intl/routing';

/**
 * 多語言路由設定（#multilingual Phase 0）。
 *
 * - `defaultLocale: 'zh-Hant'` + `localePrefix: 'as-needed'`：預設繁中**不加前綴**，
 *   既有 zh-TW URL 與 SEO 一字不變；en/ja/ko 走 `/en`、`/ja`、`/ko`。
 * - `locales` 一次定義四種語言，但切換器（LanguageSwitcher）第一階段只露出
 *   `VISIBLE_LOCALES`（繁中＋英文）；ja/ko 先 config-ready 但隱藏，等翻譯來源齊
 *   再開，避免日韓旅客切過去看到滿頁中文 fallback 的壞體驗。
 *
 * Scope：只有 traveler 公開頁吃 locale 前綴；admin/guide/api/auth 不在 `[locale]`
 * 下，永不帶前綴（見 middleware.ts 的 isLocalePublicPage / stripLocale）。
 */
export const routing = defineRouting({
  locales: ['zh-Hant', 'en', 'ja', 'ko'],
  defaultLocale: 'zh-Hant',
  localePrefix: 'as-needed',
  // zh-first：關閉 next-intl 內建偵測（Accept-Language／cookie）。新訪客一律落在預設
  // 繁中、不因瀏覽器語言自動跳到 /en（台灣品牌，主要受眾為中文）。使用者選過的語言
  // 由 middleware 依 NEXT_LOCALE cookie 做 sticky redirect（見 middleware.ts）。
  localeDetection: false,
});

export type AppLocale = (typeof routing.locales)[number];

/** 切換器第一階段只露出的語言（其餘 config-ready 但隱藏）。 */
export const VISIBLE_LOCALES: AppLocale[] = ['zh-Hant', 'en'];

/** UI 顯示用的語言名稱（以該語言自身書寫）。 */
export const LOCALE_LABELS: Record<AppLocale, string> = {
  'zh-Hant': '繁體中文',
  en: 'English',
  ja: '日本語',
  ko: '한국어',
};

/** `<html lang>` 用的 BCP-47 值。 */
export const HTML_LANG: Record<AppLocale, string> = {
  'zh-Hant': 'zh-Hant',
  en: 'en',
  ja: 'ja',
  ko: 'ko',
};

/** OpenGraph `locale` 用的值。 */
export const OG_LOCALE: Record<AppLocale, string> = {
  'zh-Hant': 'zh_TW',
  en: 'en_US',
  ja: 'ja_JP',
  ko: 'ko_KR',
};

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === 'string' && (routing.locales as readonly string[]).includes(value);
}
