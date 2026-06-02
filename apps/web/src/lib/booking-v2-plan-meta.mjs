export function derivePlanMetaFromActivityPlans(plans, planKey) {
  if (!Array.isArray(plans) || typeof planKey !== 'string' || planKey.length === 0) {
    return null;
  }

  const matched = plans.find((p) => p && (p.id === planKey || p.slug === planKey));
  if (!matched) return null;

  const basePrice = Number(matched.basePrice);
  if (!Number.isFinite(basePrice) || basePrice <= 0) return null;

  const name =
    [matched.displayName, matched.label, matched.name]
      .map((v) => (typeof v === 'string' ? v.trim() : ''))
      .find((v) => v.length > 0) || null;

  const minParticipantsRaw = Number(matched.minParticipants);
  const maxParticipantsRaw = Number(matched.maxParticipants);

  return {
    name,
    priceType: matched.priceType === 'per_group' ? 'per_group' : 'per_person',
    basePrice,
    minParticipants:
      Number.isFinite(minParticipantsRaw) && minParticipantsRaw > 0
        ? Math.max(1, Math.trunc(minParticipantsRaw))
        : 1,
    maxParticipants:
      Number.isFinite(maxParticipantsRaw) && maxParticipantsRaw > 0
        ? Math.trunc(maxParticipantsRaw)
        : null,
  };
}
