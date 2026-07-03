import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getGuideBySlugDb, getGuideShopDb } from '../../../../src/lib/db.mjs';
import { isGuideShopEnabled } from '../../../../src/config/feature-flags.mjs';
import { GuideAvatar } from '../../../../src/components/shared/GuideAvatar';
import { ShopMemberButton } from './ShopMemberButton';
import { ShopShareBar } from './ShopShareBar';
import { ShopViewTracker } from './ShopViewTracker';

// 與導遊公開頁一致的 on-demand ISR（導遊存檔後 revalidatePath 失效）。
// 另加 time-based revalidate 兜底：導遊存檔的 revalidatePath 只打 /guides 與
// /guides/<slug>，打不到本頁；行程／方案編輯更不會失效此頁 —— 60 秒與
// /api/guides/[slug]/shop 的 s-maxage=60 對齊，方案卡最多 stale 一分鐘。
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
    robots: { index: false }, // 商店頁為導購入口，不另建索引（公開導遊頁負責 SEO）
  };
}

type ShopPlan = {
  id: string;
  name: string;
  basePrice: number | null;
  priceType: 'per_person' | 'per_group';
  duration: string;
  minParticipants: number;
  maxParticipants: number | null;
};

type ShopActivity = {
  id: string;
  slug: string;
  title: string;
  region: string;
  plans: ShopPlan[];
};

function formatPlanPrice(plan: ShopPlan): string {
  if (!Number.isFinite(Number(plan.basePrice))) return '價格請洽導遊';
  const unit = plan.priceType === 'per_group' ? '組' : '人';
  return `NT$${Number(plan.basePrice).toLocaleString()} / ${unit}`;
}

function formatCapacity(plan: ShopPlan): string {
  if (plan.maxParticipants) return `${plan.minParticipants}–${plan.maxParticipants} 人`;
  return `${plan.minParticipants} 人起`;
}

export default async function GuideShopPage({ params }: { params: Promise<{ slug: string }> }) {
  if (!isGuideShopEnabled()) return notFound();
  const { slug } = await params;
  const shop = await getGuideShopDb(slug).catch((): null => null);
  if (!shop) return notFound();
  const { guide, activitiesByRegion } = shop;
  const hasPlans = activitiesByRegion.some((r: { activities: ShopActivity[] }) => r.activities.length > 0);

  return (
    <main className="tp-light-page tp-container" style={{ paddingBottom: 96, maxWidth: 560 }}>
      <ShopViewTracker slug={slug} />

      {/* 標題列 + 會員入口（登入／會員專區） */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 18 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>{guide.displayName} 的祕島預約頁</h1>
        <ShopMemberButton slug={slug} />
      </div>

      {/* 導遊封面照（個人資料封面） */}
      {guide.heroImageUrl && (
        <div
          data-testid="shop-hero"
          style={{
            position: 'relative', width: '100%', aspectRatio: '16 / 9',
            marginTop: 16, borderRadius: 16, overflow: 'hidden',
            border: '1px solid var(--tp-border)',
          }}
        >
          <Image
            src={guide.heroImageUrl}
            alt={`${guide.displayName} 封面照`}
            fill
            priority
            sizes="(max-width: 560px) 100vw, 560px"
            style={{ objectFit: 'cover' }}
          />
        </div>
      )}

      {/* 店家卡片 */}
      <section
        className="tp-card"
        style={{ marginTop: 16, padding: 20 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <GuideAvatar photoUrl={guide.profilePhotoUrl} name={guide.displayName} size={72} showBorder />
          <div>
            <p style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>
              {guide.region ? `${guide.region} · ` : ''}{guide.displayName}
            </p>
            <p style={{ margin: '4px 0 0', color: 'var(--tp-muted)', fontSize: 14 }}>祕島</p>
          </div>
        </div>

        {/* 信任列：審核徽章＋評分＋服務次數（商店頁只列 getGuideBySlugDb 已過濾 approved 的導遊，徽章恆顯） */}
        <div
          data-testid="shop-trust-row"
          style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 14, fontSize: 13 }}
        >
          <span
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px',
              borderRadius: 999, border: '1px solid #B08D3E', color: '#B08D3E', fontWeight: 700,
            }}
          >
            ✓ 祕島審核導遊
          </span>
          {Number(guide.reviewCount) > 0 && (
            <span style={{ color: 'var(--tp-muted)' }}>
              ★ {Number(guide.ratingAvg).toFixed(1)}（{guide.reviewCount} 則評論）
            </span>
          )}
          {Number(guide.serviceCount) > 0 && (
            <span style={{ color: 'var(--tp-muted)' }}>已服務 {guide.serviceCount} 次</span>
          )}
        </div>
        {(guide.languages.length > 0 || guide.specialties.length > 0) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            {[...guide.languages, ...guide.specialties].map((chip: string) => (
              <span
                key={chip}
                style={{
                  padding: '3px 10px', borderRadius: 999, fontSize: 12,
                  background: 'var(--tp-bg, #f5f5f0)', border: '1px solid var(--tp-border)',
                  color: 'var(--tp-muted)',
                }}
              >
                {chip}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* 分享列：複製連結／LINE／QR */}
      <ShopShareBar slug={slug} displayName={guide.displayName} />

      {/* 可預約行程與方案（免登入即可瀏覽；點卡片帶入預選進預約流程） */}
      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>可預約行程</h2>
        {!hasPlans && (
          <p style={{ color: 'var(--tp-muted)', lineHeight: 1.8 }}>
            這裡還沒有開放預約的行程。你可以先按「開始預約」查看，或稍後再回來。
          </p>
        )}
        {activitiesByRegion.map((group: { region: string; activities: ShopActivity[] }) => (
          <div key={group.region} style={{ marginBottom: 12 }}>
            {activitiesByRegion.length > 1 && (
              <p style={{ margin: '8px 0', fontSize: 13, fontWeight: 700, color: 'var(--tp-muted)' }}>
                {group.region}
              </p>
            )}
            {group.activities.map((activity) => (
              activity.plans.map((plan) => (
                <Link
                  key={`${activity.id}-${plan.id}`}
                  data-testid="shop-landing-plan-card"
                  href={`/guides/${slug}/shop/book?activityId=${encodeURIComponent(activity.id)}&planId=${encodeURIComponent(plan.id)}`}
                  className="tp-card"
                  style={{
                    display: 'block', padding: 16, marginBottom: 10,
                    textDecoration: 'none', color: 'inherit',
                  }}
                >
                  <p style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{activity.title}</p>
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--tp-muted)' }}>
                    {plan.name}
                    {plan.duration ? ` · ${plan.duration}` : ''}
                    {` · ${formatCapacity(plan)}`}
                  </p>
                  <p style={{ margin: '8px 0 0', fontSize: 15, fontWeight: 700 }}>
                    {formatPlanPrice(plan)}
                  </p>
                </Link>
              ))
            ))}
          </div>
        ))}
      </section>

      {/* 店家資訊 */}
      {guide.bio && (
        <section style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 16, marginBottom: 8 }}>店家資訊</h2>
          <p style={{ color: 'var(--tp-muted)', lineHeight: 1.8, whiteSpace: 'pre-line' }}>{guide.bio}</p>
        </section>
      )}

      {/* 付款與取消（靜態說明；實際可用付款方式以結帳頁為準） */}
      <section data-testid="shop-policy" style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>付款與取消</h2>
        <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--tp-muted)', lineHeight: 1.9, fontSize: 14 }}>
          <li>線上付款經 ECPay 加密交易，付款方式以結帳頁顯示為準。</li>
          <li>
            行程異動與退款依平台退款規範辦理，詳見
            <Link href="/legal/refund" style={{ marginLeft: 4 }}>退款政策</Link>。
          </li>
        </ul>
      </section>

      {/* 固定底部 CTA */}
      <div
        style={{
          position: 'fixed', left: 0, right: 0, bottom: 0,
          padding: '12px 16px', background: 'var(--tp-card-bg, #fff)',
          borderTop: '1px solid var(--tp-border)', zIndex: 20,
        }}
      >
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <Link
            href={`/guides/${slug}/shop/book`}
            className="tp-btn tp-btn-primary"
            style={{ width: '100%', display: 'block', textAlign: 'center', padding: '14px 0', fontSize: 16 }}
          >
            開始預約
          </Link>
        </div>
      </div>
    </main>
  );
}
