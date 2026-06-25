import { routing, isAppLocale, type AppLocale } from './routing';

/**
 * 純函式 locale 路徑工具（#multilingual Phase 0.5 PoC）。
 *
 * 不依賴 next-intl context（NextIntlClientProvider）——供 root layout 內、provider
 * 之外的 client 元件（Navbar、LanguageSwitcher）共用。`localePrefix: 'as-needed'`：
 * 預設 `zh-Hant` 無前綴、其餘語言走 `/<locale>` 前綴。
 */

/** 從實際瀏覽器 pathname 推斷目前 locale（無前綴＝預設 locale）。 */
export function detectLocale(pathname: string): AppLocale {
  const seg = pathname.split('/')[1];
  return isAppLocale(seg) ? seg : routing.defaultLocale;
}

/** 把目前 pathname 換成 target locale 的對應網址（as-needed：預設不加前綴）。 */
export function pathForLocale(pathname: string, target: AppLocale): string {
  const current = detectLocale(pathname);
  let rest = pathname;
  if (current !== routing.defaultLocale) {
    rest = pathname.slice(`/${current}`.length) || '/';
  }
  if (target === routing.defaultLocale) {
    return rest || '/';
  }
  return rest === '/' ? `/${target}` : `/${target}${rest}`;
}
