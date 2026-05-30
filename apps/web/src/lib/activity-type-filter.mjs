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

export function resolveCanonicalType(typeOptions, rawType) {
  const normalizedRaw = normalizeActivityTypeForFilter(rawType);
  if (!normalizedRaw) return '';

  const matched = typeOptions.find((option) => normalizeActivityTypeForFilter(option) === normalizedRaw);
  return matched || rawType;
}
