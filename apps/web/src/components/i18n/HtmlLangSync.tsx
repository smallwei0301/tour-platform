'use client';

import { useEffect } from 'react';
import { useLocale } from 'next-intl';

import { HTML_LANG, isAppLocale } from '../../i18n/routing';

/**
 * <html lang> 隨 locale 正確輸出（#1569 的 ISR-safe 版本，#1585）。
 *
 * Root layout 是 ISR 頁（導遊詳情/商店、活動詳情）的共同祖先，不能呼叫
 * getLocale()/headers() 等 dynamic API（會讓 ISR 靜態生成 DYNAMIC_SERVER_USAGE
 * 500，#1585 production 事故）。因此 SSR HTML 一律輸出 lang="zh-Hant"，由本
 * client component 在 hydration 後把 <html lang> 更新為當前 locale —— a11y
 * （螢幕閱讀器）與會執行 JS 的爬蟲（Googlebot rendered DOM）拿到正確值。
 * Server-rendered lang 的完整解法（多 root layout）見 #1585 follow-up。
 */
export function HtmlLangSync() {
  const locale = useLocale();

  useEffect(() => {
    document.documentElement.lang = isAppLocale(locale) ? HTML_LANG[locale] : 'zh-Hant';
  }, [locale]);

  return null;
}
