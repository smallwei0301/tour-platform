import { ok, fail } from '../../../../../src/lib/api';
import { verifyGuideSession } from '../../../../../src/lib/guide-auth';

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function PATCH(
  req: Request,
  context: { params: { scheduleId: string } },
) {
  const session = verifyGuideSession(req);
  if (!session) return Response.json(fail('UNAUTHORIZED', 'session required'), { status: 401 });

  const { scheduleId } = context.params;
  if (!scheduleId) return Response.json(fail('BAD_REQUEST', 'scheduleId required'), { status: 400 });

  const body = await req.json().catch(() => ({}));
  const supabase = await getSupabase();

  // Fetch schedule + verify ownership
  const { data: schedule, error } = await supabase
    .from('activity_schedules')
    .select('id, activity_id, capacity, booked_count, status')
    .eq('id', scheduleId || '')
    .single();

  if (error || !schedule) {
    return Response.json(fail('NOT_FOUND', 'Schedule not found'), { status: 404 });
  }

  // Verify the schedule belongs to this guide
  const { data: activity } = await supabase
    .from('activities')
    .select('guide_id')
    .eq('id', schedule.activity_id)
    .single();

  if (!activity || activity.guide_id !== session.guideId) {
    return Response.json(fail('FORBIDDEN', '無權操作此場次'), { status: 403 });
  }

  const updates: Record<string, any> = {};

  // Toggle status (open ↔ cancelled)
  if ('isActive' in body) {
    updates.status = body.isActive ? 'open' : 'cancelled';
  }

  // Update capacity
  if ('maxCapacity' in body) {
    const newCap = Number(body.maxCapacity);
    if (isNaN(newCap) || newCap < 1) {
      return Response.json(fail('INVALID_CAPACITY', '容量必須大於 0'), { status: 400 });
    }
    if (newCap < schedule.booked_count) {
      return Response.json(
        fail('CAPACITY_TOO_LOW', `容量不可低於已訂位人數（${schedule.booked_count}）`),
        { status: 400 },
      );
    }
    updates.capacity = newCap;
    // Auto-update status
    if (newCap <= schedule.booked_count) updates.status = 'full';
    else if (schedule.status === 'full') updates.status = 'open';
  }

  // Update guide note
  if ('guideNote' in body) {
    updates.guide_note = body.guideNote || null;
  }

  updates.updated_at = new Date().toISOString();

  const { data: updated, error: updateError } = await supabase
    .from('activity_schedules')
    .update(updates)
    .eq('id', scheduleId)
    .select()
    .single();

  if (updateError) {
    return Response.json(fail('SERVER_ERROR', updateError.message), { status: 500 });
  }

  return Response.json(ok(updated));
}
