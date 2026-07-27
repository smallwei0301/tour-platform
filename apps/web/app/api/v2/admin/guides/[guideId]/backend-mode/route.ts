import { randomUUID } from 'node:crypto';
import { isMidaoBackendEnabled, isMidaoBackendModeSwitchEnabled } from '../../../../../../../src/config/feature-flags.mjs';
import { pickAdminCredentials } from '../../../../../../../src/lib/admin-auth.mjs';
import { jsonError, jsonOk } from '../../../../../../../src/lib/api-response';
import { switchGuideBackendModeDb } from '../../../../../../../src/lib/midao/db-backend-mode.mjs';
import { hashIdempotentRequest, parseIdempotencyKey } from '../../../../../../../src/lib/midao/idempotency';
import { handleMidaoRouteError as handleRouteError } from '../../../../../../../src/lib/midao/route-errors';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BODY_KEYS = ['backendMode', 'reason'];

export async function POST(
  request: Request,
  { params }: { params: Promise<{ guideId: string }> },
): Promise<Response> {
  try {
    const { guideId } = await params;
    if (!UUID_REGEX.test(guideId)) return jsonError('INVALID_GUIDE_ID', 'Invalid guide ID', 422);

    const adminEmail = String(pickAdminCredentials(request).email || '').trim().toLowerCase();
    if (!adminEmail) return jsonError('ADMIN_ACTOR_REQUIRED', 'Admin actor is required', 401);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError('INVALID_REQUEST_BODY', 'Invalid JSON request body', 422);
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)
      || Object.getPrototypeOf(body) !== Object.prototype
      || JSON.stringify(Object.keys(body).sort()) !== JSON.stringify(BODY_KEYS)) {
      return jsonError('INVALID_REQUEST_BODY', 'Only backendMode and reason are allowed', 422);
    }

    const { backendMode, reason } = body as { backendMode?: unknown; reason?: unknown };
    if (backendMode !== 'legacy' && backendMode !== 'midao') {
      return jsonError('INVALID_BACKEND_MODE', 'Invalid backend mode', 422);
    }
    if (typeof reason !== 'string' || !reason.trim() || reason.trim().length > 500) {
      return jsonError('INVALID_REASON', 'Reason is required and must be at most 500 characters', 422);
    }
    const normalizedReason = reason.trim();
    const idempotencyKey = parseIdempotencyKey(request.headers.get('idempotency-key'));
    const requestHash = hashIdempotentRequest({ backendMode, reason: normalizedReason });

    const result = await switchGuideBackendModeDb({
      guideId,
      targetMode: backendMode,
      reason: normalizedReason,
      actorId: adminEmail,
      requestId: randomUUID(),
      idempotencyKey,
      requestHash,
      backendEnabled: isMidaoBackendEnabled(),
      modeSwitchEnabled: isMidaoBackendModeSwitchEnabled(),
    });
    return jsonOk(result);
  } catch (error) {
    return handleRouteError(error, { route: 'v2/admin/guides/backend-mode' });
  }
}
