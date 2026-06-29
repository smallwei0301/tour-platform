'use client';
import { useEffect } from 'react';

/**
 * 把 `<html lang>` 同步成目前的 locale（#multilingual）。
 *
 * 根 `app/layout.tsx` 因多 root（admin/guide 在 [locale] 之外）且需維持頁面靜態快取，
 * SSR 時 `<html lang>` 固定為 zh-Hant。本元件在 [locale] 區段 client 端把 lang 更新為
 * 實際 locale（en 頁→`lang="en"`），供螢幕報讀器與輔助技術正確判讀語言。純 a11y 副作用，
 * 不影響版面；視覺層的 locale 切換另由 `[data-locale]` 屬性（SSR 穩定）驅動。
 */
export function HtmlLangSync({ locale }: { locale: string }) {
  useEffect(() => {
    if (typeof document !== 'undefined' && document.documentElement.lang !== locale) {
      document.documentElement.lang = locale;
    }
  }, [locale]);
  return null;
}
