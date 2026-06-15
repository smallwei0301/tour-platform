// Guide Telegram-binding console endpoint.
//
// GET  → current binding status for the signed-in guide.
// POST → mint a one-time code + t.me deep link the guide taps to open the bot
//        pre-filled with `/start <code>`; the webhook redeems it and binds
//        chat_id ↔ guide_id. No bot token needed to mint (the link is public).

import { ok, fail } from '../../../../src/lib/api';
import { verifyGuideSession } from '../../../../src/lib/guide-auth';
import { validateCsrf } from '../../../../src/lib/csrf.mjs';
import {
  createTelegramBindCode,
  getTelegramChatForGuide,
} from '../../../../src/lib/telegram-binding.mjs';

function buildDeepLink(code: string): string | null {
  const bot = (process.env.TELEGRAM_BOT_USERNAME || '').replace(/^@/, '').trim();
  if (!bot) return null;
  return `https://t.me/${bot}?start=${encodeURIComponent(code)}`;
}

export async function GET(req: Request) {
  const session = verifyGuideSession(req);
  if (!session) return Response.json(fail('UNAUTHORIZED', 'session required'), { status: 401 });
  const chatId = await getTelegramChatForGuide(session.guideId);
  return Response.json(ok({ bound: !!chatId }));
}

export async function POST(req: Request) {
  const session = verifyGuideSession(req);
  if (!session) return Response.json(fail('UNAUTHORIZED', 'session required'), { status: 401 });

  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const { code, expiresAt } = await createTelegramBindCode({ role: 'guide', subjectId: session.guideId });
  const deepLink = buildDeepLink(code);
  return Response.json(ok({
    code,
    deepLink,
    expiresAt,
    instruction: deepLink
      ? '點開連結後按「START / 開始」即可完成綁定。'
      : '請先加入訂單通知 bot，然後傳送：/start ' + code,
  }));
}
