import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { errorV2, ok } from '../../../../../src/lib/api';
// 健檢 v2 S1：收斂本地複製的 SHA-256 hashPassword → 共用 guide-auth 的 scrypt 實作
import { hashPassword } from '../../../../../src/lib/guide-auth';
import { classifyGuideAccountUpdateError } from '../../../../../src/lib/guide-account-error.mjs';
import {
  deleteGuideProfileDb,
  deleteGuideApplicationDb,
} from '../../../../../src/lib/db-guide-delete.mjs';
import { localizeRevalidationPaths } from '../../../../../src/lib/region-slug.mjs';
import { revalidateActivityPaths } from '../../../../../src/lib/revalidate-activity.mjs';
import { getSupabaseUrl, getSupabaseServiceRoleKey } from '../../../../../src/config/supabase-service-env.mjs';

/**
 * GET /api/admin/guides/:guideId
 * Dual-entity resolver: the admin UI links both guide PROFILES
 * (guide_profiles.id) and guide APPLICATIONS (guide_applications.id) to
 * this detail URL. The two tables have separate id spaces (promote
 * creates the profile with a NEW id), so resolving only guide_profiles
 * made every application card 404 with 「找不到導遊資料」.
 *
 * Resolution order:
 *   1. guide_profiles by id   → kind:'profile'  (fields unchanged, additive kind)
 *   2. guide_applications by id → kind:'application' + application payload
 *   3. neither → 404 with a message that says both sources were checked.
 * Auth via middleware.
 */
export async function GET(
  _req: Request,
  context: { params: Promise<{ guideId: string }> }
) {
  const { guideId } = await context.params;
  if (!guideId) {
    return NextResponse.json(errorV2('BAD_REQUEST', 'guideId is required'), { status: 400 });
  }
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      getSupabaseUrl()!,
      getSupabaseServiceRoleKey()!
    );
    const isMissingColumn = (e: { code?: string; message?: string } | null) =>
      !!e && (e.code === '42703' || /column .*does not exist/i.test(e.message || ''));

    // guide_profiles：rich select 含 bio/specialties；若欄位漂移則退回 base select，
    // 避免整筆查詢因單一缺欄而失敗、被誤判成「找不到導遊」而 404。
    // （#fix：原本 select 了不存在的單數 `specialty`，導致所有已上線導遊詳情頁 404。）
    const profileRichSelect = 'id, display_name, slug, verification_status, headline, region, rating_avg, guide_email, profile_photo_url, bio, specialties, created_at';
    const profileBaseSelect = 'id, display_name, slug, verification_status, headline, region, rating_avg, guide_email, profile_photo_url, created_at';
    let { data: profile, error: profileError } = await supabase
      .from('guide_profiles')
      .select(profileRichSelect)
      .eq('id', guideId)
      .maybeSingle();
    if (isMissingColumn(profileError)) {
      ({ data: profile } = await supabase
        .from('guide_profiles')
        .select(profileBaseSelect)
        .eq('id', guideId)
        .maybeSingle());
    }
    if (profile) {
      return NextResponse.json({ ok: true, data: { kind: 'profile', ...profile } });
    }

    const appBaseSelect = 'id, full_name, phone, email, city, bio, status, admin_note, created_at, updated_at';
    const appRichSelectV1 = `${appBaseSelect}, specialties, languages, regions, certifications, payment_method, profile_photo_url, hero_image_url, gallery_urls`;
    const appRichSelectV2 = `${appRichSelectV1}, payment_methods`;
    // Schema drift guard（三層）：payment_methods（20260623）→ 其餘 rich（20260610）→ base。
    let { data: application, error: appError } = await supabase
      .from('guide_applications')
      .select(appRichSelectV2)
      .eq('id', guideId)
      .maybeSingle();
    if (isMissingColumn(appError)) {
      ({ data: application, error: appError } = await supabase
        .from('guide_applications')
        .select(appRichSelectV1)
        .eq('id', guideId)
        .maybeSingle());
    }
    if (isMissingColumn(appError)) {
      ({ data: application, error: appError } = await supabase
        .from('guide_applications')
        .select(appBaseSelect)
        .eq('id', guideId)
        .maybeSingle());
    }
    if (application) {
      const arr = (value: unknown) => (Array.isArray(value) ? value : []);
      return NextResponse.json({
        ok: true,
        data: {
          kind: 'application',
          id: application.id,
          display_name: application.full_name,
          application: {
            fullName: application.full_name,
            phone: application.phone,
            email: application.email,
            city: application.city,
            bio: application.bio,
            specialties: arr(application.specialties),
            languages: arr(application.languages),
            regions: arr(application.regions),
            certifications: arr(application.certifications),
            paymentMethod: application.payment_method ?? null,
            paymentMethods: (() => {
              const list = arr((application as Record<string, unknown>).payment_methods);
              if (list.length) return list;
              return application.payment_method ? [application.payment_method] : [];
            })(),
            profilePhotoUrl: application.profile_photo_url ?? null,
            heroImageUrl: application.hero_image_url ?? null,
            galleryUrls: arr(application.gallery_urls),
            status: application.status,
            adminNote: application.admin_note,
            createdAt: application.created_at,
            updatedAt: application.updated_at,
          },
        },
      });
    }

    return NextResponse.json(
      errorV2('NOT_FOUND', '找不到導遊資料：此 ID 不屬於任何導遊檔案或導遊申請'),
      { status: 404 }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'SERVER_ERROR';
    return NextResponse.json(errorV2('SERVER_ERROR', msg), { status: 500 });
  }
}

/**
 * PATCH /api/admin/guides/:guideId
 * Update guide email and/or reset password. Auth via middleware.
 */
export async function PATCH(
  req: Request,
  context: { params: Promise<{ guideId: string }> }
) {
  const { guideId } = await context.params;
  if (!guideId) {
    return NextResponse.json(errorV2('BAD_REQUEST', 'guideId is required'), { status: 400 });
  }

  const body = await req.json().catch(() => ({})) as Record<string, string>;
  const { email, password } = body;

  if (!email && !password) {
    return NextResponse.json(
      errorV2('BAD_REQUEST', '請提供 email 或 password'),
      { status: 400 }
    );
  }

  if (password && password.length < 6) {
    return NextResponse.json(
      errorV2('INVALID_PASSWORD', '密碼至少 6 個字元'),
      { status: 400 }
    );
  }

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      getSupabaseUrl()!,
      getSupabaseServiceRoleKey()!
    );

    // Verify guide exists and is approved
    const { data: guide, error: fetchError } = await supabase
      .from('guide_profiles')
      .select('id, display_name, guide_email, verification_status, guide_session_version')
      .eq('id', guideId)
      .single();

    if (fetchError || !guide) {
      return NextResponse.json(errorV2('NOT_FOUND', 'Guide not found'), { status: 404 });
    }

    // Build update payload
    const updates: Record<string, unknown> = {};
    if (email) {
      updates.guide_email = email.toLowerCase().trim();
    }
    if (password) {
      updates.guide_password_hash = hashPassword(password);
      // Bump session version to invalidate existing sessions.
      // 先前的 fetch 沒 select guide_session_version，導致這裡永遠讀到
      // undefined、每次都被重設成 2（無法真正遞增）。改為 select 出來後 +1。
      const currentVersion = Number((guide as Record<string, unknown>).guide_session_version) || 1;
      updates.guide_session_version = currentVersion + 1;
    }

    const { error: updateError } = await supabase
      .from('guide_profiles')
      .update(updates)
      .eq('id', guideId);

    if (updateError) throw updateError;

    return NextResponse.json({
      ok: true,
      data: {
        id: guideId,
        displayName: guide.display_name,
        emailUpdated: !!email,
        passwordUpdated: !!password,
        sessionsInvalidated: !!password,
      }
    });
  } catch (err: unknown) {
    // Supabase 的 PostgrestError 是純物件（非 Error 實例），過去直接
    // `err instanceof Error ? err.message : 'SERVER_ERROR'` 會吞掉真正訊息、
    // 也讓 unique(email) 衝突無法被辨識成 EMAIL_TAKEN。改用共用分類器。
    const { code, message, status } = classifyGuideAccountUpdateError(err);
    return NextResponse.json(errorV2(code, message), { status });
  }
}

/**
 * DELETE /api/admin/guides/:guideId
 * 雙實體解析（鏡射 GET）：先試 guide_profiles、NOT_FOUND 再試 guide_applications。
 * profile 有訂單／撥款紀錄時回 409 GUIDE_HAS_RECORDS（附各表筆數），
 * 建議改用停權 — 對應 DB 層 RESTRICT 外鍵的友善化。
 * Auth + CSRF via middleware（DELETE 已在 mutation 清單，middleware.ts:114）。
 */
export async function DELETE(
  _req: Request,
  context: { params: Promise<{ guideId: string }> }
) {
  const { guideId } = await context.params;
  if (!guideId) {
    return NextResponse.json(errorV2('BAD_REQUEST', 'guideId is required'), { status: 400 });
  }

  try {
    const profileRes = await deleteGuideProfileDb(guideId);

    if (profileRes.ok && profileRes.deleted) {
      const deleted = profileRes.deleted;
      // Revalidate 公開頁（仿 suspend route）：導遊列表／個人頁＋每個被刪活動頁。
      try {
        const paths = ['/guides', '/activities'];
        if (deleted.slug) paths.push(`/guides/${deleted.slug}`);
        for (const p of localizeRevalidationPaths(paths)) revalidatePath(p);
        for (const a of deleted.activities) {
          revalidateActivityPaths({ region: a.region, regionSlug: a.regionSlug, slug: a.slug });
        }
      } catch (revalidateErr) {
        console.warn('[guide-delete] revalidate failed:', revalidateErr);
      }
      return NextResponse.json(ok({ kind: 'profile', ...deleted }));
    }

    if (profileRes.code === 'GUIDE_HAS_RECORDS') {
      // 標準 errorV2 envelope（error-envelope-phase1 規範）＋ 附 counts 供 UI 顯示筆數。
      const envelope = errorV2(
        'GUIDE_HAS_RECORDS',
        '此導遊已有訂單或撥款紀錄，無法刪除。建議改用「停權帳號」，保留歷史紀錄。'
      );
      return NextResponse.json(
        { ...envelope, error: { ...envelope.error, counts: profileRes.counts } },
        { status: 409 }
      );
    }

    // profile NOT_FOUND → 試 application（兩表 id 空間分離，見 GET 註解）。
    const appRes = await deleteGuideApplicationDb(guideId);
    if (appRes.ok) {
      return NextResponse.json(ok({ kind: 'application', ...appRes.deleted }));
    }

    return NextResponse.json(
      errorV2('NOT_FOUND', '找不到導遊資料：此 ID 不屬於任何導遊檔案或導遊申請'),
      { status: 404 }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'SERVER_ERROR';
    return NextResponse.json(errorV2('SERVER_ERROR', msg), { status: 500 });
  }
}
