import { loadActivityRevalidateTarget } from './activity-revalidate-target.mjs';

/**
 * 依 activityId 失效該行程的公開 ISR 快取（詳情頁 + 列表頁）。
 *
 * 背景：方案（activity_plans）與開放季節（activity_plan_seasons）的後台異動原本
 * 不會呼叫 revalidatePath，導致詳情頁 ISR（revalidate=60）最多要等 60 秒、商店／
 * 預約頁的邊緣快取（stale-while-revalidate）最久要等數分鐘才反映 —— 後台「方案管理」
 * 改完後，前台在一段時間內仍顯示舊內容，操作者會誤以為「修改被還原」。
 *
 * 與 admin 行程編輯路由（app/api/admin/activities/[id]/route.ts）相同：改完即時失效
 * 該行程詳情頁與列表頁，讓變更立即可見。查詢與 region slug 對應邏輯在
 * activity-revalidate-target.mjs（純函式、可單測，不依賴 next/cache）。
 *
 * next/cache 採「延遲且容錯」載入：revalidate-activity.mjs 會 import 'next/cache'，
 * 在純 node 測試環境無法解析；改在實際需要失效時才動態 import 並 try/catch 包住，
 * 讓「直接 import 本路由做契約測試」不會在載入期就壞掉（#1067 路由測試會 import 路由）。
 *
 * best-effort：查不到行程、next/cache 不可用或 revalidate 失敗都不擋下主要寫入結果。
 *
 * @param {{ from: Function }} supabase 已建立的 service-role client
 * @param {string} activityId
 */
export async function revalidateActivityById(supabase, activityId) {
  const target = await loadActivityRevalidateTarget(supabase, activityId);
  if (!target) return;

  try {
    const { revalidateActivityPaths } = await import('./revalidate-activity.mjs');
    revalidateActivityPaths(target);
  } catch {
    // next/cache 不可用（純 node 測試環境）或失效失敗：best-effort，不影響已寫入結果
  }
}
