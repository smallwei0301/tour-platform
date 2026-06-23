'use client';
import { useRouter, usePathname } from 'next/navigation';
import {
  routing,
  VISIBLE_LOCALES,
  isAppLocale,
  type AppLocale,
} from '../../i18n/routing';

/**
 * 最小語言切換器（#multilingual Phase 0.5 PoC）。
 *
 * 重要：Navbar 渲染於「根」`app/layout.tsx`，位在 `app/[locale]/layout.tsx` 的
 * NextIntlClientProvider **之外**，因此這裡**不能**用 next-intl 的 `useLocale()`／
 * `useTranslations()`／`createNavigation` hooks（會抓不到 provider context）。
 * 改用純 `next/navigation`，依 routing config（`localePrefix: 'as-needed'`）自行
 * 解析／替換網址前綴：預設 `zh-Hant` 無前綴、`en` 走 `/en`。
 *
 * 註：query string 在點擊時才從 `window.location.search` 讀取（client-only），
 * 刻意**不用 `useSearchParams()`**——本元件在 root layout 每頁皆渲染（含靜態
 * 預渲的 `/_not-found`），用該 hook 會觸發 CSR bailout 而要求 Suspense 邊界、
 * 導致 production build 失敗。
 *
 * PoC 範圍：只露出 `VISIBLE_LOCALES`（繁中＋英文）；只有首頁與 /activities 已搬進
 * `[locale]`，切到其他頁的英文版前要等全面搬遷。
 */

/** 切換鈕上的精簡標籤（導覽列空間有限，不用 LOCALE_LABELS 的全名）。 */
const SHORT_LABELS: Record<AppLocale, string> = {
  'zh-Hant': '中文',
  en: 'EN',
  ja: 'JA',
  ko: 'KO',
};

/** 從實際瀏覽器 pathname 推斷目前 locale（無前綴＝預設 locale）。 */
function detectLocale(pathname: string): AppLocale {
  const seg = pathname.split('/')[1];
  return isAppLocale(seg) ? seg : routing.defaultLocale;
}

/** 把目前 pathname 換成 target locale 的對應網址（as-needed：預設不加前綴）。 */
function pathForLocale(pathname: string, target: AppLocale): string {
  const current = detectLocale(pathname);
  // 先去掉目前的前綴，取得「內部 pathname」。
  let rest = pathname;
  if (current !== routing.defaultLocale) {
    rest = pathname.slice(`/${current}`.length) || '/';
  }
  if (target === routing.defaultLocale) {
    return rest || '/';
  }
  return rest === '/' ? `/${target}` : `/${target}${rest}`;
}

export function LanguageSwitcher({ className }: { className?: string }) {
  const router = useRouter();
  const pathname = usePathname() || '/';
  const active = detectLocale(pathname);

  function switchTo(target: AppLocale) {
    if (target === active) return;
    // 寫 next-intl 預設讀取的 NEXT_LOCALE cookie，讓選擇 sticky；否則 middleware 的
    // localeDetection 會用舊 cookie/Accept-Language 把無前綴的預設語言路徑又導回 /en。
    document.cookie = `NEXT_LOCALE=${target};path=/;max-age=31536000;samesite=lax`;
    const query = typeof window !== 'undefined' ? window.location.search : '';
    const href = pathForLocale(pathname, target) + query;
    router.push(href);
    router.refresh();
  }

  return (
    <div
      className={`tp-lang-switch${className ? ` ${className}` : ''}`}
      role="group"
      aria-label="切換語言 / Language"
    >
      {VISIBLE_LOCALES.map((locale) => (
        <button
          key={locale}
          type="button"
          onClick={() => switchTo(locale)}
          aria-current={locale === active ? 'true' : undefined}
          data-testid={`lang-switch-${locale}`}
          className={`tp-lang-switch-btn${locale === active ? ' is-active' : ''}`}
        >
          {SHORT_LABELS[locale]}
        </button>
      ))}
    </div>
  );
}
