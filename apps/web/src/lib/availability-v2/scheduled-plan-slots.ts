import {
  evaluateBookingAvailability,
  type BookingAvailabilityEvaluatorInput,
  type EvaluatorSchedule,
} from './booking-availability-evaluator.ts';
import type { SerializedSlot } from '../slot-generator.ts';

/**
 * Scheduled (固定場次) plan listing.
 *
 * booking_type='scheduled' 的方案只開放預先建立的固定場次（activity_schedules），
 * 不提供導遊動態可預約規則（availability rules）產生的任意時段。本函式把該方案在
 * 查詢區間內的每個開放場次，逐一丟進共用的 evaluateBookingAvailability 驗證
 * （沿用既有的容量／黑名單／衝突／季節判斷），並收集通過的場次成為可預約 slots。
 *
 * 關鍵：每個場次以 selectedSchedule 形式評估，且 rules 一律傳空陣列 —— 固定場次本身
 * 就是 source of truth，不受動態規則約束（避免「方案同時有規則但場次時間不在規則內」
 * 時把合法場次誤判為不可預約）。回傳的每個 slot 都帶有對應的 scheduleId，供旅客選取
 * 後於 draft 帶入。
 */

export type ScheduledListingBaseInput = Omit<
  BookingAvailabilityEvaluatorInput,
  'rules' | 'selectedSchedule' | 'selectedScheduleAuthority'
>;

export interface ScheduledPlanSlotsResult {
  slots: SerializedSlot[];
  reasonCode?: string;
  messageZh?: string;
}

export function evaluateScheduledPlanSlots(
  baseInput: ScheduledListingBaseInput,
  schedules: EvaluatorSchedule[],
): ScheduledPlanSlotsResult {
  const collected: SerializedSlot[] = [];

  for (const schedule of schedules) {
    const evaluation = evaluateBookingAvailability({
      ...baseInput,
      rules: [],
      selectedSchedule: schedule,
      selectedScheduleAuthority: 'authoritative',
    });
    for (const slot of evaluation.slots) {
      if (slot.isAvailable) {
        collected.push(slot);
      }
    }
  }

  collected.sort(
    (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
  );

  if (collected.length === 0) {
    return {
      slots: [],
      reasonCode: 'NO_OPEN_SCHEDULES',
      messageZh: '此方案目前沒有開放的預約場次，請稍後再試或選擇其他方案',
    };
  }

  return { slots: collected };
}
