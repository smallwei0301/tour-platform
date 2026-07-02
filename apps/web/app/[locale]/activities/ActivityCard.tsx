'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { buildActivityHref } from '../../../src/lib/activity-url';
import { classifyActivityCategoryTag } from '../../../src/lib/category-tags.mjs';
import { resolveActivityReviewStats } from '../../../src/lib/activity-review-stats.mjs';
import WishlistToggle from '../../../src/components/WishlistToggle';
import { PublicIcon } from '../../../src/components/ui/PublicIcon';
import { resolveCoverSrc, CARD_IMAGE_SIZES } from './cover-image';

// Issue #1344 — 卡片抽成獨立元件，讓 ActivitiesContent（互動列表）與
// page 層的 Suspense fallback（SSR 首屏）共用同一份 markup。
// 重點：這個元件**不得使用 useSearchParams** — page 是 ISR
// （revalidate=60），useSearchParams 會讓 client component 在 prerender
// 時 CSR bailout，SSR HTML 退回 fallback；fallback 裡的卡片正是靠
// 「無 useSearchParams」才能被 server render 進 HTML、讓 LCP 圖片
// 在 HTML parse 階段就開始下載＋渲染。

export interface Activity {
  id: string;
  slug: string;
  title: string;
  tagline?: string;
  shortDescription?: string;
  region: string;
  regionSlug?: string;
  regions?: string[];
  category: string;
  priceTwd: number;
  durationMinutes?: number;
  minParticipants?: number;
  maxParticipants?: number;
  coverImageUrl?: string;
  status: string;
  guideName?: string;
  guideSlug?: string;
  guideAvatarUrl?: string;
  ratingAvg?: number;
  reviewCount?: number;
  // #收藏星數：與詳情頁共用 resolveActivityReviewStats 的輸入（真實評論 + 社群口碑語錄），
  // 讓列表卡顯示與詳情頁一致的真實星數／評論數。
  reviews?: Array<{ rating?: number }>;
  socialProofQuotes?: Array<string | { author?: string; rating?: number; text?: string }>;
}

interface ActivityCardProps {
  a: Activity;
  idx: number;
  wishlisted?: boolean;
  isLoggedIn?: boolean;
}

export default function ActivityCard({ a, idx, wishlisted = false, isLoggedIn = false }: ActivityCardProps) {
  const t = useTranslations('activities');
  const href = buildActivityHref({ slug: a.slug, region: a.region, regionSlug: a.regionSlug });
  const durationDisplay = a.durationMinutes
    ? a.durationMinutes >= 60
      ? a.durationMinutes % 60
        ? t('durHoursMinutes', { h: Math.floor(a.durationMinutes / 60), m: a.durationMinutes % 60 })
        : t('durHours', { h: Math.floor(a.durationMinutes / 60) })
      : t('durMinutes', { m: a.durationMinutes })
    : '';
  return (
    <article className="tp-card" key={a.slug} data-testid="activity-card" data-activity-slug={a.slug}>
      <div style={{ position: 'relative' }}>
        <Image
          // Issue #1344 — src fallback 與 sizes 抽到
          // cover-image.ts 共用常數,跟 page 層 SSR preload
          // 的 imagesrcset / imagesizes 保證一致,否則
          // preload 的 URL 對不上 srcset → double download。
          // quality=60 對應 buildCardImageSrcSet 的 q=60;
          // Next 15 next.config 不支援 images.quality 全域
          // 設定,必須在這裡跟著 preload URL 設值。
          src={resolveCoverSrc(a.coverImageUrl)}
          alt={a.title}
          className="tp-card-img"
          style={{ background: 'none' }}
          // `.tp-card-grid-activities` renders 2 cols by
          // default and 1 col under 768px → first 2 cards
          // are above-the-fold on desktop AND the first
          // alone on mobile.
          priority={idx < 2}
          loading={idx < 2 ? 'eager' : 'lazy'}
          sizes={CARD_IMAGE_SIZES}
          quality={60}
          width={1200} height={675} />
        <WishlistToggle activityId={a.id} initialWishlisted={wishlisted} isLoggedIn={isLoggedIn} />
        <span style={{
          position: 'absolute', top: 10, left: 10,
          background: 'var(--tp-accent)', color: '#fff',
          fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
        }}>{t(`categoryTag.${classifyActivityCategoryTag(a)}`)}</span>
      </div>
      {a.guideName && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0 4px' }}>
          {a.guideAvatarUrl && (
            <Image src={a.guideAvatarUrl} alt={a.guideName} style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} width={28} height={28} />
          )}
          <span style={{ fontSize: 13, color: 'var(--tp-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>{a.guideName} <span style={{ color: 'var(--tp-brass)', display: 'inline-flex' }}><PublicIcon name="badgeCheck" size={14} /></span></span>
        </div>
      )}
      <h3 style={{ fontSize: 15, margin: '4px 0 6px', lineHeight: 1.4 }}>{a.title}</h3>
      {(() => {
        // 與詳情頁同一真實來源（resolveActivityReviewStats）：count>0 才顯示星數/則數，
        // 否則顯示「尚無評價」，避免出現「5.0 (0則)」這種與詳情頁不一致的假數據。
        const stats = resolveActivityReviewStats(a);
        return (
          <div data-testid="activity-card-rating" style={{ display: 'flex', alignItems: 'center', gap: 4, margin: '0 0 2px', fontSize: 13 }}>
            {stats.count > 0 ? (
              <>
                <span style={{ color: '#f59e0b', display: 'inline-flex' }}><PublicIcon name="star" size={14} /></span>
                <span>{stats.score.toFixed(1)}</span>
                <span style={{ color: 'var(--tp-muted)' }}>{t('reviewCount', { n: stats.count })}</span>
                <span style={{ color: 'var(--tp-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>· <PublicIcon name="pin" size={13} /> {a.region}</span>
              </>
            ) : (
              <>
                <span style={{ color: 'var(--tp-muted)' }} className="text-xs">{t('noRating')}</span>
                <span style={{ color: 'var(--tp-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>· <PublicIcon name="pin" size={13} /> {a.region}</span>
              </>
            )}
          </div>
        );
      })()}
      {durationDisplay && (
        <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--tp-muted)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><PublicIcon name="clock" size={13} /> {durationDisplay}</span> · <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><PublicIcon name="users" size={13} /> {t('people', { min: a.minParticipants ?? 0, max: a.maxParticipants ?? 0 })}</span>
        </p>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong style={{ color: 'var(--tp-gold-strong)' }}>{t('perPerson', { price: a.priceTwd?.toLocaleString() ?? '0' })}</strong>
        <Link
          className="tp-btn tp-btn-primary"
          href={href}
          // Issue #1249 — Next.js Link already does
          // viewport-based prefetch automatically; the
          // onMouseEnter `router.prefetch(href)` we used to
          // call here was redundant and flooded the network
          // with parallel _rsc requests during initial load.
          prefetch
          data-testid="activity-card-link"
          style={{ fontSize: 13, padding: '6px 14px' }}
        >
          {t('viewActivity')}
        </Link>
      </div>
    </article>
  );
}
