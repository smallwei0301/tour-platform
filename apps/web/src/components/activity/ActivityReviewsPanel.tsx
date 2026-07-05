'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { buildRatingDistribution, filterReviews } from '../../lib/review-distribution.mjs';
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
 * 分佈與篩選皆為前端純函式（review-distribution.mjs），社群口碑語錄（warmQuotes）
 * 不參與篩選、恆顯示於真實評論之後。
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

  const dist = useMemo(() => buildRatingDistribution(reviews), [reviews]);
  const filtered = useMemo(
    () => filterReviews(reviews, { rating: ratingFilter, withPhotos }) as Review[],
    [reviews, ratingFilter, withPhotos],
  );

  const hasReviews = dist.total > 0;

  return (
    <div>
      {/* 評分分佈長條（僅有真實評論時顯示） */}
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
        {filtered.map((r) => (
          <div key={r.id} className="kkd-review-card">
            <div className="kkd-review-header">
              <strong className="kkd-reviewer">
                {t('reviewAuthor', { author: r.author ?? '', city: r.city || t('reviewCityFallback') })}
              </strong>
              <span className="kkd-review-date">
                {r.date || new Date().toLocaleDateString(locale === 'en' ? 'en-US' : 'zh-TW')}
              </span>
            </div>
            {r.rating ? <Stars value={r.rating} aria={t('starAria', { filled: Math.round(Number(r.rating) || 0), max: STAR_MAX })} /> : null}
            <p className="kkd-review-text">{r.text}</p>
            {Array.isArray(r.photos) && r.photos.length > 0 && (
              <ReviewPhotos photos={r.photos} authorLabel={r.author ?? ''} />
            )}
            {/* #1592 導遊回覆 */}
            {r.guideReply && r.guideReply.text && (
              <div className="kkd-review-guide-reply">
                <strong className="kkd-review-guide-reply-label">
                  <PublicReplyIcon /> {t('reviewsGuideReplyLabel')}
                </strong>
                <p className="kkd-review-guide-reply-text">{r.guideReply.text}</p>
              </div>
            )}
          </div>
        ))}

        {filtered.length === 0 && hasReviews && (
          <div className="kkd-review-empty">{t('reviewsEmptyFiltered')}</div>
        )}

        {/* 社群口碑語錄（暖場）— 不參與篩選，恆顯示 */}
        {warmQuotes.map((q, i) => (
          <div key={`warm-${i}`} className="kkd-review-card">
            <div className="kkd-review-header">
              <strong className="kkd-reviewer">{resolveSocialProofAuthor(q.author)}</strong>
            </div>
            <Stars value={q.rating} aria={t('starAria', { filled: Math.round(Number(q.rating) || 0), max: STAR_MAX })} />
            <p className="kkd-review-text">{q.text}</p>
            {Array.isArray(q.photos) && q.photos.length > 0 && (
              <ReviewPhotos photos={q.photos} authorLabel={resolveSocialProofAuthor(q.author)} />
            )}
          </div>
        ))}
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
