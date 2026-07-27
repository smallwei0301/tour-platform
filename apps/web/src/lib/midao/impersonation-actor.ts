import {
  signDomainSeparatedValue,
  verifyDomainSeparatedValue,
} from '../guide/session-crypto.ts';
import { isProductionRuntime } from '../../config/guide-session-env.mjs';

export const MIDAO_IMPERSONATION_ACTOR_COOKIE_NAME = 'midao_impersonation_actor';
const ACTOR_DOMAIN = 'midao:impersonation-actor:v1';
export const MIDAO_IMPERSONATION_MAX_AGE_SECONDS = 60 * 60;
const ACTOR_MAX_AGE_MS = MIDAO_IMPERSONATION_MAX_AGE_SECONDS * 1000;
const GUIDE_SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface SignedActorPayload {
  version: 1;
  actorType: 'admin';
  actorId: string;
  targetGuideId: string;
  issuedAt: number;
  expiresAt: number;
}

export interface ImpersonationActor {
  actorType: 'admin';
  actorId: string;
  targetGuideId: string;
  issuedAt: number;
  expiresAt: number;
}

interface CreateActorCookieInput {
  adminEmail: string;
  targetGuideId: string;
  issuedAt?: number;
  guideSessionExpiresAt?: number;
}

function normalizeAdminEmail(email: string): string {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized || !normalized.includes('@') || /\s/u.test(normalized)) {
    throw new Error('adminEmail must be a non-empty normalized email address');
  }
  return normalized;
}

function normalizeTargetGuideId(guideId: string): string {
  const normalized = String(guideId || '').trim();
  if (!normalized) throw new Error('targetGuideId is required');
  return normalized;
}

function secureAttribute(): string {
  return isProductionRuntime() ? '; Secure' : '';
}

function parseCookie(cookieHeader: string, name: string): string {
  for (const part of String(cookieHeader || '').split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${name}=`)) {
      try {
        return decodeURIComponent(trimmed.slice(name.length + 1));
      } catch {
        return '';
      }
    }
  }
  return '';
}

export function createImpersonationActorCookie(input: CreateActorCookieInput): string {
  const requestedIssuedAt = input.issuedAt ?? Date.now();
  const guideSessionExpiresAt = input.guideSessionExpiresAt ?? (requestedIssuedAt + GUIDE_SESSION_MAX_AGE_MS);
  if (!Number.isSafeInteger(requestedIssuedAt) || !Number.isSafeInteger(guideSessionExpiresAt)) {
    throw new Error('actor cookie timestamps must be safe integer milliseconds');
  }
  const issuedAt = Math.floor(requestedIssuedAt / 1_000) * 1_000;
  const expiresAt = Math.floor(Math.min(issuedAt + ACTOR_MAX_AGE_MS, guideSessionExpiresAt) / 1_000) * 1_000;
  if (expiresAt <= issuedAt) throw new Error('guide session must outlive actor cookie issuance');

  const payload: SignedActorPayload = {
    version: 1,
    actorType: 'admin',
    actorId: normalizeAdminEmail(input.adminEmail),
    targetGuideId: normalizeTargetGuideId(input.targetGuideId),
    issuedAt,
    expiresAt,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = signDomainSeparatedValue(ACTOR_DOMAIN, encodedPayload);
  const maxAge = Math.floor((expiresAt - issuedAt) / 1000);
  if (maxAge < 1) throw new Error('actor cookie lifetime must be at least one second');

  return `${MIDAO_IMPERSONATION_ACTOR_COOKIE_NAME}=${encodedPayload}.${signature}`
    + `; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`
    + `; Expires=${new Date(expiresAt).toUTCString()}${secureAttribute()}`;
}

export function verifyImpersonationActorCookie(
  cookieHeader: string,
  options: { targetGuideId: string; now?: number },
): ImpersonationActor | null {
  const value = parseCookie(cookieHeader, MIDAO_IMPERSONATION_ACTOR_COOKIE_NAME);
  const parts = value.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [encodedPayload, signature] = parts;
  if (!verifyDomainSeparatedValue(ACTOR_DOMAIN, encodedPayload, signature)) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const expectedKeys = ['actorId', 'actorType', 'expiresAt', 'issuedAt', 'targetGuideId', 'version'];
  const actualKeys = Object.keys(payload).sort();
  if (actualKeys.length !== expectedKeys.length || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    return null;
  }
  const candidate = payload as Partial<SignedActorPayload>;
  const targetGuideId = normalizeTargetGuideId(options.targetGuideId);
  const now = options.now ?? Date.now();
  let canonicalActorId = '';
  if (typeof candidate.actorId === 'string') {
    try {
      canonicalActorId = normalizeAdminEmail(candidate.actorId);
    } catch {
      return null;
    }
  }
  if (
    candidate.version !== 1
    || candidate.actorType !== 'admin'
    || typeof candidate.actorId !== 'string'
    || candidate.actorId !== canonicalActorId
    || candidate.targetGuideId !== targetGuideId
    || !Number.isSafeInteger(candidate.issuedAt)
    || !Number.isSafeInteger(candidate.expiresAt)
    || !Number.isSafeInteger(now)
    || (candidate.issuedAt as number) > now
    || now >= (candidate.expiresAt as number)
    || (candidate.expiresAt as number) <= (candidate.issuedAt as number)
    || (candidate.expiresAt as number) - (candidate.issuedAt as number) > ACTOR_MAX_AGE_MS
  ) return null;

  return {
    actorType: 'admin',
    actorId: candidate.actorId,
    targetGuideId: candidate.targetGuideId,
    issuedAt: candidate.issuedAt as number,
    expiresAt: candidate.expiresAt as number,
  };
}

export function clearImpersonationActorCookie(): string {
  return `${MIDAO_IMPERSONATION_ACTOR_COOKIE_NAME}=`
    + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'
    + `; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secureAttribute()}`;
}
