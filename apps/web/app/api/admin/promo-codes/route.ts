/**
 * GET  /api/admin/promo-codes — list all promo codes
 * POST /api/admin/promo-codes — create a new promo code
 *
 * Authentication: admin cookie session (isAdminAuthorized pattern)
 * Issue #353: Promo codes backend
 */
import { NextRequest, NextResponse } from 'next/server';
import { ok, fail } from '../../../../src/lib/api';
import { isAdminAuthorized } from '../../../../src/lib/admin-auth.mjs';
import { getAdminSecurityState, getRequiredAdminToken } from '../../../../src/lib/admin-session.mjs';

// ── Auth guard ─────────────────────────────────────────────────────────────────

function parseCookie(req: NextRequest, key: string): string {
  const cookie = req.headers.get('cookie') || '';
  const parts = cookie.split(';').map((s) => s.trim());
  const hit = parts.find((p) => p.startsWith(`${key}=`));
  return hit ? decodeURIComponent(hit.slice(key.length + 1)) : '';
}

function checkAdminAuth(req: NextRequest): { ok: boolean; reason?: string } {
  const token = parseCookie(req, 'admin_token');
  const email = parseCookie(req, 'admin_email');
  const expiresAt = parseCookie(req, 'admin_session_expires_at');
  const sessionVersion = Number(parseCookie(req, 'admin_session_version') || 0);

  const security = getAdminSecurityState();
  return isAdminAuthorized({
    token,
    email,
    expiresAt,
    requiredToken: getRequiredAdminToken(process.env.ADMIN_ACCESS_TOKEN),
    allowlistRaw: process.env.ADMIN_EMAIL_ALLOWLIST,
    expectedSessionVersion: security.sessionVersion,
    sessionVersion,
  });
}

// ── Supabase client ────────────────────────────────────────────────────────────

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ── GET /api/admin/promo-codes ─────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = checkAdminAuth(req);
  if (!auth.ok) {
    return NextResponse.json(fail('UNAUTHORIZED', auth.reason || 'unauthorized'), { status: 401 });
  }

  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from('promo_codes')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json(fail('SERVER_ERROR', error.message), { status: 500 });
    }

    return NextResponse.json(ok(data ?? []));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}

// ── POST /api/admin/promo-codes ────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = checkAdminAuth(req);
  if (!auth.ok) {
    return NextResponse.json(fail('UNAUTHORIZED', auth.reason || 'unauthorized'), { status: 401 });
  }

  const body = await req.json().catch(() => ({}));

  const rawCode = String(body?.code || '');
  if (!rawCode) {
    return NextResponse.json(fail('INVALID_REQUEST', 'code is required'), { status: 400 });
  }

  // Normalize code: UPPER + TRIM
  const code = rawCode.toUpperCase().trim();

  const discountType = String(body?.discount_type || '');
  if (!['percentage', 'fixed'].includes(discountType)) {
    return NextResponse.json(
      fail('INVALID_REQUEST', 'discount_type must be percentage or fixed'),
      { status: 400 }
    );
  }

  const discountValue = Number(body?.discount_value);
  if (!Number.isFinite(discountValue) || discountValue <= 0) {
    return NextResponse.json(
      fail('INVALID_REQUEST', 'discount_value must be a positive number'),
      { status: 400 }
    );
  }

  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from('promo_codes')
      .insert({
        code,
        discount_type: discountType,
        discount_value: discountValue,
        max_uses:       Number.isFinite(Number(body?.max_uses))  ? Number(body.max_uses)  : 100,
        expires_at:     body?.expires_at ?? null,
        active:         body?.active !== false,
        per_user_limit: Number.isFinite(Number(body?.per_user_limit)) ? Number(body.per_user_limit) : 1,
      })
      .select()
      .single();

    if (error) {
      // 23505 = unique_violation
      if (error.code === '23505') {
        return NextResponse.json(
          fail('CONFLICT', `promo code '${code}' already exists`),
          { status: 409 }
        );
      }
      return NextResponse.json(fail('SERVER_ERROR', error.message), { status: 500 });
    }

    return NextResponse.json(ok(data), { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}
