/**
 * Issue #1307 follow-up — shared fallback slot generation for the
 * "no activityPlanId" (全部方案) availability preview.
 *
 * Original bug: both preview routes generated fallback slots by calling
 * generateAvailableSlots() with activityPlanId=null (guide route) or a
 * synthetic 'preview' id (admin route). slot-generator's
 * getAvailabilityRules() drops every rule whose activity_plan_id is set
 * and differs from the requested planId — so all plan-bound rules (the
 * normal case: the rule modal binds a 方案) silently produced ZERO
 * candidates, and the default preview showed 「此期間無可用時段」 even
 * though the rules were saved correctly. #1307 fixed only the season
 * label; this helper fixes slot generation itself.
 *
 * Fix: group rules by their own activity_plan_id and thread that id
 * through generateAvailableSlots so plan-bound rules survive filtering.
 * When the caller provides plan meta, the plan's real duration /
 * capacity / min_participants are used; otherwise the legacy
 * interval-as-duration approximation is kept. Unbound (null-plan) rules
 * keep the original synthetic behavior verbatim.
 *
 * Pure helper — no Supabase / no logging. Routes own the queries.
 */

import {
  generateAvailableSlots,
  type AvailabilityRule,
  type BlackoutWindow,
  type ExistingBooking,
  type ActivityPlan,
  type SerializedSlot,
} from '../slot-generator.ts';

export interface FallbackPlanMeta {
  duration_minutes?: number | null;
  max_participants?: number | null;
  booking_type?: string | null;
  min_participants?: number | null;
}

export interface FallbackPreviewSlot extends SerializedSlot {
  /** 成團人數 from the bound plan; null for unbound rules / unknown plans */
  minParticipants: number | null;
  /** which plan produced this slot (null = unbound rule) */
  activityPlanId: string | null;
}

export interface FallbackPreviewInput {
  guideId: string;
  rules: AvailabilityRule[];
  blackouts: BlackoutWindow[];
  bookings: ExistingBooking[];
  dateFrom: string; // "YYYY-MM-DD"
  dateTo: string; // "YYYY-MM-DD"
  timezone: string;
  planMetaById?: Record<string, FallbackPlanMeta>;
}

const VALID_BOOKING_TYPES = new Set(['scheduled', 'request', 'instant']);

function normalizeBookingType(value: string | null | undefined): ActivityPlan['booking_type'] {
  return VALID_BOOKING_TYPES.has(value ?? '')
    ? (value as ActivityPlan['booking_type'])
    : 'scheduled';
}

function groupByInterval(rules: AvailabilityRule[]): Map<number, AvailabilityRule[]> {
  const groups = new Map<number, AvailabilityRule[]>();
  for (const rule of rules) {
    const interval = rule.slot_interval_minutes || 60;
    const group = groups.get(interval);
    if (group) {
      group.push(rule);
    } else {
      groups.set(interval, [rule]);
    }
  }
  return groups;
}

export function generateFallbackPreviewSlots(input: FallbackPreviewInput): FallbackPreviewSlot[] {
  const { guideId, rules, blackouts, bookings, dateFrom, dateTo, timezone } = input;
  const planMetaById = input.planMetaById ?? {};

  // Partition rules: plan-bound rules must thread their own plan id
  // through generateAvailableSlots, or getAvailabilityRules drops them.
  const boundByPlan = new Map<string, AvailabilityRule[]>();
  const unbound: AvailabilityRule[] = [];
  for (const rule of rules) {
    if (rule.activity_plan_id) {
      const group = boundByPlan.get(rule.activity_plan_id);
      if (group) {
        group.push(rule);
      } else {
        boundByPlan.set(rule.activity_plan_id, [rule]);
      }
    } else {
      unbound.push(rule);
    }
  }

  const allSlots: FallbackPreviewSlot[] = [];

  const emit = (
    generated: SerializedSlot[],
    minParticipants: number | null,
    activityPlanId: string | null,
  ) => {
    for (const slot of generated) {
      allSlots.push({ ...slot, minParticipants, activityPlanId });
    }
  };

  const generateGroup = (
    groupRules: AvailabilityRule[],
    activityPlanId: string | null,
    plan: ActivityPlan,
    minParticipants: number | null,
  ) => {
    const result = generateAvailableSlots(
      { guideId, activityPlanId, dateFrom, dateTo, timezone, participants: 1 },
      { rules: groupRules, blackouts, bookings, plan },
    );
    emit(result.slots, minParticipants, activityPlanId);
  };

  for (const [planId, groupRules] of boundByPlan) {
    const meta = planMetaById[planId];
    const minParticipants = meta?.min_participants ?? null;
    if (meta?.duration_minutes != null) {
      // Real plan meta known → canonical generation with true duration.
      generateGroup(groupRules, planId, {
        id: planId,
        activity_id: '',
        duration_minutes: meta.duration_minutes,
        max_participants: meta.max_participants ?? 99,
        booking_type: normalizeBookingType(meta.booking_type),
        min_participants: minParticipants,
      }, minParticipants);
    } else {
      // No meta → legacy approximation: each rule's interval acts as duration.
      for (const [interval, intervalRules] of groupByInterval(groupRules)) {
        generateGroup(intervalRules, planId, {
          id: planId,
          activity_id: '',
          duration_minutes: interval,
          max_participants: meta?.max_participants ?? 99,
          booking_type: normalizeBookingType(meta?.booking_type),
          min_participants: minParticipants,
        }, minParticipants);
      }
    }
  }

  // Unbound rules: original synthetic behavior (interval-as-duration).
  for (const [interval, intervalRules] of groupByInterval(unbound)) {
    generateGroup(intervalRules, null, {
      id: 'fallback-synthetic',
      activity_id: 'fallback',
      duration_minutes: interval,
      max_participants: 99,
      booking_type: 'scheduled',
    }, null);
  }

  // Sort by start time, dedupe identical windows across rules/plans.
  allSlots.sort((a, b) => a.startAt.localeCompare(b.startAt) || a.endAt.localeCompare(b.endAt));
  const seen = new Set<string>();
  return allSlots.filter((slot) => {
    const key = `${slot.startAt}|${slot.endAt}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
