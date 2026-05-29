// Type sidecar for activity-bottom-bar-cta.mjs (issue #919).

export interface BottomBarCtaSelected {
  id: string;
  label: string;
  price: number;
  priceType: 'per_person' | 'per_group';
  date?: string;
  scheduleId?: string;
}

export interface ResolveBottomBarCtaArgs {
  selected?: BottomBarCtaSelected | null;
  directBookingHref?: string | null;
  activitySlug: string;
  useBookingV2?: boolean;
  planSectionId?: string;
}

export type BottomBarCta =
  | { mode: 'book'; href: string; label: string; selected: BottomBarCtaSelected | null }
  | { mode: 'scroll'; targetId: string; label: string; selected: null };

export function resolveBottomBarCta(args: ResolveBottomBarCtaArgs): BottomBarCta;
