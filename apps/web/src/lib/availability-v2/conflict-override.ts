export type ConflictOverrideStatus = 'active' | 'disabled' | 'cancelled';
export type ConflictOverrideHelperStatus =
  | 'not_needed'
  | 'required'
  | 'pending_assignment'
  | 'assigned'
  | 'declined';

export interface GuideSlotConflictOverride {
  id: string;
  guide_id: string;
  activity_id: string;
  activity_plan_id: string;
  start_at: string;
  end_at: string;
  reason: string;
  requires_helper: boolean;
  helper_status: ConflictOverrideHelperStatus;
  guide_note?: string | null;
  admin_note?: string | null;
  status: ConflictOverrideStatus;
  created_at?: string | null;
  created_by_admin_email?: string | null;
}

export interface ConflictOverrideClientSnapshot {
  id: string;
  reason: string;
  requiresHelper: boolean;
  helperStatus: ConflictOverrideHelperStatus;
  guideNote?: string | null;
  adminNote?: string | null;
  createdAt?: string | null;
  createdByAdminEmail?: string | null;
}

/** Public (traveler-visible) snapshot — admin-only fields stripped. */
export interface ConflictOverridePublicSnapshot {
  id: string;
  reason: string;
  requiresHelper: boolean;
  helperStatus: ConflictOverrideHelperStatus;
  guideNote?: string | null;
}

export function isActiveConflictOverride(
  override: Pick<GuideSlotConflictOverride, 'status'> | null | undefined,
): boolean {
  return override?.status === 'active';
}

export function findMatchingConflictOverride(params: {
  guideId: string;
  activityId: string;
  planId: string;
  requestedStartAt: string;
  requestedEndAt?: string;
  overrides?: GuideSlotConflictOverride[] | null;
}): GuideSlotConflictOverride | null {
  if (!params.requestedEndAt) return null;

  return (
    params.overrides?.find(
      (override) =>
        isActiveConflictOverride(override) &&
        override.guide_id === params.guideId &&
        override.activity_id === params.activityId &&
        override.activity_plan_id === params.planId &&
        override.start_at === params.requestedStartAt &&
        override.end_at === params.requestedEndAt,
    ) ?? null
  );
}

export function serializeConflictOverrideForClient(
  override: GuideSlotConflictOverride,
): ConflictOverrideClientSnapshot {
  return {
    id: override.id,
    reason: override.reason,
    requiresHelper: Boolean(override.requires_helper),
    helperStatus: override.helper_status,
    guideNote: override.guide_note ?? null,
    adminNote: override.admin_note ?? null,
    createdAt: override.created_at ?? null,
    createdByAdminEmail: override.created_by_admin_email ?? null,
  };
}

/**
 * Public serializer for traveler-visible available-slots output.
 * Strips admin-only fields (adminNote, createdByAdminEmail) that must not
 * be exposed to unauthenticated travelers.
 */
export function serializeConflictOverrideForPublic(
  override: GuideSlotConflictOverride,
): ConflictOverridePublicSnapshot {
  return {
    id: override.id,
    reason: override.reason,
    requiresHelper: Boolean(override.requires_helper),
    helperStatus: override.helper_status,
    guideNote: override.guide_note ?? null,
  };
}
