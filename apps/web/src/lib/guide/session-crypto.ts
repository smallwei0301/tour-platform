import { createHmac, randomBytes } from 'node:crypto';
import { getGuideSessionSecurityEnv } from '../../config/guide-session-env.mjs';
import { constantTimeEquals } from '../constant-time.mjs';

function resolveGuideSessionSecret(): string {
  const { secret: configured, isProduction, isNextBuildPhase } = getGuideSessionSecurityEnv();

  if (isProduction && !isNextBuildPhase) {
    if (!configured || configured.length < 32) {
      throw new Error(
        '[SECURITY_ENV_BLOCK] GUIDE_SESSION_SECRET missing/weak in production; set a strong secret (>=32 chars).',
      );
    }
    return configured;
  }

  if (configured) return configured;
  return randomBytes(32).toString('hex');
}

const guideSessionSecret = resolveGuideSessionSecret();

function hmac(message: string): string {
  return createHmac('sha256', guideSessionSecret).update(message, 'utf8').digest('hex');
}

export function signGuideSession(guideId: string, sessionVersion: number): string {
  return hmac(`${guideId}:${sessionVersion}`);
}

export function verifyGuideSessionSignature(
  guideId: string,
  sessionVersion: number,
  signature: string,
): boolean {
  return constantTimeEquals(signature, signGuideSession(guideId, sessionVersion));
}

const IMPERSONATED_GUIDE_SESSION_DOMAIN = 'midao:guide-session:admin-impersonation:v1';

export function signImpersonatedGuideSession(guideId: string, sessionVersion: number): string {
  return signDomainSeparatedValue(
    IMPERSONATED_GUIDE_SESSION_DOMAIN,
    `${guideId}:${sessionVersion}`,
  );
}

export function verifyImpersonatedGuideSessionSignature(
  guideId: string,
  sessionVersion: number,
  signature: string,
): boolean {
  return constantTimeEquals(signature, signImpersonatedGuideSession(guideId, sessionVersion));
}

function domainSeparatedMessage(domain: string, payload: string): string {
  return `${domain}\0${Buffer.byteLength(payload, 'utf8')}:${payload}`;
}

export function signDomainSeparatedValue(domain: string, payload: string): string {
  return hmac(domainSeparatedMessage(domain, payload));
}

export function verifyDomainSeparatedValue(
  domain: string,
  payload: string,
  signature: string,
): boolean {
  return constantTimeEquals(signature, signDomainSeparatedValue(domain, payload));
}
