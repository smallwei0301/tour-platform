import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../..');
const comparatorPath = path.join(root, 'scripts/database-baseline/compare-catalog.mjs');
const normalizerPath = path.join(root, 'scripts/database-baseline/normalize-catalog.mjs');
const fixturePath = path.join(here, '../fixtures/database-baseline/catalog-unstable-a.json');
const fixedSections = [
  'schemas', 'relations', 'sequences', 'columns', 'types', 'constraints', 'indexes', 'routines', 'triggers',
  'rls', 'policies', 'acl', 'owners', 'defaultPrivileges', 'extensions', 'extensionMemberships',
  'publicationMembership', 'managedSchemaInventory', 'managedSchemaOverlays',
];

async function subject() {
  assert.ok(existsSync(comparatorPath), 'catalog comparator missing');
  return import(`${pathToFileURL(comparatorPath).href}?t=${Date.now()}`);
}

function entry(canonicalKey, fields) {
  return { canonicalKey, ...fields };
}

async function catalog() {
  const { normalizeCatalog } = await import(pathToFileURL(normalizerPath).href);
  const raw = JSON.parse(await readFile(fixturePath, 'utf8'));
  const normalized = JSON.parse(normalizeCatalog(raw));
  normalized.sections.policies = [entry(['policy', 'public', 'alpha', 'reader'], { roles: ['PUBLIC'], using: '(id > 0)' })];
  normalized.sections.triggers = [entry(['trigger', 'public', 'alpha', 'audit'], { definition: 'CREATE TRIGGER audit' })];
  normalized.sections.indexes = [entry(['index', 'public', 'alpha_pkey'], { definition: 'CREATE UNIQUE INDEX alpha_pkey' })];
  normalized.sections.constraints = [entry(['constraint', 'relation', 'public', 'alpha', 'alpha_pkey'], { definition: 'PRIMARY KEY (id)' })];
  return normalized;
}

function approvedExclusion(objectKey, field) {
  return {
    objectKey,
    field,
    reason: 'reviewed synthetic exception',
    approval: { status: 'approved', approvedBy: 'fixture-reviewer', reference: 'fixture:test' },
  };
}

test('exact normalized catalogs compare equal', async () => {
  const { compareCatalogs } = await subject();
  const expected = await catalog();
  const result = compareCatalogs({ expected, actual: structuredClone(expected), exclusions: [] });
  assert.equal(result.equal, true);
  assert.deepEqual(result.differences, []);
  assert.deepEqual(result.excludedDifferences, []);
});

test('ACL policy function trigger index constraint extension and default privilege drift is identity-bound', async () => {
  const { compareCatalogs } = await subject();
  const expected = await catalog();
  const actual = structuredClone(expected);
  actual.sections.acl[0].privilege = 'UPDATE';
  actual.sections.policies[0].using = '(id >= 0)';
  actual.sections.routines[0].bodySha256 = 'f'.repeat(64);
  actual.sections.triggers[0].definition = 'CREATE TRIGGER changed';
  actual.sections.indexes[0].definition = 'CREATE INDEX changed';
  actual.sections.constraints[0].definition = 'UNIQUE (id)';
  actual.sections.extensions[0].version = '9.9';
  actual.sections.defaultPrivileges[0].grantable = true;
  const result = compareCatalogs({ expected, actual, exclusions: [] });
  assert.equal(result.equal, false);
  assert.deepEqual(new Set(result.differences.map((difference) => `${difference.section}.${difference.field}`)), new Set([
    'acl.privilege', 'policies.using', 'routines.bodySha256', 'triggers.definition',
    'indexes.definition', 'constraints.definition', 'extensions.version', 'defaultPrivileges.grantable',
  ]));
});

test('missing and unexpected identities are reported and malformed duplicate identities fail closed', async () => {
  const { compareCatalogs } = await subject();
  const expected = await catalog();
  const actual = structuredClone(expected);
  const removed = actual.sections.triggers.pop();
  actual.sections.triggers.push(entry(['trigger', 'public', 'alpha', 'unexpected'], { definition: removed.definition }));
  const result = compareCatalogs({ expected, actual, exclusions: [] });
  assert.equal(result.equal, false);
  assert.deepEqual(result.differences.map((difference) => difference.field), ['$object', '$object']);

  const duplicate = structuredClone(expected);
  duplicate.sections.acl.push(structuredClone(duplicate.sections.acl[0]));
  assert.throws(() => compareCatalogs({ expected, actual: duplicate, exclusions: [] }), /duplicate canonical key/iu);
});

test('approved exact exclusions suppress only their identity and field and must be consumed', async () => {
  const { compareCatalogs } = await subject();
  const expected = await catalog();
  const actual = structuredClone(expected);
  actual.sections.extensions[0].version = '1.4';
  const exclusion = approvedExclusion(expected.sections.extensions[0].canonicalKey, 'version');
  const result = compareCatalogs({ expected, actual, exclusions: [exclusion] });
  assert.equal(result.equal, true);
  assert.equal(result.excludedDifferences.length, 1);
  assert.deepEqual(result.excludedDifferences[0].objectKey, exclusion.objectKey);

  const stale = approvedExclusion(expected.sections.extensions[0].canonicalKey, 'name');
  assert.throws(() => compareCatalogs({ expected, actual, exclusions: [stale] }), /unused|stale exclusion/iu);
  const unknown = approvedExclusion(['extension', 'invented'], 'version');
  assert.throws(() => compareCatalogs({ expected, actual, exclusions: [unknown] }), /unknown exclusion object/iu);
  const unapproved = structuredClone(exclusion);
  unapproved.approval.status = 'pending';
  assert.throws(() => compareCatalogs({ expected, actual, exclusions: [unapproved] }), /approved/iu);
});

test('field exclusions cannot hide object deletion while approved whole-object exclusion is exact', async () => {
  const { compareCatalogs } = await subject();
  const expected = await catalog();
  const actual = structuredClone(expected);
  const extension = actual.sections.extensions.pop();
  assert.throws(() => compareCatalogs({
    expected, actual, exclusions: [approvedExclusion(extension.canonicalKey, 'version')],
  }), /unused|cannot exclude missing object/iu);
  const result = compareCatalogs({
    expected, actual, exclusions: [approvedExclusion(extension.canonicalKey, '*')],
  });
  assert.equal(result.equal, true);
  assert.equal(result.excludedDifferences[0].field, '$object');
});

test('canonical identities reject non-JSON-safe numbers and comparator owns the fixed section schema', async () => {
  const { compareCatalogs, COMPARATOR_SECTIONS } = await subject();
  assert.deepEqual(COMPARATOR_SECTIONS, fixedSections);
  assert.equal(Object.isFrozen(COMPARATOR_SECTIONS), true);

  const nanExpected = await catalog();
  const nanActual = structuredClone(nanExpected);
  nanExpected.sections.schemas[0].canonicalKey = ['schema', Number.NaN];
  nanActual.sections.schemas[0].canonicalKey = ['schema', null];
  assert.throws(() => compareCatalogs({ expected: nanExpected, actual: nanActual, exclusions: [] }), /finite|JSON-safe/iu);

  for (const unsafe of [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -0]) {
    const expected = await catalog();
    expected.sections.schemas[0].canonicalKey = ['schema', unsafe];
    assert.throws(() => compareCatalogs({ expected, actual: structuredClone(expected), exclusions: [] }), /finite|negative zero|JSON-safe/iu);
  }
  const missingOwnKey = await catalog();
  delete missingOwnKey.sections.schemas[0].canonicalKey;
  assert.throws(() => compareCatalogs({ expected: missingOwnKey, actual: structuredClone(missingOwnKey), exclusions: [] }), /own canonicalKey/iu);
});

test('normalized envelope, section set, canonical ordering and exclusion unknown keys fail closed', async () => {
  const { compareCatalogs } = await subject();
  const expected = await catalog();
  const unknownSection = structuredClone(expected);
  unknownSection.sections.surprise = [];
  assert.throws(() => compareCatalogs({ expected, actual: unknownSection, exclusions: [] }), /unknown section/iu);
  const unsorted = structuredClone(expected);
  unsorted.sections.relations.reverse();
  assert.throws(() => compareCatalogs({ expected, actual: unsorted, exclusions: [] }), /canonical order/iu);
  const exclusion = approvedExclusion(expected.sections.extensions[0].canonicalKey, 'version');
  exclusion.broadPattern = '*';
  assert.throws(() => compareCatalogs({ expected, actual: structuredClone(expected), exclusions: [exclusion] }), /unknown key/iu);
});
