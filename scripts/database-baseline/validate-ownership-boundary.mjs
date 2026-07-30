#!/usr/bin/env node
import { constants } from 'node:fs';
import { lstat, open, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateRawCatalog } from './extract-catalog.mjs';
import { validateNormalizedCatalog } from './validate-normalized-catalog.mjs';

const OWNER_DOMAINS = new Set(['application', 'platform', 'application_overlay', 'extension', 'excluded_environmental']);
const TOC_OPTIONAL_SECTIONS = new Set(['columns', 'constraints', 'indexes', 'rls', 'owners', 'acl', 'defaultPrivileges', 'managedSchemaInventory', 'managedSchemaOverlays']);
const DUPLICATE_METADATA_SECTIONS = new Set(['managedSchemaInventory', 'managedSchemaOverlays']);

function validateOwnershipCatalog(catalog) {
  return Object.hasOwn(catalog ?? {}, 'normalizerVersion') ? validateNormalizedCatalog(catalog) : validateRawCatalog(catalog);
}

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

function isTrustedPlatformObject(section, key) {
  if (section === 'extensions' || section === 'extensionMemberships') return true;
  return section === 'publicationMembership' && key[1] === 'supabase_realtime';
}

function trustedPlatformObjects(objects) {
  return new Set(
    [...objects].filter(([, object]) => isTrustedPlatformObject(object.section, object.row.canonicalKey)).map(([id]) => id),
  );
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

function validateAssignments(boundary, objects, roles, trustedPlatformIds, requireComplete) {
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
    if (trustedPlatformIds.has(id) && assignment.ownerDomain !== 'platform') {
      throw new Error(`trusted platform classification cannot be overridden: ${id}`);
    }
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

function validatePlatformPrerequisites(document, assignments, trustedPlatformIds) {
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
  for (const id of trustedPlatformIds) {
    if (assignments.has(id) && !prerequisites.has(id)) throw new Error(`trusted platform prerequisite missing: ${id}`);
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
    const assignment = assignments.get(id);
    if (!assignment) throw new Error(`TOC unknown object: ${id}`);
    if (assignment.ownerDomain === 'excluded_environmental') throw new Error(`excluded environmental object cannot be selected in TOC: ${id}`);
    if (assignment.ownerDomain !== entry.ownerDomain) throw new Error(`TOC owner mismatch: ${id}`);
    mappedObjects.add(id);
  }
  for (const tocId of expectedTocIds) {
    if (!tocIds.has(tocId)) throw new Error(`expected TOC ID missing mapping: ${tocId}`);
  }
  for (const [id, assignment] of assignments) {
    const relationKey = assignment.objectKey;
    const isSequenceRelation = assignment.section === 'relations' && relationKey.length === 3
      && assignments.has(keyId(['sequence', relationKey[1], relationKey[2]]));
    if (['application', 'application_overlay', 'extension'].includes(assignment.ownerDomain)
      && !TOC_OPTIONAL_SECTIONS.has(assignment.section) && !isSequenceRelation && !mappedObjects.has(id)) {
      throw new Error(`required catalog object missing TOC mapping: ${id}`);
    }
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
    if (exclusion.field === '*' && ['application', 'application_overlay'].includes(assignment.ownerDomain)) {
      throw new Error(`whole application object exclusion forbidden: ${id}`);
    }
    if (exclusion.field === 'canonicalKey' || (exclusion.field !== '*' && !Object.hasOwn(object.row, exclusion.field))) {
      throw new Error(`unknown exclusion field for ${id}: ${exclusion.field}`);
    }
    const exclusionId = `${id}\u0000${exclusion.field}`;
    if (seen.has(exclusionId)) throw new Error(`duplicate exclusion: ${exclusionId}`);
    seen.add(exclusionId);
  }
  return seen;
}

export function validateOwnershipBoundary(input) {
  exactKeys(
    input,
    ['catalog', 'templateOnly', 'ownershipBoundary', 'roleMap', 'exclusions', 'platformPrerequisites', 'tocOwnershipMap'],
    ['catalog', 'templateOnly', 'ownershipBoundary', 'roleMap', 'exclusions', 'platformPrerequisites', 'tocOwnershipMap'],
    'ownership bundle',
  );
  if (typeof input.templateOnly !== 'boolean') throw new Error('templateOnly must be boolean');
  const catalog = validateOwnershipCatalog(input.catalog);
  const objects = catalogObjects(catalog);
  const trustedPlatformIds = trustedPlatformObjects(objects);
  const roles = validateRoleMap(input.roleMap);
  const assignments = validateAssignments(input.ownershipBoundary, objects, roles, trustedPlatformIds, !input.templateOnly);
  if (input.templateOnly) {
    if (input.ownershipBoundary.status !== 'template' || assignments.size !== 0) throw new Error('template cannot contain reviewed assignments');
  } else if (input.ownershipBoundary.status !== 'reviewed') {
    throw new Error('non-template ownership boundary must be reviewed');
  }
  validatePlatformPrerequisites(input.platformPrerequisites, assignments, trustedPlatformIds);
  const tocCount = validateToc(input.tocOwnershipMap, assignments);
  const approvedExclusions = validateExclusions(input.exclusions, assignments, objects);

  const managedKeys = new Set(input.catalog.sections.managedSchemaInventory.map((entry) => keyId(entry.objectKey)));
  for (const id of managedKeys) {
    if (!objects.has(id)) throw new Error(`managed inventory references unknown object: ${id}`);
  }
  for (const [id, assignment] of assignments) {
    if (assignment.ownerDomain === 'application_overlay' && !managedKeys.has(id)) {
      throw new Error(`application overlay must be listed in managed inventory: ${id}`);
    }
    if (assignment.ownerDomain === 'excluded_environmental' && !approvedExclusions.has(`${id}\u0000*`)) {
      throw new Error(`excluded environmental object requires approved whole-object exclusion: ${id}`);
    }
  }
  const applicationOverlayKeys = [...assignments]
    .filter(([, assignment]) => assignment.ownerDomain === 'application_overlay')
    .map(([, assignment]) => assignment.objectKey);
  return Object.freeze({ catalogObjectCount: objects.size, tocCount, applicationOverlayKeys });
}

const HANDOFF_MAX_BYTES = 16 * 1024;
const OWNERSHIP_INPUT_MAX_BYTES = 16 * 1024 * 1024;
const OWNERSHIP_INPUT_NAME = 'ownership-validation-input.json';

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function fileMode(stat) {
  return Number(stat.mode & 0o7777n);
}

function assertSecureStat(stat, { directory, mode, label }) {
  const expectedUid = BigInt(process.geteuid());
  if ((directory ? !stat.isDirectory() : !stat.isFile()) || stat.uid !== expectedUid || fileMode(stat) !== mode
    || (!directory && stat.nlink !== 1n)) throw new Error(`${label} identity or permissions invalid`);
}

function parseCanonicalJson(bytes, maxBytes, label) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > maxBytes || bytes.includes(0) || bytes.includes(13)) {
    throw new Error(`${label} bytes invalid`);
  }
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) {
    throw new Error(`${label} UTF-8 invalid`, { cause: error });
  }
  if (!text.endsWith('\n')) throw new Error(`${label} canonical framing invalid`);
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} JSON invalid`, { cause: error });
  }
  if (`${JSON.stringify(parsed)}\n` !== text) throw new Error(`${label} must be canonical JSON`);
  return parsed;
}

async function closeHandles(handles) {
  await Promise.allSettled(handles.filter(Boolean).map((handle) => handle.close()));
}

export function parseValidatorCli(args) {
  if (!Array.isArray(args) || args.length !== 2 || !['--input', '--candidate-handoff'].includes(args[0])
    || typeof args[1] !== 'string' || args[1].length === 0 || args[1].includes('\0')) {
    throw new Error('Usage: validate-ownership-boundary.mjs (--input <bundle.json> | --candidate-handoff <handoff.json>)');
  }
  return Object.freeze({ mode: args[0] === '--input' ? 'input' : 'candidate-handoff', path: args[1] });
}

export async function inspectCandidateHandoff(handoffPath, { candidateRoot = path.resolve('.hermes/tmp') } = {}) {
  if (typeof handoffPath !== 'string' || handoffPath.includes('\0') || typeof candidateRoot !== 'string') {
    throw new Error('candidate handoff path invalid');
  }
  const rootPath = path.resolve(candidateRoot);
  const resolvedHandoff = path.resolve(handoffPath);
  if (path.dirname(resolvedHandoff) !== rootPath || path.basename(resolvedHandoff) !== resolvedHandoff.slice(rootPath.length + 1)) {
    throw new Error('candidate handoff must be a direct child of candidate root');
  }
  let rootHandle;
  let handoffHandle;
  let candidateHandle;
  let inputHandle;
  try {
    if (await realpath(rootPath) !== rootPath) throw new Error('candidate root symlink refused');
    rootHandle = await open(rootPath, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    const rootFdStat = await rootHandle.stat({ bigint: true });
    const rootPathStat = await lstat(rootPath, { bigint: true });
    assertSecureStat(rootFdStat, { directory: true, mode: 0o700, label: 'candidate root' });
    if (!sameIdentity(rootFdStat, rootPathStat)) throw new Error('candidate root identity changed');

    const handoffFdPath = `/proc/self/fd/${rootHandle.fd}/${path.basename(resolvedHandoff)}`;
    handoffHandle = await open(handoffFdPath, constants.O_RDONLY | constants.O_NOFOLLOW);
    const handoffFdStat = await handoffHandle.stat({ bigint: true });
    const handoffPathStat = await lstat(resolvedHandoff, { bigint: true });
    assertSecureStat(handoffFdStat, { directory: false, mode: 0o600, label: 'candidate handoff' });
    if (!sameIdentity(handoffFdStat, handoffPathStat) || handoffFdStat.size > BigInt(HANDOFF_MAX_BYTES)) {
      throw new Error('candidate handoff identity or size invalid');
    }
    const handoff = parseCanonicalJson(await handoffHandle.readFile(), HANDOFF_MAX_BYTES, 'candidate handoff');
    exactKeys(handoff, ['schemaVersion', 'candidatePath', 'candidateIdentity'], ['schemaVersion', 'candidatePath', 'candidateIdentity'], 'candidate handoff');
    if (handoff.schemaVersion !== 1 || typeof handoff.candidatePath !== 'string') throw new Error('candidate handoff schema invalid');
    exactKeys(handoff.candidateIdentity, ['dev', 'ino', 'uid', 'mode'], ['dev', 'ino', 'uid', 'mode'], 'candidate identity');
    const identity = handoff.candidateIdentity;
    if (!/^(?:0|[1-9][0-9]*)$/u.test(identity.dev) || !/^(?:0|[1-9][0-9]*)$/u.test(identity.ino)
      || identity.uid !== process.geteuid() || identity.mode !== '0700') throw new Error('candidate identity schema invalid');

    const candidatePath = path.resolve(handoff.candidatePath);
    if (path.dirname(candidatePath) !== rootPath || !/^candidate-[A-Za-z0-9_-]+$/u.test(path.basename(candidatePath))) {
      throw new Error('candidate path outside root or malformed');
    }
    candidateHandle = await open(`/proc/self/fd/${rootHandle.fd}/${path.basename(candidatePath)}`, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    const candidateFdStat = await candidateHandle.stat({ bigint: true });
    const candidatePathStat = await lstat(candidatePath, { bigint: true });
    assertSecureStat(candidateFdStat, { directory: true, mode: 0o700, label: 'candidate directory' });
    if (!sameIdentity(candidateFdStat, candidatePathStat) || String(candidateFdStat.dev) !== identity.dev
      || String(candidateFdStat.ino) !== identity.ino || Number(candidateFdStat.uid) !== identity.uid) {
      throw new Error('candidate directory identity or inode mismatch');
    }

    const inputPath = path.join(candidatePath, OWNERSHIP_INPUT_NAME);
    inputHandle = await open(`/proc/self/fd/${candidateHandle.fd}/${OWNERSHIP_INPUT_NAME}`, constants.O_RDONLY | constants.O_NOFOLLOW);
    const inputFdStat = await inputHandle.stat({ bigint: true });
    const inputPathStat = await lstat(inputPath, { bigint: true });
    assertSecureStat(inputFdStat, { directory: false, mode: 0o600, label: 'ownership input' });
    if (!sameIdentity(inputFdStat, inputPathStat) || inputFdStat.size > BigInt(OWNERSHIP_INPUT_MAX_BYTES)) {
      throw new Error('ownership input identity or size invalid');
    }
    const input = parseCanonicalJson(await inputHandle.readFile(), OWNERSHIP_INPUT_MAX_BYTES, 'ownership input');

    const [rootAfter, candidateAfter, inputAfter] = await Promise.all([
      lstat(rootPath, { bigint: true }), lstat(candidatePath, { bigint: true }), lstat(inputPath, { bigint: true }),
    ]);
    if (!sameIdentity(rootFdStat, rootAfter) || !sameIdentity(candidateFdStat, candidateAfter) || !sameIdentity(inputFdStat, inputAfter)) {
      throw new Error('candidate path identity changed during read');
    }
    return Object.freeze({
      rootPath,
      rootIdentity: Object.freeze({ dev: String(rootFdStat.dev), ino: String(rootFdStat.ino) }),
      handoffPath: resolvedHandoff,
      handoffIdentity: Object.freeze({ dev: String(handoffFdStat.dev), ino: String(handoffFdStat.ino) }),
      candidatePath,
      candidateIdentity: Object.freeze({ dev: identity.dev, ino: identity.ino, uid: identity.uid, mode: identity.mode }),
      input,
    });
  } catch (error) {
    throw new Error('candidate handoff rejected', { cause: error });
  } finally {
    await closeHandles([inputHandle, candidateHandle, handoffHandle, rootHandle]);
  }
}

export async function loadCandidateHandoff(handoffPath, options) {
  return (await inspectCandidateHandoff(handoffPath, options)).input;
}

async function main() {
  const cli = parseValidatorCli(process.argv.slice(2));
  const input = cli.mode === 'input'
    ? JSON.parse(await readFile(cli.path, 'utf8'))
    : await loadCandidateHandoff(cli.path);
  process.stdout.write(`${JSON.stringify(validateOwnershipBoundary(input))}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
