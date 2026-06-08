/**
 * LINE Messaging API webhook — Tour Platform (#302b)
 *
 * Thin wrapper: per-IP rate limit + delegate to processLineWebhook (which does
 * x-line-signature verification, webhookEventId idempotency, and binding
 * upserts). Always responds 200 so LINE does not retry; events are only
 * *processed* when the signature is valid.
 */

import { limiters, RateLimiter, createRateLimitResponse } from '../../../../src/lib/rate-limit';
import { processLineWebhook } from '../../../../src/lib/line-webhook.mjs';

function ok200() {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

export async function POST(request: Request) {
  const clientIp = RateLimiter.getClientIp(request);
  const rateLimitResponse = createRateLimitResponse(limiters.lineWebhook.check(clientIp));
  if (rateLimitResponse) return rateLimitResponse;

  const raw = await request.text().catch(() => '');
  const signature = request.headers.get('x-line-signature');

  try {
    await processLineWebhook(raw, signature);
  } catch {
    // Swallow — always 200 to avoid LINE retries.
  }

  return ok200();
}
