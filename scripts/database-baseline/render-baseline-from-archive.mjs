#!/usr/bin/env node
import { createHash } from 'node:crypto';

const MAX_TOC_BYTES = 4 * 1024 * 1024;
const DATA_DESCRIPTORS = ['MATERIALIZED VIEW DATA', 'TABLE DATA', 'SEQUENCE SET', 'BLOB', 'BLOBS', 'LARGE OBJECT', 'LARGE OBJECTS'];
const DESCRIPTORS = [
  'MATERIALIZED VIEW DATA', 'MATERIALIZED VIEW', 'FOREIGN TABLE', 'FK CONSTRAINT', 'DEFAULT ACL',
  'TABLE ATTACH', 'SEQUENCE OWNED BY', 'SEQUENCE SET', 'TEXT SEARCH CONFIGURATION', 'TEXT SEARCH DICTIONARY',
  'TEXT SEARCH PARSER', 'TEXT SEARCH TEMPLATE', 'PUBLICATION TABLE', 'PUBLICATION TABLES IN SCHEMA',
  'ROW SECURITY', 'TABLE', 'VIEW', 'SEQUENCE', 'SCHEMA', 'TYPE', 'DOMAIN', 'CONSTRAINT', 'INDEX',
  'FUNCTION', 'PROCEDURE', 'AGGREGATE', 'TRIGGER', 'POLICY', 'ACL', 'EXTENSION', 'EXTENSION MEMBER',
  'PUBLICATION', 'COMMENT', 'RULE', 'CAST', 'COLLATION', 'CONVERSION', 'OPERATOR', 'OPERATOR CLASS',
  'OPERATOR FAMILY', 'LANGUAGE', 'EVENT TRIGGER', 'SERVER', 'USER MAPPING', 'FOREIGN DATA WRAPPER',
].sort((left, right) => right.length - left.length);
const DESTINATIONS = new Set(['baseline.sql', 'managed-overlays.sql']);

function safeInteger(raw, label, { positive = false } = {}) {
  if (!/^(?:0|[1-9][0-9]*)$/u.test(raw)) throw new Error(`TOC ${label} invalid`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || (positive ? value < 1 : value < 0)) throw new Error(`TOC ${label} must be a safe integer`);
  return value;
}

export function parsePg17Toc(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0 || buffer.length > MAX_TOC_BYTES) throw new Error('TOC bytes invalid');
  if (buffer.includes(0) || buffer.includes(13)) throw new Error('TOC must use LF and contain no NUL');
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch (error) {
    throw new Error('TOC UTF-8 invalid', { cause: error });
  }
  if (!text.endsWith('\n')) throw new Error('TOC must end with LF');
  const entries = [];
  const ids = new Set();
  for (const line of text.split('\n')) {
    if (line === '' || line.startsWith(';')) continue;
    const prefix = /^(\d+); (\d+) (\d+) (.+)$/u.exec(line);
    if (!prefix) throw new Error('TOC entry shape invalid');
    const tocId = safeInteger(prefix[1], 'ID', { positive: true });
    const catalogOid = safeInteger(prefix[2], 'catalog OID');
    const objectOid = safeInteger(prefix[3], 'object OID');
    if (ids.has(tocId)) throw new Error(`duplicate TOC ID: ${tocId}`);
    ids.add(tocId);
    const remainder = prefix[4];
    const dataDescriptor = DATA_DESCRIPTORS.find((descriptor) => remainder === descriptor || remainder.startsWith(`${descriptor} `));
    if (dataDescriptor) throw new Error(`data-bearing TOC descriptor refused: ${dataDescriptor}`);
    const descriptor = DESCRIPTORS.find((candidate) => remainder.startsWith(`${candidate} `));
    if (!descriptor) throw new Error('TOC descriptor unknown');
    const fields = remainder.slice(descriptor.length + 1).split(' ');
    if (fields.length < 3 || fields.some((field) => field.length === 0)) throw new Error('TOC identity shape invalid');
    const schema = fields.shift();
    const owner = fields.pop();
    const identity = fields.join(' ');
    if (!schema || !owner || !identity) throw new Error('TOC identity missing');
    entries.push(Object.freeze({ tocId, catalogOid, objectOid, descriptor, schema, identity, owner }));
  }
  if (entries.length === 0) throw new Error('TOC has no entries');
  return Object.freeze(entries);
}

export function buildSelectedUseList(buffer, selectedTocIds) {
  const entries = parsePg17Toc(buffer);
  if (!Array.isArray(selectedTocIds)) throw new Error('selected TOC IDs invalid');
  const selected = new Set();
  for (const tocId of selectedTocIds) {
    if (!Number.isSafeInteger(tocId) || tocId < 1 || selected.has(tocId)) throw new Error('selected TOC IDs duplicate or invalid');
    selected.add(tocId);
  }
  const known = new Set(entries.map((entry) => entry.tocId));
  for (const tocId of selected) if (!known.has(tocId)) throw new Error(`selected TOC ID unknown: ${tocId}`);
  if (selected.size === 0) return Buffer.alloc(0);
  const lines = new TextDecoder('utf-8', { fatal: true }).decode(buffer).split('\n')
    .filter((line) => {
      if (line === '' || line.startsWith(';')) return false;
      const match = /^(\d+); /u.exec(line);
      return match && selected.has(Number(match[1]));
    });
  if (lines.length !== selected.size) throw new Error('selected TOC use-list coverage invalid');
  return Buffer.from(`${lines.join('\n')}\n`, 'utf8');
}

export function deriveTocDestinations(tocOwnershipMap) {
  if (!tocOwnershipMap || !Array.isArray(tocOwnershipMap.expectedTocIds) || !Array.isArray(tocOwnershipMap.entries)) {
    throw new Error('TOC ownership map invalid');
  }
  const expected = new Set();
  for (const tocId of tocOwnershipMap.expectedTocIds) {
    if (!Number.isSafeInteger(tocId) || tocId < 1 || expected.has(tocId)) throw new Error('expected TOC IDs invalid');
    expected.add(tocId);
  }
  const destinations = {};
  for (const entry of tocOwnershipMap.entries) {
    if (!expected.has(entry?.tocId) || Object.hasOwn(destinations, entry.tocId)) throw new Error(`TOC destination unknown or duplicate: ${entry?.tocId}`);
    if (entry.ownerDomain === 'platform' || entry.ownerDomain === 'excluded_environmental') {
      throw new Error(`${entry.ownerDomain.replace('_', ' ')} object cannot be selected for render: ${entry.tocId}`);
    }
    if (!['application', 'application_overlay', 'extension'].includes(entry.ownerDomain)) {
      throw new Error(`TOC owner domain invalid: ${entry.tocId}`);
    }
    destinations[entry.tocId] = entry.ownerDomain === 'application_overlay' ? 'managed-overlays.sql' : 'baseline.sql';
  }
  if (Object.keys(destinations).length !== expected.size) throw new Error('TOC destination coverage missing');
  return Object.fromEntries(Object.entries(destinations).sort(([left], [right]) => Number(left) - Number(right)));
}

function validateRestrictKey(key) {
  if (typeof key !== 'string' || !/^[0-9a-f]{64}$/u.test(key) || /^0+$/u.test(key)) throw new Error('restrict key invalid');
  return key;
}

export function generateRestrictKey({ randomBytes }) {
  if (typeof randomBytes !== 'function') throw new Error('restrict random source invalid');
  const bytes = randomBytes(32);
  try {
    if (!Buffer.isBuffer(bytes) || bytes.length !== 32) throw new Error('restrict random bytes invalid');
    return validateRestrictKey(bytes.toString('hex'));
  } finally {
    if (Buffer.isBuffer(bytes)) bytes.fill(0);
  }
}


export function stripExactRestrictEnvelope(buffer, restrictKey) {
  if (!Buffer.isBuffer(buffer)) throw new Error('restrict framing requires Buffer');
  validateRestrictKey(restrictKey);
  const header = Buffer.from('--\n-- PostgreSQL database dump\n--\n\n');
  const opening = Buffer.from(`\\restrict ${restrictKey}\n`);
  const closing = Buffer.from(`\\unrestrict ${restrictKey}\n`);
  const openingEnd = header.length + opening.length;
  const closingStart = buffer.length - closing.length - 1;
  if (buffer.length < openingEnd + closing.length + 1
    || !buffer.subarray(0, header.length).equals(header)
    || !buffer.subarray(header.length, openingEnd).equals(opening)
    || closingStart < openingEnd
    || !buffer.subarray(closingStart, buffer.length - 1).equals(closing)
    || buffer.at(-1) !== 10) {
    throw new Error('restrict framing mismatch');
  }
  return Buffer.concat([header, buffer.subarray(openingEnd, closingStart)]);
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function assertPairEqual(left, right, label) {
  if (!left.equals(right)) {
    left.fill(0);
    right.fill(0);
    throw new Error(`A/B ${label} render mismatch`);
  }
}

export async function renderArchivePair({ tocBuffers, assignments, tocOwnershipMap, randomBytes, render }) {
  if (!Array.isArray(tocBuffers) || tocBuffers.length !== 2 || tocBuffers.some((entry) => !Buffer.isBuffer(entry))
    || !Array.isArray(assignments) || typeof render !== 'function') {
    throw new Error('A/B render input invalid');
  }
  const owned = new Set();
  const track = (buffer) => { owned.add(buffer); return buffer; };
  try {
  const parsedToc = tocBuffers.map((buffer) => parsePg17Toc(buffer));
  const normalized = parsedToc.map((entries) => track(Buffer.from(`${JSON.stringify(entries)}\n`)));
  assertPairEqual(normalized[0], normalized[1], 'normalized TOC');
  const restrictKey = generateRestrictKey({ randomBytes });
  const destinations = deriveTocDestinations(tocOwnershipMap);
  const selectedIds = Object.keys(destinations).map(Number).sort((left, right) => left - right);
  const allUseLists = tocBuffers.map((buffer) => track(buildSelectedUseList(buffer, selectedIds)));
  assertPairEqual(allUseLists[0], allUseLists[1], 'selected use-list');

  async function invoke(archiveIndex, destination, useList) {
    const useListCopy = Buffer.from(useList);
    let framed;
    try {
      framed = await render({ archiveIndex, destination, useList: useListCopy, restrictKey });
      if (!Buffer.isBuffer(framed)) throw new Error('render child output invalid');
      return track(stripExactRestrictEnvelope(framed, restrictKey));
    } finally {
      useListCopy.fill(0);
      framed?.fill?.(0);
    }
  }

  const rendered = {};
  for (const destination of ['baseline.sql', 'managed-overlays.sql']) {
    const ids = selectedIds.filter((tocId) => destinations[tocId] === destination);
    const useLists = tocBuffers.map((buffer) => track(buildSelectedUseList(buffer, ids)));
    assertPairEqual(useLists[0], useLists[1], `${destination} use-list`);
    if (ids.length === 0) {
      rendered[destination] = track(Buffer.alloc(0));
      continue;
    }
    const pair = [
      await invoke(0, destination, useLists[0]),
      await invoke(1, destination, useLists[1]),
    ];
    assertPairEqual(pair[0], pair[1], destination);
    rendered[destination] = pair[0];
    pair[1].fill(0);
  }

  const entryDigests = new Map();
  for (const tocId of selectedIds) {
    const destination = destinations[tocId];
    const useLists = tocBuffers.map((buffer) => track(buildSelectedUseList(buffer, [tocId])));
    assertPairEqual(useLists[0], useLists[1], `TOC ${tocId} use-list`);
    const pair = [
      await invoke(0, destination, useLists[0]),
      await invoke(1, destination, useLists[1]),
    ];
    assertPairEqual(pair[0], pair[1], `TOC ${tocId}`);
    entryDigests.set(tocId, { captureASha256: sha256(pair[0]), captureBSha256: sha256(pair[1]) });
    pair[0].fill(0);
    pair[1].fill(0);
  }
  const dependencyClosure = computeDependencyClosure({ assignments, tocOwnershipMap, destinations })
    .map((entry) => Object.freeze({ ...entry, ...entryDigests.get(entry.tocId) }));
  const result = Object.freeze({
    baselineSql: rendered['baseline.sql'],
    managedOverlaysSql: rendered['managed-overlays.sql'],
    useList: allUseLists[0],
    tocNormalized: normalized[0],
    destinations: Object.freeze(destinations),
    dependencyClosure: Object.freeze(dependencyClosure),
  });
  const retained = new Set([result.baselineSql, result.managedOverlaysSql, result.useList, result.tocNormalized]);
  for (const buffer of owned) if (!retained.has(buffer)) buffer.fill(0);
  return result;
  } catch (error) {
    for (const buffer of owned) buffer.fill(0);
    throw error;
  }
}

function keyId(key, label = 'objectKey') {
  if (!Array.isArray(key) || key.length === 0 || key.some((part) => {
    if (part === null || typeof part === 'string' || typeof part === 'boolean') return false;
    return typeof part !== 'number' || !Number.isFinite(part) || Object.is(part, -0);
  })) throw new Error(`${label} invalid`);
  return JSON.stringify(key);
}

export function computeDependencyClosure({ assignments, tocOwnershipMap, destinations }) {
  if (!Array.isArray(assignments) || !tocOwnershipMap || !Array.isArray(tocOwnershipMap.expectedTocIds)
    || !Array.isArray(tocOwnershipMap.entries) || !destinations || typeof destinations !== 'object' || Array.isArray(destinations)) {
    throw new Error('dependency closure input invalid');
  }
  const assignmentMap = new Map();
  for (const assignment of assignments) {
    const id = keyId(assignment?.objectKey);
    if (assignmentMap.has(id)) throw new Error(`duplicate dependency object: ${id}`);
    if (!Array.isArray(assignment.dependsOn)) throw new Error(`dependencies invalid: ${id}`);
    const dependencies = assignment.dependsOn.map((dependency) => keyId(dependency, 'dependency objectKey'));
    if (new Set(dependencies).size !== dependencies.length || dependencies.includes(id)) throw new Error(`dependency duplicate or self-edge: ${id}`);
    assignmentMap.set(id, { objectKey: assignment.objectKey, dependencies });
  }
  for (const [id, assignment] of assignmentMap) {
    for (const dependency of assignment.dependencies) if (!assignmentMap.has(dependency)) throw new Error(`dependency unknown for ${id}: ${dependency}`);
  }

  const visiting = new Set();
  const visited = new Set();
  const reachable = new Map();
  function visit(id) {
    if (visiting.has(id)) throw new Error(`dependency cycle: ${id}`);
    if (visited.has(id)) return reachable.get(id);
    visiting.add(id);
    const result = new Set();
    for (const dependency of assignmentMap.get(id).dependencies) {
      result.add(dependency);
      for (const nested of visit(dependency)) result.add(nested);
    }
    visiting.delete(id);
    visited.add(id);
    reachable.set(id, result);
    return result;
  }
  for (const id of assignmentMap.keys()) visit(id);

  const expected = new Set();
  for (const tocId of tocOwnershipMap.expectedTocIds) {
    if (!Number.isSafeInteger(tocId) || tocId < 1 || expected.has(tocId)) throw new Error('expected TOC IDs invalid');
    expected.add(tocId);
  }
  const entryById = new Map();
  const idsByObject = new Map();
  for (const entry of tocOwnershipMap.entries) {
    if (!expected.has(entry.tocId) || entryById.has(entry.tocId)) throw new Error(`TOC entry unknown or duplicate: ${entry.tocId}`);
    const objectId = keyId(entry.objectKey);
    if (!assignmentMap.has(objectId)) throw new Error(`TOC entry object unknown: ${objectId}`);
    entryById.set(entry.tocId, { entry, objectId });
    if (!idsByObject.has(objectId)) idsByObject.set(objectId, []);
    idsByObject.get(objectId).push(entry.tocId);
  }
  if (entryById.size !== expected.size) throw new Error('TOC entry coverage missing');
  for (const ids of idsByObject.values()) ids.sort((a, b) => a - b);
  const destinationKeys = Object.keys(destinations);
  if (destinationKeys.length !== expected.size) throw new Error('TOC destination coverage invalid');
  for (const tocId of expected) if (!DESTINATIONS.has(destinations[tocId])) throw new Error(`TOC destination invalid: ${tocId}`);
  for (const raw of destinationKeys) if (!expected.has(Number(raw)) || String(Number(raw)) !== raw) throw new Error(`TOC destination extra: ${raw}`);

  return Object.freeze([...expected].sort((a, b) => a - b).map((tocId) => {
    const { entry, objectId } = entryById.get(tocId);
    const directObjects = assignmentMap.get(objectId).dependencies;
    const directDependencies = [...new Set(directObjects.flatMap((id) => {
      const ids = idsByObject.get(id);
      if (!ids?.length) throw new Error(`selected dependency missing TOC mapping: ${id}`);
      return ids;
    }))].sort((a, b) => a - b);
    const transitiveDependencies = [...new Set([...reachable.get(objectId)].flatMap((id) => {
      const ids = idsByObject.get(id);
      if (!ids?.length) throw new Error(`transitive dependency missing TOC mapping: ${id}`);
      return ids;
    }))].sort((a, b) => a - b);
    if (destinations[tocId] === 'baseline.sql'
      && directDependencies.some((dependencyTocId) => destinations[dependencyTocId] === 'managed-overlays.sql')) {
      throw new Error(`dependency destination topology invalid: baseline TOC ${tocId} depends on managed overlay`);
    }
    return Object.freeze({
      tocId,
      objectKey: entry.objectKey,
      destination: destinations[tocId],
      directDependencies: Object.freeze(directDependencies),
      transitiveDependencies: Object.freeze(transitiveDependencies),
    });
  }));
}
