// 公開接案頁（RSC，公開唯讀）：hero → 資訊列 → RequestForm（精選服務卡＋需求表單）。
// RSC 直呼領域檔（Next 慣用寫法）；不引入任何 client hook。

import { notFound } from 'next/navigation';
import { getPublicMidaoPageDb } from '../../../../src/lib/midao/db-midao-showcase.mjs';
import RequestForm from './RequestForm';
import { Icon } from '../../midao2/ui';

// 與 apps/web/app/(non-locale)/midao2/ui.tsx 的 C 常數同值。
// 該檔標記 'use client'：server component 若直接 import 會踩 RSC client-reference 邊界
// （named export 會被替換為 client reference marker，屬性存取拿不到真值）——因此本檔內聯同值常數。
const C = {
  ACCENT: '#2563eb',
  ACCENT_SOFT: '#eff6ff',
  BG: '#f6f4ef',
  CARD: '#ffffff',
  TEXT: '#111827',
  MUTED: '#6b7280',
  BORDER: '#e5e7eb',
} as const;

type PageParams = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageParams) {
  const { slug } = await params;
  const page = await getPublicMidaoPageDb(slug);
  // 與下方頁面元件同條件呼叫 notFound()：若只在頁面元件呼叫，Next.js 15 在
  // generateMetadata 先行 resolve 完成後可能已開始 streaming shell（HTTP 200），
  // 頁面元件才發現的 notFound() 只能拿到 soft-404（內容正確但狀態碼仍是 200）。
  // 在 metadata 階段就先擋，讓框架有機會在真正送出 header 前得知這是 404。
  if (!page) notFound();
  return {
    title: `${page.guide.displayName}｜Midao 接案頁`,
    description: page.guide.headline ?? '',
  };
}

export default async function GuidePublicPage({ params }: PageParams) {
  const { slug } = await params;
  const page = await getPublicMidaoPageDb(slug);
  if (!page) notFound();

  const { guide, services } = page;
  const heroImage = guide.heroUrl ?? guide.photoUrl ?? null;

  return (
    <div style={{ minHeight: '100dvh', background: C.BG, color: C.TEXT }}>
      <div style={{ maxWidth: 520, margin: '0 auto', paddingBottom: 48 }}>
        {/* hero */}
        <div
          style={{
            position: 'relative',
            height: 220,
            background: heroImage ? `url(${heroImage}) center/cover no-repeat` : C.ACCENT_SOFT,
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(180deg, rgba(17,24,39,0) 45%, rgba(17,24,39,0.55) 100%)',
            }}
          />
          <div style={{ position: 'absolute', left: 16, bottom: -32 }}>
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: '50%',
                border: '3px solid #ffffff',
                overflow: 'hidden',
                background: C.CARD,
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              }}
            >
              {guide.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={guide.photoUrl}
                  alt={guide.displayName}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : null}
            </div>
          </div>
        </div>

        <div style={{ padding: '44px 16px 0' }}>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{guide.displayName}</div>
          {guide.headline && (
            <div style={{ fontSize: 15, color: C.MUTED, marginTop: 4 }}>{guide.headline}</div>
          )}
          {guide.bio && (
            <div style={{ fontSize: 14, color: C.TEXT, marginTop: 10 }}>{guide.bio}</div>
          )}
          {guide.languages.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
              {guide.languages.map((l: string) => (
                <span
                  key={l}
                  style={{
                    border: `1px solid ${C.ACCENT}`,
                    color: C.ACCENT,
                    borderRadius: 999,
                    padding: '3px 10px',
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {l}
                </span>
              ))}
            </div>
          )}

          {/* 資訊列 */}
          {(guide.regions.length > 0 || guide.experienceYears != null) && (
            <div
              style={{
                display: 'flex',
                gap: 16,
                flexWrap: 'wrap',
                marginTop: 14,
                paddingTop: 14,
                borderTop: `1px solid ${C.BORDER}`,
                fontSize: 13,
                color: C.MUTED,
              }}
            >
              {guide.regions.length > 0 && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Icon name="location" size={14} />
                  {guide.regions.join('・')}
                </span>
              )}
              {guide.experienceYears != null && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Icon name="map" size={14} />
                  導覽經驗 {guide.experienceYears} 年
                </span>
              )}
            </div>
          )}
        </div>

        <div style={{ padding: '24px 16px 0' }}>
          <RequestForm guide={guide} services={services} slug={slug} />
        </div>
      </div>
    </div>
  );
}
