import { validateCsrf } from '../../../../../../../src/lib/csrf.mjs';
import { getSupabase } from '../../../../../../../src/lib/supabase-env.mjs';
import { getTravelerIdentity } from '../../../../../../../src/lib/v2/traveler-auth.ts';
import { hashIdempotentRequest, parseIdempotencyKey } from '../../../../../../../src/lib/midao/idempotency.ts';
import {
  hashMidaoRequestClaimToken,
  readMidaoRequestClaimPepperFromEnv,
  unavailableMidaoRequestClaimEnvelope,
  validateMidaoRequestClaimBridgeBody,
} from '../../../../../../../src/lib/midao/midao-request-claim.ts';

function unavailable() {
  return Response.json(unavailableMidaoRequestClaimEnvelope(), {
    status: 404,
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

  return Response.json({ ok: true, data: { inquiryId: data.inquiry_id, created: data.created === true } }, {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
