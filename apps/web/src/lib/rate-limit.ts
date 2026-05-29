/**
 * Memory-based Rate Limiter
 * Phase 10 — Tour Platform
 *
 * Uses in-memory Map (suitable for serverless).
 * Each limiter has its own window and reset logic.
 */

import { resolveTrustedClientIp } from './trusted-ip.mjs';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  maxRequests: number;
}

export class RateLimiter {
  private store = new Map<string, RateLimitEntry>();
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests: number, windowMs: number = 60 * 1000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  private getClientKey(identifier: string): string {
    return identifier;
  }

  /**
   * Check if request is allowed
   * @returns { allowed: boolean, remaining: number, resetAt: number, maxRequests: number }
   */
  check(identifier: string): RateLimitResult {
    const key = this.getClientKey(identifier);
    const now = Date.now();

    let entry = this.store.get(key);

    // Expired or doesn't exist → reset
    if (!entry || entry.resetAt <= now) {
      entry = {
        count: 1,
        resetAt: now + this.windowMs,
      };
      this.store.set(key, entry);
      return {
        allowed: true,
        remaining: this.maxRequests - 1,
        resetAt: entry.resetAt,
        maxRequests: this.maxRequests,
      };
    }

    // Increment
    entry.count++;

    const allowed = entry.count <= this.maxRequests;
    const remaining = Math.max(0, this.maxRequests - entry.count);

    return {
      allowed,
      remaining,
      resetAt: entry.resetAt,
      maxRequests: this.maxRequests,
    };
  }

  /**
   * Read-only check: does NOT increment the counter.
   * Used by login routes that only count *failed* attempts (see peek/record pair).
   */
  peek(identifier: string): RateLimitResult {
    const now = Date.now();
    const entry = this.store.get(this.getClientKey(identifier));

    if (!entry || entry.resetAt <= now) {
      return {
        allowed: true,
        remaining: this.maxRequests,
        resetAt: now + this.windowMs,
        maxRequests: this.maxRequests,
      };
    }

    return {
      allowed: entry.count < this.maxRequests,
      remaining: Math.max(0, this.maxRequests - entry.count),
      resetAt: entry.resetAt,
      maxRequests: this.maxRequests,
    };
  }

  /**
   * Increment the counter without gating — pair with peek().
   * Login routes call record() only on failed attempts so successful
   * logins (e2e fixtures, legit users) never consume quota.
   */
  record(identifier: string): RateLimitResult {
    return this.check(identifier);
  }

  /**
   * Get client IP from request
   */
  static getClientIp(request: Request): string {
    return resolveTrustedClientIp(request).ip;
  }
}

// Pre-configured limiters for common routes
export const limiters = {
  // /api/orders — 10 requests per minute
  orders: new RateLimiter(10, 60 * 1000),

  // /api/payments/ecpay/callback — 30 requests per minute
  ecpayCallback: new RateLimiter(30, 60 * 1000),

  // /api/me/orders — 20 requests per minute
  userOrders: new RateLimiter(20, 60 * 1000),

  // /api/events — 50 requests per minute
  events: new RateLimiter(50, 60 * 1000),

  // /api/admin/auth/session POST — 10 *failed* attempts per minute per IP (#1373)
  adminLogin: new RateLimiter(10, 60 * 1000),

  // /api/guide/auth/session POST — 10 *failed* attempts per minute per IP (#1373)
  guideLogin: new RateLimiter(10, 60 * 1000),

  // /api/reviews POST — 5 submissions per minute per IP (#1379)
  reviewSubmit: new RateLimiter(5, 60 * 1000),

  // order messages POST — 10 messages per 10 minutes per sender (#1411)
  messageSend: new RateLimiter(10, 10 * 60 * 1000),

  // /api/line/webhook — 60 requests per minute (LINE delivers in bursts)
  lineWebhook: new RateLimiter(60, 60 * 1000),
};

// Named exports for convenience
export const ordersLimiter = limiters.orders;
export const ecpayCallbackLimiter = limiters.ecpayCallback;
export const myOrdersLimiter = limiters.userOrders;
export const eventsLimiter = limiters.events;
export const adminLoginLimiter = limiters.adminLogin;
export const guideLoginLimiter = limiters.guideLogin;
export const reviewSubmitLimiter = limiters.reviewSubmit;
export const messageSendLimiter = limiters.messageSend;

/**
 * Middleware helper: Returns 429 if limit exceeded
 */
/**
 * Login-route variant (#1373): same 429 semantics but the body follows the
 * unified fail() envelope and stays generic — it must not reveal whether the
 * email/account exists. Inlined (not imported from src/lib/api) so this module
 * keeps zero non-.mjs imports and stays transpile-importable from tests.
 */
export function createLoginRateLimitResponse(result: RateLimitResult): Response | null {
  if (result.allowed) {
    return null;
  }

  const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);

  return new Response(
    JSON.stringify({
      ok: false,
      error: { code: 'RATE_LIMITED', message: '嘗試次數過多，請稍後再試' },
    }),
    {
      status: 429,
      headers: {
        'content-type': 'application/json',
        'Retry-After': String(retryAfter),
        'X-RateLimit-Limit': String(result.maxRequests),
        'X-RateLimit-Remaining': String(result.remaining),
        'X-RateLimit-Reset': String(result.resetAt),
      },
    }
  );
}

export function createRateLimitResponse(
  result: ReturnType<RateLimiter['check']>
): Response | null {
  if (result.allowed) {
    return null; // Allowed, continue
  }

  const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);

  return new Response(
    JSON.stringify({
      error: 'TOO_MANY_REQUESTS',
      message: 'Rate limit exceeded',
      retryAfter,
    }),
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfter),
        'X-RateLimit-Limit': String(result.maxRequests),
        'X-RateLimit-Remaining': String(result.remaining),
        'X-RateLimit-Reset': String(result.resetAt),
      },
    }
  );
}
