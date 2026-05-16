/**
 * GET  /api/admin/soft-launch — return current soft-launch controls + whitelist count
 * POST /api/admin/soft-launch — { controlKey, toValue, reason } → setControl + return updated controls
 *
 * Authentication: admin cookie session (isAdminAuthorized pattern)
 * Issue #553: Soft-launch admin UI
 */
import { NextRequest, NextResponse } from 'next/server';
import { ok, fail } from '../../../../src/lib/api';
import { isAdminAuthorized } from '../../../../src/lib/admin-auth.mjs';
import { getAdminSecurityState, getRequiredAdminToken } from '../../../../src/lib/admin-session.mjs';
import { getControls, setControl } from '../../../../src/lib/soft-launch.mjs';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

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

// ── Supabase service client ────────────────────────────────────────────────────

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

// ── GET /api/admin/soft-launch ─────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = checkAdminAuth(req);
  if (!auth.ok) {
    return NextResponse.json(fail('UNAUTHORIZED', auth.reason || 'unauthorized'), { status: 401 });
  }

  try {
    const svc = getSupabase();
    const controls = await getControls(svc);

    // Whitelist entry count
    let whitelistCount = 0;
    const { count } = await svc
      .from('soft_launch_whitelist')
      .select('id', { count: 'exact', head: true });
    if (count != null) whitelistCount = count;

    return NextResponse.json(ok({ controls, whitelistCount }));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}

// ── POST /api/admin/soft-launch ────────────────────────────────────────────────

const VALID_CONTROL_KEYS = [
  'public_paused',
  'new_booking_paused',
  'refund_manual_only',
  'whitelist_enabled',
] as const;

type ControlKey = typeof VALID_CONTROL_KEYS[number];

export async function POST(req: NextRequest) {
  const auth = checkAdminAuth(req);
  if (!auth.ok) {
    return NextResponse.json(fail('UNAUTHORIZED', auth.reason || 'unauthorized'), { status: 401 });
  }

  let body: { controlKey?: unknown; toValue?: unknown; reason?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(fail('BAD_REQUEST', 'invalid JSON body'), { status: 400 });
  }

  const { controlKey, toValue, reason } = body;

  if (!controlKey || !VALID_CONTROL_KEYS.includes(controlKey as ControlKey)) {
    return NextResponse.json(
      fail('BAD_REQUEST', `controlKey must be one of: ${VALID_CONTROL_KEYS.join(', ')}`),
      { status: 400 }
    );
  }
  if (typeof toValue !== 'boolean') {
    return NextResponse.json(fail('BAD_REQUEST', 'toValue must be a boolean'), { status: 400 });
  }
  if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
    return NextResponse.json(fail('BAD_REQUEST', 'reason is required'), { status: 400 });
  }

  try {
    const svc = getSupabase();

    // Derive actor from email cookie (best effort)
    const actor = parseCookie(req, 'admin_email') || 'admin';

    await setControl(svc, {
      controlKey: controlKey as string,
      toValue: toValue as boolean,
      actor,
      reason: (reason as string).trim(),
      rollbackInstruction: null,
    });

    const controls = await getControls(svc);

    let whitelistCount = 0;
    const { count } = await svc
      .from('soft_launch_whitelist')
      .select('id', { count: 'exact', head: true });
    if (count != null) whitelistCount = count;

    return NextResponse.json(ok({ controls, whitelistCount }));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}
