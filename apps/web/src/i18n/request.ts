import { getRequestConfig } from 'next-intl/server';

import { deepMergeMessages, type MessageTree } from './deep-merge';
import { routing, type AppLocale } from './routing';

import zhHant from '../../messages/zh-Hant.json';

/**
 * next-intl request config（#multilingual Phase 0）。
 *
 * - locale 由 `[locale]` segment（routing）決定；未知/缺值回 defaultLocale。
 * - zh-Hant 直接用；其他語言以 zh-Hant 為底 deep-merge（缺鍵 fallback 回繁中）。
 * - timeZone 固定 Asia/Taipei，與站台金額/日期 formatter（src/lib/format.ts）一致。
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale: AppLocale =
    requested && (routing.locales as readonly string[]).includes(requested)
      ? (requested as AppLocale)
      : routing.defaultLocale;

  const base = zhHant as MessageTree;
  let messages: MessageTree = base;

  if (locale !== 'zh-Hant') {
    try {
      const mod = (await import(`../../messages/${locale}.json`)) as { default: MessageTree };
      messages = deepMergeMessages(base, mod.default);
    } catch {
      // 該語言尚無 catalog（例如 ja/ko 尚未提供）→ 全數 fallback 回 zh-Hant。
      messages = base;
    }
  }

  return {
    locale,
    messages,
    timeZone: 'Asia/Taipei',
  };
});
