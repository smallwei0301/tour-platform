/**
 * #1383 — 改期通知 wrapper：補齊收件人資訊後呼叫 email.ts 交易信。
 * 一律 best-effort：任何失敗不得影響改期主流程（呼叫端已 fire-and-forget）。
 */
import { hasSupabaseEnv } from './db.mjs';
import { sendRescheduleRequestNotice, sendRescheduleDecisionNotice } from './email';

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
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function lookupOrderContext(orderId: string): Promise<{
  activityTitle: string;
  contactName?: string;
  contactEmail?: string;
  guideEmail?: string;
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
    };
  }

  const supabase = await getServiceClient();
  const { data: order } = await supabase
    .from('orders')
    .select('id, contact_name, contact_email, activities(title, guide_id, guide_profiles(guide_email))')
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

/** 嚮導決定 → 通知旅客。 */
export async function notifyRescheduleDecided(result: RescheduleResult, action: string): Promise<void> {
  const ctx = await lookupOrderContext(result.orderId);
  if (!ctx?.contactEmail) return;
  await sendRescheduleDecisionNotice({
    to: ctx.contactEmail,
    activityTitle: ctx.activityTitle,
    contactName: ctx.contactName,
    orderId: result.orderId,
    approved: action === 'approve',
    toStartAt: result.toStartAt,
    note: result.note,
  });
}
