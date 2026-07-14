/**
 * SEO canonical / hreflang helper（健檢 v2 SEO-1/3）。
 *
 * 英文站（/en）上線後全站缺 canonical 與 hreflang，zh 與 en 互為重複內容卻沒有
 * 告訴搜尋引擎對應關係。此 helper 集中產生 Metadata.alternates 與 sitemap 的
 * languages 變體，全站共用一份 locale 前綴規則（與 src/i18n/routing.ts 一致：
 * zh-Hant 無前綴、其餘 /en /ja /ko）。
 *
 * 規則：
 * - hreflang 只列 VISIBLE_LOCALES（ja/ko config-ready 但未開站，不對外宣告，
 *   避免搜尋引擎索引滿頁中文 fallback 的半成品）。
 * - 未開站 locale（ja/ko）的 canonical 指回預設繁中版，防止半成品被收錄。
 * - 回傳相對路徑；Next 以 root layout 的 metadataBase 解析為絕對 URL。
 */
import { routing, VISIBLE_LOCALES, isAppLocale, type AppLocale } from '../i18n/routing.ts';

/** 把「無前綴 canonical 路徑」轉為指定 locale 的路徑（zh-Hant 不加前綴）。 */
export function localizePath(path: string, locale: AppLocale): string {
  const normalized = path === '/' ? '/' : `/${path.replace(/^\/+|\/+$/g, '')}`;
  if (locale === routing.defaultLocale) return normalized;
  return normalized === '/' ? `/${locale}` : `/${locale}${normalized}`;
}

/** Builds a public route path with encoded dynamic segments. */
export function buildPublicPath(basePath: string, segments: string[] = []): string {
  const normalizedBase = `/${String(basePath).replace(/^\/+|\/+$/g, '')}`;
  const encodedSegments = segments.map((segment) => encodeURIComponent(String(segment)));
  return encodedSegments.length > 0
    ? `${normalizedBase}/${encodedSegments.join('/')}`
    : normalizedBase;
}

export type SeoAlternates = {
  canonical: string;
  languages: Record<string, string>;
};

/**
 * 產生頁面 Metadata 用的 alternates。
 * @param path  無 locale 前綴的路徑（例 `/activities/kaohsiung/chaishan-cave`）
 * @param locale 當前頁面 locale（params.locale；未知或未開站值 → 視為預設繁中）
 */
export function buildAlternates(path: string, locale: string): SeoAlternates {
  const current: AppLocale =
    isAppLocale(locale) && VISIBLE_LOCALES.includes(locale) ? locale : routing.defaultLocale;

  const languages: Record<string, string> = {};
  for (const l of VISIBLE_LOCALES) {
    languages[l] = localizePath(path, l);
  }
  languages['x-default'] = localizePath(path, routing.defaultLocale);

  return {
    canonical: localizePath(path, current),
    languages,
  };
}

/**
 * 產生 sitemap entry 用的絕對 URL languages 變體
 * （MetadataRoute.Sitemap 的 alternates.languages 需絕對 URL）。
 */
export function sitemapLanguageAlternates(
  path: string,
  baseUrl: string
): { languages: Record<string, string> } {
  const trimmedBase = baseUrl.replace(/\/+$/, '');
  const languages: Record<string, string> = {};
  for (const l of VISIBLE_LOCALES) {
    const p = localizePath(path, l);
    languages[l] = p === '/' ? trimmedBase : `${trimmedBase}${p}`;
  }
  return { languages };
}
