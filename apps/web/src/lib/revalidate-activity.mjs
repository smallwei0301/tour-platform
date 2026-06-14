import { revalidatePath } from 'next/cache';

/**
 * 行程相關頁面的 on-demand ISR 失效（#502 後續：詳情頁改 ISR 後的即時刷新）。
 *
 * 詳情頁 `app/activities/[region]/[slug]/page.tsx` 以 `revalidate = 60` 走 ISR，
 * 平時最多 60s 才更新。admin 編輯/刪除/上下架行程後呼叫本函式，立即失效該行程
 * 詳情頁與列表頁的 CDN 快取，讓變更即時可見、不必等 revalidate window。
 *
 * 失敗不應擋下 admin 操作（revalidatePath 在非請求情境會 throw），故 try/catch 吞掉。
 *
 * @param {{ region?: string|null, slug?: string|null }} activity
 */
export function revalidateActivityPaths(activity = {}) {
  const region = activity?.region ? String(activity.region) : '';
  const slug = activity?.slug ? String(activity.slug) : '';
  try {
    revalidatePath('/activities');
    if (region) revalidatePath(`/activities/${region}`);
    if (region && slug) revalidatePath(`/activities/${region}/${slug}`);
  } catch {
    // best-effort：快取刷新失敗不影響資料已寫入的結果
  }
}
