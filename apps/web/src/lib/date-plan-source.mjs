// #1407 legacy 退役後：方案呈現一律走 V2 語意——
// 有 canonical 方案就顯示；沒有就顯示「尚未開放線上預約」訊息，
// 不再退回展示用 default plans（該行為屬 legacy 展示模式，已隨退役刪除）。
export function resolveDatePlanPresentation({ canonicalPlans }) {
  const hasCanonicalPlans = Array.isArray(canonicalPlans) && canonicalPlans.length > 0;

  if (hasCanonicalPlans) {
    return {
      plans: canonicalPlans,
      showMissingCanonicalMessage: false,
    };
  }

  return {
    plans: [],
    showMissingCanonicalMessage: true,
  };
}
