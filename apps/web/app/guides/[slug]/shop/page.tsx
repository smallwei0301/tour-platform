import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getGuideBySlugDb } from '../../../../src/lib/db.mjs';
import { isGuideShopEnabled } from '../../../../src/config/feature-flags.mjs';
import { GuideAvatar } from '../../../../src/components/shared/GuideAvatar';

// 與導遊公開頁一致的 on-demand ISR（導遊存檔後 revalidatePath 失效）。
export const fetchCache = 'force-cache';
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
    title: `${name} 線上預約 | Midao 祕島`,
    description: `向 ${name} 線上預約行程。`,
    robots: { index: false }, // 商店頁為導購入口，不另建索引（公開導遊頁負責 SEO）
  };
}

export default async function GuideShopPage({ params }: { params: Promise<{ slug: string }> }) {
  if (!isGuideShopEnabled()) return notFound();
  const { slug } = await params;
  const guide = await getGuideBySlugDb(slug).catch((): null => null);
  if (!guide) return notFound();

  return (
    <main className="tp-light-page tp-container" style={{ paddingBottom: 96, maxWidth: 560 }}>
      {/* 標題列 + 會員專區 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 18 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>線上預約</h1>
        <Link
          href={`/guides/${slug}/shop/orders`}
          className="tp-btn tp-btn-ghost"
          style={{ fontSize: 14, padding: '6px 14px' }}
        >
          會員專區
        </Link>
      </div>

      {/* 店家卡片 */}
      <section
        className="tp-card"
        style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 16, padding: 20 }}
      >
        <GuideAvatar photoUrl={guide.profilePhotoUrl} name={guide.displayName} size={72} showBorder />
        <div>
          <p style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>
            {guide.region ? `${guide.region} · ` : ''}{guide.displayName}
          </p>
          <p style={{ margin: '4px 0 0', color: 'var(--tp-muted)', fontSize: 14 }}>祕島</p>
        </div>
      </section>

      {/* 店家資訊 */}
      {guide.bio && (
        <section style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 16, marginBottom: 8 }}>店家資訊</h2>
          <p style={{ color: 'var(--tp-muted)', lineHeight: 1.8, whiteSpace: 'pre-line' }}>{guide.bio}</p>
        </section>
      )}

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
