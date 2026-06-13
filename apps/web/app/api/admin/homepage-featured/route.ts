/**
 * GET /api/admin/homepage-featured — 目前設定 + 可選行程目錄
 * PUT /api/admin/homepage-featured — { editorPickSlug, moreFeaturedSlugs } → 儲存並回傳更新後設定
 *
 * Authentication: admin cookie session（isAdminAuthorized pattern，比照 soft-launch route）
 * Mutation 受 middleware 的 double-submit CSRF 保護（/api/admin/**）。
 */
import { NextRequest, NextResponse } from 'next/server';
import { ok, fail } from '../../../../src/lib/api';
import { isAdminAuthorized, pickAdminCredentials } from '../../../../src/lib/admin-auth.mjs';
import { getAdminSecurityState, getRequiredAdminToken } from '../../../../src/lib/admin-session.mjs';
import { getHomepageFeaturedDb, setHomepageFeaturedDb } from '../../../../src/lib/db.mjs';
import { HOMEPAGE_DEFAULT_EDITOR_PICK, HOMEPAGE_MORE_FEATURED_LIMIT } from '../../../../src/lib/homepage-featured.mjs';
import { activities } from '../../../../src/fixtures/data';

export const dynamic = 'force-dynamic';

function checkAdminAuth(req: NextRequest): { ok: boolean; reason?: string } {
  const { token, email, expiresAt, sessionVersion, requireSession } = pickAdminCredentials(req);
  const security = getAdminSecurityState();
  return isAdminAuthorized({
    token,
    email,
    expiresAt,
    requiredToken: getRequiredAdminToken(process.env.ADMIN_ACCESS_TOKEN),
    allowlistRaw: process.env.ADMIN_EMAIL_ALLOWLIST,
    expectedSessionVersion: security.sessionVersion,
    sessionVersion: Number(sessionVersion || 0),
    requireSession,
  });
}

// 首頁模板目前以 fixtures 目錄渲染（與 LP 文案/本地圖片資產對應），
// 因此可選清單以 fixtures 為準 — 與首頁實際可渲染的範圍一致。
function listChoices() {
  return activities.map((a) => ({
    slug: a.slug,
    title: a.title,
    region: a.region,
    price: a.price,
    durationDisplay: a.durationDisplay,
  }));
}

export async function GET(req: NextRequest) {
  const auth = checkAdminAuth(req);
  if (!auth.ok) {
    return NextResponse.json(fail('UNAUTHORIZED', auth.reason || 'unauthorized'), { status: 401 });
  }

  try {
    const settings = await getHomepageFeaturedDb();
    return NextResponse.json(ok({
      settings,
      choices: listChoices(),
      defaults: {
        editorPickSlug: HOMEPAGE_DEFAULT_EDITOR_PICK,
        moreFeaturedLimit: HOMEPAGE_MORE_FEATURED_LIMIT,
      },
    }));
  } catch (e) {
    return NextResponse.json(fail('HOMEPAGE_FEATURED_READ_FAILED', e instanceof Error ? e.message : 'read failed'), { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const auth = checkAdminAuth(req);
  if (!auth.ok) {
    return NextResponse.json(fail('UNAUTHORIZED', auth.reason || 'unauthorized'), { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(fail('INVALID_JSON', 'request body must be JSON'), { status: 400 });
  }

  const { email } = pickAdminCredentials(req);
  const input = (body ?? {}) as { editorPickSlug?: string | null; moreFeaturedSlugs?: string[] };

  try {
    const settings = await setHomepageFeaturedDb({
      editorPickSlug: input.editorPickSlug ?? null,
      moreFeaturedSlugs: Array.isArray(input.moreFeaturedSlugs) ? input.moreFeaturedSlugs : [],
      validSlugs: activities.map((a) => a.slug),
      actor: email || 'admin',
    });
    return NextResponse.json(ok({ settings }));
  } catch (e) {
    const code = (e as { code?: string })?.code;
    const message = e instanceof Error ? e.message : 'write failed';
    if (code === 'HOMEPAGE_FEATURED_INVALID') {
      return NextResponse.json(fail('HOMEPAGE_FEATURED_INVALID', message), { status: 400 });
    }
    // 表不存在（migration 未套用）→ 503 + 可執行繁中訊息，讓 admin 知道下一步。
    if (code === 'HOMEPAGE_FEATURED_TABLE_MISSING') {
      return NextResponse.json(fail('HOMEPAGE_FEATURED_TABLE_MISSING', message), { status: 503 });
    }
    return NextResponse.json(fail('HOMEPAGE_FEATURED_WRITE_FAILED', message), { status: 500 });
  }
}
