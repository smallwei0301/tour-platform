/**
 * External-hold capacity rule — 導遊外部佔位（external hold）容量決策
 *
 * 這支純函式是 SQL `fn_book_schedule`（005_schedule_plan_id.sql）的「鏡像」：
 * 外部佔位最終一律由 `fn_book_schedule` 在 DB 端原子扣量，但 API 在呼叫 RPC 前
 * 先用本函式做一次容量預檢，給導遊友善的繁中錯誤訊息，並讓容量語意可在
 * 不依賴 Supabase 的情況下被單元測試鎖定（#1376：fallback 與 SQL 語意不一致時，
 * 綠燈不代表 production 正確）。
 *
 * ⚠️ 任何 fn_book_schedule 的容量語意調整，務必同步本檔與其單元測試。
 */

export type ExternalHoldReasonCode =
  | 'INVALID_COUNT'
  | 'SCHEDULE_NOT_OPEN'
  | 'CAPACITY_EXCEEDED';

export interface ExternalHoldRequestInput {
  /** activity_schedules.capacity */
  capacity: number;
  /** activity_schedules.booked_count（已含所有通路的已佔座位） */
  bookedCount: number;
  /** activity_schedules.status；fn_book_schedule 僅接受 'open' */
  scheduleStatus: string;
  /** 本次要登記的外部佔位人數 */
  requestedParticipants: number;
}

export interface ExternalHoldDecision {
  allowed: boolean;
  /** 扣量前剩餘名額（不為負） */
  remainingBefore: number;
  /** 若允許，扣量後剩餘名額；不允許時等於 remainingBefore */
  remainingAfter: number;
  reasonCode?: ExternalHoldReasonCode;
  messageZh?: string;
}

function toSafeInt(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.floor(parsed);
}

/**
 * 鏡像 fn_book_schedule 的判定順序：
 *   1. count < 1            → INVALID_COUNT
 *   2. status != 'open'     → SCHEDULE_NOT_OPEN
 *   3. count > remaining    → CAPACITY_EXCEEDED
 *   否則允許，remainingAfter = remaining - count
 */
export function evaluateExternalHoldRequest(
  input: ExternalHoldRequestInput,
): ExternalHoldDecision {
  const capacity = Math.max(0, toSafeInt(input.capacity));
  const bookedCount = Math.max(0, toSafeInt(input.bookedCount));
  const requested = toSafeInt(input.requestedParticipants);
  const remainingBefore = Math.max(0, capacity - bookedCount);

  if (requested < 1) {
    return {
      allowed: false,
      remainingBefore,
      remainingAfter: remainingBefore,
      reasonCode: 'INVALID_COUNT',
      messageZh: '外部佔位人數需至少 1 人',
    };
  }

  if (input.scheduleStatus !== 'open') {
    return {
      allowed: false,
      remainingBefore,
      remainingAfter: remainingBefore,
      reasonCode: 'SCHEDULE_NOT_OPEN',
      messageZh: '此場次目前未開放（可能已額滿或關閉），無法登記外部佔位',
    };
  }

  if (requested > remainingBefore) {
    return {
      allowed: false,
      remainingBefore,
      remainingAfter: remainingBefore,
      reasonCode: 'CAPACITY_EXCEEDED',
      messageZh: `此場次剩餘 ${remainingBefore} 個名額，無法登記 ${requested} 個外部佔位`,
    };
  }

  return {
    allowed: true,
    remainingBefore,
    remainingAfter: remainingBefore - requested,
  };
}
