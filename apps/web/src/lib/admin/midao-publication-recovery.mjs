// #1758 S10b · Task 31 — admin publication history / atomic restore gateway.
// This module is the only layer allowed to use the service-role Supabase client.
// Restore delegates every mutation to the approved atomic RPC; it never writes tables directly.

import { getSupabase } from '../supabase-env.mjs';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const IDEMPOTENCY_KEY_PATTERN = /^[ -~]+$/u;

export class MidaoPublicationRecoveryError extends Error {
  constructor(code, status) {
    super(code);
    this.name = 'MidaoPublicationRecoveryError';
    this.code = code;
    this.status = status;
  }
}

function fail(code, status) {
  throw new MidaoPublicationRecoveryError(code, status);
}

function backendFailure(message) {
  const error = new Error(message);
  error.name = 'MidaoPublicationRecoveryBackendError';
  return error;
}

function normalizeActivityId(value) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value.trim())) {
    fail('INVALID_ACTIVITY_ID', 422);
  }
  return value.trim().toLowerCase();
}

function normalizeSourceVersion(value) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    fail('INVALID_SOURCE_VERSION', 422);
  }
  return value;
}

function normalizeActorId(value) {
  if (typeof value !== 'string') fail('ADMIN_AUTHORIZATION_REQUIRED', 401);
  const actorId = value.trim().toLowerCase();
  if (!actorId || Buffer.byteLength(actorId, 'utf8') > 128) {
    fail('ADMIN_AUTHORIZATION_REQUIRED', 401);
  }
  return actorId;
}

function normalizeIdempotencyKey(value) {
  if (typeof value !== 'string') fail('INVALID_IDEMPOTENCY_KEY', 422);
  const key = value.trim();
  if (!key || Buffer.byteLength(key, 'utf8') > 128 || !IDEMPOTENCY_KEY_PATTERN.test(key)) {
    fail('INVALID_IDEMPOTENCY_KEY', 422);
  }
  return key;
}

function normalizeRequestHash(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/u.test(value.trim().toLowerCase())) {
    fail('INVALID_REQUEST_HASH', 422);
  }
  return value.trim().toLowerCase();
}

function rpcErrorToken(error) {
  return [error?.code, error?.message, error?.details, error?.hint]
    .filter(Boolean)
    .join(' ')
    .toUpperCase();
}

function classifyRpcError(error) {
  const token = rpcErrorToken(error);
  if (token.includes('ACTIVITY_NOT_FOUND')) fail('ACTIVITY_NOT_FOUND', 404);
  if (token.includes('SOURCE_VERSION_NOT_FOUND')) fail('SOURCE_VERSION_NOT_FOUND', 404);
  if (token.includes('IDEMPOTENCY_CONFLICT')) fail('IDEMPOTENCY_CONFLICT', 409);
  if (token.includes('IDEMPOTENCY_IN_PROGRESS')) fail('IDEMPOTENCY_IN_PROGRESS', 409);
  if (token.includes('INVALID_ACTIVITY_ID')) fail('INVALID_ACTIVITY_ID', 422);
  if (token.includes('INVALID_SOURCE_VERSION')) fail('INVALID_SOURCE_VERSION', 422);
  if (token.includes('INVALID_IDEMPOTENCY_KEY')) fail('INVALID_IDEMPOTENCY_KEY', 422);
  if (token.includes('INVALID_REQUEST_HASH')) fail('INVALID_REQUEST_HASH', 422);
  if (token.includes('ADMIN_AUTHORIZATION_REQUIRED')) fail('ADMIN_AUTHORIZATION_REQUIRED', 401);
}

function mapVersionRow(row) {
  const version = row?.version;
  const sourceVersionRaw = row?.source_version;
  const sourceVersion = sourceVersionRaw == null ? null : Number(sourceVersionRaw);
  const publishedAt = row?.published_at;
  if (
    typeof version !== 'number'
    || !Number.isInteger(version)
    || version < 1
    || (sourceVersion !== null && (!Number.isInteger(sourceVersion) || sourceVersion < 1))
    || typeof publishedAt !== 'string'
    || !publishedAt
  ) {
    throw backendFailure('Midao publication history returned an invalid metadata row');
  }
  return { version, sourceVersion, publishedAt };
}

export async function listServicePublicationVersions(activityId) {
  const normalizedActivityId = normalizeActivityId(activityId);
  const supabase = await getSupabase();

  const activityResult = await supabase
    .from('activities')
    .select('id')
    .eq('id', normalizedActivityId)
    .maybeSingle();
  if (activityResult?.error) {
    throw backendFailure('Midao publication history activity lookup failed');
  }
  if (!activityResult?.data) fail('ACTIVITY_NOT_FOUND', 404);

  const result = await supabase
    .from('service_publication_versions')
    .select('version, published_at, source_version:snapshot->sourceVersion')
    .eq('activity_id', normalizedActivityId)
    .order('version', { ascending: false });
  if (result?.error) {
    throw backendFailure('Midao publication history lookup failed');
  }

  return {
    activityId: normalizedActivityId,
    versions: (Array.isArray(result?.data) ? result.data : []).map(mapVersionRow),
  };
}

export async function restoreServicePublication({
  activityId,
  sourceVersion,
  actorId,
  idempotencyKey,
  requestHash,
}) {
  const normalizedActivityId = normalizeActivityId(activityId);
  const normalizedSourceVersion = normalizeSourceVersion(sourceVersion);
  const normalizedActorId = normalizeActorId(actorId);
  const normalizedIdempotencyKey = normalizeIdempotencyKey(idempotencyKey);
  const normalizedRequestHash = normalizeRequestHash(requestHash);
  const supabase = await getSupabase();

  let result;
  try {
    result = await supabase.rpc('midao_restore_service_publication', {
      p_activity_id: normalizedActivityId,
      p_source_version: normalizedSourceVersion,
      p_actor_type: 'admin',
      p_actor_id: normalizedActorId,
      p_idempotency_key: normalizedIdempotencyKey,
      p_request_hash: normalizedRequestHash,
    });
  } catch (error) {
    classifyRpcError(error);
    throw backendFailure('Midao publication restore RPC call failed');
  }

  if (result?.error) {
    classifyRpcError(result.error);
    throw backendFailure('Midao publication restore RPC returned an error');
  }

  const data = result?.data;
  if (
    !data
    || typeof data !== 'object'
    || Array.isArray(data)
    || data.restored !== true
    || data.code !== 'RESTORED'
    || data.activityId !== normalizedActivityId
    || data.sourceVersion !== normalizedSourceVersion
    || typeof data.version !== 'number'
    || !Number.isInteger(data.version)
    || data.version < 1
  ) {
    throw backendFailure('Midao publication restore RPC returned an invalid payload');
  }

  return structuredClone(data);
}
