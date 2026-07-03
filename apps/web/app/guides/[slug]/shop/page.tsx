import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getGuideBySlugDb } from '../../../../src/lib/db.mjs';
import { isGuideShopEnabled } from '../../../../src/config/feature-flags.mjs';
import { GuideAvatar } from '../../../../src/components/shared/GuideAvatar';
import { ShopMemberButton } from './ShopMemberButton';
import styles from './shop-booking.module.css';

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
    <main className={`tp-light-page tp-container ${styles.shell}`}>
      <section className={styles.fieldHeader}>
        <div className={styles.headerRow}>
          <div>
            <p className={styles.eyebrow}>MIDAO FIELD BOOKING</p>
            <h1 className={styles.pageTitle}>線上預約</h1>
          </div>
          <div className={styles.memberSlot}>
            <ShopMemberButton slug={slug} />
          </div>
        </div>
        <p className={styles.pageIntro}>
          選一位熟悉路的人，替這趟行程留一個位置。出發前，把路線、人數與付款一次確認清楚。
        </p>
      </section>

      {guide.heroImageUrl && (
        <div
          data-testid="shop-hero"
          className={styles.cover}
        >
          <Image
            src={guide.heroImageUrl}
            alt={`${guide.displayName} 封面照`}
            fill
            priority
            sizes="(max-width: 560px) 100vw, 560px"
            className={styles.coverImg}
          />
          <div className={styles.coverCaption}>每一條路，都有人真正走過。</div>
        </div>
      )}

      <section className={styles.guideCard}>
        <GuideAvatar photoUrl={guide.profilePhotoUrl} name={guide.displayName} size={78} showBorder />
        <div className={styles.guideBody}>
          <p className={styles.guideLabel}>祕島引路人</p>
          <p className={styles.guideName}>
            {guide.region ? `${guide.region} · ` : ''}{guide.displayName}
          </p>
          <p className={styles.guideSub}>確認日期後，系統會為你保留一筆預約紀錄。</p>
        </div>
      </section>

      <section className={styles.noteGrid} aria-label="預約流程">
        <div className={styles.noteCard}>
          <span className={styles.noteNumber}>01</span>
          <strong>選路線</strong>
          <p>先挑想走的行程與同行人數。</p>
        </div>
        <div className={styles.noteCard}>
          <span className={styles.noteNumber}>02</span>
          <strong>留時段</strong>
          <p>只顯示導遊真正開放的日期。</p>
        </div>
        <div className={styles.noteCard}>
          <span className={styles.noteNumber}>03</span>
          <strong>確認付款</strong>
          <p>付款完成後，到會員專區追蹤訂單。</p>
        </div>
      </section>

      {guide.bio && (
        <section className={styles.bioSection}>
          <h2 className={styles.sectionLabel}>引路人筆記</h2>
          <p className={styles.bioText}>{guide.bio}</p>
        </section>
      )}

      <div className={styles.stickyCta}>
        <div className={styles.stickyInner}>
          <p className={styles.stickySummary}>登入後可查看訂單與付款狀態。</p>
          <Link
            href={`/guides/${slug}/shop/book`}
            className={`tp-btn tp-btn-primary ${styles.primaryCta}`}
          >
            替我留一個位置
          </Link>
        </div>
      </div>
    </main>
  );
}
