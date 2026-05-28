const DEFAULT_PLAN_SLUG_PREFIX = 'plan';

function slugifyAscii(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function defaultUniqueSuffix() {
  const timePart = Date.now().toString(36);
  const randomPart = Math.random().toString(36).slice(2, 8);
  return `${timePart}-${randomPart}`;
}

/**
 * @param {{ name?: unknown, slug?: unknown, prefix?: string, suffix?: string | (() => string) }} [options]
 */
export function generatePlanSlug({ name, slug, prefix = DEFAULT_PLAN_SLUG_PREFIX, suffix = defaultUniqueSuffix } = {}) {
  const explicitSlug = slugifyAscii(slug);
  if (explicitSlug) return explicitSlug;

  const nameSlug = slugifyAscii(name);
  if (nameSlug) return nameSlug;

  const safePrefix = slugifyAscii(prefix) || DEFAULT_PLAN_SLUG_PREFIX;
  const uniqueSuffix = typeof suffix === 'function' ? suffix() : suffix;
  const safeSuffix = slugifyAscii(uniqueSuffix) || defaultUniqueSuffix();
  return `${safePrefix}-${safeSuffix}`;
}

export function isDuplicatePlanSlugError(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || error?.details || '');
  return code === '23505' || /duplicate key|unique constraint/i.test(message);
}

export function duplicatePlanSlugMessage(slug) {
  return `Plan slug "${slug}" already exists for this activity. Please choose a different slug or rename the plan.`;
}
