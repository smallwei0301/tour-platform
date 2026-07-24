import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../..');
const validatorPath = path.join(root, 'scripts/database-baseline/validate-ownership-boundary.mjs');
const fixtureDirectory = path.join(here, '../fixtures/database-baseline');
const schemaDirectory = path.join(root, 'scripts/database-baseline/schemas');
const schemaNames = [
  'ownership-boundary.schema.json', 'role-map.schema.json', 'exclusions.schema.json',
  'platform-prerequisites.schema.json', 'toc-ownership-map.schema.json',
];
const duplicateSections = new Set(['managedSchemaInventory', 'managedSchemaOverlays']);

async function json(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

async function subject() {
  assert.ok(existsSync(validatorPath), 'ownership validator missing');
  return import(`${pathToFileURL(validatorPath).href}?t=${Date.now()}`);
}

function keyId(key) {
  return JSON.stringify(key);
}

async function validInput() {
  const catalog = await json(path.join(fixtureDirectory, 'catalog-minimal.json'));
  const template = await json(path.join(fixtureDirectory, 'ownership-template.json'));
  const managed = catalog.sections.managedSchemaInventory[0];
  managed.objectKey = structuredClone(catalog.sections.rls[0].canonicalKey);
  managed.canonicalKey = ['managed_schema_inventory', managed.reason, ...managed.objectKey];
  managed.managedSchema = 'public';
  template.templateOnly = false;
  template.ownershipBoundary.status = 'reviewed';
  const objects = Object.entries(catalog.sections)
    .filter(([section]) => !duplicateSections.has(section))
    .flatMap(([section, rows]) => rows.map((row) => ({ section, key: row.canonicalKey })));
  template.ownershipBoundary.assignments = objects.map(({ section, key }) => {
    const ownerDomain = ['extensions', 'extensionMemberships', 'publicationMembership'].includes(section) ? 'platform' : 'application';
    return {
      objectKey: key,
      section,
      ownerDomain,
      role: ownerDomain === 'platform' ? 'platform-owner' : 'application-owner',
      dependsOn: section === 'columns' ? [['relation', 'public', 'example']] : [],
      rationale: 'synthetic fixture classification',
    };
  });
  template.platformPrerequisites.objects = template.ownershipBoundary.assignments
    .filter((assignment) => assignment.ownerDomain === 'platform')
    .map((assignment) => ({ objectKey: assignment.objectKey, provisionedBy: 'platform bootstrap', required: true }));
  template.tocOwnershipMap.entries = template.ownershipBoundary.assignments.map((assignment, index) => ({
    tocId: index + 1,
    objectKey: assignment.objectKey,
    ownerDomain: assignment.ownerDomain,
  }));
  template.tocOwnershipMap.expectedTocIds = template.tocOwnershipMap.entries.map((entry) => entry.tocId);
  const policyAssignment = template.ownershipBoundary.assignments.find((assignment) => assignment.section === 'policies');
  template.exclusions.entries = [{
    objectKey: policyAssignment.objectKey,
    field: 'roles',
    reason: 'synthetic approved field exclusion',
    approval: { status: 'approved', approvedBy: 'fixture-reviewer', reference: 'fixture:test' },
  }];
  return { catalog, ...template };
}

test('ownership validator schemas and non-production template exist', async () => {
  assert.ok(existsSync(validatorPath), 'ownership validator missing');
  for (const name of schemaNames) {
    const schema = await json(path.join(schemaDirectory, name));
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.equal(schema.additionalProperties, false);
  }
  const tocSchema = await json(path.join(schemaDirectory, 'toc-ownership-map.schema.json'));
  assert.equal(tocSchema.properties.expectedTocIds.items.maximum, Number.MAX_SAFE_INTEGER);
  assert.equal(tocSchema.properties.entries.items.properties.tocId.maximum, Number.MAX_SAFE_INTEGER);
  const template = await json(path.join(fixtureDirectory, 'ownership-template.json'));
  assert.equal(template.templateOnly, true);
  assert.equal(template.ownershipBoundary.status, 'template');
  assert.deepEqual(template.ownershipBoundary.assignments, []);
});

test('every catalog object and TOC ID is classified exactly once and only application objects become overlay candidates', async () => {
  const { validateOwnershipBoundary } = await subject();
  const input = await validInput();
  const result = validateOwnershipBoundary(input);
  assert.equal(result.catalogObjectCount, input.ownershipBoundary.assignments.length);
  assert.equal(result.tocCount, result.catalogObjectCount);
  assert.ok(result.applicationOverlayKeys.length > 0);
  const platform = new Set(input.platformPrerequisites.objects.map((entry) => keyId(entry.objectKey)));
  assert.equal(result.applicationOverlayKeys.some((key) => platform.has(keyId(key))), false);
});

test('overlap missing unknown object and duplicate TOC IDs fail closed', async () => {
  const { validateOwnershipBoundary } = await subject();
  const overlap = await validInput();
  overlap.ownershipBoundary.assignments.push(structuredClone(overlap.ownershipBoundary.assignments[0]));
  assert.throws(() => validateOwnershipBoundary(overlap), /overlap|duplicate assignment/iu);

  const missing = await validInput();
  missing.ownershipBoundary.assignments.pop();
  assert.throws(() => validateOwnershipBoundary(missing), /missing.*catalog object/iu);

  const unknown = await validInput();
  unknown.ownershipBoundary.assignments[0].objectKey = ['relation', 'public', 'invented'];
  assert.throws(() => validateOwnershipBoundary(unknown), /unknown.*object/iu);

  const duplicateToc = await validInput();
  duplicateToc.tocOwnershipMap.entries[1].tocId = duplicateToc.tocOwnershipMap.entries[0].tocId;
  assert.throws(() => validateOwnershipBoundary(duplicateToc), /duplicate TOC ID/iu);
});

test('TOC IDs are each classified once while one object may own many TOC entries and embedded sections may own none', async () => {
  const { validateOwnershipBoundary } = await subject();
  const input = await validInput();
  const first = input.tocOwnershipMap.entries[0];
  const additionalTocId = Math.max(...input.tocOwnershipMap.expectedTocIds) + 1;
  input.tocOwnershipMap.expectedTocIds.push(additionalTocId);
  input.tocOwnershipMap.entries.push({ tocId: additionalTocId, objectKey: structuredClone(first.objectKey), ownerDomain: first.ownerDomain });
  assert.equal(validateOwnershipBoundary(input).tocCount, input.tocOwnershipMap.expectedTocIds.length);

  const embeddedOnly = await validInput();
  const optionalAssignment = embeddedOnly.ownershipBoundary.assignments.find((entry) => entry.section === 'columns');
  const optionalIndex = embeddedOnly.tocOwnershipMap.entries.findIndex((entry) => keyId(entry.objectKey) === keyId(optionalAssignment.objectKey));
  const [removedOptional] = embeddedOnly.tocOwnershipMap.entries.splice(optionalIndex, 1);
  embeddedOnly.tocOwnershipMap.expectedTocIds = embeddedOnly.tocOwnershipMap.expectedTocIds.filter((id) => id !== removedOptional.tocId);
  assert.doesNotThrow(() => validateOwnershipBoundary(embeddedOnly));

  const requiredMissing = await validInput();
  const relationAssignment = requiredMissing.ownershipBoundary.assignments.find((entry) => entry.section === 'relations');
  const relationIndex = requiredMissing.tocOwnershipMap.entries.findIndex((entry) => keyId(entry.objectKey) === keyId(relationAssignment.objectKey));
  const [removedRequired] = requiredMissing.tocOwnershipMap.entries.splice(relationIndex, 1);
  requiredMissing.tocOwnershipMap.expectedTocIds = requiredMissing.tocOwnershipMap.expectedTocIds.filter((id) => id !== removedRequired.tocId);
  assert.throws(() => validateOwnershipBoundary(requiredMissing), /required catalog object missing TOC mapping/iu);
});

test('dependency closure and exact TOC ownership are enforced', async () => {
  const { validateOwnershipBoundary } = await subject();
  const unknownDependency = await validInput();
  unknownDependency.ownershipBoundary.assignments[0].dependsOn = [['relation', 'public', 'absent']];
  assert.throws(() => validateOwnershipBoundary(unknownDependency), /dependency.*unknown/iu);

  const missingToc = await validInput();
  missingToc.tocOwnershipMap.entries.pop();
  assert.throws(() => validateOwnershipBoundary(missingToc), /missing.*TOC|TOC.*missing/iu);

  const extraExpectedToc = await validInput();
  extraExpectedToc.tocOwnershipMap.expectedTocIds.push(999_999);
  assert.throws(() => validateOwnershipBoundary(extraExpectedToc), /expected TOC.*missing|TOC.*999999/iu);

  const unsafeToc = await validInput();
  unsafeToc.tocOwnershipMap.expectedTocIds[0] = Number.MAX_SAFE_INTEGER + 1;
  unsafeToc.tocOwnershipMap.entries[0].tocId = Number.MAX_SAFE_INTEGER + 1;
  assert.throws(() => validateOwnershipBoundary(unsafeToc), /safe integer/iu);

  const mismatchedToc = await validInput();
  mismatchedToc.tocOwnershipMap.entries[0].ownerDomain = 'platform';
  assert.throws(() => validateOwnershipBoundary(mismatchedToc), /TOC.*owner/iu);
});

test('role ownership and platform prerequisite boundaries reject platform objects misclassified as application', async () => {
  const { validateOwnershipBoundary } = await subject();
  const mismatchedRole = await validInput();
  const platformAssignment = mismatchedRole.ownershipBoundary.assignments.find((entry) => entry.ownerDomain === 'platform');
  platformAssignment.role = 'application-owner';
  assert.throws(() => validateOwnershipBoundary(mismatchedRole), /role.*owner|owner.*role/iu);

  const missingPlatform = await validInput();
  missingPlatform.platformPrerequisites.objects.pop();
  assert.throws(() => validateOwnershipBoundary(missingPlatform), /platform prerequisite.*missing/iu);

  const appAsPlatform = await validInput();
  const app = appAsPlatform.ownershipBoundary.assignments.find((entry) => entry.ownerDomain === 'application');
  appAsPlatform.platformPrerequisites.objects.push({ objectKey: app.objectKey, provisionedBy: 'wrong', required: true });
  assert.throws(() => validateOwnershipBoundary(appAsPlatform), /non-platform.*prerequisite/iu);

  const laundered = await validInput();
  const extensionAssignment = laundered.ownershipBoundary.assignments.find((entry) => entry.section === 'extensions');
  extensionAssignment.ownerDomain = 'application';
  extensionAssignment.role = 'application-owner';
  laundered.tocOwnershipMap.entries.find((entry) => keyId(entry.objectKey) === keyId(extensionAssignment.objectKey)).ownerDomain = 'application';
  laundered.platformPrerequisites.objects = laundered.platformPrerequisites.objects
    .filter((entry) => keyId(entry.objectKey) !== keyId(extensionAssignment.objectKey));
  laundered.catalog.sections.managedSchemaInventory[0].objectKey = structuredClone(extensionAssignment.objectKey);
  assert.throws(() => validateOwnershipBoundary(laundered), /trusted platform|platform classification/iu);
});

test('whole application-object exclusions and unapproved or unknown-field exclusions fail closed', async () => {
  const { validateOwnershipBoundary } = await subject();
  const wholeObject = await validInput();
  wholeObject.exclusions.entries[0].field = '*';
  assert.throws(() => validateOwnershipBoundary(wholeObject), /whole.*application|application.*whole/iu);

  const unapproved = await validInput();
  unapproved.exclusions.entries[0].approval.status = 'pending';
  assert.throws(() => validateOwnershipBoundary(unapproved), /exclusion.*approved/iu);

  const unknownField = await validInput();
  unknownField.exclusions.entries[0].field = 'inventedField';
  assert.throws(() => validateOwnershipBoundary(unknownField), /unknown exclusion field/iu);
});

test('unknown document keys and production claims in a template are rejected', async () => {
  const { validateOwnershipBoundary } = await subject();
  const unknown = await validInput();
  unknown.ownershipBoundary.surprise = true;
  assert.throws(() => validateOwnershipBoundary(unknown), /unknown key/iu);

  const blankTemplate = await validInput();
  blankTemplate.templateOnly = true;
  blankTemplate.ownershipBoundary.status = 'template';
  blankTemplate.ownershipBoundary.assignments = [];
  blankTemplate.platformPrerequisites.objects = [];
  blankTemplate.tocOwnershipMap.expectedTocIds = [];
  blankTemplate.tocOwnershipMap.entries = [];
  blankTemplate.exclusions.entries = [];
  assert.deepEqual(validateOwnershipBoundary(blankTemplate).applicationOverlayKeys, []);

  const fakeTemplate = await validInput();
  fakeTemplate.templateOnly = true;
  assert.throws(() => validateOwnershipBoundary(fakeTemplate), /template.*assignments|template.*reviewed/iu);
});
