import {
  evaluateBookingAvailability,
  type BookingAvailabilityEvaluation,
  type BookingAvailabilityEvaluatorInput,
} from './booking-availability-evaluator.ts';
import type { SerializedSlot } from '../slot-generator.ts';

export interface EffectiveBookingAvailabilityResult {
  available: boolean;
  reasonCode?: string;
  messageZh?: string;
  matchedSlot?: SerializedSlot;
  evaluation: BookingAvailabilityEvaluation;
}

function startAtMillis(value: string): number {
  return new Date(value).getTime();
}

export function resolveEffectiveBookingAvailabilityForStartAt(params: {
  requestedStartAt: string;
  evaluation: BookingAvailabilityEvaluation;
}): EffectiveBookingAvailabilityResult {
  const requestedStartAtMs = startAtMillis(params.requestedStartAt);
  const matchedSlot = params.evaluation.slots.find((slot) => startAtMillis(slot.startAt) === requestedStartAtMs);

  if (matchedSlot) {
    return {
      available: true,
      matchedSlot,
      evaluation: params.evaluation,
    };
  }

  return {
    available: false,
    reasonCode: params.evaluation.reasonCode ?? 'BOOKING_CONFLICT',
    messageZh: params.evaluation.messageZh ?? '此時段已無可用名額，請重新選擇時段',
    evaluation: params.evaluation,
  };
}

export function evaluateEffectiveBookingAvailability(
  input: BookingAvailabilityEvaluatorInput & { requestedStartAt: string }
): EffectiveBookingAvailabilityResult {
  const evaluation = evaluateBookingAvailability(input);
  return resolveEffectiveBookingAvailabilityForStartAt({
    requestedStartAt: input.requestedStartAt,
    evaluation,
  });
}
