/**
 * 訂單/系統 ops 通知服務
 * Phase 10 → #302b — Tour Platform
 *
 * ⚠️ LINE Notify 已於 2025-03-31 被 LINE 官方關閉，原本的 Notify 推播端點
 * 已失效。本模組現改用 LINE Messaging API 將通知推送到 ops/admin 群組
 * （LINE_OPS_GROUP_ID），由 line-messaging.ts 統一處理 kill-switch
 * （LINE_MESSAGING_ENABLED，預設 OFF）與 fire-and-forget 語意。
 *
 * 對外函式名稱與 OrderNotifyData 維持不變，呼叫端無需改動。
 *
 * 設置方法：
 * 1. 於 LINE Developers 建立 Messaging API channel，取得 channel access token。
 * 2. 將 bot 加入 ops/admin 群組，取得 groupId。
 * 3. 設置環境變數 LINE_CHANNEL_ACCESS_TOKEN / LINE_OPS_GROUP_ID，
 *    並開啟 LINE_MESSAGING_ENABLED。
 */

import { pushToOps, type PushStatus } from './line-messaging';

// ── 通知類型 ───────────────────────────────────────────────────────────────────

interface NotifyLogEntry {
  fn: string;
  status: PushStatus;
  orderId?: string;
  reason?: string;
  error?: string;
  ts: string;
}

function logNotify(entry: NotifyLogEntry): void {
  const icon = entry.status === 'sent' ? '💬' : entry.status === 'skipped' ? '⏭️' : '❌';
  const base = `[line-notify] ${icon} ${entry.fn}`;
  if (entry.status === 'sent') {
    console.log(`${base} | orderId=${entry.orderId ?? '-'}`);
  } else if (entry.status === 'skipped') {
    console.log(`${base} | reason=${entry.reason ?? 'skipped'}`);
  } else {
    console.error(`${base} | error=${entry.error}`);
  }
}

// ── ops 推播 helper ──────────────────────────────────────────────────────────

async function notifyOps(fn: string, message: string, orderId?: string): Promise<void> {
  const result = await pushToOps(message);
  logNotify({ fn, orderId, status: result.status, reason: result.reason, error: result.error, ts: new Date().toISOString() });
}

// ── 訂單通知資料類型 ─────────────────────────────────────────────────────────────

export interface OrderNotifyData {
  orderId: string;
  activityTitle: string;
  scheduleDate?: string | null;
  peopleCount?: number;
  totalTwd?: number;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
}

// ── 通知函數 ─────────────────────────────────────────────────────────────────────

/**
 * 新訂單通知（發送給管理員/導遊）
 */
export async function notifyNewOrder(data: OrderNotifyData): Promise<void> {
  const message = `
🆕 新訂單通知

📋 訂單編號: ${data.orderId.slice(0, 8).toUpperCase()}
🗺️ 行程: ${data.activityTitle}
📅 日期: ${data.scheduleDate || '待確認'}
👥 人數: ${data.peopleCount || 1} 人
💰 金額: NT$ ${(data.totalTwd || 0).toLocaleString()}

👤 聯絡人: ${data.contactName || '-'}
📧 Email: ${data.contactEmail || '-'}
📱 電話: ${data.contactPhone || '-'}

請登入管理後台查看詳情`;

  await notifyOps('notifyNewOrder', message, data.orderId);
}

/**
 * 付款成功通知（發送給管理員/導遊）
 */
export async function notifyPaymentReceived(data: OrderNotifyData): Promise<void> {
  const message = `
✅ 付款成功通知

📋 訂單編號: ${data.orderId.slice(0, 8).toUpperCase()}
🗺️ 行程: ${data.activityTitle}
📅 日期: ${data.scheduleDate || '待確認'}
👥 人數: ${data.peopleCount || 1} 人
💰 已收款: NT$ ${(data.totalTwd || 0).toLocaleString()}

👤 旅客: ${data.contactName || '-'}
📧 Email: ${data.contactEmail || '-'}

請聯絡旅客確認行程細節`;

  await notifyOps('notifyPaymentReceived', message, data.orderId);
}

/**
 * 訂單取消通知（發送給管理員/導遊）
 */
export async function notifyOrderCancelled(data: OrderNotifyData): Promise<void> {
  const message = `
❌ 訂單取消通知

📋 訂單編號: ${data.orderId.slice(0, 8).toUpperCase()}
🗺️ 行程: ${data.activityTitle}
📅 日期: ${data.scheduleDate || '-'}
👥 人數: ${data.peopleCount || 1} 人

👤 旅客: ${data.contactName || '-'}

席位已自動釋放`;

  await notifyOps('notifyOrderCancelled', message, data.orderId);
}

/**
 * 退款申請通知（發送給管理員）
 */
export async function notifyRefundRequest(data: OrderNotifyData & { reason?: string; note?: string }): Promise<void> {
  const message = `
🔄 退款申請通知

📋 訂單編號: ${data.orderId.slice(0, 8).toUpperCase()}
🗺️ 行程: ${data.activityTitle}
💰 金額: NT$ ${(data.totalTwd || 0).toLocaleString()}

👤 申請人: ${data.contactName || '-'}
📧 Email: ${data.contactEmail || '-'}
📝 原因: ${data.reason || '-'}
${data.note ? `💬 備註: ${data.note}` : ''}

請登入管理後台審核`;

  await notifyOps('notifyRefundRequest', message, data.orderId);
}

/**
 * 退款完成通知 — 僅在 REFUND_AUTO_EXECUTE 自動執行成功時發送
 */
export async function notifyRefundExecuted(data: OrderNotifyData): Promise<void> {
  const message = `
✅ 退款完成：${data.activityTitle}

📋 訂單編號: ${data.orderId.slice(0, 8).toUpperCase()}
💰 金額: NT$ ${(data.totalTwd || 0).toLocaleString()}

款項將於 3-5 個工作天退回至原付款工具。`;

  await notifyOps('notifyRefundExecuted', message, data.orderId);
}

/**
 * 系統錯誤通知（發送給管理員）
 */
export async function notifySystemError(context: string, error: string, details?: Record<string, unknown>): Promise<void> {
  const detailStr = details ? `\n📦 詳情: ${JSON.stringify(details, null, 2).slice(0, 500)}` : '';
  const message = `
⚠️ 系統錯誤通知

📍 位置: ${context}
❌ 錯誤: ${error.slice(0, 200)}${detailStr}
⏰ 時間: ${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}

請儘速檢查`;

  await notifyOps('notifySystemError', message);
}
