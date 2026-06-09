import {
  evaluateBookingAvailability,
  type BookingAvailabilityEvaluation,
  type BookingAvailabilityEvaluatorInput,
} from './booking-availability-evaluator.ts';
import { resolveCanonicalAvailabilityState } from './effective-availability-resolver.ts';
import { getCanonicalReasonCopy } from './canonical-reason-copy.ts';
import type { SerializedSlot } from '../slot-generator.ts';

export interface EffectiveBookingAvailabilityResult {
  available: boolean;
  reasonCode?: string;
  messageZh?: string;
  matchedSlot?: SerializedSlot;
  canonicalState?: string;
  evaluation: BookingAvailabilityEvaluation;
}

function startAtMillis(value: string): number {
  return new Date(value).getTime();
}

function isSourceOfTruthSelectedScheduleAuthority(value: string | undefined): boolean {
  return value === 'authoritative' || value === 'fallback';
}

function canBypassGeneratedCanonicalMiss(params: {
  canonicalState: string;
  canonicalMetadata?: Record<string, string>;
}): boolean {
  void params.canonicalMetadata;
  return params.canonicalState === 'outside_rule';
}

export function resolveEffectiveBookingAvailabilityForStartAt(params: {
  requestedStartAt: string;
  timezone: string;
  evaluation: BookingAvailabilityEvaluation;
}): EffectiveBookingAvailabilityResult {
  const requestedStartAtMs = startAtMillis(params.requestedStartAt);
  const matchedSlot = params.evaluation.slots.find((slot) => startAtMillis(slot.startAt) === requestedStartAtMs);

  const canonical = resolveCanonicalAvailabilityState({
    requestedStartAt: params.requestedStartAt,
    requestedEndAt: matchedSlot?.endAt,
    timezone: params.timezone,
    rules: params.evaluation.diagnostics.rules,
    blackouts: params.evaluation.diagnostics.blackouts,
    bookings: params.evaluation.diagnostics.bookings,
    seasons: params.evaluation.diagnostics.seasons,
    seasonGateEnabled: params.evaluation.diagnostics.seasonGateEnabled,
    isYearRound: params.evaluation.diagnostics.isYearRound,
    planStatus: params.evaluation.diagnostics.planStatus,
    slotAvailable: Boolean(matchedSlot),
    slotUnavailableReason: params.evaluation.reasonCode,
    capacityAvailable: params.evaluation.reasonCode !== 'CAPACITY_EXCEEDED',
  });
  const effectiveCanonicalState = matchedSlot?.canonicalState ?? canonical.state;

  if (matchedSlot && (effectiveCanonicalState === 'available' || effectiveCanonicalState === 'allowed_with_admin_override')) {
    return {
      available: true,
      matchedSlot,
      canonicalState: effectiveCanonicalState,
      evaluation: params.evaluation,
    };
  }

  if (
    matchedSlot &&
    isSourceOfTruthSelectedScheduleAuthority(params.evaluation.selectedScheduleAuthority) &&
    canBypassGeneratedCanonicalMiss({
      canonicalState: canonical.state,
      canonicalMetadata: canonical.metadata,
    })
  ) {
    return {
      available: true,
      matchedSlot,
      canonicalState: canonical.state,
      evaluation: params.evaluation,
    };
  }

  const canonicalReasonCode =
    canonical.state === 'outside_season' || canonical.state === 'blocked_by_conflict'
      ? canonical.state
      : params.evaluation.reasonCode ?? 'BOOKING_CONFLICT';

  // Issue #1212 partial wiring: when the evaluator did not produce a
  // dynamic message (e.g. capacity-aware "剩餘 N 人" string), fall back
  // to the canonical zh-TW copy for the resolved CanonicalAvailabilityState
  // so admin / guide / traveler share the same body text on the fallback
  // path. The dynamic evaluator-supplied messageZh still takes precedence
  // (acceptance #4 — "no copy weakening"); only the previously hard-coded
  // generic "此時段已無可用名額…" fallback is replaced.
  return {
    available: false,
    reasonCode: canonicalReasonCode,
    canonicalState: canonical.state,
    messageZh: params.evaluation.messageZh ?? getCanonicalReasonCopy(canonical.state).bodyZh,
    evaluation: params.evaluation,
  };
}

export function shouldRejectDraftByEffectiveAvailability(params: {
  scheduleValidatedBySourceOfTruth: boolean;
  generatedSlotValidation: { available: boolean };
}): boolean {
  return !params.generatedSlotValidation.available;
}

export function shouldRejectDraftByLegacySlotAvailability(params: {
  hasActiveAvailabilityRules: boolean;
  scheduleValidatedBySourceOfTruth: boolean;
  slotValidation: { available: boolean; reason?: string };
}): boolean {
  if (params.slotValidation.available) {
    return false;
  }

  if (params.slotValidation.reason === 'SLOT_IN_PAST') {
    return true;
  }

  if (!params.scheduleValidatedBySourceOfTruth) {
    return true;
  }

  return !params.hasActiveAvailabilityRules;
}

export function evaluateEffectiveBookingAvailability(
  input: BookingAvailabilityEvaluatorInput & { requestedStartAt: string }
): EffectiveBookingAvailabilityResult {
  const evaluation = evaluateBookingAvailability(input);
  return resolveEffectiveBookingAvailabilityForStartAt({
    requestedStartAt: input.requestedStartAt,
    timezone: input.timezone,
    evaluation,
  });
}
