import Image from 'next/image';
import Link from 'next/link';
import { activities, guides } from '../../fixtures/data';
import { buildActivityHref } from '../../lib/activity-url';
import { classifyActivityCategoryTag, CATEGORY_TAG_LABELS_ZH } from '../../lib/category-tags.mjs';

const recommendationNotes: Record<string, string> = {
  'kaohsiung-chaishan-cave-experience': '第一次來高雄想玩得深入又安心，這條路線最容易留下記憶點。',
  'dadadaocheng-walk': '半天就能把大稻埕從「走過」變成「真正看懂」。',
  'hualien-river-trekking': '適合想把花蓮從觀景行程升級成真實參與感的人。',
};

export function FeaturedTours() {
  const featured = activities.slice(0, 3);
  const [primary, ...secondary] = featured;

  return (
    <section className="tp-section">
      <div className="tp-container">
        <div className="tp-section-head">
          <div>
            <h2 style={{ marginBottom: 4 }}>本週精選行程</h2>
            <p style={{ margin: 0, color: 'var(--tp-muted)', fontSize: 14 }}>
              先從一條最有代表性的路線開始，再挑你想延伸的旅程節奏。
            </p>
          </div>
          <Link href="/activities" className="tp-link">查看全部 →</Link>
        </div>

        {primary && (
          <article
            className="tp-card tp-featured-primary"
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)',
              gap: 18,
              marginBottom: 14,
              borderWidth: 2,
              borderColor: 'rgba(27,107,74,0.2)',
              boxShadow: '0 8px 20px rgba(0,0,0,0.04)',
            }}
          >
            <Image src={primary.imageUrl} alt={primary.title} className="tp-card-img" style={{ marginBottom: 0, minHeight: 230 }} priority width={1200} height={675} />
            <div style={{ display: 'grid', gap: 10 }}>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: 'var(--tp-primary)' }}>推薦先從這條開始</p>
              <h3 style={{ fontSize: 24, margin: 0, lineHeight: 1.4 }}>{primary.title}</h3>
              <p style={{ margin: 0, color: '#2f2f2f', lineHeight: 1.65 }}>{recommendationNotes[primary.slug]}</p>
              <p style={{ margin: 0, fontSize: 14, color: 'var(--tp-muted)' }}>
                {primary.durationDisplay} · {primary.region} · {primary.priceLabel}
              </p>
              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <Link className="tp-btn tp-btn-primary" href={buildActivityHref({ slug: primary.slug, region: primary.region, regionSlug: primary.regionSlug })}>
                  查看主打行程
                </Link>
                <Link className="tp-btn tp-btn-ghost" href="/activities">比較其他路線</Link>
              </div>
            </div>
          </article>
        )}

        <div className="tp-card-grid tp-card-grid-featured" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          {secondary.map((a) => {
            const guide = guides.find((g) => g.slug === a.guideSlug);
            return (
              <article className="tp-card" key={a.slug}>
                <Image src={a.imageUrl} alt={a.title} className="tp-card-img" style={{ background: 'none' }} loading="lazy" width={1200} height={675} />

                <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    style={{
                      background: 'rgba(255, 109, 180, 0.12)',
                      color: '#b12871',
                      fontSize: 12,
                      fontWeight: 700,
                      padding: '4px 10px',
                      borderRadius: 999,
                    }}
                  >
                    {CATEGORY_TAG_LABELS_ZH[classifyActivityCategoryTag(a)]}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--tp-muted)' }}>{a.region}</span>
                </div>

                <h3 style={{ fontSize: 18, margin: '10px 0 8px', lineHeight: 1.4 }}>{a.title}</h3>

                {guide && (
                  <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--tp-muted)' }}>
                    由 {guide.displayName} 帶路 · 導遊評價 {guide.rating.toFixed(1)} ★ / {guide.reviewCount} 則
                  </p>
                )}

                <p style={{ margin: '0 0 14px', fontSize: 14, lineHeight: 1.6, color: '#2f2f2f' }}>
                  {recommendationNotes[a.slug] ?? '適合想用在地視角重新認識台灣的人。'}
                </p>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
                  <strong style={{ color: 'var(--tp-primary)', fontSize: 15 }}>{a.priceLabel}</strong>
                  <Link
                    className="tp-btn tp-btn-primary"
                    href={buildActivityHref({ slug: a.slug, region: a.region, regionSlug: a.regionSlug })}
                    style={{ fontSize: 13, padding: '6px 14px' }}
                  >
                    查看行程
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
