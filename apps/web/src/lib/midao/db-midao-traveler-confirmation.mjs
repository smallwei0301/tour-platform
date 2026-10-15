/**
 * #1759 Package 4／Task 40：traveler confirmation accept gateway（薄層）。
 *
 * 契約來源（唯一權威）：
 * docs/operations/session-handoffs/2026-08-07-issue1759-task40-traveler-confirmation-plan.md
 * §4.2（函式簽章與 7 鍵回應）／§5.1（RPC 參數映射）／§5.2（錯誤對照）／
 * §9.1（in-memory 必須鏡射的 13 步 RPC 判斷順序）。
 *
 * 檔案位置說明（PLAN_DRIFT 記錄）：計畫 §3.2 原本要求把本檔內容 additive 寫進
 * db-midao-booking-confirmations.mjs。實測該檔會因此達 933 行，超過
 * tests/unit/architecture-ratchet-guard.test.mjs 的 800 行一般上限——而該 guard
 * 正是本卡 GREEN_CONDITION 的必跑項，且不得放寬。故保留獨立 gateway。
 * 目前由私有 confirmation-runtime 擁有共用 state 與 lifecycle，gateway 僅處理邊界。
 *
 * 安全不變式：
 * - raw token 只存在於單次請求記憶體；本檔立即轉 sha256，不入 store／log／回應。
 * - 「token 不存在」與「token 屬於他人」一律塌成 404 `Resource not found`。
 * - 本檔不自行 INSERT/UPDATE bookings／orders／booking_confirmation_tokens；
 *   Supabase 路徑一切寫入由 midao_accept_traveler_confirmation RPC 單一交易完成。
 */
import { getSupabase, hasSupabaseEnv } from '../supabase-env.mjs';
import {
  ACCEPT_RPC_ERROR_CODES,
  acceptRouteError,
  acceptRpcErrorToken,
  hashConfirmationToken,
  validateAcceptProjection,
} from './booking-confirmation.ts';
import {
  buildConfirmationPreview,
  resolveConfirmationPreviewStatus,
} from './booking-confirmation-preview.ts';
import { acceptInMemory, acceptCommandKey, previewInMemory, nowIso,
  seedActiveBookingForTest, seedAcceptIdempotencyForTest,
  seedConfirmationLifecycleForTest, clearCapacityBookingsForTest } from './confirmation-runtime.mjs';
import { acceptUnexpected, acceptNotFound } from './confirmation-runtime-errors.mjs';
import { parseIdempotencyKey } from './idempotency.ts';

import { UUID_PATTERN, HASH_PATTERN } from './confirmation-values.mjs';

const ACCEPT_RPC_NAME = 'midao_accept_traveler_confirmation';

/**
 * gateway 入口參數正規化。route 已負責使用者可見的正規化（§6.2），
 * 因此此處失敗一律視為程式缺陷 → 500，對齊 RPC 的 22023 家族語意。
 */
function normalizeAcceptCommand(input = {}) {
  const travelerUserId = typeof input.travelerUserId === 'string'
    ? input.travelerUserId.trim().toLowerCase()
    : '';
  if (!UUID_PATTERN.test(travelerUserId)) {
    throw acceptUnexpected('Midao traveler confirmation traveler id is invalid');
  }
  const rawToken = typeof input.rawToken === 'string' ? input.rawToken.trim().toLowerCase() : '';
  if (!HASH_PATTERN.test(rawToken)) {
    throw acceptUnexpected('Midao traveler confirmation token is invalid');
  }
  let idempotencyKey;
  try {
    idempotencyKey = parseIdempotencyKey(input.idempotencyKey);
  } catch {
    throw acceptUnexpected('Midao traveler confirmation idempotency key is invalid');
  }
  if (typeof input.requestHash !== 'string' || !HASH_PATTERN.test(input.requestHash)) {
    throw acceptUnexpected('Midao traveler confirmation request hash is invalid');
  }
  return {
    travelerUserId,
    // raw token 到此為止：只留 sha256，往後任何一層都拿不到原值。
    tokenHash: hashConfirmationToken(rawToken),
    idempotencyKey,
    requestHash: input.requestHash,
  };
}

/** 成功／replay 的固定 7 鍵集合（§4.2）。 */
function acceptResult(sanitized, { replayed }) {
  return {
    accepted: sanitized.accepted,
    replayed,
    bookingId: sanitized.bookingId,
    orderId: sanitized.orderId,
    bookingStatus: sanitized.bookingStatus,
    travelerConfirmationStatus: sanitized.travelerConfirmationStatus,
    paymentDeadlineAt: sanitized.paymentDeadlineAt ?? null,
  };
}

/**
 * in-memory 分支：逐項鏡射 RPC 判斷順序（§9.1 的 1–13 步）。
 * 特別是「replay 分支早於 ownership 檢查」，否則兩分支錯誤語意會不一致。
 */
function mapAcceptRpcError(error) {
  const token = acceptRpcErrorToken(error);
  if (token) throw acceptRouteError(ACCEPT_RPC_ERROR_CODES[token]);
  // 22023 全家族／MIDAO_IDEMPOTENCY_RELATION_INVALID／無法反解 → 500 並上報。
  throw acceptUnexpected();
}

function acceptRpcArgs(command) {
  return {
    p_traveler_user_id: command.travelerUserId,
    p_confirmation_token_hash: command.tokenHash,
    p_idempotency_key: command.idempotencyKey,
    p_request_hash: command.requestHash,
  };
}

async function acceptInSupabase(command) {
  const supabase = await getSupabase();
  let response;
  try {
    response = await supabase.rpc(ACCEPT_RPC_NAME, acceptRpcArgs(command));
  } catch {
    // 原始錯誤可能夾帶 driver 訊息，一律吞掉換成固定安全訊息。
    throw acceptUnexpected();
  }
  if (response?.error) mapAcceptRpcError(response.error);

  const projection = validateAcceptProjection(response?.data);
  return acceptResult(projection, { replayed: projection.replayed });
}

/**
 * traveler 以一次性 raw token 接受確認（route 直接把回傳交給 jsonOk）。
 *
 * @param {{
 *   travelerUserId: string,
 *   rawToken: string,
 *   idempotencyKey: string,
 *   requestHash: string,
 * }} input
 * @returns {Promise<{
 *   accepted: boolean,
 *   replayed: boolean,
 *   bookingId: string,
 *   orderId: string,
 *   bookingStatus: string,
 *   travelerConfirmationStatus: string,
 *   paymentDeadlineAt: string | null,
 * }>}
 */
export async function acceptMidaoTravelerConfirmationDb(input = {}) {
  const command = normalizeAcceptCommand(input);
  if (hasSupabaseEnv()) return acceptInSupabase(command);
  const { sanitized, replayed } = acceptInMemory(command);
  return acceptResult(sanitized, { replayed });
}

// ---------------------------------------------------------------------------
// #1759 Task 43a：traveler confirmation **preview**（唯讀，additive）
//
// 契約來源：docs/operations/session-handoffs/
//   2026-08-08-issue1759-task43-traveler-confirm-page-plan.md §2 D1/D3/D4／§4.3。
//
// 與 accept 的關鍵差異：本段完全唯讀——不取鎖、不寫入、不碰 idempotency、
// 不呼叫任何 RPC（計畫 §2 D1：唯讀不需要交易，且零 migration 可免時間戳碰撞）。
// in-memory lifecycle 由 confirmation-runtime 單一擁有。
//
// 安全鐵則：raw token 於入口即轉 sha256；原值不得進入任何查詢變數、
// console.*、錯誤訊息或回傳值。Supabase error 一律吞掉原訊息換固定安全字串。
// ---------------------------------------------------------------------------

/** preview 入口參數正規化（與 accept 同構，但無 idempotency／requestHash）。 */
function normalizePreviewCommand(input = {}) {
  const travelerUserId = typeof input.travelerUserId === 'string'
    ? input.travelerUserId.trim().toLowerCase()
    : '';
  if (!UUID_PATTERN.test(travelerUserId)) {
    throw acceptUnexpected('Midao traveler confirmation traveler id is invalid');
  }
  const rawToken = typeof input.rawToken === 'string' ? input.rawToken.trim().toLowerCase() : '';
  if (!HASH_PATTERN.test(rawToken)) {
    throw acceptUnexpected('Midao traveler confirmation token is invalid');
  }
  return {
    travelerUserId,
    // raw token 到此為止：只留 sha256。
    tokenHash: hashConfirmationToken(rawToken),
  };
}

/**
 * §4.3 in-memory 分支。S0/S1 塌成 404（不存在與非本人不可區分），
 * 其餘交給純函式層依 RPC 順序判定。
 */
/** Supabase 讀取封裝：吞掉 driver 原訊息，換固定安全訊息。 */
async function previewSelectMaybeSingle(query) {
  let response;
  try {
    response = await query;
  } catch {
    throw acceptUnexpected();
  }
  if (response?.error) throw acceptUnexpected();
  return response?.data ?? null;
}

/**
 * §4.3 Supabase 分支（service-role）。三張 Task 32 表對 anon/authenticated 全撤權，
 * 授權責任由 route 的 getTravelerIdentity() + 本函式的 ownership 比對承擔
 * ——與 accept 完全同構（計畫 §2 D1 論證 2）。
 */
async function previewInSupabase(command) {
  const supabase = await getSupabase();

  // 1. token
  const tokenRow = await previewSelectMaybeSingle(
    supabase
      .from('booking_confirmation_tokens')
      .select('booking_id, expires_at, consumed_at')
      .eq('token_hash', command.tokenHash)
      .maybeSingle(),
  );
  if (!tokenRow) throw acceptNotFound(); // S0

  // 2. booking
  const booking = await previewSelectMaybeSingle(
    supabase
      .from('bookings')
      .select([
        'id',
        'traveler_id',
        'status',
        'traveler_confirmation_status',
        'traveler_confirmation_expires_at',
        'participants',
        'start_at',
        'end_at',
        'activity_id',
        'activity_plan_id',
      ].join(', '))
      .eq('id', tokenRow.booking_id)
      .maybeSingle(),
  );
  if (!booking) throw acceptNotFound(); // S0
  if (booking.traveler_id !== command.travelerUserId) throw acceptNotFound(); // S1

  // 3. orders：與 accept RPC 同一取法（created_at, id 遞增取第一筆）。
  const orderRows = await previewSelectMaybeSingle(
    supabase
      .from('orders')
      .select('id')
      .eq('booking_id', booking.id)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(1),
  );
  const orderId = Array.isArray(orderRows) ? orderRows[0]?.id ?? null : orderRows?.id ?? null;
  if (!orderId) throw acceptUnexpected('Midao traveler confirmation order relation is invalid');

  // 4. pricing snapshot＝定價真值；查無視為關聯損毀 → 500 並上報。
  const snapshot = await previewSelectMaybeSingle(
    supabase
      .from('booking_pricing_snapshots')
      .select('quoted_total_twd, currency, party_size')
      .eq('booking_id', booking.id)
      .maybeSingle(),
  );
  if (!snapshot) throw acceptUnexpected('Midao traveler confirmation pricing snapshot is invalid');

  // 5. 純顯示欄位：查無一律 null，不得 500。
  const activity = await previewSelectMaybeSingle(
    supabase.from('activities').select('title').eq('id', booking.activity_id).maybeSingle(),
  );
  const plan = await previewSelectMaybeSingle(
    supabase.from('activity_plans').select('name').eq('id', booking.activity_plan_id).maybeSingle(),
  );

  // 6. participants 與 snapshot.party_size 同源寫入；若不一致以 participants 為準
  //    （容量真值），僅記 warn，不得 500。訊息不含 token、不含 PII。
  if (Number(snapshot.party_size) !== Number(booking.participants)) {
    console.warn('[midao] traveler confirmation preview party size mismatch', {
      bookingId: booking.id,
      participants: booking.participants,
      snapshotPartySize: snapshot.party_size,
    });
  }

  // 7. 狀態判定 + 投影。
  const status = resolveConfirmationPreviewStatus({
    bookingStatus: booking.status,
    travelerConfirmationStatus: booking.traveler_confirmation_status,
    travelerConfirmationExpiresAt: booking.traveler_confirmation_expires_at,
    tokenConsumedAt: tokenRow.consumed_at,
    tokenExpiresAt: tokenRow.expires_at,
    now: nowIso(),
  });

  return buildConfirmationPreview({
    status,
    bookingId: booking.id,
    orderId,
    activityId: booking.activity_id,
    activityPlanId: booking.activity_plan_id,
    title: activity?.title ?? null,
    planName: plan?.name ?? null,
    startAt: booking.start_at,
    endAt: booking.end_at,
    partySize: booking.participants,
    quotedTotalTwd: snapshot.quoted_total_twd,
    currency: snapshot.currency,
    expiresAt: booking.traveler_confirmation_expires_at,
  });
}

/**
 * traveler 以一次性 raw token 預覽「要確認的是什麼」（route 直接把回傳交給 jsonOk）。
 *
 * 誠實邊界：本函式是**預測**，accept 才是權威。兩次呼叫之間存在 TOCTOU 窗口
 * （過期時點跨越、他處併發 accept、容量被吃滿），UI 不得假設 pending 就必然 accept 成功。
 *
 * @param {{ travelerUserId: string, rawToken: string }} input
 * @returns {Promise<import('./booking-confirmation-preview.ts').ConfirmationPreview>}
 */
export async function getMidaoTravelerConfirmationPreviewDb(input = {}) {
  const command = normalizePreviewCommand(input);
  if (hasSupabaseEnv()) return previewInSupabase(command);
  return previewInMemory(command);
}

export const __internal = {
  normalizeAcceptCommand,
  mapAcceptRpcError,
  acceptRpcArgs,
  acceptCommandKey,
  seedActiveBookingForTest,
  seedAcceptIdempotencyForTest,
  seedConfirmationLifecycleForTest,
  clearCapacityBookingsForTest,
};
