import { ok, fail } from '../../../../src/lib/api';
import { verifyGuideSession } from '../../../../src/lib/guide-auth';
import { validateCsrf } from '../../../../src/lib/csrf.mjs';

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

const EDITABLE_FIELDS = [
  'display_name',
  'bio',
  'region',
  'languages',
  'specialties',
  'headline',
  'profile_photo_url',
  'hero_image_url',
  'gallery_urls',
] as const;
type EditableField = typeof EDITABLE_FIELDS[number];

const GALLERY_MAX = 12;

export async function GET(req: Request) {
  const session = verifyGuideSession(req);
  if (!session) return Response.json(fail('UNAUTHORIZED', 'session required'), { status: 401 });

  if (!process.env.SUPABASE_URL) {
    return Response.json(ok({
      display_name: '', bio: '', region: '', languages: [], specialties: [], headline: '',
      profile_photo_url: null, hero_image_url: null, gallery_urls: [], slug: null,
    }));
  }

  const supabase = await getSupabase();
  const { data: gp, error } = await supabase
    .from('guide_profiles')
    .select('id, slug, display_name, bio, region, languages, specialties, headline, profile_photo_url, hero_image_url, gallery_urls')
    .eq('id', session.guideId)
    .single();

  if (error || !gp) return Response.json(fail('NOT_FOUND', 'guide profile not found'), { status: 404 });

  return Response.json(ok({
    display_name: gp.display_name ?? '',
    bio: gp.bio ?? '',
    region: gp.region ?? '',
    languages: gp.languages ?? [],
    specialties: gp.specialties ?? [],
    headline: gp.headline ?? '',
    profile_photo_url: gp.profile_photo_url ?? null,
    hero_image_url: gp.hero_image_url ?? null,
    gallery_urls: gp.gallery_urls ?? [],
    slug: gp.slug ?? null,
  }));
}

export async function PATCH(req: Request) {
  const session = verifyGuideSession(req);
  if (!session) return Response.json(fail('UNAUTHORIZED', 'session required'), { status: 401 });

  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json(fail('BAD_REQUEST', 'invalid JSON'), { status: 400 });
  }

  // Only allow known editable fields
  const update: Partial<Record<EditableField, unknown>> = {};
  for (const field of EDITABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      update[field] = body[field];
    }
  }

  // Validate types
  if (update.display_name !== undefined && (typeof update.display_name !== 'string' || (update.display_name as string).trim().length === 0)) {
    return Response.json(fail('BAD_REQUEST', 'display_name must be a non-empty string'), { status: 400 });
  }
  if (update.languages !== undefined && !Array.isArray(update.languages)) {
    return Response.json(fail('BAD_REQUEST', 'languages must be an array'), { status: 400 });
  }
  if (update.specialties !== undefined && !Array.isArray(update.specialties)) {
    return Response.json(fail('BAD_REQUEST', 'specialties must be an array'), { status: 400 });
  }
  // Image URLs: accept string (set) or null (clear); reject other shapes.
  for (const f of ['profile_photo_url', 'hero_image_url'] as const) {
    if (update[f] !== undefined && update[f] !== null && typeof update[f] !== 'string') {
      return Response.json(fail('BAD_REQUEST', `${f} must be a string or null`), { status: 400 });
    }
  }
  if (update.gallery_urls !== undefined) {
    if (!Array.isArray(update.gallery_urls)) {
      return Response.json(fail('BAD_REQUEST', 'gallery_urls must be an array'), { status: 400 });
    }
    if ((update.gallery_urls as unknown[]).length > GALLERY_MAX) {
      return Response.json(fail('BAD_REQUEST', `gallery_urls exceeds limit of ${GALLERY_MAX}`), { status: 400 });
    }
    if (!(update.gallery_urls as unknown[]).every((u) => typeof u === 'string')) {
      return Response.json(fail('BAD_REQUEST', 'gallery_urls must contain only strings'), { status: 400 });
    }
  }

  if (Object.keys(update).length === 0) {
    return Response.json(fail('BAD_REQUEST', 'no editable fields provided'), { status: 400 });
  }

  if (!process.env.SUPABASE_URL) {
    return Response.json(ok({ updated: true }));
  }

  const supabase = await getSupabase();

  // Verify guide owns this profile
  const { data: gp, error: gpErr } = await supabase
    .from('guide_profiles')
    .select('id')
    .eq('id', session.guideId)
    .single();

  if (gpErr || !gp) return Response.json(fail('NOT_FOUND', 'guide profile not found'), { status: 404 });

  const dbUpdate: Record<string, unknown> = { ...update, updated_at: new Date().toISOString() };
  const { error: updateErr } = await supabase
    .from('guide_profiles')
    .update(dbUpdate)
    .eq('id', session.guideId);

  if (updateErr) return Response.json(fail('INTERNAL_ERROR', updateErr.message), { status: 500 });

  return Response.json(ok({ updated: true }));
}
