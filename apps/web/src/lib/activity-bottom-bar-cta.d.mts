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

// labelKey：i18n message key（bottomBar.ctaBook / ctaSelectPlan）。label 維持中文供
// 既有 #919 純函式契約；UI 改以 labelKey 透過 next-intl 取對應語言文字（#multilingual）。
export type BottomBarCtaLabelKey = 'ctaBook' | 'ctaSelectPlan';

export type BottomBarCta =
  | { mode: 'book'; href: string; label: string; labelKey: BottomBarCtaLabelKey; selected: BottomBarCtaSelected | null }
  | { mode: 'scroll'; targetId: string; label: string; labelKey: BottomBarCtaLabelKey; selected: null };

export function resolveBottomBarCta(args: ResolveBottomBarCtaArgs): BottomBarCta;
