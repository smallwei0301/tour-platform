import {
  generateAvailableSlots,
  getDateStringInTimezone,
  formatDateWithTimezone,
  validateSlotAvailability,
  type ActivityPlan,
  type AvailabilityRule,
  type BlackoutWindow,
  type ExistingBooking,
  type SerializedSlot,
  type SlotGeneratorDeps,
  type SlotGeneratorInput,
} from '../slot-generator.ts';
import type { ActivityPlanSeason } from './effective-availability-resolver.ts';
import {
  CAPACITY_HOLD_BOOKING_STATUSES,
  FORMED_GROUP_BOOKING_STATUSES,
  calculateExistingParticipantsForGroup,
  evaluateGroupBookingRule,
  excludeSameActivityPlanDateRangeBookings,
} from './group-booking-rule.ts';

export type SelectedScheduleAuthority = 'authoritative' | 'fallback' | 'generated' | 'none';

export interface EvaluatorSchedule {
  id: string;
  activity_id: string;
  plan_id: string | null;
  start_at: string;
  end_at: string;
  capacity: number;
  booked_count: number;
  status: string;
}

export interface BookingAvailabilityEvaluatorInput {
  guideId: string;
  activityId: string;
  planId: string;
  timezone: string;
  participants: number;
  dateFrom: string;
  dateTo: string;
  minParticipants: number;
  rules: AvailabilityRule[];
  blackouts: BlackoutWindow[];
  bookings: ExistingBooking[];
  plan: ActivityPlan;
  selectedSchedule?: EvaluatorSchedule | null;
  selectedScheduleAuthority?: Exclude<SelectedScheduleAuthority, 'generated' | 'none'>;
  seasons?: ActivityPlanSeason[];
  planStatus?: string;
}

export interface BookingAvailabilityEvaluation {
  available: boolean;
  reasonCode?: string;
  messageZh?: string;
  capacityLeft?: number;
  selectedScheduleAuthority: SelectedScheduleAuthority;
  slots: SerializedSlot[];
  diagnostics: {
    generatedSlotCount: number;
    filteredSlotCount: number;
    schedulePresentInGeneratedSlots: boolean;
    hasRules: boolean;
    groupedRuleFailuresByDate: Record<string, { reasonCode?: string; messageZh?: string }>;
    rules: AvailabilityRule[];
    blackouts: BlackoutWindow[];
    bookings: ExistingBooking[];
    seasons: ActivityPlanSeason[];
    seasonGateEnabled: boolean;
    planStatus: string;
  };
}

export function evaluateBookingAvailability(input: BookingAvailabilityEvaluatorInput): BookingAvailabilityEvaluation {
  const slotInput: SlotGeneratorInput = {
    guideId: input.guideId,
    activityPlanId: input.planId,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    timezone: input.timezone,
    participants: input.participants,
  };

  const nonGroupConflictBookings = excludeSameActivityPlanDateRangeBookings({
    bookings: input.bookings,
    activityId: input.activityId,
    planId: input.planId,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    timezone: input.timezone,
  });

  const deps: SlotGeneratorDeps = {
    rules: input.rules,
    blackouts: input.blackouts,
    bookings: nonGroupConflictBookings,
    plan: input.plan,
  };

  const generated = generateAvailableSlots(slotInput, deps);
  const groupedRuleFailuresByDate = new Map<string, { reasonCode?: string; messageZh?: string }>();

  const filteredSlots = generated.slots.filter((slot) => {
    const localDate = getDateStringInTimezone(new Date(slot.startAt), input.timezone);
    const effectiveExistingParticipantsForFormed = calculateExistingParticipantsForGroup({
      bookings: input.bookings,
      activityId: input.activityId,
      planId: input.planId,
      localDate,
      timezone: input.timezone,
      statuses: FORMED_GROUP_BOOKING_STATUSES,
    });

    const effectiveExistingParticipantsForCapacityHold = calculateExistingParticipantsForGroup({
      bookings: input.bookings,
      activityId: input.activityId,
      planId: input.planId,
      localDate,
      timezone: input.timezone,
      statuses: CAPACITY_HOLD_BOOKING_STATUSES,
    });

    const capacityHoldRule = evaluateGroupBookingRule({
      minParticipants: input.minParticipants,
      maxParticipants: input.plan.max_participants,
      effectiveExistingParticipants: effectiveExistingParticipantsForCapacityHold,
      requestedParticipants: input.participants,
    });

    const groupRule = evaluateGroupBookingRule({
      minParticipants: input.minParticipants,
      maxParticipants: input.plan.max_participants,
      effectiveExistingParticipants: effectiveExistingParticipantsForFormed,
      requestedParticipants: input.participants,
    });

    const rule =
      !capacityHoldRule.allowed && capacityHoldRule.reasonCode === 'CAPACITY_EXCEEDED'
        ? capacityHoldRule
        : groupRule;

    if (rule.allowed) return true;

    groupedRuleFailuresByDate.set(localDate, {
      reasonCode: rule.reasonCode,
      messageZh: rule.messageZh,
    });
    return false;
  });

  const firstRuleFailure = groupedRuleFailuresByDate.values().next().value as
    | { reasonCode?: string; messageZh?: string }
    | undefined;

  let slots = filteredSlots;
  let selectedScheduleRuleFailure: { reasonCode?: string; messageZh?: string } | undefined;
  let selectedScheduleAuthority: SelectedScheduleAuthority = filteredSlots.length > 0 ? 'generated' : 'none';
  let capacityLeft: number | undefined;
  let schedulePresentInGeneratedSlots = false;

  const selectedSchedule = input.selectedSchedule ?? null;
  if (selectedSchedule) {
    selectedScheduleAuthority = input.selectedScheduleAuthority ?? 'authoritative';
    const selectedScheduleStartAtMs = new Date(selectedSchedule.start_at).getTime();
    schedulePresentInGeneratedSlots = filteredSlots.some(
      (slot) => new Date(slot.startAt).getTime() === selectedScheduleStartAtMs,
    );

    const shouldEnforceGeneratedSlotPresence = input.rules.length > 0;
    const selectedScheduleMissingFromGeneratedSlots =
      shouldEnforceGeneratedSlotPresence && !schedulePresentInGeneratedSlots;
    const selectedScheduleBaseValidation = schedulePresentInGeneratedSlots
      ? { available: true }
      : validateSlotAvailability(
          selectedSchedule.start_at,
          selectedSchedule.end_at,
          input.guideId,
          {
            blackouts: input.blackouts,
            bookings: nonGroupConflictBookings,
            bufferBefore: 0,
            bufferAfter: 0,
          },
        );

    const localDate = getDateStringInTimezone(new Date(selectedSchedule.start_at), input.timezone);

    const effectiveExistingParticipantsForFormed = calculateExistingParticipantsForGroup({
      bookings: input.bookings,
      activityId: input.activityId,
      planId: input.planId,
      localDate,
      timezone: input.timezone,
      statuses: FORMED_GROUP_BOOKING_STATUSES,
    });

    const effectiveExistingParticipantsForCapacityHold = calculateExistingParticipantsForGroup({
      bookings: input.bookings,
      activityId: input.activityId,
      planId: input.planId,
      localDate,
      timezone: input.timezone,
      statuses: CAPACITY_HOLD_BOOKING_STATUSES,
    });

    const capacityHoldRule = evaluateGroupBookingRule({
      minParticipants: input.minParticipants,
      maxParticipants: input.plan.max_participants,
      effectiveExistingParticipants: effectiveExistingParticipantsForCapacityHold,
      requestedParticipants: input.participants,
    });
    const groupRule = evaluateGroupBookingRule({
      minParticipants: input.minParticipants,
      maxParticipants: input.plan.max_participants,
      effectiveExistingParticipants: effectiveExistingParticipantsForFormed,
      requestedParticipants: input.participants,
    });

    const selectedScheduleRule =
      !capacityHoldRule.allowed && capacityHoldRule.reasonCode === 'CAPACITY_EXCEEDED'
        ? capacityHoldRule
        : groupRule;

    const remaining = Math.max(0, selectedSchedule.capacity - selectedSchedule.booked_count);
    const insufficient = remaining < input.participants;

    if (
      selectedSchedule.status !== 'open' ||
      selectedScheduleMissingFromGeneratedSlots ||
      !selectedScheduleBaseValidation.available ||
      !selectedScheduleRule.allowed ||
      insufficient
    ) {
      slots = [];
      if (selectedScheduleMissingFromGeneratedSlots) {
        selectedScheduleRuleFailure = {
          reasonCode: 'BOOKING_CONFLICT',
          messageZh: '此時段已無可用名額，請重新選擇時段',
        };
      } else if (selectedSchedule.status !== 'open') {
        selectedScheduleRuleFailure = {
          reasonCode: 'BOOKING_CONFLICT',
          messageZh: '此時段已無可用名額，請重新選擇時段',
        };
      } else if (!selectedScheduleBaseValidation.available) {
        selectedScheduleRuleFailure = {
          reasonCode: selectedScheduleBaseValidation.reason,
          messageZh:
            selectedScheduleBaseValidation.reason === 'SLOT_IN_PAST'
              ? '所選時段已過期，請重新選擇時段'
              : selectedScheduleBaseValidation.reason === 'BLACKOUT_CONFLICT'
                ? '該時段暫停開放預約，請選擇其他時段'
                : '該時段已無可用名額，請選擇其他時段',
        };
      } else if (!selectedScheduleRule.allowed) {
        selectedScheduleRuleFailure = {
          reasonCode: selectedScheduleRule.reasonCode,
          messageZh: selectedScheduleRule.messageZh,
        };
      } else if (insufficient) {
        selectedScheduleRuleFailure = {
          reasonCode: 'CAPACITY_EXCEEDED',
          messageZh: `此行程最多 ${selectedSchedule.capacity} 人，當前時段剩餘 ${remaining} 人可預訂`,
        };
      }
    } else {
      capacityLeft = Math.min(remaining, input.plan.max_participants);
      slots = [
        {
          startAt: formatDateWithTimezone(new Date(selectedSchedule.start_at), input.timezone),
          endAt: formatDateWithTimezone(new Date(selectedSchedule.end_at), input.timezone),
          capacityLeft,
          bookingType: input.plan.booking_type,
          isAvailable: true,
        },
      ];
    }
  }

  const reasonCode = slots.length === 0
    ? selectedScheduleRuleFailure?.reasonCode ?? firstRuleFailure?.reasonCode
    : undefined;
  const messageZh = slots.length === 0
    ? selectedScheduleRuleFailure?.messageZh ?? firstRuleFailure?.messageZh
    : undefined;

  return {
    available: slots.length > 0,
    reasonCode,
    messageZh,
    capacityLeft,
    selectedScheduleAuthority,
    slots,
    diagnostics: {
      generatedSlotCount: generated.slots.length,
      filteredSlotCount: filteredSlots.length,
      schedulePresentInGeneratedSlots,
      hasRules: input.rules.length > 0,
      groupedRuleFailuresByDate: Object.fromEntries(groupedRuleFailuresByDate.entries()),
      rules: input.rules,
      blackouts: input.blackouts,
      bookings: input.bookings,
      seasons: input.seasons ?? [],
      seasonGateEnabled: input.seasons !== undefined,
      planStatus: input.planStatus ?? 'active',
    },
  };
}
