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

  // /api/line/webhook — 60 requests per minute (LINE delivers in bursts)
  lineWebhook: new RateLimiter(60, 60 * 1000),

  // /api/line/auth/verify — 20 requests per minute per IP
  lineAuth: new RateLimiter(20, 60 * 1000),
};

// Named exports for convenience
export const ordersLimiter = limiters.orders;
export const ecpayCallbackLimiter = limiters.ecpayCallback;
export const myOrdersLimiter = limiters.userOrders;
export const eventsLimiter = limiters.events;

/**
 * Middleware helper: Returns 429 if limit exceeded
 */
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
