#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { validateRawCatalog } from './extract-catalog.mjs';

const OWNER_DOMAINS = new Set(['application', 'platform', 'extension']);
const DUPLICATE_METADATA_SECTIONS = new Set(['managedSchemaInventory', 'managedSchemaOverlays']);

function keyId(key) {
  return JSON.stringify(key);
}

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
}

function exactKeys(value, allowed, required, label) {
  assertObject(value, label);
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new Error(`${label} unknown key: ${key}`);
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) throw new Error(`${label} missing key: ${key}`);
  }
}

function assertVersion(value, label) {
  if (value !== 1) throw new Error(`${label} schemaVersion must be 1`);
}

function assertString(value, label) {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} must be a non-empty string`);
}

function assertKey(key, label) {
  if (!Array.isArray(key) || key.length === 0
    || key.some((component) => component !== null && !['string', 'number', 'boolean'].includes(typeof component))) {
    throw new Error(`${label} must be a non-empty JSON scalar array`);
  }
}

function assertOwnerDomain(value, label) {
  if (!OWNER_DOMAINS.has(value)) throw new Error(`${label} owner domain invalid`);
}

function catalogObjects(catalog) {
  const objects = new Map();
  for (const [section, rows] of Object.entries(catalog.sections)) {
    if (DUPLICATE_METADATA_SECTIONS.has(section)) continue;
    for (const row of rows) {
      const id = keyId(row.canonicalKey);
      if (objects.has(id)) throw new Error(`catalog object identity overlaps sections: ${id}`);
      objects.set(id, { section, row });
    }
  }
  return objects;
}

function validateRoleMap(roleMap) {
  exactKeys(roleMap, ['schemaVersion', 'roles'], ['schemaVersion', 'roles'], 'roleMap');
  assertVersion(roleMap.schemaVersion, 'roleMap');
  if (!Array.isArray(roleMap.roles)) throw new Error('roleMap roles must be an array');
  const roles = new Map();
  for (const role of roleMap.roles) {
    exactKeys(role, ['name', 'ownerDomain'], ['name', 'ownerDomain'], 'roleMap role');
    assertString(role.name, 'role name');
    assertOwnerDomain(role.ownerDomain, 'role');
    if (roles.has(role.name)) throw new Error(`duplicate role: ${role.name}`);
    roles.set(role.name, role.ownerDomain);
  }
  return roles;
}

function validateAssignments(boundary, objects, roles, requireComplete) {
  exactKeys(boundary, ['schemaVersion', 'status', 'assignments'], ['schemaVersion', 'status', 'assignments'], 'ownershipBoundary');
  assertVersion(boundary.schemaVersion, 'ownershipBoundary');
  if (!['template', 'reviewed'].includes(boundary.status)) throw new Error('ownershipBoundary status invalid');
  if (!Array.isArray(boundary.assignments)) throw new Error('ownership assignments must be an array');
  const assignments = new Map();
  for (const assignment of boundary.assignments) {
    exactKeys(
      assignment,
      ['objectKey', 'section', 'ownerDomain', 'role', 'dependsOn', 'rationale'],
      ['objectKey', 'section', 'ownerDomain', 'role', 'dependsOn', 'rationale'],
      'ownership assignment',
    );
    assertKey(assignment.objectKey, 'assignment objectKey');
    assertString(assignment.section, 'assignment section');
    assertOwnerDomain(assignment.ownerDomain, 'assignment');
    assertString(assignment.role, 'assignment role');
    assertString(assignment.rationale, 'assignment rationale');
    if (!Array.isArray(assignment.dependsOn)) throw new Error('assignment dependsOn must be an array');
    const id = keyId(assignment.objectKey);
    if (assignments.has(id)) throw new Error(`overlap or duplicate assignment: ${id}`);
    const object = objects.get(id);
    if (!object) throw new Error(`unknown catalog object in assignment: ${id}`);
    if (object.section !== assignment.section) throw new Error(`assignment section mismatch: ${id}`);
    const roleDomain = roles.get(assignment.role);
    if (!roleDomain) throw new Error(`assignment uses unknown role: ${assignment.role}`);
    if (roleDomain !== assignment.ownerDomain) throw new Error(`role owner mismatch for ${id}`);
    assignments.set(id, assignment);
  }
  if (requireComplete) {
    for (const id of objects.keys()) {
      if (!assignments.has(id)) throw new Error(`missing catalog object assignment: ${id}`);
    }
  }
  for (const assignment of assignments.values()) {
    for (const dependency of assignment.dependsOn) {
      assertKey(dependency, 'dependency objectKey');
      const dependencyId = keyId(dependency);
      if (!objects.has(dependencyId) || !assignments.has(dependencyId)) throw new Error(`dependency references unknown object: ${dependencyId}`);
      if (dependencyId === keyId(assignment.objectKey)) throw new Error(`dependency cannot reference itself: ${dependencyId}`);
    }
  }
  return assignments;
}

function validatePlatformPrerequisites(document, assignments) {
  exactKeys(document, ['schemaVersion', 'objects'], ['schemaVersion', 'objects'], 'platformPrerequisites');
  assertVersion(document.schemaVersion, 'platformPrerequisites');
  if (!Array.isArray(document.objects)) throw new Error('platform prerequisite objects must be an array');
  const prerequisites = new Set();
  for (const object of document.objects) {
    exactKeys(object, ['objectKey', 'provisionedBy', 'required'], ['objectKey', 'provisionedBy', 'required'], 'platform prerequisite');
    assertKey(object.objectKey, 'platform prerequisite objectKey');
    assertString(object.provisionedBy, 'platform provisioner');
    if (object.required !== true) throw new Error('platform prerequisite required must be true');
    const id = keyId(object.objectKey);
    if (prerequisites.has(id)) throw new Error(`duplicate platform prerequisite: ${id}`);
    const assignment = assignments.get(id);
    if (!assignment) throw new Error(`platform prerequisite unknown object: ${id}`);
    if (assignment.ownerDomain !== 'platform') throw new Error(`non-platform object listed as prerequisite: ${id}`);
    prerequisites.add(id);
  }
  for (const [id, assignment] of assignments) {
    if (assignment.ownerDomain === 'platform' && !prerequisites.has(id)) throw new Error(`platform prerequisite missing: ${id}`);
  }
}

function validateToc(document, assignments) {
  exactKeys(document, ['schemaVersion', 'expectedTocIds', 'entries'], ['schemaVersion', 'expectedTocIds', 'entries'], 'tocOwnershipMap');
  assertVersion(document.schemaVersion, 'tocOwnershipMap');
  if (!Array.isArray(document.expectedTocIds)) throw new Error('expectedTocIds must be an array');
  const expectedTocIds = new Set();
  for (const tocId of document.expectedTocIds) {
    if (!Number.isSafeInteger(tocId) || tocId < 1) throw new Error('expected TOC ID must be a positive safe integer');
    if (expectedTocIds.has(tocId)) throw new Error(`duplicate expected TOC ID: ${tocId}`);
    expectedTocIds.add(tocId);
  }
  if (!Array.isArray(document.entries)) throw new Error('TOC entries must be an array');
  const tocIds = new Set();
  const mappedObjects = new Set();
  for (const entry of document.entries) {
    exactKeys(entry, ['tocId', 'objectKey', 'ownerDomain'], ['tocId', 'objectKey', 'ownerDomain'], 'TOC entry');
    if (!Number.isSafeInteger(entry.tocId) || entry.tocId < 1) throw new Error('TOC ID must be a positive safe integer');
    if (tocIds.has(entry.tocId)) throw new Error(`duplicate TOC ID: ${entry.tocId}`);
    if (!expectedTocIds.has(entry.tocId)) throw new Error(`unexpected TOC ID: ${entry.tocId}`);
    tocIds.add(entry.tocId);
    assertKey(entry.objectKey, 'TOC objectKey');
    assertOwnerDomain(entry.ownerDomain, 'TOC entry');
    const id = keyId(entry.objectKey);
    if (mappedObjects.has(id)) throw new Error(`duplicate TOC object mapping: ${id}`);
    const assignment = assignments.get(id);
    if (!assignment) throw new Error(`TOC unknown object: ${id}`);
    if (assignment.ownerDomain !== entry.ownerDomain) throw new Error(`TOC owner mismatch: ${id}`);
    mappedObjects.add(id);
  }
  for (const tocId of expectedTocIds) {
    if (!tocIds.has(tocId)) throw new Error(`expected TOC ID missing mapping: ${tocId}`);
  }
  for (const id of assignments.keys()) {
    if (!mappedObjects.has(id)) throw new Error(`missing TOC object mapping: ${id}`);
  }
  return expectedTocIds.size;
}

function validateExclusions(document, assignments, objects) {
  exactKeys(document, ['schemaVersion', 'entries'], ['schemaVersion', 'entries'], 'exclusions');
  assertVersion(document.schemaVersion, 'exclusions');
  if (!Array.isArray(document.entries)) throw new Error('exclusion entries must be an array');
  const seen = new Set();
  for (const exclusion of document.entries) {
    exactKeys(exclusion, ['objectKey', 'field', 'reason', 'approval'], ['objectKey', 'field', 'reason', 'approval'], 'exclusion');
    assertKey(exclusion.objectKey, 'exclusion objectKey');
    assertString(exclusion.field, 'exclusion field');
    assertString(exclusion.reason, 'exclusion reason');
    exactKeys(exclusion.approval, ['status', 'approvedBy', 'reference'], ['status', 'approvedBy', 'reference'], 'exclusion approval');
    if (exclusion.approval.status !== 'approved') throw new Error('exclusion must be approved');
    assertString(exclusion.approval.approvedBy, 'exclusion approver');
    assertString(exclusion.approval.reference, 'exclusion approval reference');
    const id = keyId(exclusion.objectKey);
    const assignment = assignments.get(id);
    const object = objects.get(id);
    if (!assignment || !object) throw new Error(`exclusion references unknown object: ${id}`);
    if (exclusion.field === '*' && assignment.ownerDomain === 'application') throw new Error(`whole application object exclusion forbidden: ${id}`);
    if (exclusion.field === 'canonicalKey' || (exclusion.field !== '*' && !Object.hasOwn(object.row, exclusion.field))) {
      throw new Error(`unknown exclusion field for ${id}: ${exclusion.field}`);
    }
    const exclusionId = `${id}\u0000${exclusion.field}`;
    if (seen.has(exclusionId)) throw new Error(`duplicate exclusion: ${exclusionId}`);
    seen.add(exclusionId);
  }
}

export function validateOwnershipBoundary(input) {
  exactKeys(
    input,
    ['catalog', 'templateOnly', 'ownershipBoundary', 'roleMap', 'exclusions', 'platformPrerequisites', 'tocOwnershipMap'],
    ['catalog', 'templateOnly', 'ownershipBoundary', 'roleMap', 'exclusions', 'platformPrerequisites', 'tocOwnershipMap'],
    'ownership bundle',
  );
  if (typeof input.templateOnly !== 'boolean') throw new Error('templateOnly must be boolean');
  const catalog = validateRawCatalog(input.catalog);
  const objects = catalogObjects(catalog);
  const roles = validateRoleMap(input.roleMap);
  const assignments = validateAssignments(input.ownershipBoundary, objects, roles, !input.templateOnly);
  if (input.templateOnly) {
    if (input.ownershipBoundary.status !== 'template' || assignments.size !== 0) throw new Error('template cannot contain reviewed assignments');
  } else if (input.ownershipBoundary.status !== 'reviewed') {
    throw new Error('non-template ownership boundary must be reviewed');
  }
  validatePlatformPrerequisites(input.platformPrerequisites, assignments);
  const tocCount = validateToc(input.tocOwnershipMap, assignments);
  validateExclusions(input.exclusions, assignments, objects);

  const managedKeys = new Set(catalog.sections.managedSchemaInventory.map((entry) => keyId(entry.objectKey)));
  for (const id of managedKeys) {
    if (!objects.has(id)) throw new Error(`managed inventory references unknown object: ${id}`);
  }
  const applicationOverlayKeys = [...assignments]
    .filter(([id, assignment]) => assignment.ownerDomain === 'application' && managedKeys.has(id))
    .map(([, assignment]) => assignment.objectKey);
  return Object.freeze({ catalogObjectCount: objects.size, tocCount, applicationOverlayKeys });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--input') throw new Error('Usage: validate-ownership-boundary.mjs --input <bundle.json>');
  const input = JSON.parse(await readFile(args[1], 'utf8'));
  process.stdout.write(`${JSON.stringify(validateOwnershipBoundary(input))}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
