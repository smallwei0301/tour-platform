import { NextResponse } from 'next/server';
import { generateInviteToken } from '../../../../../src/lib/guide-auth';
import { errorV2 } from '../../../../../src/lib/api';
import { normalizeRegionToDbValue } from '../../../../../src/lib/region-slugs.mjs';
import { getSupabaseUrl, getSupabaseServiceRoleKey } from '../../../../../src/config/supabase-service-env.mjs';

/**
 * POST /api/admin/guides/promote
 * Promote an approved guide_application to guide_profiles and generate invite token.
 * Auth via middleware.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as Record<string, string>;
  const { applicationId } = body;

  if (!applicationId) {
    return NextResponse.json(errorV2('BAD_REQUEST', 'applicationId required'), { status: 400 });
  }

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    getSupabaseUrl()!,
    getSupabaseServiceRoleKey()!,
  );

  // Fetch the application. Canonical guide_applications schema has
  // full_name (NOT name) and no slug column — selecting the old
  // name/slug columns errored on every promote against the real schema.
  // Rich profile fields (bio/city/specialties/languages) ride along so
  // 上線 can seed the public guide profile instead of a name-only shell.
  const appBaseSelect = 'id, full_name, email, phone, status, city, bio';
  const appRichSelectV1 = `${appBaseSelect}, specialties, languages, regions, certifications, payment_method, profile_photo_url, hero_image_url, gallery_urls`;
  const appRichSelectV2 = `${appRichSelectV1}, payment_methods`;
  const isMissingColumn = (e: { code?: string; message?: string } | null) =>
    !!e && (e.code === '42703' || /column .*does not exist/i.test(e.message || ''));
  // Schema drift guard（三層）：payment_methods（20260623）→ 其餘 rich（20260610）→ base。
  let { data: app, error: appErr } = await supabase
    .from('guide_applications')
    .select(appRichSelectV2)
    .eq('id', applicationId)
    .single();
  if (isMissingColumn(appErr)) {
    ({ data: app, error: appErr } = await supabase
      .from('guide_applications')
      .select(appRichSelectV1)
      .eq('id', applicationId)
      .single());
  }
  if (isMissingColumn(appErr)) {
    ({ data: app, error: appErr } = await supabase
      .from('guide_applications')
      .select(appBaseSelect)
      .eq('id', applicationId)
      .single());
  }

  if (appErr || !app) {
    return NextResponse.json(errorV2('NOT_FOUND', '申請資料不存在'), { status: 404 });
  }

  if (app.status !== 'approved') {
    return NextResponse.json(errorV2('INVALID_STATUS', '只有已通過審核的申請才能上線'), { status: 400 });
  }

  // Applications carry no slug; derive a deterministic one from the
  // application id so repeated promotes resolve to the same profile
  // (idempotency anchor for the existing-profile lookup below).
  const profileSlug = `guide-${String(app.id).replace(/-/g, '').slice(0, 12)}`;

  // Check if guide_profiles already exists for this application (by slug)
  const { data: existing } = await supabase
    .from('guide_profiles')
    .select('id, display_name')
    .eq('slug', profileSlug)
    .maybeSingle();

  let guideId: string;

  if (existing) {
    // Already promoted — just update to approved if not already
    await supabase
      .from('guide_profiles')
      .update({ verification_status: 'approved' })
      .eq('id', existing.id);
    guideId = existing.id;
  } else {
    // Create new guide_profiles entry
    const appRecord = app as Record<string, unknown>;
    // 熟悉區域統一存全名（高雄→高雄市），與行程地區格式一致；申請若存短名也正規化。
    const appRegions = Array.isArray(appRecord.regions)
      ? [...new Set((appRecord.regions as unknown[]).map((r) => normalizeRegionToDbValue(r)).filter(Boolean))]
      : [];
    const appPaymentMethods = Array.isArray(appRecord.payment_methods)
      ? appRecord.payment_methods as string[]
      : (appRecord.payment_method ? [appRecord.payment_method as string] : []);
    const newProfilePayload: Record<string, unknown> = {
      display_name: app.full_name,
      slug: profileSlug,
      verification_status: 'approved',
      // 上線即建檔但「不公開」：導遊登入後到公開頁調整內容、按「儲存
      // 並公開」才會出現在認識導遊列表。
      is_published: false,
      // 申請資料自動帶入公開導遊檔案；導遊上線後可在後台自行調整。
      bio: app.bio || null,
      // 熟悉區域：優先帶申請複選的 regions；單一文字 region 取首個以維持向後相容顯示。
      region: appRegions[0] || app.city || null,
      regions: appRegions,
      languages: Array.isArray(appRecord.languages) ? appRecord.languages : [],
      specialties: Array.isArray(appRecord.specialties) ? appRecord.specialties : [],
      certifications: Array.isArray(appRecord.certifications) ? appRecord.certifications : [],
      payment_methods: appPaymentMethods,
      // 申請時上傳的照片直接成為導遊檔案初始照片，首次登入後台即可見。
      profile_photo_url: appRecord.profile_photo_url || null,
      hero_image_url: appRecord.hero_image_url || null,
      gallery_urls: Array.isArray(appRecord.gallery_urls) ? appRecord.gallery_urls : [],
      // guide_email will be set separately by admin
    };
    // Schema drift guard（依 migration 由新到舊分批剝除）：
    //   regions/certifications/payment_methods → 20260623
    //   is_published → 20260611
    // production 尚未跑對應 migration 時剝掉該批欄位重試，promote 永不因新欄位 hard-fail。
    const DRIFT_OPTIONAL_BATCHES = [
      ['regions', 'certifications', 'payment_methods'],
      ['is_published'],
    ];
    let { data: newProfile, error: insertErr } = await supabase
      .from('guide_profiles')
      .insert(newProfilePayload)
      .select('id')
      .single();
    for (const batch of DRIFT_OPTIONAL_BATCHES) {
      if (!isMissingColumn(insertErr)) break;
      let stripped = false;
      for (const col of batch) {
        if (col in newProfilePayload) { delete newProfilePayload[col]; stripped = true; }
      }
      if (!stripped) continue;
      ({ data: newProfile, error: insertErr } = await supabase
        .from('guide_profiles')
        .insert(newProfilePayload)
        .select('id')
        .single());
    }

    if (insertErr || !newProfile) {
      return NextResponse.json(errorV2('SERVER_ERROR', insertErr?.message || '建立導遊資料失敗'), { status: 500 });
    }
    guideId = newProfile.id;
  }

  // Generate invite token
  const token = generateInviteToken();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  await supabase
    .from('guide_profiles')
    .update({ invite_token: token, invite_token_expires_at: expiresAt })
    .eq('id', guideId);

  const inviteUrl = `/guide/login?token=${token}`;

  return NextResponse.json({
    ok: true,
    data: {
      guideId,
      guideName: app.full_name,
      inviteUrl,
      token,
      expiresAt,
      wasExisting: !!existing,
    },
  });
}
