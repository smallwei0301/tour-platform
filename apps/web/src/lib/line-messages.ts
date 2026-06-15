/**
 * Traveler-facing LINE message composers — Tour Platform (#302b)
 *
 * Pure functions (no I/O) so they are trivially unit-testable. Returns
 * LINE Messaging API message objects for the per-traveler push events.
 *
 * Copy is Traditional Chinese, aligned with the Midao / 祕島 voice.
 */

import type { LineMessage } from './line-messaging';

export type TravelerEventKind =
  | 'booking_confirmed'
  | 'payment_received'
  | 'order_cancelled'
  | 'refund_requested'
  | 'refund_executed';

export interface TravelerMessageData {
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

function lines(parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join('\n');
}

/** Build the traveler message(s) for an order event. */
export function buildTravelerMessage(kind: TravelerEventKind, data: TravelerMessageData): LineMessage[] {
  const title = data.activityTitle || '行程';
  const id = shortId(data.orderId);
  const date = data.scheduleDate || '待確認';
  const people = `${data.peopleCount || 1} 人`;

  let text: string;
  switch (kind) {
    case 'booking_confirmed':
      text = lines([
        '🎉 預約已成立',
        '',
        `🗺️ 行程：${title}`,
        `📅 日期：${date}`,
        `👥 人數：${people}`,
        `📋 訂單編號：${id}`,
        '',
        '請於時限內完成付款，以確保保留名額。',
      ]);
      break;
    case 'payment_received':
      text = lines([
        '✅ 付款成功',
        '',
        `🗺️ 行程：${title}`,
        `📅 日期：${date}`,
        `💰 已收款：${amount(data.totalTwd)}`,
        `📋 訂單編號：${id}`,
        '',
        '我們已收到款項，期待與你同行！',
      ]);
      break;
    case 'order_cancelled':
      text = lines([
        '❌ 訂單已取消',
        '',
        `🗺️ 行程：${title}`,
        `📅 日期：${date}`,
        `📋 訂單編號：${id}`,
        '',
        '名額已釋出。如有疑問歡迎與我們聯繫。',
      ]);
      break;
    case 'refund_requested':
      text = lines([
        '🔄 已收到退款申請',
        '',
        `🗺️ 行程：${title}`,
        `💰 金額：${amount(data.totalTwd)}`,
        `📋 訂單編號：${id}`,
        data.reason ? `📝 原因：${data.reason}` : null,
        '',
        '我們將盡快為你審核，結果會再以此通知你。',
      ]);
      break;
    case 'refund_executed':
      text = lines([
        '✅ 退款已完成',
        '',
        `🗺️ 行程：${title}`,
        `💰 金額：${amount(data.totalTwd)}`,
        `📋 訂單編號：${id}`,
        '',
        '款項將於 3-5 個工作天退回至原付款工具。',
      ]);
      break;
    default:
      text = `訂單 ${id} 狀態已更新。`;
  }

  return [{ type: 'text', text }];
}

// ---------------------------------------------------------------------------
// Guide-facing composers (per-guide push: notify the guide who owns the order).
// ---------------------------------------------------------------------------

export type GuideEventKind =
  | 'guide_new_order'
  | 'guide_payment_received'
  | 'guide_order_cancelled'
  | 'guide_refund_requested'
  | 'guide_refund_executed';

/** Build the guide message(s) for an order event on one of their activities. */
export function buildGuideMessage(kind: GuideEventKind, data: TravelerMessageData): LineMessage[] {
  const title = data.activityTitle || '行程';
  const id = shortId(data.orderId);
  const date = data.scheduleDate || '待確認';
  const people = `${data.peopleCount || 1} 人`;

  let text: string;
  switch (kind) {
    case 'guide_new_order':
      text = lines([
        '🆕 有新的預約（待付款）',
        '',
        `🗺️ 行程：${title}`,
        `📅 日期：${date}`,
        `👥 人數：${people}`,
        `📋 訂單編號：${id}`,
        '',
        '旅客完成付款後會再通知你。',
      ]);
      break;
    case 'guide_payment_received':
      text = lines([
        '💰 訂單已付款確認',
        '',
        `🗺️ 行程：${title}`,
        `📅 日期：${date}`,
        `👥 人數：${people}`,
        `💵 金額：${amount(data.totalTwd)}`,
        `📋 訂單編號：${id}`,
        '',
        '名額已確認，記得安排出團準備。',
      ]);
      break;
    case 'guide_order_cancelled':
      text = lines([
        '❌ 有一筆訂單被取消',
        '',
        `🗺️ 行程：${title}`,
        `📅 日期：${date}`,
        `👥 人數：${people}`,
        `📋 訂單編號：${id}`,
        '',
        '名額已釋出，請更新你的出團名單。',
      ]);
      break;
    case 'guide_refund_requested':
      text = lines([
        '🔄 有一筆退款申請',
        '',
        `🗺️ 行程：${title}`,
        `💵 金額：${amount(data.totalTwd)}`,
        `📋 訂單編號：${id}`,
        data.reason ? `📝 原因：${data.reason}` : null,
        '',
        '平台將進行審核，結果會再通知你。',
      ]);
      break;
    case 'guide_refund_executed':
      text = lines([
        '✅ 一筆退款已完成',
        '',
        `🗺️ 行程：${title}`,
        `💵 金額：${amount(data.totalTwd)}`,
        `📋 訂單編號：${id}`,
        '',
        '該名額已正式結案。',
      ]);
      break;
    default:
      text = `訂單 ${id} 狀態已更新。`;
  }

  return [{ type: 'text', text }];
}
