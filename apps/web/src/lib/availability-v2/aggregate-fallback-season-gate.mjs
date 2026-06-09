/**
 * Issue #1307 — aggregate fallback season gate when no activityPlanId
 * is provided to GET /api/guide/availability-preview.
 *
 * Original bug: when the guide opened /guide/availability without
 * selecting a specific plan, the route set previewPlanSeasons=[] and
 * previewIsYearRound=false, so resolvePreviewCanonicalReason returned
 * canonicalState='outside_season' / seasonGate='no_active_season'. UI
 * then showed 「此期間無可用時段。方案尚未設定開放季節。」 even though
 * the guide had valid rules pointing at plans that were either
 * year-round or had active seasons covering the requested date.
 *
 * Fix: in the fallback (no activityPlanId) path, aggregate the
 * season state across every plan referenced by the guide's active
 * rules. Any plan with is_year_round=true or with at least one
 * active season → the aggregated gate is open.
 *
 * Pure helper — no Supabase / no logging. Route owns the queries; this
 * file owns the contract for collapsing N plan-level season states
 * into one preview-level gate.
 */

/**
 * @typedef {{
 *   id: string,
 *   activity_plan_id: string,
 *   start_month: number,
 *   start_day: number,
 *   end_month: number,
 *   end_day: number,
 *   timezone: string,
 *   is_active: boolean,
 * }} PreviewActivityPlanSeasonRow
 */

/**
 * @param {{
 *   plansById: Record<string, { is_year_round?: boolean | null }>,
 *   seasons: ReadonlyArray<PreviewActivityPlanSeasonRow>,
 * }} input
 * @returns {{
 *   seasons: PreviewActivityPlanSeasonRow[],
 *   isYearRound: boolean,
 * }}
 */
export function aggregateFallbackSeasonGate(input) {
  const plansById =
    input?.plansById && typeof input.plansById === 'object' ? input.plansById : {};
  const seasons = Array.isArray(input?.seasons) ? input.seasons.filter(Boolean) : [];

  // Any plan flagged year-round opens the gate regardless of the
  // explicit season rows.
  const isYearRound = Object.values(plansById).some(
    (plan) => Boolean(plan && plan.is_year_round === true),
  );

  // Caller will pass through to resolvePreviewCanonicalReason, which
  // already filters by is_active and date inclusion; the aggregator
  // just preserves the union of rows.
  return {
    seasons,
    isYearRound,
  };
}
