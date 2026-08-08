import type { Metadata } from 'next';
import { BookingConfirmClient } from './BookingConfirmClient';

/**
 * 旅客確認頁 `/booking/confirm/[token]`（#1759 Package 4／Task 43b）。
 *
 * 契約來源（唯一權威）：
 * docs/operations/session-handoffs/2026-08-08-issue1759-task43-traveler-confirm-page-plan.md
 * §3.2（檔案清單）／§4.4（狀態機與 metadata 拆層）／§2 D7（safe next 與 RISK-2 緩解）。
 *
 * 為何拆成 server + client 兩層：`'use client'` 檔不能 export `metadata`，
 * 而本頁必須設 `referrer: 'no-referrer'`——token 出現在 URL，若 Referer 隨頁內
 * 第三方資源外送，等同把一次性確認 token 洩到站外（計畫 §2 D7 RISK-2 緩解措施）。
 * 因此互動全部下放到 BookingConfirmClient，本檔只負責 metadata 與把 token 交棒。
 *
 * `robots: noindex` 已由 `app/(non-locale)/booking/layout.tsx` 繼承（計畫 F20），
 * 故本檔不重複宣告，也不得修改該 layout。
 *
 * `force-dynamic`：token 在路徑上，本頁不得被靜態化或進任何快取層。
 */
export const metadata: Metadata = {
  title: '確認預訂 — 祕島 Midao',
  referrer: 'no-referrer',
};

export const dynamic = 'force-dynamic';

type BookingConfirmPageProps = {
  params: Promise<{ token: string }>;
};

export default async function BookingConfirmPage({ params }: BookingConfirmPageProps) {
  const { token } = await params;
  return <BookingConfirmClient token={token} />;
}
