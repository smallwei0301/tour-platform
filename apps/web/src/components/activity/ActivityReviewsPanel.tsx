'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { buildRatingDistribution, filterReviews, toReviewDisplayList } from '../../lib/review-distribution.mjs';
import { ReviewPhotos } from './ReviewPhotos';
import { resolveSocialProofAuthor } from '../../lib/social-proof-quotes.mjs';

const STAR_MAX = 5;

type GuideReply = { text: string; at: string | null } | null;
type Review = {
  id: string;
  author?: string;
  city?: string;
  rating?: number | null;
  text?: string;
  date?: string;
  photos?: string[];
  guideReply?: GuideReply;
};
type WarmQuote = { author?: unknown; rating?: number; text?: string; photos?: string[] };
type DisplayItem =
  | (Review & { isWarm: false })
  | { id: string; isWarm: true; author?: unknown; rating?: number; text?: string; photos?: string[] };

function Stars({ value, aria }: { value?: number | null; aria: string }) {
  const filled = Math.max(0, Math.min(STAR_MAX, Math.round(Number(value) || 0)));
  const empty = STAR_MAX - filled;
  return (
    <div className="kkd-stars" role="img" aria-label={aria}>
      {filled > 0 && <span className="kkd-stars-on">{'★'.repeat(filled)}</span>}
      {empty > 0 && <span className="kkd-stars-off">{'★'.repeat(empty)}</span>}
    </div>
  );
}

/**
 * Issue #1592 — 活動頁評論互動：評分分佈長條 + 星等/有照片篩選 + 導遊回覆顯示。
 * 分佈與篩選皆為前端純函式（review-distribution.mjs）。
 * 補強：社群口碑語錄（warmQuotes，管理者後台設定的暖場評論）經 toReviewDisplayList
 * 併入分佈與篩選，與真實評論同進正式評論邏輯（真實在前、暖場在後、暖場無日期/導遊回覆）。
 * 注意：此僅影響面板視覺；rating_avg／review_count／JSON-LD 仍只採真實評論（#1378 紅線）。
 */
export function ActivityReviewsPanel({
  reviews,
  warmQuotes,
  locale,
}: {
  reviews: Review[];
  warmQuotes: WarmQuote[];
  locale: string;
}) {
  const t = useTranslations('activityDetail');
  const [ratingFilter, setRatingFilter] = useState<number | null>(null);
  const [withPhotos, setWithPhotos] = useState(false);

  // 真實評論 + 暖場語錄合併成單一顯示列，兩者同進分佈/篩選（#1592 補強）。
  const items = useMemo(() => toReviewDisplayList(reviews, warmQuotes) as DisplayItem[], [reviews, warmQuotes]);
  const dist = useMemo(() => buildRatingDistribution(items), [items]);
  const filtered = useMemo(
    () => filterReviews(items, { rating: ratingFilter, withPhotos }) as DisplayItem[],
    [items, ratingFilter, withPhotos],
  );

  const hasReviews = dist.total > 0;

  return (
    <div>
      {/* 評分分佈長條（有真實評論或暖場評論時顯示） */}
      {hasReviews && (
        <div className="kkd-review-dist" role="table" aria-label={t('reviewsDistributionAria')}>
          {[5, 4, 3, 2, 1].map((star) => {
            const s = star as 1 | 2 | 3 | 4 | 5;
            const pct = dist.percents[s];
            const active = ratingFilter === star;
            return (
              <button
                key={star}
                type="button"
                className={`kkd-review-dist-row${active ? ' is-active' : ''}`}
                aria-pressed={active}
                onClick={() => setRatingFilter(active ? null : star)}
              >
                <span className="kkd-review-dist-label">{t('reviewsFilterStar', { star })}</span>
                <span className="kkd-review-dist-track" aria-hidden>
                  <span className="kkd-review-dist-fill" style={{ width: `${pct}%` }} />
                </span>
                <span className="kkd-review-dist-count">{dist.counts[s]}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* 篩選列 */}
      {hasReviews && (
        <div className="kkd-review-filters" role="group" aria-label={t('reviewsFilterGroupAria')}>
          <button
            type="button"
            className={`kkd-review-chip${ratingFilter === null && !withPhotos ? ' is-active' : ''}`}
            aria-pressed={ratingFilter === null && !withPhotos}
            onClick={() => {
              setRatingFilter(null);
              setWithPhotos(false);
            }}
          >
            {t('reviewsFilterAll')}
          </button>
          <button
            type="button"
            className={`kkd-review-chip${withPhotos ? ' is-active' : ''}`}
            aria-pressed={withPhotos}
            onClick={() => setWithPhotos((v) => !v)}
          >
            {t('reviewsFilterPhotos')}
          </button>
        </div>
      )}

      <div className="kkd-review-list" role="region" aria-label={t('sectionReviews')} tabIndex={0}>
        {filtered.map((item) =>
          item.isWarm ? (
            /* 社群口碑語錄（暖場）— 併入分佈/篩選，無日期/導遊回覆 */
            <div key={item.id} className="kkd-review-card">
              <div className="kkd-review-header">
                <strong className="kkd-reviewer">{resolveSocialProofAuthor(item.author)}</strong>
              </div>
              <Stars value={item.rating} aria={t('starAria', { filled: Math.round(Number(item.rating) || 0), max: STAR_MAX })} />
              <p className="kkd-review-text">{item.text}</p>
              {Array.isArray(item.photos) && item.photos.length > 0 && (
                <ReviewPhotos photos={item.photos} authorLabel={resolveSocialProofAuthor(item.author)} />
              )}
            </div>
          ) : (
            <div key={item.id} className="kkd-review-card">
              <div className="kkd-review-header">
                <strong className="kkd-reviewer">
                  {t('reviewAuthor', { author: item.author ?? '', city: item.city || t('reviewCityFallback') })}
                </strong>
                <span className="kkd-review-date">
                  {item.date || new Date().toLocaleDateString(locale === 'en' ? 'en-US' : 'zh-TW')}
                </span>
              </div>
              {item.rating ? <Stars value={item.rating} aria={t('starAria', { filled: Math.round(Number(item.rating) || 0), max: STAR_MAX })} /> : null}
              <p className="kkd-review-text">{item.text}</p>
              {Array.isArray(item.photos) && item.photos.length > 0 && (
                <ReviewPhotos photos={item.photos} authorLabel={item.author ?? ''} />
              )}
              {/* #1592 導遊回覆 */}
              {item.guideReply && item.guideReply.text && (
                <div className="kkd-review-guide-reply">
                  <strong className="kkd-review-guide-reply-label">
                    <PublicReplyIcon /> {t('reviewsGuideReplyLabel')}
                  </strong>
                  <p className="kkd-review-guide-reply-text">{item.guideReply.text}</p>
                </div>
              )}
            </div>
          ),
        )}

        {filtered.length === 0 && hasReviews && (
          <div className="kkd-review-empty">{t('reviewsEmptyFiltered')}</div>
        )}
      </div>
    </div>
  );
}

function PublicReplyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden focusable="false">
      <path
        d="M9 17l-5-5 5-5M4 12h11a4 4 0 0 1 4 4v2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
