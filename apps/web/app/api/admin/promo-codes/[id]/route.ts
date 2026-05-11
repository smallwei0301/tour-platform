/**
 * PATCH  /api/admin/promo-codes/[id] — update promo code fields
 * DELETE /api/admin/promo-codes/[id] — deactivate or remove promo code
 *
 * Authentication: admin cookie session (isAdminAuthorized pattern)
 * Issue #353: Promo codes backend
 */
import { NextRequest, NextResponse } from 'next/server';
import { ok, fail } from '../../../../../src/lib/api';
import { isAdminAuthorized } from '../../../../../src/lib/admin-auth.mjs';
import { getAdminSecurityState, getRequiredAdminToken } from '../../../../../src/lib/admin-session.mjs';

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

// ── PATCH /api/admin/promo-codes/[id] ─────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = checkAdminAuth(req);
  if (!auth.ok) {
    return NextResponse.json(fail('UNAUTHORIZED', auth.reason || 'unauthorized'), { status: 401 });
  }

  const { id } = await context.params;
  const body = await req.json().catch(() => ({}));

  // Build update payload — only include provided fields
  const patch: Record<string, unknown> = {};

  if (body?.code !== undefined) {
    // Normalize code: UPPER + TRIM
    patch.code = String(body.code).toUpperCase().trim();
  }
  if (body?.discount_type !== undefined) {
    const dt = String(body.discount_type);
    if (!['percentage', 'fixed'].includes(dt)) {
      return NextResponse.json(
        fail('INVALID_REQUEST', 'discount_type must be percentage or fixed'),
        { status: 400 }
      );
    }
    patch.discount_type = dt;
  }
  if (body?.discount_value !== undefined) {
    const dv = Number(body.discount_value);
    if (!Number.isFinite(dv) || dv <= 0) {
      return NextResponse.json(
        fail('INVALID_REQUEST', 'discount_value must be a positive number'),
        { status: 400 }
      );
    }
    patch.discount_value = dv;
  }
  if (body?.max_uses !== undefined) patch.max_uses = Number(body.max_uses);
  if (body?.expires_at !== undefined) patch.expires_at = body.expires_at ?? null;
  if (body?.active !== undefined) patch.active = Boolean(body.active);
  if (body?.per_user_limit !== undefined) patch.per_user_limit = Number(body.per_user_limit);

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(fail('INVALID_REQUEST', 'no fields to update'), { status: 400 });
  }

  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from('promo_codes')
      .update(patch)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          fail('CONFLICT', 'promo code already exists'),
          { status: 409 }
        );
      }
      if (error.code === 'PGRST116') {
        return NextResponse.json(fail('NOT_FOUND', 'promo code not found'), { status: 404 });
      }
      return NextResponse.json(fail('SERVER_ERROR', error.message), { status: 500 });
    }

    if (!data) {
      return NextResponse.json(fail('NOT_FOUND', 'promo code not found'), { status: 404 });
    }

    return NextResponse.json(ok(data));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}

// ── DELETE /api/admin/promo-codes/[id] ────────────────────────────────────────

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = checkAdminAuth(req);
  if (!auth.ok) {
    return NextResponse.json(fail('UNAUTHORIZED', auth.reason || 'unauthorized'), { status: 401 });
  }

  const { id } = await context.params;

  try {
    const supabase = await getSupabase();

    // Soft delete: deactivate first; then hard delete if query param ?hard=true
    const url = new URL(req.url);
    const hard = url.searchParams.get('hard') === 'true';

    if (hard) {
      const { error } = await supabase
        .from('promo_codes')
        .delete()
        .eq('id', id);

      if (error) {
        return NextResponse.json(fail('SERVER_ERROR', error.message), { status: 500 });
      }
      return NextResponse.json(ok({ deleted: true, id }));
    }

    // Default: soft deactivate
    const { data, error } = await supabase
      .from('promo_codes')
      .update({ active: false })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(fail('NOT_FOUND', 'promo code not found'), { status: 404 });
      }
      return NextResponse.json(fail('SERVER_ERROR', error.message), { status: 500 });
    }

    if (!data) {
      return NextResponse.json(fail('NOT_FOUND', 'promo code not found'), { status: 404 });
    }

    return NextResponse.json(ok({ deactivated: true, ...data }));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}
