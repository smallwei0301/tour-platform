import Link from 'next/link';
import type { ReactNode } from 'react';
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

export function LpHero() {
  return (
    <section className="lp-hero" aria-label="祕島主視覺">
      <div
        className="lp-hero-photo"
        role="img"
        aria-label="自洞穴內仰望峽谷，曙光灑落山谷與溪流"
      />
      {/* 曙光動態圖層（由 LpHeroMotion 以 WAAPI 驅動）。
          疊層＝物理景深：靜止遠景山谷（photo）→ 洞口飄雲 →
          推進中的去背洞穴前景（fg）→ 暮色罩 → 丁達爾光束 */}
      {/* 白色霧團：置於遠景與前景之間 — 蓋在山景上、被洞穴岩壁遮擋 */}
      <div className="lp-hero-cloudbox" aria-hidden="true">
        <div className="lp-hero-clouds" />
        <div className="lp-hero-clouds2" />
      </div>
      <div className="lp-hero-fg" aria-hidden="true" />
      <div className="lp-hero-dawn" aria-hidden="true" />
      {/* 光束＋粉塵：raybox 裁切 — 右半部被前景岩壁遮蔽，只照入洞穴左半部 */}
      <div className="lp-hero-raybox" aria-hidden="true">
        <div className="lp-hero-rays" />
        {/* 丁達爾光束中的懸浮微粒（canvas 粒子系統，布朗運動＋上飄） */}
        <LpHeroDust />
      </div>
      <LpHeroMotion />
      {/* 右側橫排三行標語＋羅盤浮水印（對齊參考圖） */}
      <div className="lp-hero-vert" aria-hidden="true">
        <span>祕島之境</span>
        <span>由在地人</span>
        <span>帶你看見</span>
      </div>
      <div className="lp-hero-compass" aria-hidden="true">
        <CompassIcon size={30} />
      </div>
      <div className="lp-hero-inner">
        <div className="lp-hero-content">
          <h1>島嶼深處，<br />有故事的人<br />帶路<span className="lp-accent">。</span></h1>
          <p className="lp-hero-sub">在地嚮導 × 深度路線 × 真實相遇</p>
          <p className="lp-hero-caption">TAIWAN. LOCAL GUIDE. REAL STORIES.</p>
          <Link href="/activities" data-testid="home-cta-explore" className="lp-btn">
            探索祕島旅程 <span className="lp-btn-arrow">→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}

const THEMES = [
  { title: '山徑', sub: 'Into the Mountains', href: '/activities?category=hiking', icon: MountainIcon },
  { title: '海岸', sub: 'By the Coast', href: '/activities?category=water', icon: WaveIcon },
  { title: '部落', sub: 'Tribal Culture', href: '/activities?category=culture', icon: TribalIcon },
  { title: '茶香', sub: 'Tea Journey', href: '/activities?category=food', icon: TeaLeafIcon },
];

export function LpThemes() {
  return (
    <section className="lp-section lp-themes" aria-label="主題探索">
      <h2 className="lp-eyebrow">主題探索</h2>
      <div className="lp-themes-grid">
        {THEMES.map(({ title, sub, href, icon: Icon }) => (
          <Link key={title} href={href} className="lp-theme-card">
            <Icon size={30} />
            <span className="lp-theme-title">{title}</span>
            <span className="lp-theme-sub">{sub}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

// ── 編輯精選卡：策展文案與本地圖片（admin 於 /admin/homepage 切換行程） ──
// 圖片一律本地快取（fixtures 的 unsplash 外連在離線/慢網環境會破圖）。
const FEATURED_IMAGES: Record<string, string> = {
  'kaohsiung-chaishan-cave-experience': '/images/lp/feat-chaishan.jpg',
  'hualien-river-trekking': '/images/lp/tour-river.jpg',
  'dadadaocheng-walk': '/images/lp/tour-dadaocheng.jpg',
  'taipei-night-market-food-tour': '/images/lp/tour-nightmarket.jpg',
};

type FeaturedCopy = {
  title: string;
  subtitle: string;
  desc: ReactNode;
  tagLabel: string;
  difficulty: number; // 1-5
};

const FEATURED_COPY: Record<string, FeaturedCopy> = {
  'kaohsiung-chaishan-cave-experience': {
    title: '柴山探洞・城市祕境',
    subtitle: '走進城市邊緣的地形祕境',
    desc: <>跟著懂路的人鑽進珊瑚礁岩的洞穴地景，<br />在城市邊緣，遇見另一個世界的高雄。</>,
    tagLabel: '探洞',
    difficulty: 2,
  },
  'hualien-river-trekking': {
    title: '秀姑巒溪・溯溪冒險',
    subtitle: '走進台灣最純淨的野溪',
    desc: <>跳潭、漂流、攀上瀑布之巔，<br />用雙腳感受花蓮山與水的力量。</>,
    tagLabel: '溯溪',
    difficulty: 3,
  },
  'dadadaocheng-walk': {
    title: '大稻埕・百年街區',
    subtitle: '真正認識活了百年的老街',
    desc: <>從迪化街布行、城隍廟到永樂市場，<br />把街區背後的人與歷史走成故事。</>,
    tagLabel: '走讀',
    difficulty: 1,
  },
  'taipei-night-market-food-tour': {
    title: '台北夜市・庶民食堂',
    subtitle: '不只吃，還要懂為什麼好吃',
    desc: <>跟著在地吃貨鑽進巷弄攤位，<br />一口一口讀懂台北的夜。</>,
    tagLabel: '食旅',
    difficulty: 1,
  },
};

/** 未策展的行程退回 fixtures 衍生（標題取「｜」前段、副標取 tagline 前段） */
function deriveFeaturedCopy(activity: (typeof activities)[number]): FeaturedCopy {
  return {
    title: activity.title.split('｜')[0],
    subtitle: activity.tagline.slice(0, 18),
    desc: activity.shortDescription,
    tagLabel: activity.region,
    difficulty: 2,
  };
}

function featuredRating(slug: string): { score: string; count: number } {
  // 柴山維持既有行銷文案數字（4.9 / 128 則）
  if (slug === 'kaohsiung-chaishan-cave-experience') return { score: '4.9', count: 128 };
  const related = reviews.filter((r) => r.activitySlug === slug);
  if (related.length === 0) return { score: '4.9', count: 128 };
  const avg = related.reduce((sum, r) => sum + r.rating, 0) / related.length;
  // fixtures 評價數為樣本，顯示用基數對齊行銷文案級距
  return { score: avg.toFixed(1), count: related.length * 32 };
}

/** admin 設定的真實行程精選 view-model（page.tsx 解析後傳入）。 */
export type FeaturedView = {
  activity: { slug: string; region?: string; regionSlug?: string; priceTwd?: number; durationMinutes?: number; durationDisplay?: string };
  copy: { title: string; subtitle: string; desc: string; tagLabel: string; difficulty: number; imageUrl: string; ratingScore: string; ratingCount: number };
};

/** desc 可為策展 ReactNode（fixtures）或純字串（真實行程）；字串以換行轉 <br/>。 */
function renderFeaturedDesc(desc: ReactNode): ReactNode {
  if (typeof desc !== 'string') return desc;
  const lines = desc.split(/\n+/).filter(Boolean);
  return lines.map((line, i) => (
    <span key={i}>{line}{i < lines.length - 1 ? <br /> : null}</span>
  ));
}

export function LpFeatured({ slug = 'kaohsiung-chaishan-cave-experience', featured }: { slug?: string; featured?: FeaturedView }) {
  // 優先用真實行程 view-model；無則退回 fixtures（DB 不可用時 fail-open）。
  let href: string;
  let photo: string;
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
    photo = copy.imageUrl || '/images/lp/feat-chaishan.jpg';
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
    const copy = FEATURED_COPY[activity.slug] ?? deriveFeaturedCopy(activity);
    const rating = featuredRating(activity.slug);
    href = buildActivityHref(activity);
    photo = FEATURED_IMAGES[activity.slug] ?? activity.imageUrl;
    title = copy.title;
    subtitle = copy.subtitle;
    desc = copy.desc;
    tagLabel = copy.tagLabel;
    difficulty = copy.difficulty;
    durationDisplay = activity.durationDisplay.replace(/（.*）/, '');
    price = activity.price;
    ratingScore = rating.score;
    ratingCount = rating.count;
  }

  return (
    <section className="lp-section lp-featured" aria-label="編輯精選行程">
      <Link href={href} className="lp-feat-card">
        {/* 參考圖：照片佔整張卡片全高（穿過 footer 列），footer 僅在右欄下方 */}
        <div className="lp-feat-photo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo} alt={`${title}（編輯精選）`} />
          {/* 編輯精選書籤標籤（去背後懸掛於照片左上） */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="lp-feat-badge" src="/images/lp/badge-editors-pick.png" alt="編輯精選" />
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
                難度
                <span className="lp-dots" aria-label={`難度 5 分之 ${difficulty}`}>
                  {Array.from({ length: 5 }, (_, i) => (
                    <i key={i} className={i < difficulty ? undefined : 'lp-dot-off'} />
                  ))}
                </span>
              </span>
            </div>
          </div>
          <div className="lp-feat-footer">
            <div className="lp-feat-rating">
              <StarIcon aria-hidden="true" />
              <strong>{ratingScore}</strong>
              {ratingCount > 0 && <span className="lp-rating-count">({ratingCount}則評價)</span>}
            </div>
            <div className="lp-feat-price">
              NT$ {price.toLocaleString()}<span className="lp-price-unit">起</span>
            </div>
          </div>
        </div>
      </Link>
    </section>
  );
}

const TRUST_ITEMS = [
  { icon: ShieldCheckIcon, text: <>身份驗證<br />已通過</> },
  { icon: CompassIcon, text: <>在地嚮導<br />人工審核</> },
  { icon: BadgeShieldIcon, text: <>旅客保障<br />安心出行</> },
  { icon: StarIcon, text: <>評價真實<br />5星好評</> },
];

export function LpGuide() {
  return (
    <section className="lp-section lp-guide" aria-label="在地嚮導與平台保障">
      {/* 參考圖為單一邊框大卡：照片＋文字（左 60.5%）＋徽章 2×2（右） */}
      <div className="lp-guide-card">
        <Link href="/guides/andy-lee" className="lp-guide-story">
          {/* 照片獨立欄：固定欄寬＋右緣漸層，任何裝置同樣構圖（文字欄不壓圖） */}
          <div className="lp-guide-photo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/guides/andy-lee/portrait-hawk.webp" alt="高雄柴山在地嚮導 Andy Lee（李衍錫）與獵鷹在山林間的肖像" />
          </div>
          <div className="lp-guide-text">
            <p className="lp-guide-label">在地嚮導・真實陪伴</p>
            <p className="lp-guide-name">高雄柴山・<span className="lp-guide-name-en">Andy&nbsp;Lee</span></p>
            <p className="lp-guide-quote">「不是觀光打卡，<br />是懂路的人帶你走進柴山。」</p>
            <span className="lp-guide-link">認識嚮導的故事 →</span>
          </div>
        </Link>
        <div className="lp-trust-grid2">
          {TRUST_ITEMS.map(({ icon: Icon, text }, i) => (
            <div key={i} className="lp-trust-card">
              <Icon size={26} />
              <span>{text}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── 原首頁資訊區塊（以 LP 視覺語言重新呈現） ───

const DESTINATIONS = [
  { name: '台北', count: '120+ 行程' },
  { name: '花蓮', count: '85+ 行程' },
  { name: '高雄', count: '72+ 行程' },
  { name: '台南', count: '96+ 行程' },
  { name: '墾丁', count: '44+ 行程' },
  { name: '台中', count: '58+ 行程' },
  { name: '宜蘭', count: '37+ 行程' },
  { name: '澎湖', count: '29+ 行程' },
];

/** 更多精選行程（admin 於 /admin/homepage 選擇；未設定時為編輯精選以外的前 2 個）。
 *  圖片使用本地資產（fixtures 的 unsplash 外連在離線/慢網環境會破圖）。 */
const TOUR_IMAGES: Record<string, string> = {
  'dadadaocheng-walk': '/images/lp/tour-dadaocheng.jpg',
  'taipei-night-market-food-tour': '/images/lp/tour-nightmarket.jpg',
  'hualien-river-trekking': '/images/lp/tour-river.jpg',
  'kaohsiung-chaishan-cave-experience': '/images/lp/feat-chaishan.jpg',
};

/** admin 設定的真實行程「更多精選」view-model（page.tsx 解析後傳入）。 */
export type TourView = {
  activity: { slug: string; region?: string; regionSlug?: string; priceTwd?: number; durationMinutes?: number; durationDisplay?: string };
  copy: { title: string; tagline: string; imageUrl: string };
};

type TourItem = { slug: string; href: string; image: string; title: string; tagline: string; region: string; durationDisplay: string; price: number };

export function LpTours({ slugs, tours }: { slugs?: string[]; tours?: TourView[] }) {
  // 優先用真實行程 view-model；無則退回 fixtures（DB 不可用時 fail-open）。
  let items: TourItem[];
  if (tours && tours.length > 0) {
    items = tours.map(({ activity, copy }) => ({
      slug: activity.slug,
      href: buildActivityHref(activity),
      image: copy.imageUrl || '/images/lp/tour-river.jpg',
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
    <section className="lp-section lp-tours" aria-label="更多精選行程">
      <h2 className="lp-eyebrow">更多精選行程</h2>
      <div className="lp-tours-list">
        {items.map((a) => (
          <Link key={a.slug} href={a.href} className="lp-tour-card">
            <div className="lp-tour-photo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.image} alt={a.title} loading="lazy" />
            </div>
            <div className="lp-tour-body">
              <h3 className="lp-tour-title">{a.title}</h3>
              <p className="lp-tour-tagline">{a.tagline}</p>
              <div className="lp-tour-meta">
                <span>{a.region}{a.durationDisplay ? `・${a.durationDisplay}` : ''}</span>
                <span className="lp-tour-price">NT$ {a.price.toLocaleString()}<i>起</i></span>
              </div>
            </div>
          </Link>
        ))}
      </div>
      <Link href="/activities" className="lp-more-link">查看全部行程 →</Link>
    </section>
  );
}

/** 探索目的地（原 DestinationsSection 資料） */
export function LpDestinations() {
  return (
    <section className="lp-section lp-dests" aria-label="探索目的地">
      <h2 className="lp-eyebrow">探索目的地</h2>
      <div className="lp-dests-grid">
        {DESTINATIONS.map((d) => (
          <Link key={d.name} href={`/activities?region=${encodeURIComponent(d.name)}`} className="lp-dest-card">
            <span className="lp-dest-name">{d.name}</span>
            <span className="lp-dest-count">{d.count}</span>
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
  return (
    <section className="lp-section lp-stories" aria-label="旅人故事">
      <h2 className="lp-eyebrow">旅人故事</h2>
      <div className="lp-stories-list">
        {STORY_REVIEWS.map((r) => {
          const activity = getActivityBySlug(r.activitySlug);
          const guide = guides.find((g) => g.slug === r.guideSlug);
          if (!activity) return null;
          return (
            <Link key={r.id} href={buildActivityHref(activity)} className="lp-story-card">
              <p className="lp-story-quote">「{r.text}」</p>
              <div className="lp-story-meta">
                <span className="lp-story-stars" aria-label={`${r.rating} 顆星`}>{'★'.repeat(r.rating)}</span>
                <span>{r.author}・{r.city}</span>
              </div>
              <span className="lp-story-activity">{activity.title}｜{guide?.displayName ?? '在地導遊'}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

/** 常見問題（原 FaqSection，與 page.tsx 的 FAQPage JSON-LD 同步） */
const FAQS = [
  { q: '什麼是私人導遊行程？', a: '私人導遊行程是由平台認證的在地導遊帶領的小團體驗，行程由導遊設計，旅客可以按照自己的節奏探索，不需要配合大團行程表。' },
  { q: '如何確保導遊品質與安全？', a: '所有導遊都經過實名認證（KYC），部分導遊另有急救認證、環境教育講師等專業資歷。平台也提供緊急熱線 30 分鐘回應服務。' },
  { q: '付款安全嗎？', a: '所有付款透過 ECPay 或 LINE Pay 加密處理，你的信用卡資料不會經過本站。' },
  { q: '可以取消預約嗎？', a: '可以。每個行程都有明確的退款政策，大部分行程在出團 168 小時前（含）以上可全額退款，出團前 超過 72 小時且少於 168 小時可退 70%。詳細規則請見各行程頁面。' },
  { q: '適合帶小孩參加嗎？', a: '依行程而定。每個行程頁面都有標註「適合對象」與「不太適合」的說明，選擇前請先確認。部分行程有親子友善標籤。' },
  { q: '如何成為導遊？', a: '點擊「成為導遊」填寫申請表，經過平台審核後即可上架行程。我們歡迎有在地特色、專業背景的導遊加入。' },
];

export function LpFaq() {
  return (
    <section className="lp-section lp-faq" aria-label="常見問題">
      <h2 className="lp-eyebrow">常見問題</h2>
      <div className="lp-faq-list">
        {FAQS.map((f, i) => (
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
  return (
    <section className="lp-closing" aria-label="開始探索">
      <div className="lp-closing-paper">
        {/* 切齊直邊（不再使用波浪撕邊） */}
        <div className="lp-closing-inner">
          <h2 className="lp-closing-title">你的祕島故事，從這裡開始</h2>
          <p className="lp-closing-desc">讓在地人帶你走進台灣的深處，遇見真實的美好。</p>
          <Link href="/activities" className="lp-btn">
            開始探索祕島旅程 <span className="lp-btn-arrow">→</span>
          </Link>
          {/* MIDAO 祕島 印章已內嵌於 closing-bg 背景圖，故不再額外疊一個 lp-stamp */}
        </div>
      </div>
    </section>
  );
}
