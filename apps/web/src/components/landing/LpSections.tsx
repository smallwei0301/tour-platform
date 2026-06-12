import Link from 'next/link';
import {
  MountainIcon, WaveIcon, TribalIcon, TeaLeafIcon,
  HikeIcon, NightsIcon,
  ShieldCheckIcon, CompassIcon, BadgeShieldIcon, StarIcon,
} from './LpIcons';
import { activities, reviews, getActivityBySlug, guides } from '../../fixtures/data';
import { buildActivityHref } from '../../lib/activity-url';

export function LpHero() {
  return (
    <section className="lp-hero" aria-label="祕島主視覺">
      <div
        className="lp-hero-photo"
        role="img"
        aria-label="自洞穴內仰望峽谷，曙光灑落山谷與溪流"
      />
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

export function LpFeatured() {
  return (
    <section className="lp-section lp-featured" aria-label="編輯精選行程">
      <Link href="/activities/kaohsiung-chaishan-cave-experience" className="lp-feat-card">
        {/* 參考圖：照片佔整張卡片全高（穿過 footer 列），footer 僅在右欄下方 */}
        {/* 照片使用柴山行程的真實內容照（fixtures imageUrl 本地快取，避免外連破圖） */}
        <div className="lp-feat-photo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/lp/feat-chaishan.jpg" alt="柴山探洞體驗山徑與洞穴地景（編輯精選）" />
          {/* 編輯精選書籤標籤（去背後懸掛於照片左上） */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="lp-feat-badge" src="/images/lp/badge-editors-pick.png" alt="編輯精選" />
        </div>
        <div className="lp-feat-right">
          <div className="lp-feat-body">
            <h3 className="lp-feat-title">柴山探洞・城市祕境</h3>
            <span className="lp-feat-subtitle">走進城市邊緣的地形祕境</span>
            <p className="lp-feat-desc">
              跟著懂路的人鑽進珊瑚礁岩的洞穴地景，<br />在城市邊緣，遇見另一個世界的高雄。
            </p>
            <div className="lp-feat-tags">
              <span className="lp-tag"><HikeIcon /> 探洞</span>
              <span className="lp-tag"><NightsIcon /> 3-4小時</span>
              <span className="lp-tag">
                難度
                <span className="lp-dots" aria-label="難度 5 分之 2">
                  <i /><i /><i className="lp-dot-off" /><i className="lp-dot-off" /><i className="lp-dot-off" />
                </span>
              </span>
            </div>
          </div>
          <div className="lp-feat-footer">
            <div className="lp-feat-rating">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/lp/avatars.png" alt="" aria-hidden="true" />
              <strong>4.9</strong>
              <span className="lp-rating-count">(128則評價)</span>
            </div>
            <div className="lp-feat-price">
              NT$ 2,000<span className="lp-price-unit">起</span>
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
        <Link href="/guides" className="lp-guide-story">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/lp/guide-portrait.jpg" alt="泰雅族在地嚮導巴勇的肖像" />
          <div className="lp-guide-text">
            <p className="lp-guide-label">在地嚮導・真實陪伴</p>
            <p className="lp-guide-name">南橫泰雅・巴勇</p>
            <p className="lp-guide-quote">「我帶路的地方，<br />是我世代生活的家。」</p>
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

/** 更多精選行程（原 FeaturedTours 資料，柴山已於上方精選卡呈現）。
 *  圖片使用本地資產（fixtures 的 unsplash 外連在離線/慢網環境會破圖）。 */
const TOUR_IMAGES: Record<string, string> = {
  'dadadaocheng-walk': '/images/lp/tour-dadaocheng.jpg',
  'taipei-night-market-food-tour': '/images/lp/tour-nightmarket.jpg',
};

export function LpTours() {
  const tours = activities.filter((a) => a.slug !== 'kaohsiung-chaishan-cave-experience').slice(0, 2);
  return (
    <section className="lp-section lp-tours" aria-label="更多精選行程">
      <h2 className="lp-eyebrow">更多精選行程</h2>
      <div className="lp-tours-list">
        {tours.map((a) => (
          <Link key={a.slug} href={buildActivityHref(a)} className="lp-tour-card">
            <div className="lp-tour-photo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={TOUR_IMAGES[a.slug] ?? a.imageUrl} alt={a.title} loading="lazy" />
            </div>
            <div className="lp-tour-body">
              <h3 className="lp-tour-title">{a.title}</h3>
              <p className="lp-tour-tagline">{a.tagline}</p>
              <div className="lp-tour-meta">
                <span>{a.region}・{a.durationDisplay}</span>
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
        {/* 古紙撕邊 */}
        <svg className="lp-closing-edge" viewBox="0 0 1200 26" preserveAspectRatio="none" aria-hidden="true" style={{ position: 'absolute', top: -1, left: 0, transform: 'translateY(-100%)' }}>
          <path d="M0 26 L0 18 Q60 10 130 16 T290 12 T430 17 T580 10 T730 16 T880 11 T1030 16 T1200 12 L1200 26 Z" fill="#e6d5bd" />
        </svg>
        <div className="lp-closing-inner">
          <h2 className="lp-closing-title">你的祕島故事，從這裡開始</h2>
          <p className="lp-closing-desc">讓在地人帶你走進台灣的深處，遇見真實的美好。</p>
          <Link href="/activities" className="lp-btn">
            開始探索祕島旅程 <span className="lp-btn-arrow">→</span>
          </Link>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="lp-stamp" src="/images/lp/stamp.png" alt="" aria-hidden="true" />
        </div>
      </div>
    </section>
  );
}
