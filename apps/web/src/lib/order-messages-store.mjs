/**
 * Issue #1411 — 站內訊息的 in-memory fallback 實作（單執行緒語意）。
 * 規則一律來自 order-messages.mjs 純函式；Supabase 分支見 db.mjs。
 */
import { orders, experiences, orderMessages } from './store.mjs';
import {
  getOrderMessageWindow,
  shouldNotifyOrderMessage,
  serialiseOrderMessage,
  validateOrderMessageBody,
} from './order-messages.mjs';

function err(code, message) {
  return new Error(`${code}: ${message}`);
}

function findExperienceForOrder(order) {
  return experiences.find((e) => e.id === order.experienceId || e.slug === order.experienceSlug) || null;
}

/**
 * ownership 解析：
 * - contactEmail（traveler）不符 → ORDER_NOT_FOUND（不洩漏存在性）
 * - guideSlug（guide）不符活動歸屬 → FORBIDDEN
 * - 兩者皆缺 → admin/service-role 路徑，放行
 */
function findOrderAuthorized({ orderId, contactEmail, guideSlug }) {
  const order = orders.find((o) => o.id === String(orderId || '').trim());
  if (!order) throw err('ORDER_NOT_FOUND', 'order not found');
  if (contactEmail && order.contactEmail && order.contactEmail !== contactEmail) {
    throw err('ORDER_NOT_FOUND', 'order not found');
  }
  const exp = findExperienceForOrder(order);
  if (guideSlug && exp?.guideSlug !== guideSlug) {
    throw err('FORBIDDEN', 'order belongs to another guide');
  }
  return { order, exp };
}

function windowForOrder(order, exp, now) {
  const schedule = (exp?.schedules || []).find((s) => s.id === order.scheduleId);
  return getOrderMessageWindow({
    orderStatus: order.status,
    scheduleStartAt: order.scheduleStartAt,
    scheduleEndAt: schedule?.endAt,
    completedAt: order.completedAt,
    now,
  });
}

function messagesForOrder(orderId) {
  return orderMessages
    .filter((m) => m.orderId === orderId)
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

export function listOrderMessagesInMemory({ orderId, contactEmail, guideSlug } = {}) {
  const { order, exp } = findOrderAuthorized({ orderId, contactEmail, guideSlug });
  const window = windowForOrder(order, exp, new Date());
  return {
    orderId: order.id,
    orderStatus: order.status,
    activityTitle: exp?.title ?? null,
    canView: window.canView,
    canPost: window.canPost,
    messages: messagesForOrder(order.id).map(serialiseOrderMessage),
  };
}

export function createOrderMessageInMemory({ orderId, senderRole, senderId, body, contactEmail, guideSlug } = {}) {
  const role = String(senderRole || '').trim();
  if (!['traveler', 'guide'].includes(role)) throw err('BAD_REQUEST', 'invalid senderRole');

  const verdict = validateOrderMessageBody(body);
  if (!verdict.ok) throw err(verdict.code, verdict.message);

  const { order, exp } = findOrderAuthorized({ orderId, contactEmail, guideSlug });
  const now = new Date();
  const window = windowForOrder(order, exp, now);
  if (!window.canPost) throw err('MESSAGE_WINDOW_CLOSED', '此訂單目前無法留言');

  const previous = messagesForOrder(order.id);
  const shouldNotify = shouldNotifyOrderMessage({ previousMessages: previous, senderRole: role, now });

  const message = {
    id: `msg_${String(orderMessages.length + 1).padStart(6, '0')}`,
    orderId: order.id,
    senderRole: role,
    senderId: senderId ? String(senderId) : null,
    body: verdict.value,
    createdAt: now.toISOString(),
  };
  orderMessages.push(message);

  return { message: serialiseOrderMessage(message), shouldNotify };
}

export function listGuideMessageThreadsInMemory({ guideSlug } = {}) {
  const guideExperiences = new Map(
    experiences.filter((e) => !guideSlug || e.guideSlug === guideSlug).map((e) => [e.id, e])
  );
  const byOrder = new Map();
  for (const m of orderMessages) {
    if (!byOrder.has(m.orderId)) byOrder.set(m.orderId, []);
    byOrder.get(m.orderId).push(m);
  }

  const threads = [];
  const now = new Date();
  for (const [orderId, msgs] of byOrder) {
    const order = orders.find((o) => o.id === orderId);
    if (!order || !guideExperiences.has(order.experienceId)) continue;
    const exp = guideExperiences.get(order.experienceId);
    const sorted = msgs.slice().sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    const last = sorted[sorted.length - 1];
    const window = windowForOrder(order, exp, now);
    threads.push({
      orderId: order.id,
      orderStatus: order.status,
      activityTitle: exp?.title ?? null,
      contactName: order.contactName ?? null,
      scheduleStartAt: order.scheduleStartAt ?? null,
      lastMessage: serialiseOrderMessage(last),
      messageCount: sorted.length,
      needsReply: last.senderRole === 'traveler',
      canPost: window.canPost,
    });
  }

  // 待回覆優先，再依最後留言時間新→舊
  return threads.sort((a, b) => {
    if (a.needsReply !== b.needsReply) return a.needsReply ? -1 : 1;
    return String(b.lastMessage.createdAt).localeCompare(String(a.lastMessage.createdAt));
  });
}
