import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getGuideBySlugDb, getGuideShopDb } from '../../../../src/lib/db.mjs';
import { isGuideShopEnabled } from '../../../../src/config/feature-flags.mjs';
import { ShopMemberButton } from './ShopMemberButton';
import { ShopViewTracker } from './ShopViewTracker';
import { ShopShareBar } from './ShopShareBar';
import {
  MountainCircleLogo, LeafIcon, StepMountain, StepCalendar, StepClipboard,
  CtaMountain, ArrowRight,
} from './sib-icons';

type ShopPlan = {
  id: string; name: string; basePrice: number | null;
  priceType: 'per_person' | 'per_group'; duration: string;
  minParticipants: number; maxParticipants: number | null;
};
type ShopActivity = { id: string; slug: string; title: string; region: string; plans: ShopPlan[] };

function planMeta(plan: ShopPlan): string {
  const cap = plan.maxParticipants ? `${plan.minParticipants}–${plan.maxParticipants} 人` : `${plan.minParticipants} 人起`;
  return [plan.name, plan.duration, cap].filter(Boolean).join('　·　');
}
function planPrice(plan: ShopPlan): string {
  if (!Number.isFinite(Number(plan.basePrice))) return '價格請洽導遊';
  return `NT$${Number(plan.basePrice).toLocaleString()} / ${plan.priceType === 'per_group' ? '組' : '人'}`;
}

// 與導遊公開頁一致的 on-demand ISR；另加 time-based revalidate 兜底（存檔 revalidatePath 打不到本頁）。
export const fetchCache = 'force-cache';
export const revalidate = 60;
export const dynamicParams = true;
export function generateStaticParams() {
  return [] as Array<{ slug: string }>;
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const guide = await getGuideBySlugDb(slug).catch((): null => null);
  const name = guide?.displayName ?? slug;
  return {
    title: `${name} 的祕島預約頁 | Midao 祕島`,
    description: `向 ${name} 線上預約行程。`,
    robots: { index: false },
  };
}

const STEPS = [
  { n: 1, Ico: StepMountain, t: '選擇行程', d: ['瀏覽特色行程', '找到想去的祕境'] },
  { n: 2, Ico: StepCalendar, t: '選擇日期與時間', d: ['挑選出發日期', '與理想出發時段'] },
  { n: 3, Ico: StepClipboard, t: '填寫聯絡資料', d: ['留下聯絡方式', '完成預約申請'] },
];

export default async function GuideShopPage({ params }: { params: Promise<{ slug: string }> }) {
  if (!isGuideShopEnabled()) return notFound();
  const { slug } = await params;
  const shop = await getGuideShopDb(slug).catch((): null => null);
  if (!shop) return notFound();
  const { guide, activitiesByRegion } = shop;
  const groups = activitiesByRegion as Array<{ region: string; activities: ShopActivity[] }>;
  const hasPlans = groups.some((g) => g.activities.length > 0);
  const bio = String(guide.bio || '土生土長的在地人，用在地的眼睛，帶你看見祕境也看見生活。').trim();
  // 商店卡標題用精簡名（去括號別名），與 mockup 一致並避免換行撐高卡片
  const shortName = String(guide.displayName || '').replace(/[（(].*?[）)]/g, '').trim();

  return (
    <main className="sib">
      <ShopViewTracker slug={slug} />

      {/* 標題列 */}
      <div className="sib-toprow">
        <h1 className="sib-h1" style={{ fontSize: 34 }}>線上預約</h1>
        <ShopMemberButton slug={slug} />
      </div>

      {/* Hero：大圖＋詩句 */}
      <section className="sib-hero" data-testid="shop-hero">
        {guide.heroImageUrl && (
          <Image src={guide.heroImageUrl} alt={`${guide.displayName} 封面照`} fill priority
            sizes="(max-width: 480px) 100vw, 480px" className="sib-hero-img" />
        )}
        <MountainCircleLogo className="sib-hero-logo" />
        <p className="sib-hero-poem">走進祕境，<br />讓島嶼的故事，<br />在腳下展開。</p>
      </section>

      {/* 引路人卡 */}
      <section className="sib-guide-card">
        <div className="sib-guide-avatar">
          {guide.profilePhotoUrl && (
            <Image src={guide.profilePhotoUrl} alt={guide.displayName} width={76} height={76}
              style={{ objectFit: 'cover', width: '100%', height: '100%' }} />
          )}
        </div>
        <div style={{ flex: 1 }}>
          <div className="sib-guide-name">
            <strong>{guide.region ? `${guide.region} · ` : ''}{shortName}</strong>
            <span className="sib-guide-badge"><LeafIcon />祕島引路人</span>
          </div>
          <p className="sib-guide-bio" style={{
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>{bio}</p>
        </div>
      </section>

      {/* 可預約行程（保留方案卡；點卡片帶預選進預約流程） */}
      {hasPlans && (
        <>
          <div className="sib-section-title">
            <span className="sib-orn sib-orn--l" />
            <span>可預約行程</span>
            <span className="sib-orn sib-orn--r" />
          </div>
          <div className="sib-plan-list">
            {groups.map((group) => (
              <div key={group.region}>
                {groups.length > 1 && <p className="sib-plan-region">📍 {group.region}</p>}
                {group.activities.flatMap((activity) =>
                  activity.plans.map((plan) => (
                    <Link
                      key={`${activity.id}-${plan.id}`}
                      data-testid="shop-landing-plan-card"
                      href={`/guides/${slug}/shop/book?activityId=${encodeURIComponent(activity.id)}&planId=${encodeURIComponent(plan.id)}`}
                      className="sib-plan-card"
                    >
                      <p className="sib-plan-t">{activity.title}</p>
                      <p className="sib-plan-meta">{planMeta(plan)}</p>
                      <p className="sib-plan-price">{planPrice(plan)}</p>
                    </Link>
                  ))
                )}
              </div>
            ))}
          </div>

          {/* 分享列：複製連結／LINE／QR */}
          <ShopShareBar slug={slug} displayName={guide.displayName} />
        </>
      )}

      {/* 預約三步驟 */}
      <div className="sib-section-title">
        <span className="sib-orn sib-orn--l" />
        <span>預約三步驟</span>
        <span className="sib-orn sib-orn--r" />
      </div>
      <div className="sib-steps">
        {STEPS.map(({ n, Ico, t, d }) => (
          <div key={n} className="sib-step">
            <span className="sib-step-num">{n}</span>
            <span className="sib-step-ico"><Ico /></span>
            <p className="sib-step-t">{t}</p>
            <hr className="sib-step-divider" />
            <p className="sib-step-d">{d[0]}<br />{d[1]}</p>
          </div>
        ))}
        <span className="sib-step-arrow sib-step-arrow--1"><ArrowRight style={{ width: 12, height: 12, color: '#fff' }} /></span>
        <span className="sib-step-arrow sib-step-arrow--2"><ArrowRight style={{ width: 12, height: 12, color: '#fff' }} /></span>
      </div>

      {/* 底部 CTA（in-flow，與 mockup 一致：步驟 → CTA → 保護提示） */}
      <Link href={`/guides/${slug}/shop/book`} className="sib-cta" style={{ marginTop: 20 }}>
        <CtaMountain className="sib-cta-ico" />
        替我留一個位置
        <span className="sib-cta-arrow"><ArrowRight style={{ color: '#f6ecd9' }} /></span>
      </Link>

      {/* 付款與取消政策 */}
      <section data-testid="shop-policy" style={{ marginTop: 20, fontSize: 13, color: 'var(--sib-muted)', lineHeight: 1.9 }}>
        <p style={{ margin: 0 }}>線上付款經 ECPay 加密交易，付款方式以結帳頁顯示為準。</p>
        <p style={{ margin: '2px 0 0' }}>
          行程異動與退款依平台退款規範辦理，詳見
          <Link href="/legal/refund" style={{ marginLeft: 4, color: 'var(--sib-gold)' }}>退款政策</Link>。
        </p>
      </section>

      {/* 保護提示 */}
      <p className="sib-guard">🔒 您的資料將受到妥善保護，僅用於預約聯繫</p>
    </main>
  );
}
