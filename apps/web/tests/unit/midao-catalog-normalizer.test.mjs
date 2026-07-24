import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../..');
const normalizerPath = path.join(repoRoot, 'scripts/database-baseline/normalize-catalog.mjs');
const fixtureAPath = path.join(here, '../fixtures/database-baseline/catalog-unstable-a.json');
const fixtureBPath = path.join(here, '../fixtures/database-baseline/catalog-unstable-b.json');
const sections = [
  'schemas', 'relations', 'sequences', 'columns', 'types', 'constraints', 'indexes', 'routines', 'triggers',
  'rls', 'policies', 'acl', 'owners', 'defaultPrivileges', 'extensions', 'extensionMemberships',
  'publicationMembership', 'managedSchemaInventory', 'managedSchemaOverlays',
];

async function moduleUnderTest() {
  assert.equal(existsSync(normalizerPath), true, 'catalog normalizer missing');
  return import(`${pathToFileURL(normalizerPath).href}?t=${Date.now()}`);
}

async function fixture(filename) {
  return JSON.parse(await readFile(filename, 'utf8'));
}

test('normalizer exists and semantically equivalent unstable catalogs become byte-identical', async () => {
  const { normalizeCatalog } = await moduleUnderTest();
  const [a, b] = await Promise.all([fixture(fixtureAPath), fixture(fixtureBPath)]);
  const normalizedA = normalizeCatalog(a);
  const normalizedB = normalizeCatalog(b);
  assert.equal(normalizedA, normalizedB);
  assert.equal(normalizedA.endsWith('\n'), true);
  assert.equal(normalizedA.includes('\r'), false);
});

test('normalized document has fixed keys, section order, canonical entry order and no runtime identity', async () => {
  const { normalizeCatalog } = await moduleUnderTest();
  const output = normalizeCatalog(await fixture(fixtureAPath));
  const parsed = JSON.parse(output);
  assert.deepEqual(Object.keys(parsed), ['schemaVersion', 'normalizerVersion', 'extractorVersion', 'serverMajorVersion', 'ownershipOverlayStatus', 'sections']);
  assert.deepEqual(Object.keys(parsed.sections), sections);
  assert.deepEqual(parsed.sections.relations.map((entry) => entry.canonicalKey), [
    ['relation', 'public', 'alpha'], ['relation', 'public', 'zeta'],
  ]);
  for (const forbidden of ['oid', 'objectAddress', 'statistics', 'rowCount', 'sequenceValue', 'timestamp', 'capturedAt', 'runtimeState']) {
    assert.equal(output.includes(`"${forbidden}"`), false, `unstable key leaked: ${forbidden}`);
  }
  assert.equal(parsed.serverMajorVersion, 17);
});

test('routine definition is replaced by a stable SHA-256 while ACL RLS owner and default privileges survive', async () => {
  const { normalizeCatalog, normalizeRoutineBody } = await moduleUnderTest();
  const raw = await fixture(fixtureAPath);
  const parsed = JSON.parse(normalizeCatalog(raw));
  const routine = parsed.sections.routines[0];
  const expectedBody = normalizeRoutineBody(raw.sections.routines[0].definition);
  const expectedDigest = createHash('sha256').update(expectedBody).digest('hex');
  assert.equal(routine.definition, undefined);
  assert.equal(routine.bodySha256, expectedDigest);
  assert.match(routine.bodySha256, /^[0-9a-f]{64}$/u);
  assert.deepEqual(parsed.sections.rls, raw.sections.rls);
  assert.deepEqual(parsed.sections.acl, raw.sections.acl);
  assert.deepEqual(parsed.sections.owners, raw.sections.owners);
  assert.deepEqual(parsed.sections.defaultPrivileges, raw.sections.defaultPrivileges);
});

test('meaningful function body drift changes digest and malformed section contracts fail closed', async () => {
  const { normalizeCatalog } = await moduleUnderTest();
  const raw = await fixture(fixtureAPath);
  const changed = structuredClone(raw);
  changed.sections.routines[0].definition = changed.sections.routines[0].definition.replace('42', '43');
  assert.notEqual(
    JSON.parse(normalizeCatalog(raw)).sections.routines[0].bodySha256,
    JSON.parse(normalizeCatalog(changed)).sections.routines[0].bodySha256,
  );
  const nestedA = structuredClone(raw);
  nestedA.sections.routines[0].definition = 'CREATE FUNCTION public.answer() RETURNS text\nLANGUAGE sql\nAS $fn$\nSELECT $payload$line   \n$payload$;\n$fn$;\n';
  const nestedB = structuredClone(nestedA);
  nestedB.sections.routines[0].definition = nestedB.sections.routines[0].definition.replace('line   \n', 'line  \n');
  assert.notEqual(
    JSON.parse(normalizeCatalog(nestedA)).sections.routines[0].bodySha256,
    JSON.parse(normalizeCatalog(nestedB)).sections.routines[0].bodySha256,
    'dollar-quoted literal trailing spaces are meaningful and must not collide',
  );
  const missing = structuredClone(raw);
  delete missing.sections.policies;
  assert.throws(() => normalizeCatalog(missing), /missing section.*policies/iu);
  const duplicate = structuredClone(raw);
  duplicate.sections.relations.push({ ...duplicate.sections.relations[0] });
  assert.throws(() => normalizeCatalog(duplicate), /duplicate canonical key/iu);
});
