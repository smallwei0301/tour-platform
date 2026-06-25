'use client';
import { useState, useEffect } from 'react';
import { routing, isAppLocale, type AppLocale } from './routing';
import { detectLocale } from './locale-path';

/**
 * 讀取使用者選擇的語言（NEXT_LOCALE cookie）給「無前綴、auth-gated」的 client 頁面
 * 用（如 /me/orders）——這些個人頁不需要 /en URL／SEO，語言跟著使用者用切換器設定的
 * cookie 走（#multilingual）。
 *
 * 為避免 hydration mismatch：SSR 與 client 首次 render 都回預設繁中（server 讀不到
 * document.cookie），mount 後才依 cookie 切到實際語言（英文使用者會有極短暫 zh→en，
 * 這些頁面本來就有 auth/載入過渡，影響可忽略）。
 */
export function useClientLocale(): AppLocale {
  const [locale, setLocale] = useState<AppLocale>(routing.defaultLocale);
  useEffect(() => {
    const m = typeof document !== 'undefined'
      ? document.cookie.match(/(?:^|;\s*)NEXT_LOCALE=([^;]+)/)
      : null;
    const val = m ? decodeURIComponent(m[1]) : '';
    if (isAppLocale(val) && val !== locale) setLocale(val);
  }, [locale]);
  return locale;
}

/**
 * 全站共用 chrome（Navbar／Footer，在 NextIntlClientProvider 之外）用的 locale 解析：
 * **pathname 前綴優先**（SEO 頁 `/en/...` → en，立即決定、無 flicker），**無前綴才退回
 * cookie**（個人頁 `/me/*` 等不帶 locale 前綴者跟著使用者切換器設定走）。
 *
 * 安全性：middleware 的 cookie-sticky redirect 確保「cookie=en 卻停在無前綴 SEO 頁」不會
 * 發生（會被導去 `/en/...`），故無前綴時退回 cookie 不會讓 SEO 頁的 chrome 與內文語言打架；
 * 只有 middleware 不導向的個人頁（/me/*）會走到 cookie 分支，正好與頁面內文（useClientLocale）
 * 一致。hydration 安全沿用 useClientLocale：SSR 回預設、mount 後才依 cookie 切。
 */
export function useChromeLocale(pathname: string): AppLocale {
  const pathLocale = detectLocale(pathname);
  const cookieLocale = useClientLocale();
  return pathLocale !== routing.defaultLocale ? pathLocale : cookieLocale;
}
