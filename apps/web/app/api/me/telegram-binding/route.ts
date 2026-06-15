// Traveler Telegram-binding endpoint (optional channel).
//
// GET  → current binding status for the signed-in traveler.
// POST → mint a one-time code + t.me deep link (CSRF enforced by middleware for
//        /api/me mutations). The webhook redeems `/start <code>` and binds
//        chat_id ↔ user. Resolution falls back to contact_email for guests.

import { ok, fail } from '../../../../src/lib/api';
import { createClient } from '../../../../src/lib/supabase/server';
import {
  createTelegramBindCode,
  getTelegramChatForTraveler,
} from '../../../../src/lib/telegram-binding.mjs';

function buildDeepLink(code: string): string | null {
  const bot = (process.env.TELEGRAM_BOT_USERNAME || '').replace(/^@/, '').trim();
  if (!bot) return null;
  return `https://t.me/${bot}?start=${encodeURIComponent(code)}`;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json(fail('UNAUTHORIZED', '請先登入'), { status: 401 });
  const chatId = await getTelegramChatForTraveler({ userId: user.id, contactEmail: user.email });
  return Response.json(ok({ bound: !!chatId }));
}

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json(fail('UNAUTHORIZED', '請先登入'), { status: 401 });

  const { code, expiresAt } = await createTelegramBindCode({
    role: 'traveler',
    subjectId: user.id,
    contactEmail: user.email,
  });
  const deepLink = buildDeepLink(code);
  return Response.json(ok({
    code,
    deepLink,
    expiresAt,
    instruction: deepLink
      ? '點開連結後按「START / 開始」即可開啟 Telegram 訂單通知。'
      : '請先加入訂單通知 bot，然後傳送：/start ' + code,
  }));
}
