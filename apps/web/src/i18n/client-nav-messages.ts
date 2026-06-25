import type { AppLocale } from './routing';

import zhHant from '../../messages/zh-Hant.json';
import en from '../../messages/en.json';

/**
 * 給 root layout 內、NextIntlClientProvider 之外的 client 元件（Navbar、Footer）用的
 * 精簡文案來源（#multilingual）。
 *
 * 這些 chrome 元件在 provider 之外，拿不到 next-intl context，但本身是 client 元件，
 * 可依目前 locale（由 pathname 前綴推得）自己挑字。這裡只靜態 import 兩個已存在的
 * catalog（繁中＋英文），ja/ko 尚無 catalog → fallback 回繁中，與
 * `src/i18n/request.ts` 的 fallback 策略一致。
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

type FooterMessages = typeof zhHant.footer;

const FOOTER_CATALOGS: Partial<Record<AppLocale, FooterMessages>> = {
  'zh-Hant': zhHant.footer,
  en: en.footer,
};

export function getFooterMessages(locale: AppLocale): FooterMessages {
  return FOOTER_CATALOGS[locale] ?? zhHant.footer;
}

// 泛用 client namespace 取值：供 provider 之外、依 cookie 決定語言的 client 頁面
// （/me/** 個人頁、MemberTabs 等）取任一 namespace。ja/ko 無 catalog → fallback 繁中。
const FULL_CATALOGS: Partial<Record<AppLocale, typeof zhHant>> = {
  'zh-Hant': zhHant,
  en: en as typeof zhHant,
};

export function getClientNamespace<K extends keyof typeof zhHant>(locale: AppLocale, ns: K): (typeof zhHant)[K] {
  return (FULL_CATALOGS[locale] ?? zhHant)[ns];
}
