// 僅供 #1825 guide service-draft activity identity chain 使用：格式正規化，不承擔授權語意。
const STRUCTURAL_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export function normalizeStructuralUuid(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return STRUCTURAL_UUID_PATTERN.test(normalized) ? normalized.toLowerCase() : null;
}
