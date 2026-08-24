import { createHmac, randomBytes } from 'node:crypto';

const CLAIM_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const PEPPER_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const PLACEHOLDER_PEPPER_PATTERN = /^(.)\1{42}$/u;

export type MidaoRequestClaimBridgeBody =
  | { ok: true; rawToken: string }
  | { ok: false; code: 'INVALID_REQUEST_BODY' };

export function createMidaoRequestClaimToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * The dedicated claim pepper is a 32-byte, unpadded base64url secret.  Keep
 * this validation close to the only server-side HMAC boundary so route code
 * cannot substitute or reuse a session/payment secret.
 */
export function decodeMidaoRequestClaimPepper(value: unknown): Buffer {
  if (typeof value !== 'string' || !PEPPER_PATTERN.test(value) || PLACEHOLDER_PEPPER_PATTERN.test(value)) {
    throw new TypeError('MIDAO_REQUEST_CLAIM_PEPPER_INVALID');
  }
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.length !== 32 || decoded.toString('base64url') !== value) {
    throw new TypeError('MIDAO_REQUEST_CLAIM_PEPPER_INVALID');
  }
  return decoded;
}

export function readMidaoRequestClaimPepperFromEnv(env: NodeJS.ProcessEnv = process.env): Buffer {
  return decodeMidaoRequestClaimPepper(env.MIDAO_REQUEST_CLAIM_PEPPER);
}

/**
 * Claim capability uses an isolated HMAC namespace.  The raw token is only
 * returned to the route's request-local scope and must never be persisted.
 */
export function hashMidaoRequestClaimToken(rawToken: unknown, pepper: unknown): string {
  if (typeof rawToken !== 'string' || !CLAIM_TOKEN_PATTERN.test(rawToken)) {
    throw new TypeError('MIDAO_REQUEST_CLAIM_TOKEN_INVALID');
  }
  return createHmac('sha256', decodeMidaoRequestClaimPepper(pepper)).update(rawToken, 'utf8').digest('hex');
}

/** Every unavailable capability state intentionally shares this exact shape. */
export function unavailableMidaoRequestClaimEnvelope(_state?: unknown) {
  return {
    ok: false as const,
    error: {
      code: 'NOT_FOUND',
      message: 'Resource not found',
    },
  };
}

/**
 * Only the raw claim token belongs to the browser request body.  Identity is
 * derived from the server-verified traveler session, never supplied by body.
 */
export function validateMidaoRequestClaimBridgeBody(value: unknown): MidaoRequestClaimBridgeBody {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, code: 'INVALID_REQUEST_BODY' };
  }
  const body = value as Record<string, unknown>;
  if (Object.keys(body).length !== 1 || typeof body.token !== 'string' || !CLAIM_TOKEN_PATTERN.test(body.token)) {
    return { ok: false, code: 'INVALID_REQUEST_BODY' };
  }
  return { ok: true, rawToken: body.token };
}
