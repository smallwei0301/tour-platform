/**
 * #1759 Package 4／Task 37：inquiry 轉 booking 的純函式輸入驗證。
 *
 * 契約來源（唯一權威）：
 * docs/operations/session-handoffs/2026-08-06-issue1759-task37-inquiry-conversion-validation-plan.md
 * §2.1 型別契約、§2.2 十二步固定檢查順序。
 *
 * 不變式：
 * - 零 IO、零時鐘（不讀當前時間）、零環境變數讀取。
 *   `Date.parse()` 僅用於解析呼叫端傳入的字串，不取得當前時刻。
 * - 相同輸入完全決定性，violations 依 §2.2 固定順序累積，不 throw。
 * - `messageZh` 一律不夾帶 UUID／email／電話或任何他人身分資訊。
 *
 * 呼叫端注意（Task 38／39）：
 * `InquiryConversionPlanLike.guideId` 來自 `activities.guide_id` 的 join 結果，
 * **不是** `activity_plans` 的原生欄位（該表沒有 guide_id）。只 select
 * `activity_plans.*` 無法填出這個欄位，必須 join `activities` 取得。
 */
import { canTransitionInquiryState } from './inquiry-state-machine.mjs';
import { requiresGuideApproval } from '../booking-type-flow.mjs';

export type InquiryConversionViolationCode =
  | 'INQUIRY_STATE_NOT_CONVERTIBLE'
  | 'INQUIRY_ALREADY_CONVERTED'
  | 'PLAN_NOT_FOUND_IN_INPUT'
  | 'PLAN_ACTIVITY_MISMATCH'
  | 'PLAN_GUIDE_MISMATCH'
  | 'INQUIRY_GUIDE_MISMATCH'
  | 'PLAN_INACTIVE'
  | 'PLAN_BOOKING_TYPE_NOT_REQUEST'
  | 'INVALID_START_AT'
  | 'INVALID_END_AT'
  | 'END_NOT_AFTER_START'
  | 'INVALID_PARTICIPANTS'
  | 'PARTICIPANTS_BELOW_PLAN_MIN'
  | 'PARTICIPANTS_ABOVE_PLAN_MAX'
  | 'INVALID_QUOTED_TOTAL'
  | 'INVALID_TTL'
  | 'TTL_OUT_OF_BOUNDS'
  | 'INVALID_GUIDE_NOTE'
  | 'INVALID_INPUT_SHAPE';

export interface InquiryConversionViolation {
  code: InquiryConversionViolationCode;
  field: string;
  messageZh: string;
}

export interface InquiryConversionInquiryLike {
  id: string;
  guideId: string;
  activityId: string;
  status: string;
  convertedBookingId: string | null;
}

/**
 * 呼叫端已查好的 activity plan 投影。
 * 注意：guideId 來自 activities.guide_id（join），不是 activity_plans 的原生欄位。
 */
export interface InquiryConversionPlanLike {
  id: string;
  activityId: string;
  guideId: string;
  bookingType: string;
  status: string;
  minParticipants: number;
  maxParticipants: number;
}

export interface InquiryConversionCommandLike {
  activityPlanId: string;
  startAt: string;
  endAt: string;
  participants: number;
  quotedTotalTwd: number;
  guideNote: string | null;
  confirmationTtlHours: number;
}

export interface InquiryConversionValidationInput {
  inquiry: InquiryConversionInquiryLike;
  plan: InquiryConversionPlanLike | null;
  command: InquiryConversionCommandLike;
  actorGuideId: string;
}

export type InquiryConversionValidationResult =
  | { valid: true; violations: readonly [] }
  | { valid: false; violations: readonly InquiryConversionViolation[] };

export const CONVERSION_CONFIRMATION_TTL_MIN_HOURS = 1;
export const CONVERSION_CONFIRMATION_TTL_MAX_HOURS = 24;
export const CONVERSION_TARGET_INQUIRY_STATE = 'converted';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 僅解析呼叫端傳入的字串，不讀取當前時間。 */
function parseIsoTimestamp(value: unknown): number | null {
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * 驗證一次 inquiry → booking 轉換命令的輸入。
 * 累積所有違規後一次回傳，不 throw；唯一短路點是輸入形狀檢查。
 */
export function validateInquiryConversion(
  input: InquiryConversionValidationInput,
): InquiryConversionValidationResult {
  const violations: InquiryConversionViolation[] = [];
  const add = (
    code: InquiryConversionViolationCode,
    field: string,
    messageZh: string,
  ): void => {
    violations.push({ code, field, messageZh });
  };

  // 1) 輸入形狀（唯一短路點）
  const raw = input as unknown;
  if (!isPlainObject(raw)) {
    return {
      valid: false,
      violations: [
        {
          code: 'INVALID_INPUT_SHAPE',
          field: 'input',
          messageZh: '轉換輸入格式不正確，請重新操作。',
        },
      ],
    };
  }
  const inquiry = raw.inquiry;
  const command = raw.command;
  if (!isPlainObject(inquiry) || !isPlainObject(command)) {
    return {
      valid: false,
      violations: [
        {
          code: 'INVALID_INPUT_SHAPE',
          field: 'input',
          messageZh: '轉換輸入格式不正確，請重新操作。',
        },
      ],
    };
  }
  const plan = isPlainObject(raw.plan) ? raw.plan : null;
  const actorGuideId = raw.actorGuideId;

  // 2) 狀態合法性
  if (inquiry.convertedBookingId !== null && inquiry.convertedBookingId !== undefined) {
    add(
      'INQUIRY_ALREADY_CONVERTED',
      'inquiry.convertedBookingId',
      '此詢問單已經轉換過訂單，無法重複轉換。',
    );
  } else if (
    canTransitionInquiryState(inquiry.status as string, CONVERSION_TARGET_INQUIRY_STATE) !== true
  ) {
    add(
      'INQUIRY_STATE_NOT_CONVERTIBLE',
      'inquiry.status',
      '此詢問單目前的狀態無法轉換為訂單。',
    );
  }

  // 3) actor 與 inquiry 歸屬
  if (inquiry.guideId !== actorGuideId) {
    add('INQUIRY_GUIDE_MISMATCH', 'inquiry.guideId', '此詢問單不屬於您，無法轉換。');
  }

  // 4) plan 存在性
  const planUsable = plan !== null && plan.id === command.activityPlanId;
  if (!planUsable) {
    add(
      'PLAN_NOT_FOUND_IN_INPUT',
      'plan',
      '找不到對應的活動方案，請重新選擇方案後再試。',
    );
  }

  if (planUsable && plan !== null) {
    // 5) plan 歸屬
    if (plan.activityId !== inquiry.activityId) {
      add('PLAN_ACTIVITY_MISMATCH', 'plan.activityId', '此方案不屬於本詢問單的活動。');
    }
    if (plan.guideId !== actorGuideId) {
      add('PLAN_GUIDE_MISMATCH', 'plan.guideId', '此方案不屬於您。');
    }

    // 6) plan 可售
    if (plan.status !== 'active') {
      add('PLAN_INACTIVE', 'plan.status', '此方案目前未上架，無法用於轉換訂單。');
    }

    // 7) booking type
    if (requiresGuideApproval(plan.bookingType) !== true) {
      add(
        'PLAN_BOOKING_TYPE_NOT_REQUEST',
        'plan.bookingType',
        '此方案不是需要導遊審核的預約型方案，無法由詢問單轉換。',
      );
    }
  }

  // 8) start / end
  const startAt = parseIsoTimestamp(command.startAt);
  const endAt = parseIsoTimestamp(command.endAt);
  if (startAt === null) {
    add('INVALID_START_AT', 'command.startAt', '開始時間格式不正確，請填寫完整的日期時間。');
  }
  if (endAt === null) {
    add('INVALID_END_AT', 'command.endAt', '結束時間格式不正確，請填寫完整的日期時間。');
  }
  if (startAt !== null && endAt !== null && endAt <= startAt) {
    add('END_NOT_AFTER_START', 'command.endAt', '結束時間必須晚於開始時間。');
  }

  // 9) participants
  const participants = command.participants;
  const participantsValid =
    typeof participants === 'number' && Number.isInteger(participants) && participants >= 1;
  if (!participantsValid) {
    add('INVALID_PARTICIPANTS', 'command.participants', '參加人數必須是大於零的整數。');
  } else if (planUsable && plan !== null) {
    if (
      typeof plan.minParticipants === 'number' &&
      participants < plan.minParticipants
    ) {
      add(
        'PARTICIPANTS_BELOW_PLAN_MIN',
        'command.participants',
        '參加人數低於此方案的最低成行人數。',
      );
    }
    if (
      typeof plan.maxParticipants === 'number' &&
      participants > plan.maxParticipants
    ) {
      add(
        'PARTICIPANTS_ABOVE_PLAN_MAX',
        'command.participants',
        '參加人數超過此方案的可接待上限。',
      );
    }
  }

  // 10) 報價總額
  const quotedTotalTwd = command.quotedTotalTwd;
  if (
    typeof quotedTotalTwd !== 'number' ||
    !Number.isInteger(quotedTotalTwd) ||
    quotedTotalTwd < 0
  ) {
    add('INVALID_QUOTED_TOTAL', 'command.quotedTotalTwd', '報價總額必須是零或正整數（新台幣元）。');
  }

  // 11) 確認連結 TTL
  const ttl = command.confirmationTtlHours;
  if (typeof ttl !== 'number' || !Number.isInteger(ttl)) {
    add('INVALID_TTL', 'command.confirmationTtlHours', '確認連結有效時數必須是整數小時。');
  } else if (
    ttl < CONVERSION_CONFIRMATION_TTL_MIN_HOURS ||
    ttl > CONVERSION_CONFIRMATION_TTL_MAX_HOURS
  ) {
    add(
      'TTL_OUT_OF_BOUNDS',
      'command.confirmationTtlHours',
      `確認連結有效時數必須介於 ${CONVERSION_CONFIRMATION_TTL_MIN_HOURS} 至 ${CONVERSION_CONFIRMATION_TTL_MAX_HOURS} 小時之間。`,
    );
  }

  // 12) 導遊備註
  const guideNote = command.guideNote;
  if (guideNote !== null && typeof guideNote !== 'string') {
    add('INVALID_GUIDE_NOTE', 'command.guideNote', '導遊備註必須是文字，或留空不填。');
  }

  if (violations.length === 0) {
    return { valid: true, violations: [] };
  }
  return { valid: false, violations };
}
