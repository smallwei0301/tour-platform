import { getTranslations } from 'next-intl/server';
import ActivityCard, { type Activity } from './ActivityCard';

/**
 * Issue #1344 — SSR 首屏卡片 grid（Suspense fallback 用）。
 *
 * 背景：`/activities` 與 `/activities/[region]` 是 ISR（revalidate=60），
 * 而 `ActivitiesContent` 用了 `useSearchParams()` → prerender 時整個
 * client component 樹 CSR bailout，SSR HTML 只剩 Suspense fallback。
 * 過去 fallback 是 ActivitiesSkeleton（灰色佔位），LCP 元素（第一張卡
 * 的 cover 圖）要等 JS bundle → hydrate → render 才出現 — Lighthouse
 * slow-4G 實測 render delay 佔 LCP 的 75%（7.9s / 10.5s），圖片本身
 * 1.5s 就抓完（#1358 preload 有效），瓶頸純粹是「畫不出來」。
 *
 * 這個元件把 fallback 換成用 SSR `initialActivities` 直接 render 的
 * 「真卡片」：LCP 圖片變成 HTML 裡的真 <img>，parse 完就渲染，
 * 不必等 hydration。hydration 完成後 React 以 ActivitiesContent 的
 * 相同 markup（共用 ActivityCard）原地替換 — 幾何一致，CLS 不動。
 *
 * 版面結構鏡射 ActivitiesSkeleton（#1345 為 CLS=0 對齊的骨架）：
 * breadcrumb + tp-activities-layout + 空 aside + result head + grid。
 * 收藏愛心在首屏一律未填（wishlist 狀態本來就是 hydration 後補），
 * 與現行行為一致。
 */
export default async function ActivitiesFirstPaint({
  activities,
  locale,
}: {
  activities: Activity[];
  locale: string;
}) {
  const t = await getTranslations({ locale, namespace: 'activities' });
  const resultLabel = t('resultAll', { n: activities.length });
  return (
    <main className="tp-container tp-activities" style={{ paddingBottom: 40 }}>
      <div className="tp-breadcrumb">
        {t('breadcrumbHome')} &gt; {t('breadcrumbActivities')}
      </div>
      <section className="tp-activities-layout">
        {/* 互動篩選側欄由 hydration 後的 ActivitiesContent 提供；首屏保留
            同 class 的空 aside 佔位（與 ActivitiesSkeleton 同幾何）。 */}
        <aside className="tp-filter" aria-hidden="true" style={{ minHeight: 320 }} />
        <section>
          <div className="tp-result-head">
            <h1>{resultLabel}</h1>
          </div>
          <div className="tp-card-grid tp-card-grid-activities">
            {activities.map((a, idx) => (
              <ActivityCard key={a.slug} a={a} idx={idx} />
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
