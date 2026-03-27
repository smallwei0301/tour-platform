import { listExperiences as listInMemory, createOrder as createOrderInMemory } from './services.mjs';

function hasSupabaseEnv() {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function listExperiencesDb() {
  if (!hasSupabaseEnv()) return listInMemory();
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('experiences')
    .select('id, slug, title, price_twd')
    .order('slug', { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []).map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    priceTwd: r.price_twd
  }));
}

export async function createOrderDb(input) {
  if (!input?.experienceSlug) throw new Error('experienceSlug is required');

  if (!hasSupabaseEnv()) {
    return createOrderInMemory(input);
  }

  const supabase = await getSupabase();
  const { data: exp, error: expError } = await supabase
    .from('experiences')
    .select('id, slug, price_twd')
    .eq('slug', input.experienceSlug)
    .single();

  if (expError || !exp) throw new Error('experience not found');

  const payload = {
    id: crypto.randomUUID(),
    experience_id: exp.id,
    customer_name: input.customerName || 'Guest',
    status: 'pending_payment',
    total_twd: exp.price_twd
  };

  const { data: inserted, error: orderError } = await supabase
    .from('orders')
    .insert(payload)
    .select('id, status, total_twd, experience_id')
    .single();

  if (orderError || !inserted) throw new Error(orderError?.message || 'order create failed');

  return {
    id: inserted.id,
    status: inserted.status,
    totalTwd: inserted.total_twd,
    experienceId: inserted.experience_id,
    experienceSlug: exp.slug
  };
}
