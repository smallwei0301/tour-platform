import type {
  AvailabilityRule,
  TimeSlot,
} from '../slot-generator.ts';

export interface SelectorCandidateProvenance {
  slot: TimeSlot;
  rule: AvailabilityRule;
}

export function appendSelectorCandidateProvenance(
  target: SelectorCandidateProvenance[],
  slots: TimeSlot[],
  rule: AvailabilityRule,
): void {
  for (const slot of slots) {
    target.push({ slot, rule });
  }
}

export function filterSelectorCandidatesByRuleBuffers(
  candidates: SelectorCandidateProvenance[],
  conflictsWithBlackout: (slot: TimeSlot) => boolean,
  conflictsWithBooking: (
    slot: TimeSlot,
    bufferBefore: number,
    bufferAfter: number,
  ) => boolean,
): TimeSlot[] {
  return candidates
    .filter(({ slot, rule }) =>
      !conflictsWithBlackout(slot) &&
      !conflictsWithBooking(
        slot,
        rule.buffer_before_minutes,
        rule.buffer_after_minutes,
      )
    )
    .map(({ slot }) => slot);
}
