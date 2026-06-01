export function resolveDatePlanPresentation({ useBookingV2, canonicalPlans, defaultPlans }) {
  const hasCanonicalPlans = Array.isArray(canonicalPlans) && canonicalPlans.length > 0;

  if (hasCanonicalPlans) {
    return {
      plans: canonicalPlans,
      showMissingCanonicalMessage: false,
    };
  }

  if (useBookingV2) {
    return {
      plans: [],
      showMissingCanonicalMessage: true,
    };
  }

  return {
    plans: defaultPlans,
    showMissingCanonicalMessage: false,
  };
}
