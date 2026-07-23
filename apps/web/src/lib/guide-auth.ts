/**
 * guide-auth.ts
 * Guide session utilities (mirrors admin-auth pattern)
 * Uses crypto built-in: SHA-256 + salt for passwords, HMAC for session tokens
 */
import { randomBytes, createHash, scryptSync } from 'crypto';
import { constantTimeEquals } from './constant-time.mjs';
import { signGuideSession, verifyGuideSessionSignature } from './guide-session-crypto.ts';

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
// 健檢 v2 S1（docs/operations/reports/repo-health-audit-20260702.md）：
// 單輪 SHA-256 → scrypt 慢雜湊。舊格式（`salt:hash`）仍可驗證，登入成功時由
// session route 以 needsPasswordRehash() 透明升級，導遊無感、不強制重設。

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;
// N=16384, r=8 → 128*N*r = 16MB，低於 Node scrypt 預設 maxmem(32MB)

/** Hash a password: returns `scrypt$N$r$p$salt$hash` */
export function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(plain, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  }).toString('hex');
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${hash}`;
}

/** 舊格式（單輪 SHA-256 `salt:hash`）→ true，應在下次登入成功時透明升級 */
export function needsPasswordRehash(stored: string | null | undefined): boolean {
  return !String(stored || '').startsWith('scrypt$');
}

/** Verify a plain password against stored hash（scrypt 新格式＋SHA-256 舊格式相容） */
export function verifyPassword(plain: string, stored: string): boolean {
  const s = String(stored || '');

  if (s.startsWith('scrypt$')) {
    const parts = s.split('$'); // ['scrypt', N, r, p, salt, hash]
    if (parts.length !== 6) return false;
    const [, nStr, rStr, pStr, salt, expected] = parts;
    const N = Number(nStr);
    const r = Number(rStr);
    const p = Number(pStr);
    if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
    if (!salt || !expected || expected.length % 2 !== 0) return false;
    try {
      const actual = scryptSync(plain, salt, expected.length / 2, { N, r, p }).toString('hex');
      return constantTimeEquals(actual, expected);
    } catch {
      return false; // 參數超界（maxmem 等）→ 視為驗證失敗，不丟錯
    }
  }

  // Legacy: `${salt}:${hash}`（單輪 SHA-256）
  const parts = s.split(':');
  if (parts.length !== 2) return false;
  const [salt, expected] = parts;
  const actual = createHash('sha256').update(salt + plain).digest('hex');
  // Constant-time comparison（共用 edge-safe helper，健檢 v2 S2）
  return constantTimeEquals(actual, expected);
}

// ─── Session Cookies ─────────────────────────────────────────────────────────

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
  const sig = signGuideSession(guideId, sessionVersion);
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

  if (!verifyGuideSessionSignature(guideId, version, sig)) return null;

  return { guideId, guideName, isNew };
}

/** Mask email: john@example.com → j***@example.com */
export function maskEmail(email: string): string {
  const atIdx = email.indexOf('@');
  if (atIdx <= 0) return '***';
  return email[0] + '***' + email.slice(atIdx);
}
