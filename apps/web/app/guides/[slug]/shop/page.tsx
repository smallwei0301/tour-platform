import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getGuideBySlugDb, getGuideShopDb } from '../../../../src/lib/db.mjs';
import { isGuideShopEnabled } from '../../../../src/config/feature-flags.mjs';
import { SHOP_MOCK_SLUG, SHOP_LANDING_MOCK } from '../../../../src/fixtures/shop-landing-mock.mjs';
import { ShopMemberButton } from './ShopMemberButton';
import { ShopViewTracker } from './ShopViewTracker';
import {
  LeafIcon, StepMountain, StepCalendar, StepClipboard,
  CtaMountain, ArrowRight, LockIcon,
} from './sib-icons';

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
  // 像素級比對用的固定 mock 頁（保留字 slug，脫離 DB／fixtures，內容與版面永不隨真實資料變動）。
  const shop = slug === SHOP_MOCK_SLUG ? SHOP_LANDING_MOCK : await getGuideShopDb(slug).catch((): null => null);
  if (!shop) return notFound();
  const { guide } = shop;
  const bio = String(guide.bio || '土生土長的在地人，用在地的眼睛，帶你看見祕境也看見生活。').trim();
  const shortName = String(guide.displayName || '').replace(/[（(].*?[）)]/g, '').trim();

  return (
    <main className="sib">
      <ShopViewTracker slug={slug} />

      {/* 標題列 */}
      <div className="sib-toprow">
        <h1 className="sib-h1">線上預約</h1>
        <ShopMemberButton slug={slug} />
      </div>

      {/* Hero：純大圖，不疊字樣/圖樣 */}
      <section className="sib-hero" data-testid="shop-hero">
        {guide.heroImageUrl && (
          <Image src={guide.heroImageUrl} alt={`${guide.displayName} 封面照`} fill priority
            sizes="(max-width: 480px) 100vw, 480px" className="sib-hero-img" />
        )}
      </section>

      {/* 引路人卡 */}
      <section className="sib-guide-card">
        <div className="sib-guide-avatar">
          {guide.profilePhotoUrl && (
            <Image src={guide.profilePhotoUrl} alt={guide.displayName} width={76} height={76}
              style={{ objectFit: 'cover', width: '100%', height: '100%' }} />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="sib-guide-name">
            <strong>{guide.region ? `${guide.region} · ` : ''}{shortName}</strong>
            <span className="sib-guide-badge"><LeafIcon />祕島引路人</span>
          </div>
          <p className="sib-guide-bio" style={{
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>{bio}</p>
        </div>
      </section>

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
      <Link href={`/guides/${slug}/shop/book`} className="sib-cta" style={{ marginTop: 30 }}>
        <CtaMountain className="sib-cta-ico" />
        替我留一個位置
        <span className="sib-cta-arrow"><ArrowRight style={{ color: '#f6ecd9' }} /></span>
      </Link>

      {/* 保護提示 */}
      <p className="sib-guard"><LockIcon size={10} /> 您的資料將受到妥善保護，僅用於預約聯繫</p>
    </main>
  );
}
