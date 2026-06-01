export const BOOKING_V2_STEP1_CTA_REASON_ID = 'booking-v2-step1-cta-reason';

export function getBookingV2Step1CtaState({ slotsLoading, slotsCount, guests, selectedCapacityLeft }) {
  const overCapacity = slotsCount > 0 && guests > selectedCapacityLeft;
  const blockedByNoSlots = !slotsLoading && slotsCount === 0;
  const blockedByOverCapacity = !slotsLoading && overCapacity;
  const disabled = slotsLoading || blockedByNoSlots || blockedByOverCapacity;

  if (slotsLoading) {
    return {
      disabled,
      reason: '正在確認可預約名額…',
      reasonId: BOOKING_V2_STEP1_CTA_REASON_ID,
      role: 'status',
      tone: 'muted',
    };
  }

  if (blockedByNoSlots) {
    return {
      disabled,
      reason: '此日期目前無可預約名額，請選擇其他日期。',
      reasonId: BOOKING_V2_STEP1_CTA_REASON_ID,
      role: 'alert',
      tone: 'danger',
    };
  }

  if (blockedByOverCapacity) {
    return {
      disabled,
      reason: '參加人數已超過此日期剩餘名額，請降低人數或選擇其他日期。',
      reasonId: BOOKING_V2_STEP1_CTA_REASON_ID,
      role: 'alert',
      tone: 'danger',
    };
  }

  return {
    disabled,
    reason: '',
    reasonId: null,
    role: null,
    tone: null,
  };
}
