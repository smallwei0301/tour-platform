/**
 * Telegram order-event text composers (pure functions, no I/O).
 *
 * Plain-text messages for the three audiences. Copy is Traditional Chinese,
 * aligned with the Midao / 祕島 voice.
 */

export type OrderEventKind =
  | 'new_order'
  | 'payment_received'
  | 'order_cancelled'
  | 'refund_requested'
  | 'refund_executed';

export type NotifyAudience = 'traveler' | 'guide' | 'admin';

export interface OrderEventTextData {
  orderId: string;
  activityTitle?: string;
  scheduleDate?: string | null;
  peopleCount?: number;
  totalTwd?: number;
  reason?: string;
}

function shortId(orderId: string): string {
  return String(orderId || '').slice(0, 8).toUpperCase();
}

function amount(totalTwd?: number): string {
  return `NT$ ${(totalTwd || 0).toLocaleString()}`;
}

const HEADLINE: Record<NotifyAudience, Record<OrderEventKind, string>> = {
  traveler: {
    new_order: '🎉 預約已建立（待付款）',
    payment_received: '✅ 付款成功，預約確認',
    order_cancelled: '❌ 您的訂單已取消',
    refund_requested: '🔄 已收到您的退款申請',
    refund_executed: '✅ 退款已完成',
  },
  guide: {
    new_order: '🆕 你有新的預約（待付款）',
    payment_received: '💰 訂單已付款確認',
    order_cancelled: '❌ 有一筆訂單被取消',
    refund_requested: '🔄 有一筆退款申請',
    refund_executed: '✅ 一筆退款已完成',
  },
  admin: {
    new_order: '🆕 新訂單（待付款）',
    payment_received: '💰 訂單付款確認',
    order_cancelled: '❌ 訂單取消',
    refund_requested: '🔄 退款申請',
    refund_executed: '✅ 退款完成',
  },
};

/** Build a plain-text Telegram message for an order event. */
export function buildOrderEventTelegramText(
  kind: OrderEventKind,
  data: OrderEventTextData,
  audience: NotifyAudience,
): string {
  const head = HEADLINE[audience]?.[kind] ?? '訂單狀態更新';
  const parts = [
    head,
    '',
    `🗺️ 行程：${data.activityTitle || '行程'}`,
    data.scheduleDate ? `📅 日期：${data.scheduleDate}` : null,
    data.peopleCount ? `👥 人數：${data.peopleCount} 人` : null,
    data.totalTwd !== undefined ? `💰 金額：${amount(data.totalTwd)}` : null,
    `📋 訂單：${shortId(data.orderId)}`,
    data.reason ? `📝 原因：${data.reason}` : null,
  ];
  return parts.filter((p) => p !== null && p !== undefined).join('\n');
}
