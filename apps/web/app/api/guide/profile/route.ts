import { revalidatePath } from 'next/cache';
import { localizeRevalidationPaths } from '../../../../src/lib/region-slug.mjs';
import { ok, fail } from '../../../../src/lib/api';
import { verifyGuideSession } from '../../../../src/lib/guide-auth';
import { validateCsrf } from '../../../../src/lib/csrf.mjs';
import { isMissingColumnError } from '../../../../src/lib/schema-drift.mjs';
import { normalizeRegionToDbValue } from '../../../../src/lib/region-slugs.mjs';

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

const EDITABLE_FIELDS = [
  'display_name',
  'bio',
  'region',
  // 熟悉區域（複選）／專業證照／收款方式（複選）— 申請帶入、導遊可自行修改（20260623）。
  'regions',
  'certifications',
  'payment_methods',
  'languages',
  'specialties',
  'headline',
  'profile_photo_url',
  'hero_image_url',
  'gallery_urls',
  'is_published',
  // #1475 不公開匯款資訊（僅付款步驟揭露）
  'bank_name',
  'account_name',
  'account_number',
  'transfer_note',
] as const;
type EditableField = typeof EDITABLE_FIELDS[number];

// 較新且可能尚未在 production migrate 的欄位（42703 drift 時於 GET/PATCH 自動降級）。
const DRIFT_OPTIONAL_FIELDS = [
  'is_published', 'bank_name', 'account_name', 'account_number', 'transfer_note',
  'regions', 'certifications', 'payment_methods',
] as const;
// 陣列型可編輯欄位（PATCH 型別檢查與 GET 預設值共用）。
const ARRAY_FIELDS = ['languages', 'specialties', 'regions', 'certifications', 'payment_methods'] as const;

const GALLERY_MAX = 12;

export async function GET(req: Request) {
  const session = verifyGuideSession(req);
  if (!session) return Response.json(fail('UNAUTHORIZED', 'session required'), { status: 401 });

  if (!process.env.SUPABASE_URL) {
    return Response.json(ok({
      display_name: '', bio: '', region: '', languages: [], specialties: [], headline: '',
      regions: [], certifications: [], payment_methods: [],
      profile_photo_url: null, hero_image_url: null, gallery_urls: [], slug: null,
      is_published: false,
      bank_name: '', account_name: '', account_number: '', transfer_note: '',
    }));
  }

  const supabase = await getSupabase();
  const baseSelect = 'id, slug, display_name, bio, region, languages, specialties, headline, profile_photo_url, hero_image_url, gallery_urls';
  const richSelectV1 = `${baseSelect}, is_published, bank_name, account_name, account_number, transfer_note`;
  const richSelectV2 = `${richSelectV1}, regions, certifications, payment_methods`;
  // Schema drift guard（三層）：熟悉區域等（20260623）→ is_published／匯款（20260611+）→ base。
  let { data: gp, error } = await supabase
    .from('guide_profiles')
    .select(richSelectV2)
    .eq('id', session.guideId)
    .single();
  if (error && isMissingColumnError(error)) {
    ({ data: gp, error } = await supabase
      .from('guide_profiles')
      .select(richSelectV1)
      .eq('id', session.guideId)
      .single());
  }
  if (error && isMissingColumnError(error)) {
    ({ data: gp, error } = await supabase
      .from('guide_profiles')
      .select(baseSelect)
      .eq('id', session.guideId)
      .single());
  }

  if (error || !gp) return Response.json(fail('NOT_FOUND', 'guide profile not found'), { status: 404 });

  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  return Response.json(ok({
    display_name: gp.display_name ?? '',
    bio: gp.bio ?? '',
    region: gp.region ?? '',
    regions: arr(gp.regions),
    certifications: arr(gp.certifications),
    payment_methods: arr(gp.payment_methods),
    languages: gp.languages ?? [],
    specialties: gp.specialties ?? [],
    headline: gp.headline ?? '',
    profile_photo_url: gp.profile_photo_url ?? null,
    hero_image_url: gp.hero_image_url ?? null,
    gallery_urls: gp.gallery_urls ?? [],
    slug: gp.slug ?? null,
    is_published: gp.is_published ?? false,
    bank_name: gp.bank_name ?? '',
    account_name: gp.account_name ?? '',
    account_number: gp.account_number ?? '',
    transfer_note: gp.transfer_note ?? '',
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
  for (const f of ARRAY_FIELDS) {
    if (update[f] === undefined) continue;
    if (!Array.isArray(update[f])) {
      return Response.json(fail('BAD_REQUEST', `${f} must be an array`), { status: 400 });
    }
    if (!(update[f] as unknown[]).every((v) => typeof v === 'string')) {
      return Response.json(fail('BAD_REQUEST', `${f} must contain only strings`), { status: 400 });
    }
  }
  if (update.is_published !== undefined && typeof update.is_published !== 'boolean') {
    return Response.json(fail('BAD_REQUEST', 'is_published must be a boolean'), { status: 400 });
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
  // #1475 匯款資訊：接受字串（含空字串＝清空）或 null，拒絕其他型別。
  for (const f of ['bank_name', 'account_name', 'account_number', 'transfer_note'] as const) {
    if (update[f] !== undefined && update[f] !== null && typeof update[f] !== 'string') {
      return Response.json(fail('BAD_REQUEST', `${f} must be a string or null`), { status: 400 });
    }
  }

  if (Object.keys(update).length === 0) {
    return Response.json(fail('BAD_REQUEST', 'no editable fields provided'), { status: 400 });
  }

  if (!process.env.SUPABASE_URL) {
    return Response.json(ok({ updated: true }));
  }

  const supabase = await getSupabase();

  // Verify guide owns this profile; slug drives on-demand revalidation below.
  const { data: gp, error: gpErr } = await supabase
    .from('guide_profiles')
    .select('id, slug')
    .eq('id', session.guideId)
    .single();

  if (gpErr || !gp) return Response.json(fail('NOT_FOUND', 'guide profile not found'), { status: 404 });

  const dbUpdate: Record<string, unknown> = { ...update, updated_at: new Date().toISOString() };
  // 熟悉區域統一存全名（高雄→高雄市），與行程地區格式一致；即使前端傳短名也正規化落地。
  if (Array.isArray(dbUpdate.regions)) {
    dbUpdate.regions = [...new Set((dbUpdate.regions as unknown[]).map((r) => normalizeRegionToDbValue(r)).filter(Boolean))];
  }
  if (typeof dbUpdate.region === 'string' && dbUpdate.region) {
    dbUpdate.region = normalizeRegionToDbValue(dbUpdate.region);
  }
  let { error: updateErr } = await supabase
    .from('guide_profiles')
    .update(dbUpdate)
    .eq('id', session.guideId);
  // Schema drift guard: 較新欄位（is_published、#1475 匯款欄位）可能尚未在 production
  // migrate；缺欄位時 update 會回 42703。把這些 optional 欄位剝除後重試，讓其他內容
  // 仍能存檔（被剝除的欄位於 migration 套用前 no-op）。
  if (updateErr && isMissingColumnError(updateErr)) {
    let stripped = false;
    for (const f of DRIFT_OPTIONAL_FIELDS) {
      if (f in dbUpdate) {
        delete dbUpdate[f];
        stripped = true;
      }
    }
    if (stripped && Object.keys(dbUpdate).length > 1) {
      ({ error: updateErr } = await supabase
        .from('guide_profiles')
        .update(dbUpdate)
        .eq('id', session.guideId));
    } else if (stripped) {
      updateErr = null;
    }
  }

  if (updateErr) return Response.json(fail('INTERNAL_ERROR', updateErr.message), { status: 500 });

  // On-demand revalidation (事件觸發，非定時 ISR)：導遊存檔/發佈後精準
  // 失效公開頁，旅客下次刷新即見最新資料，平時零背景運算。
  try {
    // #1488：/guides 在 app/[locale]/，需帶各 locale 前綴才命中被快取的路由。
    const paths = ['/guides'];
    if (gp.slug) paths.push(`/guides/${gp.slug}`);
    for (const p of localizeRevalidationPaths(paths)) revalidatePath(p);
  } catch {
    // revalidation 失敗不應讓存檔失敗（例如非請求情境）。
  }

  return Response.json(ok({ updated: true }));
}
