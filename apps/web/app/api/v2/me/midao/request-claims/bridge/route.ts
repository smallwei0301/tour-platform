import { validateCsrf } from '../../../../../../../src/lib/csrf.mjs';
import { getSupabase } from '../../../../../../../src/lib/supabase-env.mjs';
import { getTravelerIdentity } from '../../../../../../../src/lib/v2/traveler-auth.ts';
import { hashIdempotentRequest, parseIdempotencyKey } from '../../../../../../../src/lib/midao/idempotency.ts';
import {
  hashMidaoRequestClaimToken,
  unavailableMidaoRequestClaimEnvelope,
  validateMidaoRequestClaimBridgeBody,
} from '../../../../../../../src/lib/midao/midao-request-claim.ts';
import { readMidaoRequestClaimPepperFromEnv } from '../../../../../../../src/config/security-env.mjs';
import { jsonError, jsonOk } from '../../../../../../../src/lib/api-response';
import { handleRouteError } from '../../../../../../../src/lib/route-error';

function unavailable() {
  const envelope = unavailableMidaoRequestClaimEnvelope();
  return jsonError(envelope.error.code, envelope.error.message, 404, {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

export async function POST(request: Request) {
  const csrf = validateCsrf(request);
  if (csrf) return unavailable();

  let body: unknown;
  try { body = await request.json(); } catch { return unavailable(); }
  const parsed = validateMidaoRequestClaimBridgeBody(body);
  if (!parsed.ok) return unavailable();

  try {
    const traveler = await getTravelerIdentity();
    if (!traveler.id) return unavailable();

    let idempotencyKey: string;
    try { idempotencyKey = parseIdempotencyKey(request.headers.get('idempotency-key')); } catch { return unavailable(); }

    const tokenHash = hashMidaoRequestClaimToken(parsed.rawToken, readMidaoRequestClaimPepperFromEnv());
    const supabase = await getSupabase();
    const { data, error } = await supabase.rpc('midao_bridge_request_claim', {
      p_claim_token_hash: tokenHash,
      p_traveler_user_id: traveler.id,
      p_idempotency_key: idempotencyKey,
      p_request_hash: hashIdempotentRequest({ token: parsed.rawToken }),
    });
    if (error || data?.status !== 'ok' || typeof data.inquiry_id !== 'string') return unavailable();

    return jsonOk({ inquiryId: data.inquiry_id, created: data.created === true }, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    return handleRouteError(error, { route: 'v2/me/midao/request-claims/bridge' });
  }
}
