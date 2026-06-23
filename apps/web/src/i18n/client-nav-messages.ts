import type { AppLocale } from './routing';

import zhHant from '../../messages/zh-Hant.json';
import en from '../../messages/en.json';

/**
 * 給 root layout 內、NextIntlClientProvider 之外的 client 元件（Navbar）用的
 * 精簡文案來源（#multilingual Phase 0.5 PoC）。
 *
 * Navbar 在 provider 之外，拿不到 next-intl context，但本身是 client 元件，可依
 * 目前 locale（由 pathname 前綴推得）自己挑字。這裡只靜態 import 兩個已存在的
 * catalog（繁中＋英文，皆 < 2KB），ja/ko 尚無 catalog → fallback 回繁中，與
 * `src/i18n/request.ts` 的 fallback 策略一致。
 *
 * 範圍刻意只取 Navbar 需要的 `nav` 與 `common`，避免把整包 messages 帶進
 * 每頁都載入的導覽列 bundle。
 */

type NavMessages = {
  nav: typeof zhHant.nav;
  common: typeof zhHant.common;
};

const CATALOGS: Partial<Record<AppLocale, NavMessages>> = {
  'zh-Hant': { nav: zhHant.nav, common: zhHant.common },
  en: { nav: en.nav, common: en.common },
};

const FALLBACK: NavMessages = { nav: zhHant.nav, common: zhHant.common };

export function getNavMessages(locale: AppLocale): NavMessages {
  return CATALOGS[locale] ?? FALLBACK;
}
