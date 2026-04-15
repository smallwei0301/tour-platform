import { hasSupabaseEnv, getSupabase } from '../../../../../../../src/lib/db.mjs';
import { FALLBACK_PLANS, type Plan } from './_store';

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

function validPriceType(input: string) {
  return input === 'per_person' || input === 'per_group';
}

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!UUID_RE.test(id)) return failure('VALIDATION_ERROR', 'Invalid activityId', 400);

  try {
    const status = new URL(req.url).searchParams.get('status');

    if (hasSupabaseEnv()) {
      const supabase = await getSupabase();
      let query = supabase
        .from('activity_plans')
        .select('id, activity_id, name, slug, duration_minutes, price_type, base_price, min_participants, max_participants, booking_type, status, created_at, updated_at')
        .eq('activity_id', id)
        .order('created_at', { ascending: false });
      if (status && status !== 'all') query = query.eq('status', status);
      const { data, error } = await query;
      if (error) return failure('SERVER_ERROR', error.message, 500);
      return success({ activity: { id }, plans: data || [] });
    }

    const list = [...(FALLBACK_PLANS[id] || [])];
    const filtered = status && status !== 'all' ? list.filter((p) => p.status === status) : list;
    return success({ activity: { id }, plans: filtered });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return failure('SERVER_ERROR', message, 500);
  }
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!UUID_RE.test(id)) return failure('VALIDATION_ERROR', 'Invalid activityId', 400);

  const body = await req.json().catch(() => null);
  if (!body) return failure('VALIDATION_ERROR', 'Invalid JSON body', 400);

  const name = String(body.name || '').trim();
  if (!name) return failure('VALIDATION_ERROR', 'name is required', 400);

  const priceType = String(body.price_type || '');
  if (!validPriceType(priceType)) return failure('VALIDATION_ERROR', 'Invalid price_type', 400);

  const duration = Number(body.duration_minutes || 0);
  if (!Number.isFinite(duration) || duration < 15) {
    return failure('VALIDATION_ERROR', 'duration_minutes must be at least 15', 400);
  }

  const now = new Date().toISOString();
  const payload = {
    activity_id: id,
    name,
    slug: asSlug(String(body.slug || name)),
    duration_minutes: duration,
    price_type: priceType,
    base_price: Number(body.base_price || 0),
    min_participants: Number(body.min_participants || 1),
    max_participants: Number(body.max_participants || 10),
    booking_type: String(body.booking_type || 'scheduled'),
    status: String(body.status || 'active'),
    updated_at: now
  };

  try {
    if (hasSupabaseEnv()) {
      const supabase = await getSupabase();
      const { data, error } = await supabase
        .from('activity_plans')
        .insert(payload)
        .select('id, activity_id, name, slug, duration_minutes, price_type, base_price, min_participants, max_participants, booking_type, status, created_at, updated_at')
        .single();
      if (error) {
        if (String(error.code || '').includes('23505')) {
          return failure('CONFLICT', 'duplicate slug', 409);
        }
        return failure('SERVER_ERROR', error.message, 500);
      }
      return success({ plan: data }, 201);
    }

    const idPlan = crypto.randomUUID();
    const plan: Plan = {
      id: idPlan,
      created_at: now,
      ...payload
    } as Plan;
    if (!FALLBACK_PLANS[id]) FALLBACK_PLANS[id] = [];
    FALLBACK_PLANS[id].unshift(plan);
    return success({ plan }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return failure('SERVER_ERROR', message, 500);
  }
}
