import { csrfHeaders, ensureCsrfToken } from '../../../lib/csrf-client';
import type { DraftResponseData, PublicationPreview, ServiceDraft, ServiceDraftPayload, ServiceListData } from './service-types';

export async function prepareServiceMutations(): Promise<void> {
  await ensureCsrfToken();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isEnvelope(value: unknown): value is { success: boolean; data?: unknown; error?: { code?: string; message?: string } } {
  return isRecord(value) && typeof value.success === 'boolean';
}

function normalizeServiceDraft(value: unknown): ServiceDraft | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.activityId !== 'string'
    || typeof value.guideId !== 'string'
    || typeof value.revision !== 'number'
    || (value.status !== 'active' && value.status !== 'discarded' && value.status !== 'published')
    || !isRecord(value.payload)
  ) return null;
  return {
    activityId: value.activityId,
    guideId: value.guideId,
    revision: value.revision,
    status: value.status,
    payload: value.payload as ServiceDraft['payload'],
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : null,
    materializationOrigin: typeof value.materializationOrigin === 'string' ? value.materializationOrigin : 'native',
    materializationReviewState: typeof value.materializationReviewState === 'string' ? value.materializationReviewState : null,
  };
}

function normalizeDraftResponseData(value: unknown): DraftResponseData {
  if (!isRecord(value)) throw new Error('草稿格式不正確');
  return {
    draft: normalizeServiceDraft(value.draft),
    publicationPreview: normalizePublicationPreview(value.publicationPreview) ?? undefined,
  };
}

async function readEnvelope(response: Response): Promise<{ data?: unknown; error?: { code?: string; message?: string } }> {
  const payload: unknown = await response.json().catch(() => null);
  if (!isEnvelope(payload)) throw new Error('服務 API 回應格式不正確');
  if (!response.ok || !payload.success) {
    const error = new Error(payload.error?.message || '服務 API 請求失敗') as Error & { code?: string; status?: number; data?: unknown };
    error.code = payload.error?.code;
    error.status = response.status;
    error.data = payload;
    throw error;
  }
  return payload;
}

export async function fetchServiceList(page: number, pageSize = 8, status = 'all'): Promise<ServiceListData> {
  const response = await fetch(`/api/v2/guide/services?page=${page}&pageSize=${pageSize}&status=${status}`, { cache: 'no-store' });
  const envelope = await readEnvelope(response);
  if (!isRecord(envelope.data) || !Array.isArray(envelope.data.items)) throw new Error('服務清單格式不正確');
  return envelope.data as unknown as ServiceListData;
}

export async function fetchServiceDraft(activityId: string): Promise<DraftResponseData> {
  const response = await fetch(`/api/v2/guide/service-drafts?activityId=${encodeURIComponent(activityId)}`, { cache: 'no-store' });
  const envelope = await readEnvelope(response);
  return normalizeDraftResponseData(envelope.data);
}

export async function ensureNativeServiceDraft(activityId: string): Promise<DraftResponseData> {
  await prepareServiceMutations();
  const response = await fetch('/api/v2/guide/service-drafts/ensure', {
    method: 'POST',
    headers: csrfHeaders({ 'content-type': 'application/json' }),
    credentials: 'include',
    body: JSON.stringify({ activityId }),
  });
  const envelope = await readEnvelope(response);
  const data = normalizeDraftResponseData(envelope.data);
  if (!data.draft) throw new Error('草稿尚未準備完成');
  return data;
}

export async function saveServiceDraft(activityId: string, expectedRevision: number, patch: ServiceDraftPayload): Promise<DraftResponseData> {
  const response = await fetch('/api/v2/guide/service-drafts', {
    method: 'POST',
    headers: csrfHeaders({ 'content-type': 'application/json' }),
    credentials: 'include',
    body: JSON.stringify({ activityId, expectedRevision, patch }),
  });
  const envelope = await readEnvelope(response);
  try {
    return normalizeDraftResponseData(envelope.data);
  } catch {
    throw new Error('儲存草稿回應格式不正確');
  }
}

export async function publishServiceDraft(activityId: string, expectedRevision: number): Promise<{ publicUrl: string | null; version: number | null }> {
  const response = await fetch(`/api/v2/guide/service-drafts/${activityId}/commands/publish`, {
    method: 'POST',
    headers: csrfHeaders({ 'content-type': 'application/json' }),
    credentials: 'include',
    body: JSON.stringify({ expectedRevision }),
  });
  const envelope = await readEnvelope(response);
  const data = envelope.data;
  if (!isRecord(data)) throw new Error('發布回應格式不正確');
  return {
    publicUrl: typeof data.publicUrl === 'string' ? data.publicUrl : null,
    version: typeof data.version === 'number' ? data.version : null,
  };
}

export async function createGuideActivity(): Promise<string> {
  const response = await fetch('/api/guide/activities', {
    method: 'POST',
    headers: csrfHeaders({ 'content-type': 'application/json' }),
    credentials: 'include',
    body: JSON.stringify({ title: '未命名服務' }),
  });
  const envelope = await response.json().catch(() => null) as unknown;
  if (!response.ok || !isRecord(envelope) || envelope.ok !== true || !isRecord(envelope.data) || typeof envelope.data.id !== 'string') {
    throw new Error(isRecord(envelope) && isRecord(envelope.error) && typeof envelope.error.message === 'string' ? envelope.error.message : '建立服務失敗');
  }
  return envelope.data.id;
}

export function getErrorDetails(error: unknown): { code?: string; status?: number; data?: unknown; message: string } {
  if (error instanceof Error) {
    const candidate = error as Error & { code?: string; status?: number; data?: unknown };
    return { code: candidate.code, status: candidate.status, data: candidate.data, message: error.message };
  }
  return { message: '服務操作失敗' };
}

export function extractConflictDraft(data: unknown): { draft: ServiceDraft | null; currentRevision: number | null } {
  if (!isRecord(data)) return { draft: null, currentRevision: null };
  const error = isRecord(data.error) ? data.error : null;
  const currentRevision = typeof data.currentRevision === 'number'
    ? data.currentRevision
    : error && typeof error.currentRevision === 'number' ? error.currentRevision : null;
  const draft = isRecord(data.draft) ? data.draft as unknown as ServiceDraft : null;
  return { draft, currentRevision };
}

export function normalizePublicationPreview(value: unknown): PublicationPreview | null {
  if (!isRecord(value) || typeof value.valid !== 'boolean' || !Array.isArray(value.errors)) return null;
  return { valid: value.valid, errors: value.errors.filter((error): error is string => typeof error === 'string') };
}
