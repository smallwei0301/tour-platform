/**
 * Telegram webhook — Tour Platform.
 *
 * Thin wrapper: per-IP rate limit + delegate to processTelegramUpdate (which
 * does X-Telegram-Bot-Api-Secret-Token verification, update_id idempotency, and
 * /start binding). Always responds 200 so Telegram does not retry; updates are
 * only *processed* when the secret matches.
 */

import { limiters, RateLimiter, createRateLimitResponse } from '../../../../src/lib/rate-limit';
import { processTelegramUpdate } from '../../../../src/lib/telegram-webhook.mjs';

function ok200() {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

export async function POST(request: Request) {
  const clientIp = RateLimiter.getClientIp(request);
  const rateLimitResponse = createRateLimitResponse(limiters.telegramWebhook.check(clientIp));
  if (rateLimitResponse) return rateLimitResponse;

  const raw = await request.text().catch(() => '');
  const secret = request.headers.get('x-telegram-bot-api-secret-token');

  try {
    await processTelegramUpdate(raw, secret);
  } catch {
    // Swallow — always 200 to avoid Telegram retries.
  }

  return ok200();
}
