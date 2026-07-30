import { validateRawCatalog } from './extract-catalog.mjs';

const NORMALIZED_CATALOG_KEYS = Object.freeze([
  'schemaVersion', 'normalizerVersion', 'extractorVersion', 'serverMajorVersion',
  'ownershipOverlayStatus', 'sections',
]);

export function validateNormalizedCatalog(catalog) {
  if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) throw new Error('normalized catalog must be an object');
  const keys = Object.keys(catalog);
  for (const key of keys) if (!NORMALIZED_CATALOG_KEYS.includes(key)) throw new Error(`normalized catalog unknown key: ${key}`);
  for (const key of NORMALIZED_CATALOG_KEYS) if (!Object.hasOwn(catalog, key)) throw new Error(`normalized catalog missing key: ${key}`);
  if (catalog.schemaVersion !== 1 || catalog.normalizerVersion !== 1 || catalog.extractorVersion !== 1
    || catalog.serverMajorVersion !== 17 || catalog.ownershipOverlayStatus !== 'pending') {
    throw new Error('normalized catalog version or state mismatch');
  }
  validateRawCatalog({
    schemaVersion: catalog.schemaVersion,
    extractorVersion: catalog.extractorVersion,
    serverVersionNum: catalog.serverMajorVersion * 10_000,
    transactionReadOnly: true,
    ownershipOverlayStatus: catalog.ownershipOverlayStatus,
    sections: catalog.sections,
  });
  return catalog;
}
