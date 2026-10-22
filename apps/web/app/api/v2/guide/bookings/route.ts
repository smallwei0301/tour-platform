/**
 * #1649 Phase 6：實作自 legacy 路徑（app/api/guide/bookings）整體搬遷至 v2 命名空間。
 * legacy 路徑已退役刪除；行為與測試契約以本檔為準。
 */
import { ok, fail } from '../../../../../src/lib/api';
import { verifyGuideSession, maskEmail } from '../../../../../src/lib/guide-auth';
import { getSupabaseUrl, getSupabaseServiceRoleKey } from '../../../../../src/config/supabase-service-env.mjs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(getSupabaseUrl()!, getSupabaseServiceRoleKey()!);
}

export async function GET(req: Request) {
  const session = verifyGuideSession(req);
  if (!session) return Response.json(fail('UNAUTHORIZED', 'session required'), { status: 401 });

  if (!getSupabaseUrl()) return Response.json(ok([]));

  const supabase = await getSupabase();

  // Get guide's activities
  const { data: activities } = await supabase
    .from('activities')
    .select('id, title')
    .eq('guide_id', session.guideId);

  const activityIds = (activities || []).map((a: any) => a.id);
  const activityIdSet = new Set<string>(activityIds);
  const activityMap = Object.fromEntries((activities || []).map((a: any) => [a.id, a]));

  if (activityIds.length === 0) return Response.json(ok([]));

  // Optional: filter by scheduleId
  const url = new URL(req.url);
  const filterScheduleId = url.searchParams.get('scheduleId');

  // Get orders with schedule info and booking_id for conflict override lookup
  let query = supabase
    .from('orders')
    .select(`
      id, contact_name, contact_email, contact_phone,
      people_count, status, total_twd, paid_at, created_at, admin_note,
      activity_id, schedule_id, booking_id,
      activity_schedules!orders_schedule_id_fkey(start_at, plan_id)
    `)
    .in('activity_id', activityIds)
    .order('created_at', { ascending: false })
    .limit(100);

  if (filterScheduleId) {
    query = query.eq('schedule_id', filterScheduleId);
  }

  const { data: orders, error } = await query;

  if (error) return Response.json(fail('SERVER_ERROR', error.message), { status: 500 });

  // Fetch conflict_override_snapshot for orders that have a booking_id
  const bookingIds = (orders || [])
    .map((o: any) => o.booking_id)
    .filter((id: any) => Boolean(id));

  // Build maps keyed by booking_id: hasConflictOverride (compact marker) and activity_plan_id
  const conflictOverrideMap: Record<string, boolean> = {};
  const bookingPlanIdMap: Record<string, string> = {};
  // bookings 查詢失敗時，有 booking_id 的訂單無法確認 booking 方案：planId／planName 回 null，不退回 schedule.plan_id
  let bookingsLookupFailed = false;
  if (bookingIds.length > 0) {
    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('id, conflict_override_snapshot, activity_plan_id')
      .in('id', bookingIds);
    if (bookingsError || !bookings) bookingsLookupFailed = true;
    for (const booking of bookings || []) {
      if (booking.conflict_override_snapshot) {
        conflictOverrideMap[booking.id] = true;
      }
      if (booking.activity_plan_id) {
        bookingPlanIdMap[booking.id] = booking.activity_plan_id;
      }
    }
  }

  // 候選 plan 識別碼：bookings.activity_plan_id 優先，其次 schedule.plan_id。
  // schedule.plan_id 是 text（legacy 識別碼如 'half-day'），activity_plans.id 是 UUID：
  // 非 UUID 值放進 .in('id', …) 會讓整個查詢失敗，所以分組處理，任一組失敗只影響該組。
  const resolveRawPlanKey = (o: any): string | null => {
    const schedule = Array.isArray(o.activity_schedules) ? o.activity_schedules[0] : o.activity_schedules;
    if (o.booking_id && bookingsLookupFailed) return null;
    const raw: string | null = (o.booking_id ? bookingPlanIdMap[o.booking_id] : undefined) ?? schedule?.plan_id ?? null;
    // UUID 不分大小寫，統一小寫後再查詢與比對
    return raw && UUID_RE.test(raw) ? raw.toLowerCase() : raw;
  };
  const rawKeys = Array.from(new Set((orders || []).map(resolveRawPlanKey).filter((id: any): id is string => Boolean(id))));
  const uuidKeys = rawKeys.filter((k) => UUID_RE.test(k));
  const legacyKeys = rawKeys.filter((k) => !UUID_RE.test(k));

  type PlanRow = { id: string; name: string | null; activity_id: string };
  const planById: Record<string, PlanRow> = {};
  const ambiguousLegacy = new Set<string>();
  const planByLegacy: Record<string, PlanRow> = {}; // key = `${activity_id}\u0000${legacy_plan_id}`
  if (uuidKeys.length > 0) {
    const { data: plans } = await supabase
      .from('activity_plans')
      .select('id, name, activity_id')
      .in('id', uuidKeys);
    for (const plan of plans || []) {
      if (activityIdSet.has(plan.activity_id)) planById[plan.id] = plan;
    }
  }
  if (legacyKeys.length > 0) {
    const { data: plans } = await supabase
      .from('activity_plans')
      .select('id, name, activity_id, legacy_plan_id')
      .in('legacy_plan_id', legacyKeys)
      .in('activity_id', activityIds);
    for (const plan of plans || []) {
      if (!activityIdSet.has(plan.activity_id) || !plan.legacy_plan_id) continue;
      const key = `${plan.activity_id}\u0000${plan.legacy_plan_id}`;
      // schema 對 (activity_id, legacy_plan_id) 沒有唯一約束：同 key 出現第二列即視為歧義（比照 maybeSingle 語意），
      // 不依賴列順序挑一個，該 key 的訂單 planId／planName 皆回 null
      if (planByLegacy[key] || ambiguousLegacy.has(key)) {
        delete planByLegacy[key];
        ambiguousLegacy.add(key);
      } else {
        planByLegacy[key] = plan;
      }
    }
  }

  const result = (orders || []).map((o: any) => {
    const schedule = Array.isArray(o.activity_schedules) ? o.activity_schedules[0] : o.activity_schedules;
    // planId 一律是解析後的 canonical activity_plans.id，且與 planName 指向同一個通過 ownership 驗證的方案；
    // 驗證失敗（含他人／他 activity 的方案、legacy 識別碼對不到）兩者皆 null
    const rawKey = resolveRawPlanKey(o);
    const candidate = rawKey
      ? (UUID_RE.test(rawKey) ? planById[rawKey] : planByLegacy[`${o.activity_id}\u0000${rawKey}`])
      : undefined;
    const plan = candidate && candidate.activity_id === o.activity_id ? candidate : undefined;
    const planId = plan ? plan.id : null;
    return {
      id: o.id,
      scheduleId: o.schedule_id,
      guestName: o.contact_name || '未知',
      guestPhone: filterScheduleId ? (o.contact_phone || '') : '',  // show phone only when filtering by schedule
      maskedEmail: o.contact_email ? maskEmail(o.contact_email) : '',
      scheduleDate: schedule?.start_at || null,
      planId,
      planName: plan ? (plan.name || null) : null,
      tourTitle: activityMap[o.activity_id]?.title || '',
      partySize: o.people_count,
      status: o.status,
      paymentStatus: o.paid_at ? 'paid' : 'unpaid',
      totalTwd: o.total_twd,
      createdAt: o.created_at,
      hasConflictOverride: o.booking_id ? (conflictOverrideMap[o.booking_id] ?? false) : false,
    };
  });

  return Response.json(ok(result));
}
