// #919: pure resolver for the activity detail page's bottom CTA.
// - traveler has selected a plan -> direct booking link with full plan params
// - no selection, but the server-provided directBookingHref already carries a
//   `plan=` (single-plan activity) -> keep working as before (no regression)
// - otherwise (multiple active plans / can't infer) -> scroll to the plan section
//   instead of navigating to a booking page that would error with "缺少或無法判定方案參數".
//
// Output is a small, JSON-serialisable descriptor so the UI layer stays dumb
// and we can unit-test the decision independently of React.

import { resolvePlanBookingHref } from './booking-entry.mjs';

const DEFAULT_PLAN_SECTION_ID = 'section-plan';

function hrefHasPlanParam(href) {
  if (typeof href !== 'string' || !href) return false;
  const qIdx = href.indexOf('?');
  if (qIdx === -1) return false;
  const query = href.slice(qIdx + 1);
  for (const pair of query.split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const key = eq === -1 ? pair : pair.slice(0, eq);
    if (key === 'plan') {
      const value = eq === -1 ? '' : pair.slice(eq + 1);
      if (value.trim().length > 0) return true;
    }
  }
  return false;
}

export function resolveBottomBarCta({
  selected,
  directBookingHref,
  activitySlug,
  useBookingV2 = true,
  planSectionId = DEFAULT_PLAN_SECTION_ID,
} = {}) {
  if (selected && typeof selected.id === 'string' && selected.id.trim().length > 0) {
    const href = resolvePlanBookingHref({
      activitySlug,
      planId: selected.id,
      date: selected.date || undefined,
      scheduleId: selected.scheduleId || undefined,
      useBookingV2,
    });
    return { mode: 'book', href, label: '立即預約', selected };
  }

  if (hrefHasPlanParam(directBookingHref)) {
    return { mode: 'book', href: directBookingHref, label: '選擇方案', selected: null };
  }

  return { mode: 'scroll', targetId: planSectionId, label: '選擇方案', selected: null };
}
