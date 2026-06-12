import Link from 'next/link';
import { BoomerangVideoBg } from './BoomerangVideoBg';

export const HERO_VIDEO_SRC =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260511_131941_d136af49-e243-493a-be14-6ff3f24e09e6.mp4';

function SparkleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
      <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function HeroSection() {
  return (
    <section className="tp-hero-motion" data-testid="hero-motion">
      <BoomerangVideoBg src={HERO_VIDEO_SRC} />
      <div className="tp-hero-motion-overlay" aria-hidden="true" />

      <div className="tp-hero-motion-inner">
        {/* 置中主文案 */}
        <div className="tp-hero-motion-copy">
          <p className="tp-hero-motion-kicker">台灣在地導遊平台</p>
          <h1 className="tp-hero-motion-title">
            找到懂路的人，
            <span className="tp-hero-motion-title-accent">
              <br />
              帶你走進台灣最有故事的地方
            </span>
          </h1>
          <p className="tp-hero-motion-sub">不跟團、不趕路。預約在地導遊，用你的節奏認識這座島嶼。</p>
        </div>

        {/* 底部列：左側品牌區塊 + CTA、右側往下探索提示 */}
        <div className="tp-hero-motion-footer">
          <div className="tp-hero-motion-brand">
            <div className="tp-hero-motion-brandline">
              <SparkleIcon />
              <span>
                祕島 MIDAO<sup>™</sup>
              </span>
            </div>
            <p className="tp-hero-motion-brandcopy">島嶼裡，還有一座島。每一條上架的路線，都是在地導遊真的走過的路。</p>
            <div className="tp-hero-motion-cta-row">
              <Link href="/activities" data-testid="home-cta-explore" className="tp-hero-motion-btn-primary">
                先看本週精選路線
              </Link>
              <Link href="/guides" data-testid="home-cta-guides" className="tp-hero-motion-btn-ghost">
                再挑適合你的導遊
              </Link>
            </div>
          </div>

          <div className="tp-hero-motion-scrollhint" aria-hidden="true">
            <span className="tp-hero-motion-scrollicon">
              <ChevronDownIcon />
            </span>
            <span>往下探索本週路線</span>
          </div>
        </div>
      </div>
    </section>
  );
}
