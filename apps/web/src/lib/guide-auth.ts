/**
 * guide-auth.ts
 * Guide session utilities (mirrors admin-auth pattern)
 * Uses crypto built-in: SHA-256 + salt for passwords, HMAC for session tokens
 */
import { createHmac, randomBytes, createHash } from 'crypto';

const GUIDE_SESSION_SECRET =
  process.env.GUIDE_SESSION_SECRET || 'guide-dev-secret-change-in-prod';
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days

// ─── Invite Token ────────────────────────────────────────────────────────────

/** Generate a UUID v4 invite token */
export function generateInviteToken(): string {
  const bytes = randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant
  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

/** Returns true if the invite token has expired */
export function isInviteTokenExpired(expiresAt: string): boolean {
  return new Date(expiresAt) < new Date();
}

// ─── Password ────────────────────────────────────────────────────────────────

/** Hash a password: returns `${salt}:${hash}` */
export function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = createHash('sha256').update(salt + plain).digest('hex');
  return `${salt}:${hash}`;
}

/** Verify a plain password against a stored `${salt}:${hash}` */
export function verifyPassword(plain: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 2) return false;
  const [salt, expected] = parts;
  const actual = createHash('sha256').update(salt + plain).digest('hex');
  // Constant-time comparison
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) {
    diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

// ─── Session Cookies ─────────────────────────────────────────────────────────

function signToken(guideId: string, sessionVersion: number): string {
  const payload = `${guideId}:${sessionVersion}`;
  return createHmac('sha256', GUIDE_SESSION_SECRET).update(payload).digest('hex');
}

export interface GuideSessionPayload {
  guideId: string;
  guideName: string;
  isNew?: boolean;
}

/**
 * Create Set-Cookie header strings for a guide session.
 * Returns an array to be used with headers.append('set-cookie', ...)
 */
export function createGuideSessionCookies(
  guideId: string,
  guideName: string,
  sessionVersion = 1,
  isNew = false,
): string[] {
  const sig = signToken(guideId, sessionVersion);
  const token = `${guideId}:${sessionVersion}:${sig}`;
  const maxAge = SESSION_MAX_AGE_SECONDS;
  // Add Secure flag in production (HTTPS only)
  const securePart = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  const cookieBase = `; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${securePart}`;
  // guide_id/guide_name are read by client JS for UI display only (not security-sensitive)
  const publicBase = `; Path=/; SameSite=Lax; Max-Age=${maxAge}${securePart}`;

  const cookies = [
    `guide_token=${encodeURIComponent(token)}${cookieBase}`,
    `guide_id=${encodeURIComponent(guideId)}${publicBase}`,
    `guide_name=${encodeURIComponent(guideName)}${publicBase}`,
  ];
  if (isNew) {
    cookies.push(`guide_is_new=1${publicBase}`);
  }
  return cookies;
}

/** Clear all guide session cookies */
export function clearGuideSessionCookies(): string[] {
  const securePart = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  const expire = `; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${securePart}`;
  const pubExpire = `; Path=/; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${securePart}`;
  return [
    `guide_token=''${expire}`,
    `guide_id=''${pubExpire}`,
    `guide_name=''${pubExpire}`,
    `guide_is_new=''${pubExpire}`,
  ];
}

function parseCookie(cookieHeader: string, key: string): string {
  const parts = cookieHeader.split(';').map((s) => s.trim());
  const hit = parts.find((p) => p.startsWith(`${key}=`));
  return hit ? decodeURIComponent(hit.slice(key.length + 1)) : '';
}

/**
 * Verify guide session from request cookies.
 * Returns null if invalid or missing.
 */
export function verifyGuideSession(req: Request): GuideSessionPayload | null {
  const cookieHeader = req.headers.get('cookie') || '';
  const rawToken = parseCookie(cookieHeader, 'guide_token');
  const guideId = parseCookie(cookieHeader, 'guide_id');
  const guideName = parseCookie(cookieHeader, 'guide_name');
  const isNew = parseCookie(cookieHeader, 'guide_is_new') === '1';

  if (!rawToken || !guideId) return null;

  const parts = rawToken.split(':');
  if (parts.length !== 3) return null;

  const [tokenGuideId, versionStr, sig] = parts;
  if (tokenGuideId !== guideId) return null;

  const version = Number(versionStr);
  if (isNaN(version)) return null;

  const expected = signToken(guideId, version);
  if (sig !== expected) return null;

  return { guideId, guideName, isNew };
}

/** Mask email: john@example.com → j***@example.com */
export function maskEmail(email: string): string {
  const atIdx = email.indexOf('@');
  if (atIdx <= 0) return '***';
  return email[0] + '***' + email.slice(atIdx);
}
