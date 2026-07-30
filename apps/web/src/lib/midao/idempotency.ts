import { createHash } from 'node:crypto';
import { MidaoRouteError } from './route-errors.ts';

export function parseIdempotencyKey(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new MidaoRouteError('INVALID_IDEMPOTENCY_KEY', 'Idempotency-Key is required', 422);
  }
  if (/[\x00-\x1f\x7f]/u.test(raw)) {
    throw new MidaoRouteError('INVALID_IDEMPOTENCY_KEY', 'Invalid Idempotency-Key', 422);
  }
  const key = raw.trim();
  const bytes = Buffer.byteLength(key, 'utf8');
  if (!key || bytes > 128 || /[^\x20-\x7e]/u.test(key)) {
    throw new MidaoRouteError('INVALID_IDEMPOTENCY_KEY', 'Invalid Idempotency-Key', 422);
  }
  return key;
}

function canonicalize(value: unknown, seen = new Set<object>()): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new MidaoRouteError('INVALID_REQUEST_BODY', 'Request body must be canonical JSON', 422);
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') {
    throw new MidaoRouteError('INVALID_REQUEST_BODY', 'Request body must be canonical JSON', 422);
  }
  if (seen.has(value)) throw new MidaoRouteError('INVALID_REQUEST_BODY', 'Request body must be acyclic JSON', 422);
  seen.add(value);
  try {
    if (Array.isArray(value)) return `[${value.map((item) => canonicalize(item, seen)).join(',')}]`;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new MidaoRouteError('INVALID_REQUEST_BODY', 'Request body must be plain JSON', 422);
    }
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize((value as Record<string, unknown>)[key], seen)}`).join(',')}}`;
  } finally {
    seen.delete(value);
  }
}

export function hashIdempotentRequest(value: unknown): string {
  return createHash('sha256').update(canonicalize(value), 'utf8').digest('hex');
}
