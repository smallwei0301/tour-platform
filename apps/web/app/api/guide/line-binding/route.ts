// Guide LINE-binding console endpoint (#302b).
//
// GET  → current binding status for the signed-in guide.
// POST → mint a one-time BIND-XXXXXX code + a line.me deep link the guide taps
//        to open the bot chat pre-filled with the code. The webhook then
//        redeems the code and binds line_user_id ↔ guide_id.
//
// No LINE secrets are needed to mint a code (the deep link is public), so this
// works regardless of the LINE_MESSAGING/PUSH kill-switches.

import { ok, fail } from '../../../../src/lib/api';
import { verifyGuideSession } from '../../../../src/lib/guide-auth';
import { validateCsrf } from '../../../../src/lib/csrf.mjs';
import {
  createGuideBindCode,
  getGuideBinding,
} from '../../../../src/lib/guide-line-binding.mjs';

/** Build the line.me deep link that opens the bot chat pre-filled with the code. */
function buildDeepLink(code: string): string | null {
  const basicId = (process.env.LINE_BOT_BASIC_ID || '').trim();
  if (!basicId) return null;
  return `https://line.me/R/oaMessage/${basicId}/?${encodeURIComponent(code)}`;
}

function maskLineUserId(lineUserId: string | null): string | null {
  if (!lineUserId) return null;
  return lineUserId.length <= 6 ? '***' : `${lineUserId.slice(0, 5)}…${lineUserId.slice(-3)}`;
}

export async function GET(req: Request) {
  const session = verifyGuideSession(req);
  if (!session) return Response.json(fail('UNAUTHORIZED', 'session required'), { status: 401 });

  const binding = await getGuideBinding(session.guideId);
  const bound = !!binding && !binding.isBlocked;
  return Response.json(ok({
    bound,
    blocked: !!binding?.isBlocked,
    lineUserId: maskLineUserId(binding?.lineUserId ?? null),
    displayName: binding?.displayName ?? null,
    boundAt: binding?.boundAt ?? null,
  }));
}

export async function POST(req: Request) {
  const session = verifyGuideSession(req);
  if (!session) return Response.json(fail('UNAUTHORIZED', 'session required'), { status: 401 });

  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const { code, expiresAt } = await createGuideBindCode(session.guideId);
  const deepLink = buildDeepLink(code);
  return Response.json(ok({
    code,
    deepLink,
    expiresAt,
    // Fallback instruction when no deep link (LINE_BOT_BASIC_ID unset): the guide
    // adds the bot and sends the code manually.
    instruction: deepLink
      ? '點開連結後直接送出訊息即可完成綁定。'
      : '請先加入官方帳號好友，然後把這組綁定碼貼到聊天室送出。',
  }));
}
