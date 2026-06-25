import ActivitiesSkeleton from '../ActivitiesSkeleton';

/**
 * Issue #1345 part 5 — region listing 的 page-level streaming fallback。
 *
 * `/activities/[region]/page.tsx` 是 async page：`await
 * listPublishedActivitiesDb(...)` 在 JSX return 之前執行。當 Next.js
 * 以 dynamic rendering 串流這頁時，外層 boundary 在 page 函式還沒
 * resolve 前就先送出 shell——此時 page JSX 裡的 `<Suspense
 * fallback={<ActivitiesSkeleton />}>` 根本還沒執行到，外層 fallback
 * 是 `loading.tsx`，而這個檔案先前不存在 → fallback 空白 → footer
 * 先渲染在視窗頂端，真卡 streamed 進來再把 footer 推下 ~1300px，
 * 單一 shift 0.52（kaohsiung-desktop 實測）。
 *
 * 這個檔案就是那個缺掉的外層 fallback。
 */
export default function RegionActivitiesLoading() {
  return <ActivitiesSkeleton />;
}
