/**
 * 站內訊息／訂單留言串（#1411）
 * #1613 db.mjs strangler：整塊自 db.mjs 純搬移（行為零變更；型別債見 #1597）。
 * db.mjs 以 re-export 保持既有 caller 匯入路徑不變。
 */
import { createOrderMessageInMemory, listGuideMessageThreadsInMemory, listOrderMessagesInMemory } from './order-messages-store.mjs';
import { getOrderMessageWindow, serialiseOrderMessage, shouldNotifyOrderMessage, validateOrderMessageBody } from './order-messages.mjs';
import { getSupabase, hasSupabaseEnv } from './supabase-env.mjs';

// ── Issue #1411: 站內訊息（訂單留言串） ─────────────────────────────────────

/**
 * ownership 解析（Supabase 分支）：
 * - contactEmail 不符 → ORDER_NOT_FOUND（不洩漏存在性）
 * - guideId 不符活動歸屬 → FORBIDDEN
 * - 兩者皆缺 → admin/service-role 路徑，放行
 */
async function fetchOrderForMessages(supabase, { orderId, contactEmail, guideId }) {
  const { data: order, error } = await supabase
    .from('orders')
    .select('id, status, contact_email, contact_name, schedule_id, activity_id, activities(id, title, guide_id), activity_schedules(id, start_at, end_at)')
    .eq('id', String(orderId || '').trim())
    .maybeSingle();
  if (error || !order) throw new Error('ORDER_NOT_FOUND: order not found');
  if (contactEmail && order.contact_email && order.contact_email !== contactEmail) {
    throw new Error('ORDER_NOT_FOUND: order not found');
  }
  const activity = Array.isArray(order.activities) ? order.activities[0] : order.activities;
  if (guideId && activity?.guide_id !== guideId) {
    throw new Error('FORBIDDEN: order belongs to another guide');
  }
  const schedule = Array.isArray(order.activity_schedules) ? order.activity_schedules[0] : order.activity_schedules;
  return { order, activity, schedule };
}

function orderMessageWindowForRow(order, schedule, now) {
  // orders 無 completed_at 欄位 → completed 的 14 天唯讀窗以場次 end_at 起算
  return getOrderMessageWindow({
    orderStatus: order.status,
    scheduleStartAt: schedule?.start_at,
    scheduleEndAt: schedule?.end_at,
    now,
  });
}

export async function listOrderMessagesDb(input = {}) {
  if (!hasSupabaseEnv()) return listOrderMessagesInMemory(input);

  const supabase = await getSupabase();
  const { order, activity, schedule } = await fetchOrderForMessages(supabase, input);
  const window = orderMessageWindowForRow(order, schedule, new Date());

  const { data: rows, error } = await supabase
    .from('order_messages')
    .select('*')
    .eq('order_id', order.id)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);

  return {
    orderId: order.id,
    orderStatus: order.status,
    activityTitle: activity?.title ?? null,
    canView: window.canView,
    canPost: window.canPost,
    messages: (rows ?? []).map(serialiseOrderMessage),
  };
}

export async function createOrderMessageDb(input = {}) {
  if (!hasSupabaseEnv()) return createOrderMessageInMemory(input);

  const role = String(input?.senderRole || '').trim();
  if (!['traveler', 'guide'].includes(role)) throw new Error('BAD_REQUEST: invalid senderRole');
  const verdict = validateOrderMessageBody(input?.body);
  if (!verdict.ok) throw new Error(`${verdict.code}: ${verdict.message}`);

  const supabase = await getSupabase();
  const { order, schedule } = await fetchOrderForMessages(supabase, input);
  const now = new Date();
  const window = orderMessageWindowForRow(order, schedule, now);
  if (!window.canPost) throw new Error('MESSAGE_WINDOW_CLOSED: 此訂單目前無法留言');

  // 通知節流：只需同角色最後一則
  const { data: lastSameRole } = await supabase
    .from('order_messages')
    .select('sender_role, created_at')
    .eq('order_id', order.id)
    .eq('sender_role', role)
    .order('created_at', { ascending: false })
    .limit(1);
  const shouldNotify = shouldNotifyOrderMessage({
    previousMessages: lastSameRole ?? [],
    senderRole: role,
    now,
  });

  const { data: inserted, error: insertError } = await supabase
    .from('order_messages')
    .insert({
      order_id: order.id,
      sender_role: role,
      sender_id: input?.senderId ? String(input.senderId) : null,
      body: verdict.value,
      created_at: now.toISOString(),
    })
    .select('*')
    .single();
  if (insertError) throw new Error(insertError.message);

  return { message: serialiseOrderMessage(inserted), shouldNotify };
}

export async function listGuideMessageThreadsDb(input = {}) {
  if (!hasSupabaseEnv()) return listGuideMessageThreadsInMemory(input);

  const guideId = String(input?.guideId || '').trim();
  const supabase = await getSupabase();
  const now = new Date();

  const { data: rows, error } = await supabase
    .from('order_messages')
    .select('*, orders!inner(id, status, schedule_id, contact_name, activity_id, activities!inner(id, title, guide_id), activity_schedules(id, start_at, end_at))')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);

  const byOrder = new Map();
  for (const row of rows ?? []) {
    const order = Array.isArray(row.orders) ? row.orders[0] : row.orders;
    const activity = order ? (Array.isArray(order.activities) ? order.activities[0] : order.activities) : null;
    if (!order || (guideId && activity?.guide_id !== guideId)) continue;
    if (!byOrder.has(order.id)) byOrder.set(order.id, { order, activity, messages: [] });
    byOrder.get(order.id).messages.push(row);
  }

  const threads = [];
  for (const { order, activity, messages } of byOrder.values()) {
    const last = messages[messages.length - 1];
    const schedule = Array.isArray(order.activity_schedules) ? order.activity_schedules[0] : order.activity_schedules;
    const window = orderMessageWindowForRow(order, schedule, now);
    threads.push({
      orderId: order.id,
      orderStatus: order.status,
      activityTitle: activity?.title ?? null,
      contactName: order.contact_name ?? null,
      scheduleStartAt: schedule?.start_at ?? null,
      lastMessage: serialiseOrderMessage(last),
      messageCount: messages.length,
      needsReply: last.sender_role === 'traveler',
      canPost: window.canPost,
    });
  }

  // 待回覆優先，再依最後留言時間新→舊
  return threads.sort((a, b) => {
    if (a.needsReply !== b.needsReply) return a.needsReply ? -1 : 1;
    return String(b.lastMessage.createdAt).localeCompare(String(a.lastMessage.createdAt));
  });
}

