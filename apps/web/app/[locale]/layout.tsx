import '../globals.css';

import type { Metadata } from 'next';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { routing, VISIBLE_LOCALES, HTML_LANG } from '../../src/i18n/routing';
import { SITE_METADATA_BASE } from '../../src/lib/seo/site-metadata';
import { RootDocument } from '../../src/components/layout/RootDocument';

/**
 * Localized public root layout.
 *
 * This segment owns the document root so the initial server response can emit
 * `<html lang>` from the static locale param. It deliberately avoids request
 * dynamic APIs (`headers()` / `cookies()`) so ISR pages remain prerenderable.
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
// [locale] 下的內容頁皆未自設 robots，故本 layout 的 robots 會生效：
// visible locale 可索引；config-ready 但未開站 locale 則 noindex/nofollow。
export async function generateMetadata(
  { params }: { params: Promise<{ locale: string }> },
): Promise<Metadata> {
  const { locale } = await params;
  const visible = (VISIBLE_LOCALES as readonly string[]).includes(locale);
  const tSeo = await getTranslations({ locale, namespace: 'seo' });
  const metadata: Metadata = {
    metadataBase: SITE_METADATA_BASE,
    title: {
      template: tSeo('titleTemplate'),
      default: tSeo('defaultTitle'),
    },
    description: tSeo('defaultDescription'),
    openGraph: {
      type: 'website',
      locale: locale === 'en' ? 'en_US' : 'zh_TW',
      siteName: tSeo('siteName'),
      title: tSeo('defaultTitle'),
      description: tSeo('defaultDescription'),
      images: [{ url: '/images/og-default.png', width: 1536, height: 1024, alt: tSeo('defaultTitle') }],
    },
    twitter: {
      card: 'summary_large_image',
      title: tSeo('defaultTitle'),
      description: tSeo('defaultDescription'),
      images: ['/images/og-default.png'],
    },
    robots: { index: visible, follow: visible },
  };

  return metadata;
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
    <RootDocument lang={HTML_LANG[locale]}>
      <NextIntlClientProvider locale={locale} messages={messages}>
        {children}
      </NextIntlClientProvider>
    </RootDocument>
  );
}
