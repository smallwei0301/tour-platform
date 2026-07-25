import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdtemp, mkdir, chmod, lstat, rename, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../..');
const validatorPath = path.join(root, 'scripts/database-baseline/validate-ownership-boundary.mjs');
const normalizerPath = path.join(root, 'scripts/database-baseline/normalize-catalog.mjs');
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
  const managedObjectId = keyId(managed.objectKey);
  const objects = Object.entries(catalog.sections)
    .filter(([section]) => !duplicateSections.has(section))
    .flatMap(([section, rows]) => rows.map((row) => ({ section, key: row.canonicalKey })));
  template.ownershipBoundary.assignments = objects.map(({ section, key }) => {
    const ownerDomain = keyId(key) === managedObjectId
      ? 'application_overlay'
      : ['extensions', 'extensionMemberships', 'publicationMembership'].includes(section) ? 'platform' : 'application';
    return {
      objectKey: key,
      section,
      ownerDomain,
      role: ownerDomain === 'platform' ? 'platform-owner'
        : ownerDomain === 'application_overlay' ? 'application-overlay-owner' : 'application-owner',
      dependsOn: section === 'columns' ? [['relation', 'public', 'example']] : [],
      rationale: 'synthetic fixture classification',
    };
  });
  template.platformPrerequisites.objects = template.ownershipBoundary.assignments
    .filter((assignment) => assignment.ownerDomain === 'platform')
    .map((assignment) => ({ objectKey: assignment.objectKey, provisionedBy: 'platform bootstrap', required: true }));
  template.tocOwnershipMap.entries = template.ownershipBoundary.assignments
    .filter((assignment) => ['application', 'application_overlay', 'extension'].includes(assignment.ownerDomain))
    .map((assignment, index) => ({
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

test('reviewed ownership accepts only exact normalized catalog metadata and preserves object coverage', async () => {
  const [{ validateOwnershipBoundary }, { normalizeCatalog }] = await Promise.all([
    subject(), import(`${pathToFileURL(normalizerPath).href}?t=${Date.now()}`),
  ]);
  const input = await validInput();
  for (const routine of input.catalog.sections.routines) routine.definition = 'SELECT 1;';
  input.catalog = JSON.parse(normalizeCatalog(input.catalog));
  assert.equal(validateOwnershipBoundary(input).catalogObjectCount > 0, true);
  const wrongVersion = structuredClone(input);
  wrongVersion.catalog.normalizerVersion = 2;
  assert.throws(() => validateOwnershipBoundary(wrongVersion), /normalized catalog version|normalizer/iu);
  const unknown = structuredClone(input);
  unknown.catalog.unexpected = true;
  assert.throws(() => validateOwnershipBoundary(unknown), /normalized catalog.*unknown|unexpected option or key/iu);
});

test('every catalog object and TOC ID is classified exactly once and only application objects become overlay candidates', async () => {
  const { validateOwnershipBoundary } = await subject();
  const input = await validInput();
  const result = validateOwnershipBoundary(input);
  assert.equal(result.catalogObjectCount, input.ownershipBoundary.assignments.length);
  assert.equal(result.tocCount, input.tocOwnershipMap.entries.length);
  assert.ok(result.applicationOverlayKeys.length > 0);
  const platform = new Set(input.platformPrerequisites.objects.map((entry) => keyId(entry.objectKey)));
  assert.equal(result.applicationOverlayKeys.some((key) => platform.has(keyId(key))), false);
});

test('application overlays and excluded environmental objects are explicit approved ownership domains', async () => {
  const { validateOwnershipBoundary } = await subject();
  const input = await validInput();
  const overlay = input.ownershipBoundary.assignments.find((entry) => entry.section === 'rls');
  overlay.ownerDomain = 'application_overlay';
  overlay.role = 'application-overlay-owner';
  input.tocOwnershipMap.entries.find((entry) => keyId(entry.objectKey) === keyId(overlay.objectKey)).ownerDomain = 'application_overlay';

  const excluded = input.ownershipBoundary.assignments.find((entry) => entry.section === 'policies');
  excluded.ownerDomain = 'excluded_environmental';
  excluded.role = 'excluded-environmental-owner';
  const excludedTocIndex = input.tocOwnershipMap.entries.findIndex((entry) => keyId(entry.objectKey) === keyId(excluded.objectKey));
  const [excludedToc] = input.tocOwnershipMap.entries.splice(excludedTocIndex, 1);
  input.tocOwnershipMap.expectedTocIds = input.tocOwnershipMap.expectedTocIds.filter((tocId) => tocId !== excludedToc.tocId);
  input.exclusions.entries = [{
    objectKey: excluded.objectKey,
    field: '*',
    reason: 'synthetic environment-specific object',
    approval: { status: 'approved', approvedBy: 'fixture-reviewer', reference: 'fixture:environment' },
  }];
  const result = validateOwnershipBoundary(input);
  assert.deepEqual(result.applicationOverlayKeys, [overlay.objectKey]);

  const missingApproval = structuredClone(input);
  missingApproval.exclusions.entries = [];
  assert.throws(() => validateOwnershipBoundary(missingApproval), /excluded environmental.*exclusion|exclusion.*excluded environmental/iu);

  const untrackedOverlay = structuredClone(input);
  const relation = untrackedOverlay.ownershipBoundary.assignments.find((entry) => entry.section === 'relations');
  relation.ownerDomain = 'application_overlay';
  relation.role = 'application-overlay-owner';
  untrackedOverlay.tocOwnershipMap.entries.find((entry) => keyId(entry.objectKey) === keyId(relation.objectKey)).ownerDomain = 'application_overlay';
  assert.throws(() => validateOwnershipBoundary(untrackedOverlay), /application overlay.*managed|managed.*application overlay/iu);
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
  const addedTocId = Math.max(...laundered.tocOwnershipMap.expectedTocIds) + 1;
  laundered.tocOwnershipMap.expectedTocIds.push(addedTocId);
  laundered.tocOwnershipMap.entries.push({ tocId: addedTocId, objectKey: extensionAssignment.objectKey, ownerDomain: 'application' });
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

test('candidate handoff pins canonical file and directory identity before loading ownership input', async () => {
  const { loadCandidateHandoff, parseValidatorCli, validateOwnershipBoundary } = await subject();
  assert.deepEqual(parseValidatorCli(['--candidate-handoff', '.hermes/tmp/baseline-capture-handoff.json']), {
    mode: 'candidate-handoff', path: '.hermes/tmp/baseline-capture-handoff.json',
  });
  assert.deepEqual(parseValidatorCli(['--input', 'bundle.json']), { mode: 'input', path: 'bundle.json' });
  assert.throws(() => parseValidatorCli(['--candidate-handoff', 'x', '--input', 'y']), /Usage/iu);

  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'midao-handoff-'));
  const candidatePath = path.join(rootDir, 'candidate-a');
  const handoffPath = path.join(rootDir, 'handoff.json');
  const symlinkPath = path.join(rootDir, 'handoff-link.json');
  try {
    await chmod(rootDir, 0o700);
    await mkdir(candidatePath, { mode: 0o700 });
    await chmod(candidatePath, 0o700);
    const bundle = await validInput();
    await writeFile(path.join(candidatePath, 'ownership-validation-input.json'), `${JSON.stringify(bundle)}\n`, { mode: 0o600, flag: 'wx' });
    const stat = await lstat(candidatePath, { bigint: true });
    const handoff = {
      schemaVersion: 1,
      candidatePath,
      candidateIdentity: { dev: String(stat.dev), ino: String(stat.ino), uid: Number(stat.uid), mode: '0700' },
    };
    await writeFile(handoffPath, `${JSON.stringify(handoff)}\n`, { mode: 0o600, flag: 'wx' });
    await chmod(handoffPath, 0o600);
    const loaded = await loadCandidateHandoff(handoffPath, { candidateRoot: rootDir });
    assert.equal(validateOwnershipBoundary(loaded).catalogObjectCount > 0, true);

    const stale = structuredClone(handoff);
    stale.candidateIdentity.ino = String(BigInt(stale.candidateIdentity.ino) + 1n);
    await writeFile(handoffPath, `${JSON.stringify(stale)}\n`, { mode: 0o600 });
    await assert.rejects(
      loadCandidateHandoff(handoffPath, { candidateRoot: rootDir }),
      (error) => error?.message === 'candidate handoff rejected' && /identity|inode/iu.test(String(error?.cause?.message)),
    );

    await writeFile(handoffPath, `${JSON.stringify(handoff)}\n`, { mode: 0o600 });
    await symlink(handoffPath, symlinkPath);
    await assert.rejects(
      loadCandidateHandoff(symlinkPath, { candidateRoot: rootDir }),
      (error) => error?.message === 'candidate handoff rejected' && error?.cause?.code === 'ELOOP',
    );

    await rename(candidatePath, `${candidatePath}-original`);
    await mkdir(candidatePath, { mode: 0o700 });
    await chmod(candidatePath, 0o700);
    await assert.rejects(
      loadCandidateHandoff(handoffPath, { candidateRoot: rootDir }),
      (error) => error?.message === 'candidate handoff rejected' && /identity|inode/iu.test(String(error?.cause?.message)),
    );
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
