// 顯式 .ts 副檔名：讓 node --test（type stripping）可直接載入本模組（同 seo-alternates.ts 慣例）
import { routing, isAppLocale, type AppLocale } from './routing.ts';

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
  // #1721：只要第一段是合法 locale 就剝掉——SSR 下 usePathname() 會回傳 middleware
  // 改寫後的內部路徑（預設語系帶顯式 /zh-Hant 前綴）；原本只剝非預設語系，
  // 會把 href 算成 /zh-Hant/... 與 /en/zh-Hant/...。
  const seg = pathname.split('/')[1];
  const rest = isAppLocale(seg) ? pathname.slice(`/${seg}`.length) || '/' : pathname;
  if (target === routing.defaultLocale) {
    return rest || '/';
  }
  return rest === '/' ? `/${target}` : `/${target}${rest}`;
}
