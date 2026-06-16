// Traveler LINE-binding endpoint (#302b traveler binding).
//
// GET  → current LINE binding status for the signed-in traveler.
// POST → mint a one-time TBIND-XXXXXX code + a line.me deep link (CSRF enforced
//        by middleware for /api/me mutations). The webhook redeems the code and
//        binds line_user_id ↔ this traveler (user_id, contact_email fallback).
//
// No LINE secrets are needed to mint a code (the deep link is public), so this
// works regardless of the LINE_MESSAGING/PUSH kill-switches — only sending is
// gated by those flags + the notification matrix.

import { ok, fail } from '../../../../src/lib/api';
import { createClient } from '../../../../src/lib/supabase/server';
import {
  createTravelerLineBindCode,
  getLineUserIdForOrder,
} from '../../../../src/lib/line-binding.mjs';

/** Build the line.me deep link that opens the bot chat pre-filled with the code. */
function buildDeepLink(code: string): string | null {
  const basicId = (process.env.LINE_BOT_BASIC_ID || '').trim();
  if (!basicId) return null;
  return `https://line.me/R/oaMessage/${basicId}/?${encodeURIComponent(code)}`;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json(fail('UNAUTHORIZED', '請先登入'), { status: 401 });
  const lineUserId = await getLineUserIdForOrder({ userId: user.id, contactEmail: user.email });
  return Response.json(ok({ bound: !!lineUserId }));
}

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json(fail('UNAUTHORIZED', '請先登入'), { status: 401 });

  const { code, expiresAt } = await createTravelerLineBindCode({
    userId: user.id,
    contactEmail: user.email,
  });
  const deepLink = buildDeepLink(code);
  return Response.json(ok({
    code,
    deepLink,
    expiresAt,
    instruction: deepLink
      ? '點開連結後直接送出訊息即可完成 LINE 訂單通知綁定。'
      : '請先加入官方帳號好友，然後把這組綁定碼貼到聊天室送出：' + code,
  }));
}
