import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { routing } from '../../src/i18n/routing';

/**
 * [locale] 區段 layout（#multilingual Phase 0.5 PoC）。
 *
 * 巢狀於根 `app/layout.tsx`（後者仍提供 `<html>`/`<body>` 與 Navbar/Footer），
 * 因此這裡**不渲染 `<html>`**——只負責驗證 locale、設定 request locale、並用
 * NextIntlClientProvider 把 messages/locale 傳給 client component。
 *
 * 註：此 PoC 階段 `<html lang>` 仍由根 layout 固定為 zh-Hant；en 頁的 lang 正確化
 * 留待全面搬遷時改用「多 root layout」結構處理（見計劃 Phase 0.5 → 全面搬遷）。
 */
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // 啟用 static rendering：讓本區段的頁面可在 build 時依 locale 預渲染。
  setRequestLocale(locale);

  const messages = await getMessages();

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}
