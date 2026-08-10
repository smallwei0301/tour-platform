// @ts-check
/**
 * Issue #1811 — draft 建單協調器。
 *
 * 順序是 atomic commit → 基本資料 read-back／對帳 → 現行 extras seam → 最終
 * read-back → 通知。#1812/#1813 會把 extras/points 收進同一 RPC；在此之前仍保留
 * 現有行為，但任何 read-back 失敗一律 fail closed，不發布 order ID 或成功通知。
 */
import { getSupabase } from '../supabase-env.mjs';
import { applyOrderExtras } from './order-extras.mjs';
import {
  createBookingDraftAtomicDb,
  readBackBookingOrderMaterializationDb,
} from './db-booking-order-materialization.mjs';

/** @param {any} input */
async function defaultNotify(input) {
  // 保持既有 TS fan-out 檔與其 architecture contract；動態載入也讓純 Node 單元測試
  // 可以只注入邊界，不必教 Node 直接解析 Next.js 的 `.ts` 模組。
  const { fireDraftPostCreateNotifications } = await import('./booking-draft-post-create-notify');
  return fireDraftPostCreateNotifications(input);
}

/**
 * @param {any} input
 * @param {{
 *   createAtomic?: (input: any) => Promise<any>,
 *   readBack?: (input: any) => Promise<any>,
 *   applyExtras?: (input: any) => Promise<any>,
 *   notify?: (input: any) => any,
 * }} [deps]
 */
export async function materializeDraftBookingOrder(input, deps = {}) {
  const createAtomic = deps.createAtomic ?? ((payload) => createBookingDraftAtomicDb(payload));
  const readBack = deps.readBack ?? ((payload) => readBackBookingOrderMaterializationDb(payload));
  const applyExtras = deps.applyExtras ?? (async (payload) => {
    const supabase = await getSupabase();
    return applyOrderExtras({ ...payload, supabase });
  });
  const notify = deps.notify ?? defaultNotify;

  const created = await createAtomic(input);
  const persistedBase = await readBack({
    bookingId: created.bookingId,
    orderId: created.orderId,
    expectedActivityId: input.activityId,
    expectedPlanId: input.planId,
    requireTotalMatch: true,
  });

  const extrasResult = await applyExtras({
    orderId: persistedBase.orderId,
    activityId: persistedBase.activityId,
    participants: input.participants,
    travelerId: input.travelerId ?? null,
    totalAmount: persistedBase.totalTwd,
    addonSelections: input.addonSelections,
    redeemPoints: input.redeemPoints,
  });
  const hasExtendedPricing = Number(extrasResult?.addonTotal) > 0
    || Number(extrasResult?.redeemed) > 0;

  const persistedFinal = await readBack({
    bookingId: persistedBase.bookingId,
    orderId: persistedBase.orderId,
    expectedActivityId: persistedBase.activityId,
    expectedPlanId: persistedBase.planId,
    // 沒有實際延伸金額時仍須再次證明 base item = payable total。只有真的寫入
    // order_addons／points 時才暫時放寬；兩者會在 #1812/#1813 納入完整對帳。
    requireTotalMatch: !hasExtendedPricing,
  });

  try {
    await notify({
      bookingId: persistedFinal.bookingId,
      orderId: persistedFinal.orderId,
      activityId: persistedFinal.activityId,
      activityTitle: input.activityTitle,
      startAt: input.startAt,
      peopleCount: input.participants,
      totalTwd: persistedFinal.totalTwd,
      paymentDeadlineAt: persistedFinal.paymentDeadlineAt,
      requiresApproval: input.requiresApproval === true,
    });
  } catch (error) {
    // 通知維持既有 best-effort 契約；資料與 API 成功不能被外部通知可用性反轉。
    console.error('[booking-draft-post-create-notify] orchestration failed:', error);
  }

  return {
    bookingId: persistedFinal.bookingId,
    bookingNo: persistedFinal.bookingNo,
    bookingStatus: persistedFinal.bookingStatus,
    orderId: persistedFinal.orderId,
    orderStatus: persistedFinal.orderStatus,
    amount: persistedFinal.totalTwd,
    paymentDeadlineAt: persistedFinal.paymentDeadlineAt,
  };
}
