/**
 * #1759 Package 4／Task 43a：traveler confirmation **preview**（唯讀）的純函式層。
 *
 * 契約來源（唯一權威）：
 * docs/operations/session-handoffs/2026-08-08-issue1759-task43-traveler-confirm-page-plan.md
 * §2 D3（S0–S7 判定順序）／§3.3（精確 8 鍵投影）／§5.1 P1–P11（測試矩陣）。
 *
 * 為何另開新檔而非併入 booking-confirmation.ts（計畫 §2 D5）：
 * 該檔已自我定義為「Task 40 accept 的純函式層」且以 ACCEPT_* 為命名前綴；
 * 混入 preview 常數會讓「哪些常數屬於哪個端點」失去可讀邊界。
 *
 * 安全不變式（違反即 blocker）：
 * - 本檔不得 import supabase、不得有任何 I/O。
 * - raw token／tokenHash 不得作為輸入被回傳，亦不得出現在任何錯誤訊息中。
 * - 投影恰 8 個頂層鍵，巢狀鍵集合精確；不得夾帶 travelerId／guideId／
 *   sourceInquiryId／paymentDeadlineAt／consumedAt／planBasePriceTwd／任何 PII。
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

/** §3.3：preview 的三態判別式。 */
export const PREVIEW_STATUSES = ['pending', 'expired', 'used'] as const;

export type ConfirmationPreviewStatus = (typeof PREVIEW_STATUSES)[number];

export interface ConfirmationPreview {
  status: ConfirmationPreviewStatus;
  bookingId: string;
  orderId: string;
  service: {
    activityId: string;
    activityPlanId: string;
    title: string | null;
    planName: string | null;
  };
  schedule: {
    startAt: string;
    endAt: string;
  };
  partySize: number;
  price: {
    quotedTotalTwd: number;
    currency: string;
  };
  expiresAt: string | null;
}

export interface ConfirmationPreviewStatusInput {
  bookingStatus: unknown;
  travelerConfirmationStatus: unknown;
  travelerConfirmationExpiresAt: unknown;
  tokenConsumedAt: unknown;
  tokenExpiresAt: unknown;
  now: unknown;
}

export interface ConfirmationPreviewInput {
  status: ConfirmationPreviewStatus;
  bookingId: unknown;
  orderId: unknown;
  activityId: unknown;
  activityPlanId: unknown;
  title: unknown;
  planName: unknown;
  startAt: unknown;
  endAt: unknown;
  partySize: unknown;
  quotedTotalTwd: unknown;
  currency: unknown;
  expiresAt: unknown;
}

/**
 * 形狀／關聯損毀一律走這條（→ 500 並上報）。訊息為固定安全字串，
 * 絕不回填原始值（回填等同把 token／PII 送進 log 與 Sentry）。
 */
function previewUnexpected(message = 'Midao traveler confirmation preview backend failure'): Error {
  const error = new Error(message);
  error.name = 'MidaoTravelerConfirmationBackendError';
  return error;
}

function previewUuid(raw: unknown): string {
  if (typeof raw !== 'string' || !UUID_PATTERN.test(raw.trim().toLowerCase())) {
    throw previewUnexpected('Midao traveler confirmation preview UUID is invalid');
  }
  return raw.trim().toLowerCase();
}

/** 必填時間戳 → ISO（與 booking-confirmation.ts 的 projectionTimestamp 同語意）。 */
function previewTimestamp(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw previewUnexpected('Midao traveler confirmation preview timestamp is invalid');
  }
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) {
    throw previewUnexpected('Midao traveler confirmation preview timestamp is invalid');
  }
  return new Date(parsed).toISOString();
}

/** 可空時間戳 → ISO | null。 */
function previewNullableTimestamp(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  return previewTimestamp(raw);
}

/** 純顯示欄位：查無一律 null，不得丟錯（計畫 §2 D4）。 */
function previewNullableText(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed ? trimmed : null;
}

/**
 * 已知時間戳可否判定為「已到期」（`<= now`）。
 * 無法解析視為已到期（fail-closed：寧可顯示過期，也不要謊報可確認）。
 */
function isAtOrBefore(value: unknown, nowMs: number): boolean {
  if (typeof value !== 'string' || !value.trim()) return true;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return true;
  return parsed <= nowMs;
}

/**
 * §2 D3：S2–S7 判定順序，**逐項鏡射** RPC `midao_accept_traveler_confirmation`
 * 取鎖後的判斷順序，不得自創（順序錯即為 blocker）。
 *
 * 對應 supabase/migrations/20260806120000_midao_atomic_inquiry_conversion.sql：
 *   S2 ← :566-568  booking.status <> 'draft'                      → CONFIRMATION_TOKEN_EXPIRED
 *   S3 ← :569-571  traveler_confirmation_status <> 'pending'      → ALREADY_CONSUMED
 *   S4 ← :572-575  traveler_confirmation_expires_at IS NULL / <=now → EXPIRED
 *   S5 ← :588-590  token.consumed_at IS NOT NULL                  → ALREADY_CONSUMED
 *   S6 ← :591-593  token.expires_at <= now                        → EXPIRED
 *   S7            以上皆非                                        → pending
 *
 * 誠實邊界：preview 是**預測**，accept 才是權威。兩次呼叫之間存在 TOCTOU 窗口
 * （過期時點跨越、他處併發 accept、容量被吃滿），UI 必須同時處理 accept 的 410/409。
 *
 * 註：S0（token 查無）／S1（非本人）在 gateway 層即塌成 404，不進入本函式。
 */
export function resolveConfirmationPreviewStatus(
  input: ConfirmationPreviewStatusInput,
): ConfirmationPreviewStatus {
  const nowMs = Date.parse(String(input?.now ?? ''));
  if (!Number.isFinite(nowMs)) {
    throw previewUnexpected('Midao traveler confirmation preview clock is invalid');
  }

  // S2：booking 已離開 draft（已確認／已取消等）→ 此連結不再可用。
  if (input.bookingStatus !== 'draft') return 'expired';

  // S3：confirmed → 已使用；其餘（expired／not_required）→ 過期。
  if (input.travelerConfirmationStatus !== 'pending') {
    return input.travelerConfirmationStatus === 'confirmed' ? 'used' : 'expired';
  }

  // S4：booking 上的確認期限（null 或已過）。
  if (input.travelerConfirmationExpiresAt === null
    || input.travelerConfirmationExpiresAt === undefined
    || isAtOrBefore(input.travelerConfirmationExpiresAt, nowMs)) {
    return 'expired';
  }

  // S5：token 已被消費。
  if (input.tokenConsumedAt !== null && input.tokenConsumedAt !== undefined) return 'used';

  // S6：token 自身期限已過。
  if (isAtOrBefore(input.tokenExpiresAt, nowMs)) return 'expired';

  // S7。
  return 'pending';
}

/**
 * §3.3：組出精確 8 鍵投影並驗形。任何形狀錯誤一律丟 backend error（→500 並上報），
 * 不得降級成 4xx（那會讓關聯損毀被誤讀為「連結無效」）。
 */
export function buildConfirmationPreview(input: ConfirmationPreviewInput): ConfirmationPreview {
  if (!PREVIEW_STATUSES.includes(input?.status)) {
    throw previewUnexpected('Midao traveler confirmation preview status is invalid');
  }

  const partySize = Number(input.partySize);
  if (!Number.isInteger(partySize) || partySize < 1) {
    throw previewUnexpected('Midao traveler confirmation preview party size is invalid');
  }

  const quotedTotalTwd = Number(input.quotedTotalTwd);
  if (!Number.isFinite(quotedTotalTwd) || quotedTotalTwd < 0) {
    throw previewUnexpected('Midao traveler confirmation preview price is invalid');
  }

  const currency = typeof input.currency === 'string' ? input.currency.trim().toUpperCase() : '';
  if (currency !== 'TWD') {
    throw previewUnexpected('Midao traveler confirmation preview currency is invalid');
  }

  return {
    status: input.status,
    bookingId: previewUuid(input.bookingId),
    orderId: previewUuid(input.orderId),
    service: {
      activityId: previewUuid(input.activityId),
      activityPlanId: previewUuid(input.activityPlanId),
      title: previewNullableText(input.title),
      planName: previewNullableText(input.planName),
    },
    schedule: {
      startAt: previewTimestamp(input.startAt),
      endAt: previewTimestamp(input.endAt),
    },
    partySize,
    price: {
      quotedTotalTwd,
      currency,
    },
    expiresAt: previewNullableTimestamp(input.expiresAt),
  };
}
