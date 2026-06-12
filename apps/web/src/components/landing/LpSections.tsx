import Link from 'next/link';
import {
  MountainIcon, WaveIcon, TribalIcon, TeaLeafIcon,
  HikeIcon, NightsIcon,
  ShieldCheckIcon, CompassIcon, BadgeShieldIcon, StarIcon,
} from './LpIcons';

export function LpHero() {
  return (
    <section className="lp-hero" aria-label="祕島主視覺">
      <div
        className="lp-hero-photo"
        role="img"
        aria-label="太魯閣峽谷洞穴中透出的曙光，旁有直書「祕島之境 由在地人 帶你看見」"
      />
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
            <Icon size={34} />
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
      <Link href="/activities" className="lp-feat-card">
        <div className="lp-feat-main">
          <div className="lp-feat-photo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/lp/feat-mountain.jpg" alt="能高越嶺道雲海與山徑（編輯精選）" />
          </div>
          <div className="lp-feat-body">
            <h3 className="lp-feat-title">能高越嶺・雲之道</h3>
            <span className="lp-feat-subtitle">走進雲與林的交界</span>
            <p className="lp-feat-desc">
              從南投入山，穿越原始林徑與古老鐵杉，<br />在雲海翻湧之處，遇見布農的山與故事。
            </p>
            <div className="lp-feat-tags">
              <span className="lp-tag"><HikeIcon /> 健行</span>
              <span className="lp-tag"><NightsIcon /> 3天2夜</span>
              <span className="lp-tag">
                難度
                <span className="lp-dots" aria-label="難度 4 分之 3">
                  <i /><i /><i /><i className="lp-dot-off" />
                </span>
              </span>
            </div>
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
            NT$ 12,800<span className="lp-price-unit">起</span>
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
