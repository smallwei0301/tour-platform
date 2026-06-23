import ActivitiesSkeleton from './ActivitiesSkeleton';

/**
 * Issue #1345 part 5 — `/activities` 的 page-level streaming fallback。
 *
 * 主頁目前走 ISR（revalidate=60），fallback 由 page JSX 內的
 * `<Suspense>` 渲染，CLS 已是 0.001。但若未來這頁因任何原因轉成
 * dynamic rendering（cookie/header 依賴、revalidate 移除等），
 * page-level await 的外層 fallback 就會變成這個檔案——沒有它就是
 * 空白 shell，[region] 頁已經實際踩過這個洞（見同 part 5 的
 * [region]/loading.tsx）。防禦性補上。
 */
export default function ActivitiesLoading() {
  return <ActivitiesSkeleton />;
}
