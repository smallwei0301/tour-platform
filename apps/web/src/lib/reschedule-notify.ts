/**
 * #1383 — 改期通知 wrapper：補齊收件人資訊後呼叫 email.ts 交易信。
 * 一律 best-effort：任何失敗不得影響改期主流程（呼叫端已 fire-and-forget）。
 */
import { hasSupabaseEnv } from './db.mjs';
import { sendRescheduleRequestNotice, sendRescheduleDecisionNotice } from './email';
import { createNotification } from './db-notifications.mjs';
import { getSupabaseUrl, getSupabaseServiceRoleKey } from '../../src/config/supabase-service-env.mjs';

type RescheduleResult = {
  id: string;
  orderId: string;
  fromStartAt?: string | null;
  toStartAt?: string | null;
  note?: string;
  order?: { id: string; contactName?: string | null } | null;
};

async function getServiceClient() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(getSupabaseUrl()!, getSupabaseServiceRoleKey()!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** #1411 起由 order-message-notify.ts 共用 → export。#1593 加 travelerUserId 供站內通知。 */
export async function lookupOrderContext(orderId: string): Promise<{
  activityTitle: string;
  contactName?: string;
  contactEmail?: string;
  guideEmail?: string;
  travelerUserId?: string;
} | null> {
  if (!hasSupabaseEnv()) {
    // in-memory：fixtures 無嚮導 email；旅客 email 從 store 取得
    const { orders, experiences } = await import('./store.mjs');
    const order = (orders as Array<Record<string, unknown>>).find((o) => o.id === orderId);
    if (!order) return null;
    const exp = (experiences as Array<Record<string, unknown>>).find((e) => e.id === order.experienceId);
    return {
      activityTitle: String(exp?.title ?? '您的行程'),
      contactName: order.contactName ? String(order.contactName) : undefined,
      contactEmail: order.contactEmail ? String(order.contactEmail) : undefined,
      guideEmail: undefined,
      travelerUserId: order.userId ? String(order.userId) : (order.user_id ? String(order.user_id) : undefined),
    };
  }

  const supabase = await getServiceClient();
  const { data: order } = await supabase
    .from('orders')
    .select('id, user_id, contact_name, contact_email, activities(title, guide_id, guide_profiles(guide_email))')
    .eq('id', orderId)
    .maybeSingle();
  if (!order) return null;
  const activity = Array.isArray(order.activities) ? order.activities[0] : order.activities;
  const guideProfile = activity
    ? (Array.isArray(activity.guide_profiles) ? activity.guide_profiles[0] : activity.guide_profiles)
    : null;
  return {
    activityTitle: activity?.title ?? '您的行程',
    contactName: order.contact_name ?? undefined,
    contactEmail: order.contact_email ?? undefined,
    guideEmail: guideProfile?.guide_email ?? undefined,
    travelerUserId: order.user_id ?? undefined,
  };
}

/** 旅客送出申請 → 通知嚮導（無嚮導 email 時靜默略過）。 */
export async function notifyRescheduleRequested(result: RescheduleResult): Promise<void> {
  const ctx = await lookupOrderContext(result.orderId);
  if (!ctx?.guideEmail) return;
  await sendRescheduleRequestNotice({
    to: ctx.guideEmail,
    activityTitle: ctx.activityTitle,
    contactName: ctx.contactName,
    orderId: result.orderId,
    fromStartAt: result.fromStartAt,
    toStartAt: result.toStartAt,
  });
}

/** 嚮導決定 → 通知旅客（email＋#1593 站內通知）。 */
export async function notifyRescheduleDecided(result: RescheduleResult, action: string): Promise<void> {
  const ctx = await lookupOrderContext(result.orderId);
  if (!ctx) return;
  const approved = action === 'approve';
  // #1593 站內通知（best-effort，createNotification 永不 throw）
  if (ctx.travelerUserId) {
    await createNotification({
      userId: ctx.travelerUserId,
      type: 'reschedule_result',
      title: approved ? '改期申請已通過' : '改期申請未通過',
      body: `「${ctx.activityTitle}」的改期${approved ? '已確認' : '未被接受'}${result.note ? `：${result.note}` : ''}`,
      linkPath: `/me/orders/${result.orderId}`,
    });
  }
  if (!ctx.contactEmail) return;
  await sendRescheduleDecisionNotice({
    to: ctx.contactEmail,
    activityTitle: ctx.activityTitle,
    contactName: ctx.contactName,
    orderId: result.orderId,
    approved,
    toStartAt: result.toStartAt,
    note: result.note,
  });
}
