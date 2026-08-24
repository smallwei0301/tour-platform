import { getSupabase } from '../supabase-env.mjs';

function requestNoFromClaim({ preferredDate, tokenHash }) {
  const ymd = String(preferredDate || '').replaceAll('-', '');
  if (!/^\d{8}$/u.test(ymd) || !/^[0-9a-f]{64}$/u.test(tokenHash)) {
    throw new Error('MIDAO_REQUEST_CLAIM_ISSUE_INPUT_INVALID');
  }
  return `R${ymd}${tokenHash.slice(0, 12)}`;
}

/**
 * Server-only issuance boundary. The RPC receives only the HMAC token hash;
 * the raw capability stays in the caller's request-local memory.
 */
export async function issueMidaoRequestClaimDb({ guideId, activityId, activityTitle, value, tokenHash }) {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc('midao_issue_request_with_claim', {
    p_request_no: requestNoFromClaim({ preferredDate: value.preferred_date, tokenHash }),
    p_guide_id: guideId,
    p_activity_id: activityId,
    p_activity_title: activityTitle,
    p_traveler_name: value.traveler_name,
    p_traveler_line_id: value.traveler_line_id,
    p_traveler_email: value.traveler_email,
    p_preferred_date: value.preferred_date,
    p_backup_date: value.backup_date,
    p_preferred_period: value.preferred_period,
    p_start_time: value.start_time,
    p_end_time: value.end_time,
    p_participants_count: value.participants_count,
    p_participants_note: value.participants_note,
    p_language: value.language,
    p_need_pickup: value.need_pickup,
    p_special_note: value.special_note,
    p_answers: value.answers,
    p_claim_token_hash: tokenHash,
  });
  if (error || !data?.request_no) throw new Error('MIDAO_REQUEST_CLAIM_ISSUE_FAILED');
  return { requestNo: data.request_no };
}
