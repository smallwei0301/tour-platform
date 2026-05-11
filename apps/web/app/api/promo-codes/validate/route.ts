/**
 * POST /api/promo-codes/validate
 *
 * Validates a promo code for an authenticated user and returns discount details.
 * Does NOT redeem the code — redemption happens at checkout via fn_redeem_promo_code.
 *
 * Authentication: Supabase session (user must be logged in → 401 otherwise)
 * Rate limit: 10 requests / minute per IP (IP-based)
 * Issue #353: Promo codes backend
 */
import { NextRequest, NextResponse } from 'next/server';
import { fail } from '../../../../src/lib/api';
import { RateLimiter } from '../../../../src/lib/rate-limit';
import { calculateDiscount } from '../../../../src/lib/promo-discount';

// Re-export for backwards-compat / convenience
export { calculateDiscount };

// ── Rate limiter: 10 req/min per IP ───────────────────────────────────────────
const promoValidateLimiter = new RateLimiter(10, 60 * 1000);

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Rate limit check (IP-based)
  const ip = RateLimiter.getClientIp(req);
  const rateLimitResult = promoValidateLimiter.check(ip);
  if (!rateLimitResult.allowed) {
    const retryAfter = Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000);
    return new NextResponse(
      JSON.stringify({ error: 'TOO_MANY_REQUESTS', message: 'Rate limit exceeded', retryAfter }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(retryAfter),
          'X-RateLimit-Limit': String(rateLimitResult.maxRequests),
          'X-RateLimit-Remaining': String(rateLimitResult.remaining),
          'X-RateLimit-Reset': String(rateLimitResult.resetAt),
        },
      }
    );
  }

  // Auth check: require Supabase session
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Extract auth token from Authorization header or cookie
  const authHeader = req.headers.get('authorization') || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  let userId: string | null = null;

  if (bearerToken) {
    const { data: { user }, error } = await supabase.auth.getUser(bearerToken);
    if (!error && user) {
      userId = user.id;
    }
  }

  if (!userId) {
    return NextResponse.json(
      fail('UNAUTHORIZED', 'authentication required'),
      { status: 401 }
    );
  }

  // Parse body
  const body = await req.json().catch(() => ({}));
  const rawCode = String(body?.code || '').toUpperCase().trim();
  const originalTotal = Number(body?.originalTotal ?? 0);

  if (!rawCode) {
    return NextResponse.json(fail('INVALID_REQUEST', 'code is required'), { status: 400 });
  }

  try {
    // Look up promo code
    const { data: promo, error: promoError } = await supabase
      .from('promo_codes')
      .select('id, code, discount_type, discount_value, max_uses, used_count, expires_at, active, per_user_limit')
      .eq('code', rawCode)
      .single();

    if (promoError || !promo) {
      return NextResponse.json({
        valid: false,
        reason: 'NOT_FOUND',
        discountAmount: 0,
        discountedTotal: originalTotal,
      });
    }

    // Validate: active check
    if (!promo.active) {
      return NextResponse.json({
        valid: false,
        reason: 'INACTIVE',
        discountAmount: 0,
        discountedTotal: originalTotal,
      });
    }

    // Validate: expiry check
    if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
      return NextResponse.json({
        valid: false,
        reason: 'EXPIRED',
        discountAmount: 0,
        discountedTotal: originalTotal,
      });
    }

    // Validate: usage limit
    if (promo.used_count >= promo.max_uses) {
      return NextResponse.json({
        valid: false,
        reason: 'EXHAUSTED',
        discountAmount: 0,
        discountedTotal: originalTotal,
      });
    }

    // Validate: per-user limit
    const { count: userRedemptions } = await supabase
      .from('promo_redemptions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('promo_code_id', promo.id);

    if ((userRedemptions ?? 0) >= promo.per_user_limit) {
      return NextResponse.json({
        valid: false,
        reason: 'ALREADY_REDEEMED',
        discountAmount: 0,
        discountedTotal: originalTotal,
      });
    }

    // Calculate discount
    const discountAmount = calculateDiscount(promo.discount_type, Number(promo.discount_value), originalTotal);
    const discountedTotal = Math.max(0, originalTotal - discountAmount);

    return NextResponse.json({
      valid: true,
      discountAmount,
      discountedTotal,
      promo: {
        id: promo.id,
        code: promo.code,
        discount_type: promo.discount_type,
        discount_value: promo.discount_value,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}
