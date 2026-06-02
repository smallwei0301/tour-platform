import type { SerializedSlot } from '../slot-generator.ts';

export interface DateAvailabilityEntry {
  date: string;
  state: 'available' | 'blocked' | 'no_slots';
  capacityLeft: number;
  reason: string;
  messageZh: string;
  firstAvailableStartAt?: string;
  selectedSlot?: {
    startAt: string;
    endAt: string;
    capacityLeft: number;
    bookingType: SerializedSlot['bookingType'];
    isAvailable: boolean;
  };
}

interface BuildDateAvailabilityInput {
  dateFrom: string;
  dateTo: string;
  timezone: string;
  slots: SerializedSlot[];
  fallbackReason?: string;
  fallbackMessageZh?: string;
  groupedRuleFailuresByDate?: Record<string, { reasonCode?: string; messageZh?: string }>;
}

function localDateFromIso(isoLike: string, timezone: string): string {
  return new Date(isoLike).toLocaleDateString('sv-SE', { timeZone: timezone });
}

function enumerateDates(dateFrom: string, dateTo: string): string[] {
  const result: string[] = [];
  const cursor = new Date(`${dateFrom}T00:00:00.000Z`);
  const end = new Date(`${dateTo}T00:00:00.000Z`);
  while (cursor.getTime() <= end.getTime()) {
    result.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

export function buildDateAvailabilitySummary(input: BuildDateAvailabilityInput): DateAvailabilityEntry[] {
  const slotsByDate = new Map<string, SerializedSlot[]>();
  for (const slot of input.slots) {
    const localDate = localDateFromIso(slot.startAt, input.timezone);
    const list = slotsByDate.get(localDate) || [];
    list.push(slot);
    slotsByDate.set(localDate, list);
  }

  const allDates = enumerateDates(input.dateFrom, input.dateTo);
  return allDates.map((date) => {
    const slots = (slotsByDate.get(date) || [])
      .filter((slot) => slot.isAvailable)
      .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());

    if (slots.length > 0) {
      const selectedSlot = slots[0];
      return {
        date,
        state: 'available',
        capacityLeft: selectedSlot.capacityLeft,
        reason: '',
        messageZh: '',
        firstAvailableStartAt: selectedSlot.startAt,
        selectedSlot: {
          startAt: selectedSlot.startAt,
          endAt: selectedSlot.endAt,
          capacityLeft: selectedSlot.capacityLeft,
          bookingType: selectedSlot.bookingType,
          isAvailable: selectedSlot.isAvailable,
        },
      };
    }

    const groupedFailure = input.groupedRuleFailuresByDate?.[date];
    const reason = groupedFailure?.reasonCode || input.fallbackReason || 'NO_SLOTS';
    const messageZh =
      groupedFailure?.messageZh ||
      input.fallbackMessageZh ||
      '此日期目前無可預約名額，請選擇其他日期。';

    return {
      date,
      state: reason === 'NO_SLOTS' ? 'no_slots' : 'blocked',
      capacityLeft: 0,
      reason,
      messageZh,
    };
  });
}
