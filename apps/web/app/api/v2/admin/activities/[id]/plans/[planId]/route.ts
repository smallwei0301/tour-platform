import { hasSupabaseEnv, getSupabase } from '../../../../../../../../src/lib/db.mjs';
import { FALLBACK_PLANS, type Plan } from '../_store';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function success(data: unknown, status = 200) {
  return Response.json({ success: true, data }, { status });
}

function failure(code: string, message: string, status = 400) {
  return Response.json({ success: false, error: { code, message } }, { status });
}

function asSlug(input: string) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export async function PUT(req: Request, context: { params: Promise<{ id: string; planId: string }> }) {
  const { id, planId } = await context.params;
  if (!UUID_RE.test(id)) return failure('VALIDATION_ERROR', 'Invalid activityId', 400);
  if (!UUID_RE.test(planId)) return failure('VALIDATION_ERROR', 'Invalid planId', 400);

  const body = await req.json().catch(() => null);
  if (!body) return failure('VALIDATION_ERROR', 'Invalid JSON body', 400);

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString()
  };

  if (body.name !== undefined) patch.name = String(body.name || '').trim();
  if (body.slug !== undefined) patch.slug = asSlug(String(body.slug || ''));
  if (body.duration_minutes !== undefined) patch.duration_minutes = Number(body.duration_minutes || 0);
  if (body.price_type !== undefined) patch.price_type = String(body.price_type || '');
  if (body.base_price !== undefined) patch.base_price = Number(body.base_price || 0);
  if (body.min_participants !== undefined) patch.min_participants = Number(body.min_participants || 1);
  if (body.max_participants !== undefined) patch.max_participants = Number(body.max_participants || 10);
  if (body.booking_type !== undefined) patch.booking_type = String(body.booking_type || 'scheduled');
  if (body.status !== undefined) patch.status = String(body.status || 'inactive');

  try {
    if (hasSupabaseEnv()) {
      const supabase = await getSupabase();
      const { data, error } = await supabase
        .from('activity_plans')
        .update(patch)
        .eq('id', planId)
        .eq('activity_id', id)
        .select('id, activity_id, name, slug, duration_minutes, price_type, base_price, min_participants, max_participants, booking_type, status, created_at, updated_at')
        .maybeSingle();

      if (error) return failure('SERVER_ERROR', error.message, 500);
      if (!data) return failure('NOT_FOUND', 'plan not found', 404);
      return success({ plan: data });
    }

    const list = FALLBACK_PLANS[id] || [];
    const idx = list.findIndex((p) => p.id === planId);
    if (idx < 0) return failure('NOT_FOUND', 'plan not found', 404);
    list[idx] = { ...list[idx], ...patch } as Plan;
    FALLBACK_PLANS[id] = list;
    return success({ plan: list[idx] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return failure('SERVER_ERROR', message, 500);
  }
}

export async function DELETE(_req: Request, context: { params: Promise<{ id: string; planId: string }> }) {
  const { id, planId } = await context.params;
  if (!UUID_RE.test(id)) return failure('VALIDATION_ERROR', 'Invalid activityId', 400);
  if (!UUID_RE.test(planId)) return failure('VALIDATION_ERROR', 'Invalid planId', 400);

  try {
    if (hasSupabaseEnv()) {
      const supabase = await getSupabase();
      const { error } = await supabase
        .from('activity_plans')
        .update({ status: 'archived', updated_at: new Date().toISOString() })
        .eq('id', planId)
        .eq('activity_id', id);
      if (error) return failure('SERVER_ERROR', error.message, 500);
      return success({ archived: true });
    }

    const list = FALLBACK_PLANS[id] || [];
    const idx = list.findIndex((p) => p.id === planId);
    if (idx < 0) return failure('NOT_FOUND', 'plan not found', 404);
    list[idx] = { ...list[idx], status: 'archived', updated_at: new Date().toISOString() };
    FALLBACK_PLANS[id] = list;
    return success({ archived: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return failure('SERVER_ERROR', message, 500);
  }
}
