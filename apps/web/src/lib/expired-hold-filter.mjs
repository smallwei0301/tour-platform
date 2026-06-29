// #1493 讀取時過濾：把「已逾時未付款」的 draft 佔位從容量計算中濾掉，讓名額在
// 逾時當下即時釋放，不必依賴排程取消。read-only（不寫任何資料）、best-effort
// （查 orders 失敗時原樣回傳，絕不擋住讀取主流程）。
//
// 佔位以 booking.status 計（CAPACITY_HOLD 含 'draft'），但付款期限在 orders 上，
// 故以 booking.order_id 反查對應 order 的 status / payment_deadline_at。

import { isPaymentExpired } from './payment-deadline.mjs';

/**
 * @param {*} supabase service-role client
 * @param {Array<{id:string,status:string,order_id?:string|null}>} bookings 已載入的 booking rows（select 需含 order_id）
 * @param {string} nowIso 現在時間
 * @returns {Promise<Array>} 濾掉逾時未付款 draft 後的 bookings
 */
export async function dropExpiredUnpaidHolds(supabase, bookings, nowIso) {
  if (!Array.isArray(bookings) || bookings.length === 0) return bookings;

  const draftOrderIds = [
    ...new Set(bookings.filter((b) => b.status === 'draft' && b.order_id).map((b) => b.order_id)),
  ];
  if (draftOrderIds.length === 0) return bookings;

  let orders;
  try {
    const res = await supabase
      .from('orders')
      .select('id, status, payment_deadline_at')
      .in('id', draftOrderIds);
    if (res.error) return bookings; // best-effort：查不到就不過濾
    orders = res.data;
  } catch {
    return bookings;
  }

  const expiredOrderIds = new Set(
    (orders || [])
      .filter((o) => o.status === 'pending_payment' && isPaymentExpired(o.payment_deadline_at, nowIso))
      .map((o) => o.id),
  );
  if (expiredOrderIds.size === 0) return bookings;

  return bookings.filter((b) => !(b.status === 'draft' && expiredOrderIds.has(b.order_id)));
}
