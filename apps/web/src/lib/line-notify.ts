/**
 * LINE Notify 通知服務
 * Phase 10 — Tour Platform
 *
 * LINE Notify 是免費的 LINE 通知服務，用於發送重要訂單通知給管理員/導遊
 *
 * 設置方法：
 * 1. 前往 https://notify-bot.line.me/my/
 * 2. 登入 LINE 帳號
 * 3. 點擊「發行權杖」
 * 4. 選擇要接收通知的群組或個人聊天室
 * 5. 將權杖設置到環境變量 LINE_NOTIFY_ACCESS_TOKEN
 *
 * 注意：所有函數都是 fire-and-forget，不會阻塞 API 回應
 */

// ── 通知類型 ───────────────────────────────────────────────────────────────────

interface NotifyLogEntry {
  fn: string;
  status: 'sent' | 'failed' | 'skipped';
  orderId?: string;
  error?: string;
  ts: string;
}

function logNotify(entry: NotifyLogEntry): void {
  const icon = entry.status === 'sent' ? '💬' : entry.status === 'skipped' ? '⏭️' : '❌';
  const base = `[line-notify] ${icon} ${entry.fn}`;
  if (entry.status === 'sent') {
    console.log(`${base} | orderId=${entry.orderId ?? '-'}`);
  } else if (entry.status === 'skipped') {
    console.log(`${base} | reason=no_access_token`);
  } else {
    console.error(`${base} | error=${entry.error}`);
  }
}

// ── LINE Notify API ─────────────────────────────────────────────────────────────

const LINE_NOTIFY_API = 'https://notify-api.line.me/api/notify';

async function sendLineNotify(message: string): Promise<boolean> {
  const token = process.env.LINE_NOTIFY_ACCESS_TOKEN;

  if (!token) {
    return false;
  }

  const response = await fetch(LINE_NOTIFY_API, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ message }),
  });

  if (!response.ok) {
    throw new Error(`LINE Notify API error: ${response.status} ${response.statusText}`);
  }

  return true;
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

  try {
    const sent = await sendLineNotify(message);
    if (!sent) {
      logNotify({ fn: 'notifyNewOrder', orderId: data.orderId, status: 'skipped', ts: new Date().toISOString() });
      return;
    }
    logNotify({ fn: 'notifyNewOrder', orderId: data.orderId, status: 'sent', ts: new Date().toISOString() });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logNotify({ fn: 'notifyNewOrder', orderId: data.orderId, status: 'failed', error, ts: new Date().toISOString() });
  }
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

  try {
    const sent = await sendLineNotify(message);
    if (!sent) {
      logNotify({ fn: 'notifyPaymentReceived', orderId: data.orderId, status: 'skipped', ts: new Date().toISOString() });
      return;
    }
    logNotify({ fn: 'notifyPaymentReceived', orderId: data.orderId, status: 'sent', ts: new Date().toISOString() });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logNotify({ fn: 'notifyPaymentReceived', orderId: data.orderId, status: 'failed', error, ts: new Date().toISOString() });
  }
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

  try {
    const sent = await sendLineNotify(message);
    if (!sent) {
      logNotify({ fn: 'notifyOrderCancelled', orderId: data.orderId, status: 'skipped', ts: new Date().toISOString() });
      return;
    }
    logNotify({ fn: 'notifyOrderCancelled', orderId: data.orderId, status: 'sent', ts: new Date().toISOString() });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logNotify({ fn: 'notifyOrderCancelled', orderId: data.orderId, status: 'failed', error, ts: new Date().toISOString() });
  }
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

  try {
    const sent = await sendLineNotify(message);
    if (!sent) {
      logNotify({ fn: 'notifyRefundRequest', orderId: data.orderId, status: 'skipped', ts: new Date().toISOString() });
      return;
    }
    logNotify({ fn: 'notifyRefundRequest', orderId: data.orderId, status: 'sent', ts: new Date().toISOString() });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logNotify({ fn: 'notifyRefundRequest', orderId: data.orderId, status: 'failed', error, ts: new Date().toISOString() });
  }
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

  try {
    const sent = await sendLineNotify(message);
    if (!sent) {
      logNotify({ fn: 'notifySystemError', status: 'skipped', ts: new Date().toISOString() });
      return;
    }
    logNotify({ fn: 'notifySystemError', status: 'sent', ts: new Date().toISOString() });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logNotify({ fn: 'notifySystemError', status: 'failed', error: errMsg, ts: new Date().toISOString() });
  }
}
