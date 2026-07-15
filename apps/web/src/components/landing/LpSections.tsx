import Link from 'next/link';
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import {
  MountainIcon, WaveIcon, TribalIcon, TeaLeafIcon,
  HikeIcon, NightsIcon,
  ShieldCheckIcon, CompassIcon, BadgeShieldIcon, StarIcon,
} from './LpIcons';
import { activities, reviews, getActivityBySlug, guides } from '../../fixtures/data';
import { buildActivityHref } from '../../lib/activity-url';
import { formatDurationDisplay } from '../../lib/homepage-featured-copy.mjs';
import { LpHeroMotion } from './LpHeroMotion';
import { LpHeroDust } from './LpHeroDust';
import { LpFeaturedCarousel } from './LpFeaturedCarousel';

// #multilingual 全面搬遷：首頁區塊改用 useTranslations('home')。next-intl 的
// useTranslations 在 server component 亦可同步使用（本檔皆 server component）。
// 內部連結維持 next/link（不加 locale 前綴）：未搬進 [locale] 的路徑（/theme、
// /guides…）若被前綴會 404；已搬進的 /、/activities 靠 sticky NEXT_LOCALE cookie，
// middleware localeDetection 會把無前綴請求導回目前語言，語言連續性不受影響。

export function LpHero() {
  const t = useTranslations('home.hero');
  return (
    <section className="lp-hero" aria-label={t('sectionLabel')}>
      <div
        className="lp-hero-photo"
        role="img"
        aria-label={t('photoAlt')}
      />
      <div className="lp-hero-cloudbox" aria-hidden="true">
        <div className="lp-hero-clouds" />
        <div className="lp-hero-clouds2" />
      </div>
      <div className="lp-hero-fg" aria-hidden="true" />
      <div className="lp-hero-dawn" aria-hidden="true" />
      <div className="lp-hero-raybox" aria-hidden="true">
        <div className="lp-hero-rays" />
        <LpHeroDust />
      </div>
      <LpHeroMotion />
      <div className="lp-hero-vert" aria-hidden="true">
        <span>{t('vertical1')}</span>
        <span>{t('vertical2')}</span>
        <span>{t('vertical3')}</span>
      </div>
      <div className="lp-hero-compass" aria-hidden="true">
        <CompassIcon size={30} />
      </div>
      <div className="lp-hero-inner">
        <div className="lp-hero-content">
          <h1>{t('titleA')}<br />{t('titleB')}<br />{t('titleC')}<span className="lp-accent">{t('accent')}</span></h1>
          <p className="lp-hero-sub">{t('sub')}</p>
          <p className="lp-hero-caption">{t('caption')}</p>
          <Link href="/activities" data-testid="home-cta-explore" className="lp-btn">
            {t('cta')} <span className="lp-btn-arrow">→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}

const THEMES = [
  { titleKey: 'mountainTitle', sub: 'Into the Mountains', href: '/theme/mountain-wilderness', icon: MountainIcon },
  { titleKey: 'riverTitle', sub: 'Wild Streams', href: '/theme/river-trekking', icon: WaveIcon },
  { titleKey: 'cultureTitle', sub: 'Local Culture', href: '/theme/culture-history', icon: TribalIcon },
  { titleKey: 'ecologyTitle', sub: 'Wildlife & Nature', href: '/theme/ecology', icon: TeaLeafIcon },
] as const;

export function LpThemes() {
  const t = useTranslations('home.themes');
  return (
    <section className="lp-section lp-themes" aria-label={t('eyebrow')}>
      <h2 className="lp-eyebrow">{t('eyebrow')}</h2>
      <div className="lp-themes-grid">
        {THEMES.map(({ titleKey, sub, href, icon: Icon }) => (
          <Link key={titleKey} href={href} className="lp-theme-card">
            <Icon size={30} />
            <span className="lp-theme-title">{t(titleKey)}</span>
            <span className="lp-theme-sub">{sub}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

// ── 編輯精選卡：策展圖片與難度（admin 於 /admin/homepage 切換行程） ──
const FEATURED_IMAGES: Record<string, string> = {
  'kaohsiung-chaishan-cave-experience': '/images/lp/feat-chaishan.webp',
  'hualien-river-trekking': '/images/lp/tour-river.webp',
  'dadadaocheng-walk': '/images/lp/tour-dadaocheng.webp',
  'taipei-night-market-food-tour': '/images/lp/tour-nightmarket.webp',
};

// 策展行程難度（文案已移至 messages 的 home.featuredCopy）。
const FEATURED_DIFFICULTY: Record<string, number> = {
  'kaohsiung-chaishan-cave-experience': 2,
  'hualien-river-trekking': 3,
  'dadadaocheng-walk': 1,
  'taipei-night-market-food-tour': 1,
};

const CURATED_SLUGS = new Set(Object.keys(FEATURED_IMAGES));

type FeaturedCopy = {
  title: string;
  subtitle: string;
  desc: ReactNode;
  tagLabel: string;
  difficulty: number; // 1-5
};

function featuredRating(slug: string): { score: string; count: number } {
  // 柴山維持既有行銷文案數字（4.9 / 128 則）
  if (slug === 'kaohsiung-chaishan-cave-experience') return { score: '4.9', count: 128 };
  const related = reviews.filter((r) => r.activitySlug === slug);
  if (related.length === 0) return { score: '4.9', count: 128 };
  const avg = related.reduce((sum, r) => sum + r.rating, 0) / related.length;
  return { score: avg.toFixed(1), count: related.length * 32 };
}

/** admin 設定的真實行程精選 view-model（page.tsx 解析後傳入）。 */
export type FeaturedView = {
  activity: { slug: string; region?: string; regionSlug?: string; priceTwd?: number; durationMinutes?: number; durationDisplay?: string };
  copy: { title: string; subtitle: string; desc: string; tagLabel: string; difficulty: number; imageUrl: string; imageUrls?: string[]; ratingScore: string; ratingCount: number };
};

/** desc 可為策展 ReactNode 或純字串；字串以換行轉 <br/>。 */
function renderFeaturedDesc(desc: ReactNode): ReactNode {
  if (typeof desc !== 'string') return desc;
  const lines = desc.split(/\n+/).filter(Boolean);
  return lines.map((line, i) => (
    <span key={i}>{line}{i < lines.length - 1 ? <br /> : null}</span>
  ));
}

export function LpFeatured({ slug = 'kaohsiung-chaishan-cave-experience', featured }: { slug?: string; featured?: FeaturedView }) {
  const t = useTranslations('home.featured');
  const tc = useTranslations('home.featuredCopy');
  // 優先用真實行程 view-model；無則退回 fixtures（DB 不可用時 fail-open）。
  let href: string;
  let photo: string;
  let photos: string[];
  let title: string;
  let subtitle: string;
  let desc: ReactNode;
  let tagLabel: string;
  let difficulty: number;
  let durationDisplay: string;
  let price: number;
  let ratingScore: string;
  let ratingCount: number;

  if (featured) {
    const { activity, copy } = featured;
    href = buildActivityHref(activity);
    photo = copy.imageUrl || '/images/lp/feat-chaishan.webp';
    photos = copy.imageUrls && copy.imageUrls.length > 0 ? copy.imageUrls : [photo];
    title = copy.title;
    subtitle = copy.subtitle;
    desc = copy.desc;
    tagLabel = copy.tagLabel;
    difficulty = copy.difficulty || 2;
    durationDisplay = activity.durationDisplay || formatDurationDisplay(activity.durationMinutes);
    price = activity.priceTwd ?? 0;
    ratingScore = copy.ratingScore || '5.0';
    ratingCount = copy.ratingCount || 0;
  } else {
    const activity = getActivityBySlug(slug) ?? getActivityBySlug('kaohsiung-chaishan-cave-experience')!;
    const rating = featuredRating(activity.slug);
    href = buildActivityHref(activity);
    photo = FEATURED_IMAGES[activity.slug] ?? activity.imageUrl;
    photos = [photo];
    // 策展行程文案取自 messages（可切語言）；非策展退回 fixtures 衍生（資料端原文）。
    if (CURATED_SLUGS.has(activity.slug)) {
      title = tc(`${activity.slug}.title`);
      subtitle = tc(`${activity.slug}.subtitle`);
      desc = tc(`${activity.slug}.desc`);
      tagLabel = tc(`${activity.slug}.tagLabel`);
      difficulty = FEATURED_DIFFICULTY[activity.slug] ?? 2;
    } else {
      const derived: FeaturedCopy = {
        title: activity.title.split('｜')[0],
        subtitle: activity.tagline.slice(0, 18),
        desc: activity.shortDescription,
        tagLabel: activity.region,
        difficulty: 2,
      };
      title = derived.title;
      subtitle = derived.subtitle;
      desc = derived.desc;
      tagLabel = derived.tagLabel;
      difficulty = derived.difficulty;
    }
    durationDisplay = activity.durationDisplay.replace(/（.*）/, '');
    price = activity.price;
    ratingScore = rating.score;
    ratingCount = rating.count;
  }

  return (
    <section className="lp-section lp-featured" aria-label={t('sectionLabel')}>
      <Link href={href} className="lp-feat-card">
        <div className="lp-feat-photo">
          <LpFeaturedCarousel images={photos} alt={title} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="lp-feat-badge" src="/images/lp/badge-editors-pick.webp" alt={t('badge')} loading="lazy" width={132} height={241} />
        </div>
        <div className="lp-feat-right">
          <div className="lp-feat-body">
            <h3 className="lp-feat-title">{title}</h3>
            {subtitle && <span className="lp-feat-subtitle">{subtitle}</span>}
            <p className="lp-feat-desc">{renderFeaturedDesc(desc)}</p>
            <div className="lp-feat-tags">
              {tagLabel && <span className="lp-tag"><HikeIcon /> {tagLabel}</span>}
              {durationDisplay && <span className="lp-tag"><NightsIcon /> {durationDisplay}</span>}
              <span className="lp-tag">
                {t('difficulty')}
                <span className="lp-dots" aria-label={t('difficultyAria', { n: difficulty })}>
                  {Array.from({ length: 5 }, (_, i) => (
                    <i key={i} className={i < difficulty ? undefined : 'lp-dot-off'} />
                  ))}
                </span>
              </span>
            </div>
          </div>
          <div className="lp-feat-footer">
            <div className="lp-feat-rating">
              <StarIcon filled aria-hidden="true" />
              <strong>{ratingScore}</strong>
              {ratingCount > 0 && <span className="lp-rating-count">{t('reviewCount', { count: ratingCount })}</span>}
            </div>
            <div className="lp-feat-price">
              NT$ {price.toLocaleString()}<span className="lp-price-unit">{t('priceUnit')}</span>
            </div>
          </div>
        </div>
      </Link>
    </section>
  );
}

const TRUST_ITEMS = [
  { icon: ShieldCheckIcon, a: 'verifyA', b: 'verifyB' },
  { icon: CompassIcon, a: 'reviewA', b: 'reviewB' },
  { icon: BadgeShieldIcon, a: 'protectA', b: 'protectB' },
  { icon: StarIcon, a: 'ratingA', b: 'ratingB' },
] as const;

export function LpGuide() {
  const t = useTranslations('home.guide');
  return (
    <section className="lp-section lp-guide" aria-label={t('sectionLabel')}>
      <div className="lp-guide-card">
        <Link href="/guides/andy-lee" className="lp-guide-story">
          <div className="lp-guide-photo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/guides/andy-lee/portrait-hawk.webp" alt={t('portraitAlt')} loading="lazy" width={900} height={1125} />
          </div>
          <div className="lp-guide-text">
            <p className="lp-guide-label">{t('label')}</p>
            <p className="lp-guide-name">{t('name')}<span className="lp-guide-name-en">Andy&nbsp;Lee</span></p>
            <p className="lp-guide-quote">{t('quoteA')}<br />{t('quoteB')}</p>
            <span className="lp-guide-link">{t('link')}</span>
          </div>
        </Link>
        <div className="lp-trust-grid2">
          {TRUST_ITEMS.map(({ icon: Icon, a, b }, i) => (
            <div key={i} className="lp-trust-card">
              <Icon size={26} />
              <span>{t(a)}<br />{t(b)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── 原首頁資訊區塊（以 LP 視覺語言重新呈現） ───

// region＝連結用的 DB 規範值（保持中文，?region= query 需對得上資料）；
// nameKey＝顯示名稱的 i18n key；n＝行程數。
const DESTINATIONS = [
  { nameKey: 'taipei', region: '台北', n: 120 },
  { nameKey: 'hualien', region: '花蓮', n: 85 },
  { nameKey: 'kaohsiung', region: '高雄', n: 72 },
  { nameKey: 'tainan', region: '台南', n: 96 },
  { nameKey: 'kenting', region: '屏東', n: 44 },
  { nameKey: 'taichung', region: '台中', n: 58 },
  { nameKey: 'yilan', region: '宜蘭', n: 37 },
  { nameKey: 'penghu', region: '澎湖', n: 29 },
] as const;

const TOUR_IMAGES: Record<string, string> = {
  'dadadaocheng-walk': '/images/lp/tour-dadaocheng.webp',
  'taipei-night-market-food-tour': '/images/lp/tour-nightmarket.webp',
  'hualien-river-trekking': '/images/lp/tour-river.webp',
  'kaohsiung-chaishan-cave-experience': '/images/lp/feat-chaishan.webp',
};

/** admin 設定的真實行程「更多精選」view-model（page.tsx 解析後傳入）。 */
export type TourView = {
  activity: { slug: string; region?: string; regionSlug?: string; priceTwd?: number; durationMinutes?: number; durationDisplay?: string };
  copy: { title: string; tagline: string; imageUrl: string };
};

type TourItem = { slug: string; href: string; image: string; title: string; tagline: string; region: string; durationDisplay: string; price: number };

export function LpTours({ slugs, tours }: { slugs?: string[]; tours?: TourView[] }) {
  const t = useTranslations('home.tours');
  // 優先用真實行程 view-model；無則退回 fixtures（DB 不可用時 fail-open）。
  let items: TourItem[];
  if (tours && tours.length > 0) {
    items = tours.map(({ activity, copy }) => ({
      slug: activity.slug,
      href: buildActivityHref(activity),
      image: copy.imageUrl || '/images/lp/tour-river.webp',
      title: copy.title,
      tagline: copy.tagline,
      region: activity.region ?? '',
      durationDisplay: activity.durationDisplay || formatDurationDisplay(activity.durationMinutes),
      price: activity.priceTwd ?? 0,
    }));
  } else {
    const fixtures = (slugs && slugs.length > 0
      ? slugs.map((slug) => activities.find((a) => a.slug === slug)).filter((a): a is (typeof activities)[number] => !!a)
      : activities.filter((a) => a.slug !== 'kaohsiung-chaishan-cave-experience').slice(0, 2));
    items = fixtures.map((a) => ({
      slug: a.slug, href: buildActivityHref(a), image: TOUR_IMAGES[a.slug] ?? a.imageUrl,
      title: a.title, tagline: a.tagline, region: a.region, durationDisplay: a.durationDisplay, price: a.price,
    }));
  }
  return (
    <section className="lp-section lp-tours" aria-label={t('eyebrow')}>
      <h2 className="lp-eyebrow">{t('eyebrow')}</h2>
      <div className="lp-tours-list">
        {items.map((a) => (
          <Link key={a.slug} href={a.href} className="lp-tour-card">
            <div className="lp-tour-photo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.image} alt={a.title} loading="lazy" width={1200} height={675} />
            </div>
            <div className="lp-tour-body">
              <h3 className="lp-tour-title">{a.title}</h3>
              <p className="lp-tour-tagline">{a.tagline}</p>
              <div className="lp-tour-meta">
                <span>{a.region}{a.durationDisplay ? `・${a.durationDisplay}` : ''}</span>
                <span className="lp-tour-price">NT$ {a.price.toLocaleString()}<i>{t('priceUnit')}</i></span>
              </div>
            </div>
          </Link>
        ))}
      </div>
      <Link href="/activities" className="lp-more-link">{t('more')}</Link>
    </section>
  );
}

/** 探索目的地（原 DestinationsSection 資料） */
export function LpDestinations() {
  const t = useTranslations('home.destinations');
  return (
    <section className="lp-section lp-dests" aria-label={t('eyebrow')}>
      <h2 className="lp-eyebrow">{t('eyebrow')}</h2>
      <div className="lp-dests-grid">
        {DESTINATIONS.map((d) => (
          <Link key={d.nameKey} href={`/activities?region=${encodeURIComponent(d.region)}`} className="lp-dest-card">
            <span className="lp-dest-name">{t(d.nameKey)}</span>
            <span className="lp-dest-count">{t('count', { n: d.n })}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

/** 旅人故事（原 StoryProofSection：每個行程取一則真實評價） */
const STORY_REVIEWS = Array.from(
  new Map(reviews.map((r) => [r.activitySlug, r])).values(),
).slice(0, 3);

export function LpStories() {
  const t = useTranslations('home.stories');
  return (
    <section className="lp-section lp-stories" aria-label={t('eyebrow')}>
      <h2 className="lp-eyebrow">{t('eyebrow')}</h2>
      <div className="lp-stories-list">
        {STORY_REVIEWS.map((r) => {
          const activity = getActivityBySlug(r.activitySlug);
          const guide = guides.find((g) => g.slug === r.guideSlug);
          if (!activity) return null;
          return (
            <Link key={r.id} href={buildActivityHref(activity)} className="lp-story-card">
              <p className="lp-story-quote">「{r.text}」</p>
              <div className="lp-story-meta">
                <span className="lp-story-stars" aria-label={t('starsAria', { n: r.rating })}>{'★'.repeat(r.rating)}</span>
                <span>{r.author}・{r.city}</span>
              </div>
              <span className="lp-story-activity">{activity.title}｜{guide?.displayName ?? t('guideFallback')}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

/** 常見問題（原 FaqSection，與 page.tsx 的 FAQPage JSON-LD 同步） */
export function LpFaq() {
  const t = useTranslations('home.faq');
  const items = t.raw('items') as Array<{ q: string; a: string }>;
  return (
    <section className="lp-section lp-faq" aria-label={t('eyebrow')}>
      <h2 className="lp-eyebrow">{t('eyebrow')}</h2>
      <div className="lp-faq-list">
        {items.map((f, i) => (
          <details key={i} className="lp-faq-item">
            <summary>{f.q}</summary>
            <p>{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

export function LpClosing() {
  const t = useTranslations('home.closing');
  return (
    <section className="lp-closing" aria-label={t('sectionLabel')}>
      <div className="lp-closing-paper">
        <div className="lp-closing-inner">
          <h2 className="lp-closing-title">{t('title')}</h2>
          <p className="lp-closing-desc">{t('desc')}</p>
          <Link href="/activities" className="lp-btn">
            {t('cta')} <span className="lp-btn-arrow">→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
