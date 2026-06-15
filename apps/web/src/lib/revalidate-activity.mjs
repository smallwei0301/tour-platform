import { revalidatePath } from 'next/cache';
import { activityRevalidationPaths } from './region-slug.mjs';

// 純路徑計算邏輯在 `region-slug.mjs`（不依賴 next/cache，方便測）；這裡只負責呼叫
// revalidatePath。re-export 方便既有呼叫端 import。
export { activityRevalidationPaths };

/**
 * 行程相關頁面的 on-demand ISR 失效（#502 後續：詳情頁改 ISR 後的即時刷新；
 * #1440 後續：修正 region slug 對不上導致照片不更新）。
 *
 * 詳情頁 `app/activities/[region]/[slug]/page.tsx` 以 `revalidate = 60` 走 ISR，
 * 平時最多 60s 才更新。admin 編輯/刪除/上下架行程後呼叫本函式，立即失效該行程
 * 詳情頁與列表頁的 CDN 快取，讓變更即時可見、不必等 revalidate window。
 *
 * 關鍵：`[region]` segment 必須是正規化後的英文 slug（例如「高雄市」→ kaohsiung），
 * 與 `buildActivityHref()` 建出的連結一致，否則 revalidatePath 打不到實際被快取的
 * 詳情頁，前台會看不到輪播照片／暖場評論照片的變更（#1440）。
 *
 * 失敗不應擋下 admin 操作（revalidatePath 在非請求情境會 throw），故 try/catch 吞掉。
 *
 * @param {{ region?: string|null, regionSlug?: string|null, slug?: string|null }} activity
 */
export function revalidateActivityPaths(activity = {}) {
  try {
    for (const path of activityRevalidationPaths(activity)) {
      revalidatePath(path);
    }
  } catch {
    // best-effort：快取刷新失敗不影響資料已寫入的結果
  }
}
