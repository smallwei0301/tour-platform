/**
 * LINE LIFF idToken verification + binding — Tour Platform (#302b)
 *
 * Replaces the "trust the query param" handoff. The client sends the LIFF
 * idToken; we verify it against LINE (audience = our login channel) and bind
 * the resulting lineUserId to the traveler (by email from the token, plus an
 * optional logged-in userId), so later order pushes can resolve a recipient.
 *
 * Thin wrapper: rate-limit + verify + upsert. Gated at the entry page by
 * NEXT_PUBLIC_LINE_LIFF_ENABLED (flag OFF → legacy query-param handoff).
 */

import { successV2, errorV2 } from '../../../../../src/lib/api';
import { limiters, RateLimiter, createRateLimitResponse } from '../../../../../src/lib/rate-limit';
import { verifyLiffIdToken } from '../../../../../src/lib/line-liff-verify.mjs';
import { upsertLineMapping } from '../../../../../src/lib/line-binding.mjs';

export async function POST(request: Request) {
  const clientIp = RateLimiter.getClientIp(request);
  const rateLimitResponse = createRateLimitResponse(limiters.lineAuth.check(clientIp));
  if (rateLimitResponse) return rateLimitResponse;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json(errorV2('VALIDATION_ERROR', 'invalid JSON body'), { status: 400 });
  }

  const idToken = typeof body?.idToken === 'string' ? body.idToken : '';
  if (!idToken) {
    return Response.json(errorV2('VALIDATION_ERROR', 'idToken is required'), { status: 400 });
  }

  const verified = await verifyLiffIdToken(idToken);
  if (!verified.ok) {
    return Response.json(errorV2('LINE_IDTOKEN_INVALID', verified.reason), { status: 401 });
  }

  // Bind the verified lineUserId to the traveler. Email comes from the token
  // (when the email scope is granted); userId may be supplied if the traveler
  // is also signed in to the site.
  const userId = typeof body?.userId === 'string' && body.userId.trim() ? body.userId.trim() : undefined;
  await upsertLineMapping({
    lineUserId: verified.lineUserId,
    userId,
    contactEmail: verified.email,
    displayName: verified.name,
  });

  return Response.json(
    successV2({ lineUserId: verified.lineUserId, bound: true }),
  );
}
