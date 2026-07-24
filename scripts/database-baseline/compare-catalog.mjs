import { isDeepStrictEqual } from 'node:util';
import { CATALOG_SECTIONS } from './extract-catalog.mjs';

const ENVELOPE_KEYS = ['schemaVersion', 'normalizerVersion', 'extractorVersion', 'serverMajorVersion', 'ownershipOverlayStatus', 'sections'];

function keyId(key) {
  return JSON.stringify(key);
}

function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
}

function exactKeys(value, expected, label) {
  assertObject(value, label);
  const actual = Object.keys(value);
  for (const key of actual) {
    if (!expected.includes(key)) throw new Error(`${label} unknown key: ${key}`);
  }
  for (const key of expected) {
    if (!Object.hasOwn(value, key)) throw new Error(`${label} missing key: ${key}`);
  }
}

function assertCanonicalKey(key, label) {
  if (!Array.isArray(key) || key.length === 0
    || key.some((component) => component !== null && !['string', 'number', 'boolean'].includes(typeof component))) {
    throw new Error(`${label} canonical key invalid`);
  }
}

function validateNormalizedCatalog(catalog, label) {
  exactKeys(catalog, ENVELOPE_KEYS, label);
  if (catalog.schemaVersion !== 1 || catalog.normalizerVersion !== 1 || catalog.extractorVersion !== 1) {
    throw new Error(`${label} normalized version invalid`);
  }
  if (catalog.serverMajorVersion !== 17) throw new Error(`${label} requires PostgreSQL major 17`);
  if (catalog.ownershipOverlayStatus !== 'pending') throw new Error(`${label} ownership overlay status invalid`);
  assertObject(catalog.sections, `${label} sections`);
  const sectionKeys = Object.keys(catalog.sections);
  for (const section of sectionKeys) {
    if (!CATALOG_SECTIONS.includes(section)) throw new Error(`${label} unknown section: ${section}`);
  }
  for (const section of CATALOG_SECTIONS) {
    if (!Object.hasOwn(catalog.sections, section)) throw new Error(`${label} missing section: ${section}`);
  }
  if (!isDeepStrictEqual(sectionKeys, CATALOG_SECTIONS)) throw new Error(`${label} section canonical order invalid`);

  const globalObjects = new Map();
  const sectionMaps = new Map();
  for (const section of CATALOG_SECTIONS) {
    const rows = catalog.sections[section];
    if (!Array.isArray(rows)) throw new Error(`${label} section ${section} must be an array`);
    const map = new Map();
    let previous = null;
    for (const row of rows) {
      assertObject(row, `${label} ${section} entry`);
      assertCanonicalKey(row.canonicalKey, `${label} ${section}`);
      const id = keyId(row.canonicalKey);
      if (map.has(id)) throw new Error(`${label} duplicate canonical key in ${section}: ${id}`);
      if (previous !== null && compareCodeUnits(previous, id) >= 0) throw new Error(`${label} section ${section} canonical order invalid`);
      previous = id;
      map.set(id, row);
      if (globalObjects.has(id)) throw new Error(`${label} canonical key appears in multiple sections: ${id}`);
      globalObjects.set(id, { section, row });
    }
    sectionMaps.set(section, map);
  }
  return { globalObjects, sectionMaps };
}

function validateExclusions(exclusions, expectedObjects, actualObjects) {
  if (!Array.isArray(exclusions)) throw new Error('exclusions must be an array');
  const validated = new Map();
  for (const exclusion of exclusions) {
    exactKeys(exclusion, ['objectKey', 'field', 'reason', 'approval'], 'exclusion');
    assertCanonicalKey(exclusion.objectKey, 'exclusion');
    if (typeof exclusion.field !== 'string' || exclusion.field.length === 0 || exclusion.field === 'canonicalKey') {
      throw new Error('exclusion field invalid');
    }
    if (typeof exclusion.reason !== 'string' || exclusion.reason.length === 0) throw new Error('exclusion reason missing');
    exactKeys(exclusion.approval, ['status', 'approvedBy', 'reference'], 'exclusion approval');
    if (exclusion.approval.status !== 'approved') throw new Error('exclusion must be approved');
    if (typeof exclusion.approval.approvedBy !== 'string' || exclusion.approval.approvedBy.length === 0
      || typeof exclusion.approval.reference !== 'string' || exclusion.approval.reference.length === 0) {
      throw new Error('exclusion approval evidence missing');
    }
    const objectId = keyId(exclusion.objectKey);
    const expected = expectedObjects.get(objectId);
    const actual = actualObjects.get(objectId);
    if (!expected && !actual) throw new Error(`unknown exclusion object: ${objectId}`);
    if (expected && actual && expected.section !== actual.section) throw new Error(`exclusion object section drift: ${objectId}`);
    if (exclusion.field !== '*') {
      if (!expected || !actual) throw new Error(`field exclusion cannot exclude missing object: ${objectId}`);
      if (!Object.hasOwn(expected.row, exclusion.field) && !Object.hasOwn(actual.row, exclusion.field)) {
        throw new Error(`unknown exclusion field ${exclusion.field} for ${objectId}`);
      }
    }
    const exclusionId = `${objectId}\u0000${exclusion.field}`;
    if (validated.has(exclusionId)) throw new Error(`duplicate exclusion: ${exclusionId}`);
    validated.set(exclusionId, { exclusion, objectId, used: 0 });
  }
  return validated;
}

function difference(section, objectKey, field, expectedPresent, expected, actualPresent, actual) {
  const output = { section, objectKey, field, expectedPresent, actualPresent };
  if (expectedPresent) output.expected = expected;
  if (actualPresent) output.actual = actual;
  return output;
}

function exclusionFor(exclusions, objectId, field) {
  return exclusions.get(`${objectId}\u0000${field}`) ?? exclusions.get(`${objectId}\u0000*`);
}

export function compareCatalogs(input) {
  exactKeys(input, ['expected', 'actual', 'exclusions'], 'catalog comparison');
  const expected = validateNormalizedCatalog(input.expected, 'expected catalog');
  const actual = validateNormalizedCatalog(input.actual, 'actual catalog');
  const exclusions = validateExclusions(input.exclusions, expected.globalObjects, actual.globalObjects);
  const differences = [];
  const excludedDifferences = [];

  for (const field of ENVELOPE_KEYS.slice(0, -1)) {
    if (!isDeepStrictEqual(input.expected[field], input.actual[field])) {
      differences.push(difference('$document', ['$document'], field, true, input.expected[field], true, input.actual[field]));
    }
  }

  for (const section of CATALOG_SECTIONS) {
    const expectedMap = expected.sectionMaps.get(section);
    const actualMap = actual.sectionMaps.get(section);
    const ids = [...new Set([...expectedMap.keys(), ...actualMap.keys()])].sort(compareCodeUnits);
    for (const id of ids) {
      const expectedRow = expectedMap.get(id);
      const actualRow = actualMap.get(id);
      const objectKey = (expectedRow ?? actualRow).canonicalKey;
      if (!expectedRow || !actualRow) {
        const item = difference(section, objectKey, '$object', Boolean(expectedRow), expectedRow, Boolean(actualRow), actualRow);
        const approved = exclusionFor(exclusions, id, '$object');
        if (approved) {
          approved.used += 1;
          excludedDifferences.push(item);
        } else {
          differences.push(item);
        }
        continue;
      }
      const fields = [...new Set([...Object.keys(expectedRow), ...Object.keys(actualRow)])]
        .filter((field) => field !== 'canonicalKey')
        .sort(compareCodeUnits);
      for (const field of fields) {
        const expectedPresent = Object.hasOwn(expectedRow, field);
        const actualPresent = Object.hasOwn(actualRow, field);
        if (expectedPresent === actualPresent && isDeepStrictEqual(expectedRow[field], actualRow[field])) continue;
        const item = difference(section, objectKey, field, expectedPresent, expectedRow[field], actualPresent, actualRow[field]);
        const approved = exclusionFor(exclusions, id, field);
        if (approved) {
          approved.used += 1;
          excludedDifferences.push(item);
        } else {
          differences.push(item);
        }
      }
    }
  }

  for (const { exclusion, used } of exclusions.values()) {
    if (used === 0) throw new Error(`unused or stale exclusion: ${keyId(exclusion.objectKey)} field ${exclusion.field}`);
  }
  return Object.freeze({ equal: differences.length === 0, differences, excludedDifferences });
}
