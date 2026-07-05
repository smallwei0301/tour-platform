import type { Metadata } from 'next';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { routing, VISIBLE_LOCALES } from '../../src/i18n/routing';
import { HtmlLangSync } from '../../src/components/i18n/HtmlLangSync';

/**
 * [locale] 區段 layout（#multilingual Phase 0.5 PoC）。
 *
 * 巢狀於根 `app/layout.tsx`（後者仍提供 `<html>`/`<body>` 與 Navbar/Footer），
 * 因此這裡**不渲染 `<html>`**——只負責驗證 locale、設定 request locale、並用
 * NextIntlClientProvider 把 messages/locale 傳給 client component。
 *
 * 註：`<html lang>` 的 SSR 輸出由根 layout 固定為 zh-Hant（根 layout 禁用
 * getLocale()/headers()，否則 ISR 頁 500，見 #1585）；en 頁的 lang 由
 * HtmlLangSync 在 hydration 後補正。Server-rendered lang 留待全面搬遷時
 * 改用「多 root layout」結構處理（見計劃 Phase 0.5 → 全面搬遷）。
 */
// #1595：只預渲染已開站的可見 locale；ja/ko 為 config-ready 但未開站，不預建。
export function generateStaticParams() {
  return VISIBLE_LOCALES.map((locale) => ({ locale }));
}

// #1595：未開站 locale（ja/ko＝config-ready 但不在 VISIBLE_LOCALES）render 但 noindex，
// 避免翻譯未齊的半成品被搜尋引擎收錄。sitemap／hreflang 亦只列 VISIBLE_LOCALES
// （見 src/lib/seo-alternates.ts），雙重不對外宣告。
//
// 為何不用 notFound()：本區段經 middleware(next-intl) rewrite 進入，rewrite 下游的
// notFound() 只渲染 not-found 內容但 HTTP 狀態仍是 200（soft-404，對 SEO 無效），
// 且 middleware.ts 為凍結區不可改。noindex meta 不依賴狀態碼，是此約束下的可靠解。
// [locale] 下的內容頁皆未自設 robots，故本 layout 的 robots 會生效（visible locale
// 回空物件、沿用 root layout 的可索引預設）。開站＝把該 locale 加入 VISIBLE_LOCALES。
export async function generateMetadata(
  { params }: { params: Promise<{ locale: string }> },
): Promise<Metadata> {
  const { locale } = await params;
  const visible = (VISIBLE_LOCALES as readonly string[]).includes(locale);
  return visible ? {} : { robots: { index: false, follow: false } };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  // 非法 locale（不在四語系 config）＝真 404。valid-but-hidden（ja/ko）不在此擋，
  // 改以 generateMetadata 的 noindex 處理（見上方註解，middleware rewrite 使 notFound
  // 只能 soft-404）。
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // 啟用 static rendering：讓本區段的頁面可在 build 時依 locale 預渲染。
  setRequestLocale(locale);

  const messages = await getMessages();

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <HtmlLangSync />
      {children}
    </NextIntlClientProvider>
  );
}
