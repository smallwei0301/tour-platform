/**
 * GET /api/v2/guide/midao/calendar?month=YYYY-MM — 月曆聚合。
 * 可用時段（獨立輕量表）＋需求單點色＋既有 bookings 唯讀疊加（查詢失敗 degrade，不整頁 500）。
 * 點色：橘=未結案需求（new/pending_reply/replied）、綠=closed_won 或既有 confirmed 訂單。
 */
import { verifyGuideSession } from '../../../../../../src/lib/guide-auth';
import { getMonthEffectiveDb } from '../../../../../../src/lib/db-midao-availability.mjs';
import { listMidaoRequestsDb } from '../../../../../../src/lib/db-midao-requests.mjs';
import { hasSupabaseEnv, getSupabase } from '../../../../../../src/lib/db.mjs';
import { jsonOk, jsonError } from '../../../../../../src/lib/api-response';
import { handleRouteError } from '../../../../../../src/lib/route-error';

const MONTH_RE = /^\d{4}-\d{2}$/;
const OPEN_REQ = ['new', 'pending_reply', 'replied'];

async function fetchBookingsOverlay(guideId: string, month: string) {
  // 既有站內訂單唯讀疊加；失敗回空（degrade，spec §8）
  if (!hasSupabaseEnv()) return [];
  try {
    const supabase = await getSupabase();
    const { data } = await supabase.from('bookings')
      .select('id, start_at, end_at, participants, status, customer_note')
      .eq('guide_id', guideId)
      .in('status', ['pending_confirmation', 'confirmed'])
      .gte('start_at', `${month}-01T00:00:00Z`)
      .lt('start_at', nextMonthStart(month));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function nextMonthStart(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, '0')}-01T00:00:00Z`;
}

export async function GET(request: Request) {
  const session = verifyGuideSession(request);
  if (!session) return jsonError('UNAUTHORIZED', '請先登入導遊帳號', 401);
  const url = new URL(request.url);
  const month = url.searchParams.get('month') ?? '';
  if (!MONTH_RE.test(month)) return jsonError('INVALID_MONTH', '月份格式需為 YYYY-MM', 400);
  try {
    const [availability, requests, bookings] = await Promise.all([
      getMonthEffectiveDb(session.guideId, month),
      listMidaoRequestsDb(session.guideId, { status: 'all', sort: 'newest' }),
      fetchBookingsOverlay(session.guideId, month),
    ]);
    const days = availability.map((day) => {
      const dayRequests = requests.items.filter((r) => r.preferredDate === day.date);
      const dayBookings = bookings.filter((b) => String(b.start_at).slice(0, 10) === day.date);
      return {
        date: day.date,
        availability: { morning: day.morning, afternoon: day.afternoon, evening: day.evening, custom: day.custom },
        hasPending: dayRequests.some((r) => OPEN_REQ.includes(r.status)),
        hasConfirmed: dayRequests.some((r) => r.status === 'closed_won') || dayBookings.length > 0,
        items: [
          ...dayRequests.map((r) => ({
            type: 'midao_request' as const, id: r.id, travelerName: r.travelerName,
            title: r.activityTitle, status: r.status,
            timeRange: r.startTime && r.endTime ? `${r.startTime}–${r.endTime}` : null,
            participantsCount: r.participantsCount,
          })),
          ...dayBookings.map((b) => ({
            type: 'booking' as const, id: b.id, travelerName: null,
            title: '站內訂單', status: b.status,
            timeRange: `${String(b.start_at).slice(11, 16)}–${String(b.end_at).slice(11, 16)}`,
            participantsCount: b.participants,
          })),
        ],
      };
    });
    return jsonOk({ month, days });
  } catch (err) {
    return handleRouteError(err, { route: 'v2/guide/midao/calendar' });
  }
}
