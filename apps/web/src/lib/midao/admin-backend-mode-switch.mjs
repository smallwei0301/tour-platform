const MODES = new Set(['legacy', 'midao']);
const GENERIC_ERROR = '切換導遊後台模式失敗';
const REASON_ERROR = '切換原因必填，且不可超過 500 字';

export function canSwitchAdminGuideBackendMode(guide, switchingMode) {
  return !!guide
    && guide.kind !== 'application'
    && guide.verification_status === 'approved'
    && switchingMode === false;
}

export function normalizeAdminBackendModeReason(reasonInput) {
  if (reasonInput === null) return { ok: false, cancelled: true };
  const reason = typeof reasonInput === 'string' ? reasonInput.trim() : '';
  if (!reason || reason.length > 500) {
    return { ok: false, cancelled: false, message: REASON_ERROR };
  }
  return { ok: true, reason };
}

function safeErrorMessage(json) {
  const message = json?.error?.message;
  return typeof message === 'string' && message.length > 0 && message.length <= 200
    ? message
    : GENERIC_ERROR;
}

export async function executeAdminBackendModeSwitch(input, dependencies) {
  const currentMode = MODES.has(input?.currentMode) ? input.currentMode : 'legacy';
  const targetMode = currentMode === 'midao' ? 'legacy' : 'midao';
  const normalized = normalizeAdminBackendModeReason(input?.reason);
  if (!normalized.ok) return normalized.cancelled
    ? { ok: false, message: GENERIC_ERROR }
    : { ok: false, message: normalized.message };
  if (!input?.guideId || typeof input.guideId !== 'string') {
    return { ok: false, message: GENERIC_ERROR };
  }

  await dependencies.ensureCsrfToken();
  const response = await dependencies.fetchImpl(
    `/api/v2/admin/guides/${input.guideId}/backend-mode`,
    {
      method: 'POST',
      headers: {
        ...dependencies.csrfHeaders(),
        'Content-Type': 'application/json',
        'Idempotency-Key': dependencies.randomUUID(),
      },
      cache: 'no-store',
      body: JSON.stringify({ backendMode: targetMode, reason: normalized.reason }),
    }
  );
  const json = await response.json().catch(() => null);
  if (!response.ok || json?.success !== true) {
    return { ok: false, message: safeErrorMessage(json) };
  }
  if (!MODES.has(json?.data?.backendMode) || json.data.backendMode !== targetMode) {
    return { ok: false, message: GENERIC_ERROR };
  }
  return { ok: true, backendMode: json.data.backendMode };
}

export const __internal = { GENERIC_ERROR, REASON_ERROR };
