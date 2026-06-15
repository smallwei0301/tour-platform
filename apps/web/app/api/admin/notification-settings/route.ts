/**
 * GET   /api/admin/notification-settings — current matrix + dimensions
 * PATCH /api/admin/notification-settings — { cells: [{event,recipient,channel,enabled}] }
 *
 * The admin back-office notification matrix (#920): per order event, decide
 * which audience (traveler / guide / admin) is notified on which channel
 * (LINE / Telegram). Delegates to the notification-settings gateway, which
 * handles the Supabase singleton row / in-memory fallback.
 *
 * Authentication: admin cookie session (isAdminAuthorized pattern).
 */
import { NextRequest, NextResponse } from 'next/server';
import { ok, fail } from '../../../../src/lib/api';
import { isAdminAuthorized, pickAdminCredentials } from '../../../../src/lib/admin-auth.mjs';
import { getAdminSecurityState, getRequiredAdminToken } from '../../../../src/lib/admin-session.mjs';
import {
  NOTIFY_EVENTS,
  NOTIFY_RECIPIENTS,
  NOTIFY_CHANNELS,
  getNotificationMatrix,
  setNotificationCells,
} from '../../../../src/lib/notification-settings.mjs';

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

const DIMENSIONS = {
  events: NOTIFY_EVENTS,
  recipients: NOTIFY_RECIPIENTS,
  channels: NOTIFY_CHANNELS,
};

export async function GET(req: NextRequest) {
  const auth = checkAdminAuth(req);
  if (!auth.ok) {
    return NextResponse.json(fail('UNAUTHORIZED', auth.reason || 'unauthorized'), { status: 401 });
  }
  try {
    const matrix = await getNotificationMatrix();
    return NextResponse.json(ok({ matrix, dimensions: DIMENSIONS }));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}

interface CellInput {
  event?: unknown;
  recipient?: unknown;
  channel?: unknown;
  enabled?: unknown;
}

export async function PATCH(req: NextRequest) {
  const auth = checkAdminAuth(req);
  if (!auth.ok) {
    return NextResponse.json(fail('UNAUTHORIZED', auth.reason || 'unauthorized'), { status: 401 });
  }

  let body: { cells?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(fail('BAD_REQUEST', 'invalid JSON body'), { status: 400 });
  }

  const rawCells = Array.isArray(body?.cells) ? (body.cells as CellInput[]) : null;
  if (!rawCells) {
    return NextResponse.json(fail('BAD_REQUEST', 'cells must be an array'), { status: 400 });
  }

  const cells = rawCells
    .map((c) => ({
      event: String(c?.event ?? ''),
      recipient: String(c?.recipient ?? ''),
      channel: String(c?.channel ?? ''),
      enabled: !!c?.enabled,
    }))
    .filter(
      (c) =>
        NOTIFY_EVENTS.includes(c.event) &&
        NOTIFY_RECIPIENTS.includes(c.recipient) &&
        NOTIFY_CHANNELS.includes(c.channel),
    );

  if (cells.length === 0) {
    return NextResponse.json(fail('BAD_REQUEST', 'no valid cells to update'), { status: 400 });
  }

  try {
    const actor = pickAdminCredentials(req).email || 'admin';
    await setNotificationCells(cells, { actor });
    const matrix = await getNotificationMatrix();
    return NextResponse.json(ok({ matrix, dimensions: DIMENSIONS }));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}
