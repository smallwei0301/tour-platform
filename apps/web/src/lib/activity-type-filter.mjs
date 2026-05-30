const EMOJI_REGEX = /[\p{Extended_Pictographic}\uFE0F]/gu;

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function normalizeActivityTypeForFilter(value) {
  if (!value) return '';

  return safeDecode(String(value))
    .replace(/\+/g, ' ')
    .normalize('NFKC')
    .replace(EMOJI_REGEX, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isActivityTypeMatch(category, selectedType) {
  const normalizedCategory = normalizeActivityTypeForFilter(category);
  const normalizedSelected = normalizeActivityTypeForFilter(selectedType);

  if (!normalizedCategory || !normalizedSelected) return false;
  return normalizedCategory.includes(normalizedSelected) || normalizedSelected.includes(normalizedCategory);
}

export function isActivityTypeKeywordMatch(activity, selectedType) {
  const keyword = normalizeActivityTypeForFilter(selectedType);
  if (!keyword) return false;

  const searchable = [activity?.title, activity?.tagline, activity?.shortDescription]
    .map((value) => normalizeActivityTypeForFilter(value))
    .filter(Boolean)
    .join(' ');

  return searchable.includes(keyword);
}

export function resolveCanonicalType(typeOptions, rawType) {
  const normalizedRaw = normalizeActivityTypeForFilter(rawType);
  if (!normalizedRaw) return '';

  const matched = typeOptions.find((option) => normalizeActivityTypeForFilter(option) === normalizedRaw);
  return matched || rawType;
}
