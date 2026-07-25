#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import path from 'node:path';
import {
  validateCatalogCutoffDigest, validateKnownSecurityDrift, validatePublicationSqlPayloads,
} from './prepare-capture-publication.mjs';
import { validateOwnershipBoundary } from './validate-ownership-boundary.mjs';
import { computeDependencyClosure, deriveTocDestinations } from './render-baseline-from-archive.mjs';

export const CAPTURE_PAYLOAD_PATHS = Object.freeze([
  'baseline.sql', 'managed-overlays.sql', 'catalog.cutoff.normalized.json', 'toc.normalized.json',
  'use-list.txt', 'toc-ownership-map.json', 'dependency-closure.json', 'role-map.json',
  'ownership-boundary.json', 'exclusions.json', 'platform-prerequisites.json', 'security-drift.json',
  'catalog-cutoff.sha256',
]);

const SHA256 = /^[0-9a-f]{64}$/u;
const MAX_METADATA_BYTES = 2 * 1024 * 1024;
const MAX_PAYLOAD_BYTES = 32 * 1024 * 1024;
const MAX_SNAPSHOT_BYTES = 64 * 1024 * 1024;
const CAPTURE_MANIFEST_NAME = 'capture-manifest.json';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function canonicalSha256(value) {
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`);
  try { return sha256(bytes); } finally { bytes.fill(0); }
}

function exactKeys(value, allowed, required, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) if (!allowedSet.has(key)) throw new Error(`${label} unknown key: ${key}`);
  for (const key of required) if (!Object.hasOwn(value, key)) throw new Error(`${label} missing key: ${key}`);
}

function validateDigest(value, label) {
  if (typeof value !== 'string' || !SHA256.test(value)) throw new Error(`${label} digest invalid`);
  return value;
}

function validatePayloadDigests(value, paths = CAPTURE_PAYLOAD_PATHS) {
  exactKeys(value, paths, paths, 'payload digests');
  if (JSON.stringify(Object.keys(value)) !== JSON.stringify(paths)) throw new Error('payload digest path order invalid');
  for (const relative of paths) validateDigest(value[relative], `payload ${relative}`);
  return value;
}

function rejectForbiddenMetadata(value, trail = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => rejectForbiddenMetadata(entry, [...trail, String(index)]));
    return;
  }
  if (!value || typeof value !== 'object') {
    if (typeof value === 'string' && (/postgres(?:ql)?:\/\//iu.test(value) || /PGPASSWORD|\\(?:un)?restrict\s+[0-9a-f]{16,}/iu.test(value))) {
      throw new Error(`manifest forbidden value at ${trail.join('.')}`);
    }
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (key !== 'secretScan' && /password|credential|secret|restrictKey|argv|env|rawOutput|MIDAO_USE_LIST_B64/iu.test(key)) {
      throw new Error(`manifest forbidden key: ${key}`);
    }
    rejectForbiddenMetadata(entry, [...trail, key]);
  }
}

export function validateCaptureManifest(manifest) {
  exactKeys(manifest,
    ['schemaVersion', 'kind', 'transactionId', 'payloadDigests', 'capture', 'toolchain', 'assertions'],
    ['schemaVersion', 'kind', 'transactionId', 'payloadDigests', 'capture', 'toolchain', 'assertions'],
    'capture manifest');
  if (manifest.schemaVersion !== 1 || manifest.kind !== 'midao-baseline-capture') throw new Error('capture manifest identity invalid');
  validateDigest(manifest.transactionId, 'transactionId');
  validatePayloadDigests(manifest.payloadDigests);
  exactKeys(manifest.capture,
    ['count', 'catalogSha256', 'tocSha256', 'renderedBaselineSha256', 'renderedOverlaySha256'],
    ['count', 'catalogSha256', 'tocSha256', 'renderedBaselineSha256', 'renderedOverlaySha256'], 'capture manifest capture');
  if (manifest.capture.count !== 2) throw new Error('capture manifest requires two captures');
  for (const key of ['catalogSha256', 'tocSha256', 'renderedBaselineSha256', 'renderedOverlaySha256']) {
    validateDigest(manifest.capture[key], `capture ${key}`);
  }
  if (manifest.capture.catalogSha256 !== manifest.payloadDigests['catalog.cutoff.normalized.json']
    || manifest.capture.tocSha256 !== manifest.payloadDigests['toc.normalized.json']
    || manifest.capture.renderedBaselineSha256 !== manifest.payloadDigests['baseline.sql']
    || manifest.capture.renderedOverlaySha256 !== manifest.payloadDigests['managed-overlays.sql']) {
    throw new Error('capture rendered digest mismatch');
  }
  exactKeys(manifest.toolchain,
    ['supabaseCliVersion', 'dumpSchemaSourceSha256', 'postgresMajor', 'postgresImage'],
    ['supabaseCliVersion', 'dumpSchemaSourceSha256', 'postgresMajor', 'postgresImage'], 'capture toolchain');
  if (manifest.toolchain.supabaseCliVersion !== '2.87.2'
    || manifest.toolchain.dumpSchemaSourceSha256 !== '5cd57189f6565ddf651ff149995398a4c9b1971ca34a0093a77c011a41f21d64'
    || manifest.toolchain.postgresMajor !== 17
    || manifest.toolchain.postgresImage !== 'postgres@sha256:0027bef26712baaee437a4ea48fdf3d2d2e2bc5f0d81615374408ca320f3c7e3') {
    throw new Error('capture toolchain identity invalid');
  }
  exactKeys(manifest.assertions,
    ['catalogEquivalent', 'securityPolicyStatus', 'secretScan', 'dataScan'],
    ['catalogEquivalent', 'securityPolicyStatus', 'secretScan', 'dataScan'], 'capture assertions');
  if (manifest.assertions.catalogEquivalent !== true
    || !['equivalent', 'known_drift'].includes(manifest.assertions.securityPolicyStatus)
    || manifest.assertions.secretScan !== 'pass' || manifest.assertions.dataScan !== 'pass') {
    throw new Error('capture assertions invalid');
  }
  rejectForbiddenMetadata(manifest);
  return manifest;
}

export function validateCaptureLedger(ledger) {
  exactKeys(ledger,
    ['schemaVersion', 'kind', 'transactionId', 'captureManifestSha256', 'payloadDigests'],
    ['schemaVersion', 'kind', 'transactionId', 'captureManifestSha256', 'payloadDigests'], 'capture ledger');
  if (ledger.schemaVersion !== 1 || ledger.kind !== 'midao-baseline-capture-ledger') throw new Error('capture ledger identity invalid');
  validateDigest(ledger.transactionId, 'ledger transactionId');
  validateDigest(ledger.captureManifestSha256, 'capture manifest');
  validatePayloadDigests(ledger.payloadDigests);
  rejectForbiddenMetadata(ledger);
  return ledger;
}

function semanticJson(payloads, name, maxBytes = MAX_METADATA_BYTES, indent = null) {
  const bytes = payloads.get(name);
  if (!Buffer.isBuffer(bytes)) throw new Error(`semantic payload missing: ${name}`);
  return parseCanonicalJson(bytes, name, maxBytes, indent);
}

function validateNormalizedToc(entries) {
  if (!Array.isArray(entries) || entries.length === 0) throw new Error('normalized TOC must be a non-empty array');
  const ids = new Set();
  for (const [index, entry] of entries.entries()) {
    exactKeys(entry,
      ['tocId', 'catalogOid', 'objectOid', 'descriptor', 'schema', 'identity', 'owner'],
      ['tocId', 'catalogOid', 'objectOid', 'descriptor', 'schema', 'identity', 'owner'], `normalized TOC ${index}`);
    if (!Number.isSafeInteger(entry.tocId) || entry.tocId < 1 || ids.has(entry.tocId)
      || !Number.isSafeInteger(entry.catalogOid) || entry.catalogOid < 0
      || !Number.isSafeInteger(entry.objectOid) || entry.objectOid < 0
      || [entry.descriptor, entry.schema, entry.identity, entry.owner].some((value) => typeof value !== 'string' || value.length === 0 || /[\0\r\n]/u.test(value))) {
      throw new Error(`normalized TOC entry invalid: ${index}`);
    }
    ids.add(entry.tocId);
  }
  return ids;
}

function expectedUseList(entries, selectedIds) {
  const lines = entries.filter((entry) => selectedIds.has(entry.tocId)).map((entry) => (
    `${entry.tocId}; ${entry.catalogOid} ${entry.objectOid} ${entry.descriptor} ${entry.schema} ${entry.identity} ${entry.owner}`
  ));
  if (lines.length !== selectedIds.size) throw new Error('semantic TOC selected ID coverage invalid');
  return Buffer.from(`${lines.join('\n')}\n`);
}

export function validateCapturePayloadSemantics(payloads, manifest) {
  if (!(payloads instanceof Map) || !manifest || manifest.assertions?.securityPolicyStatus !== 'known_drift'
    || CAPTURE_PAYLOAD_PATHS.some((name) => !Buffer.isBuffer(payloads.get(name))) || payloads.size !== CAPTURE_PAYLOAD_PATHS.length) {
    throw new Error('capture payload semantic context invalid');
  }
  const catalogBytes = payloads.get('catalog.cutoff.normalized.json');
  validateCatalogCutoffDigest(catalogBytes, payloads.get('catalog-cutoff.sha256'));
  validateKnownSecurityDrift({ normalizedCutoffCatalog: catalogBytes, securityDriftBytes: payloads.get('security-drift.json') });
  validatePublicationSqlPayloads(payloads);

  const ownershipInput = {
    catalog: semanticJson(payloads, 'catalog.cutoff.normalized.json', MAX_PAYLOAD_BYTES, 2),
    templateOnly: false,
    tocOwnershipMap: semanticJson(payloads, 'toc-ownership-map.json'),
    roleMap: semanticJson(payloads, 'role-map.json'),
    ownershipBoundary: semanticJson(payloads, 'ownership-boundary.json'),
    exclusions: semanticJson(payloads, 'exclusions.json'),
    platformPrerequisites: semanticJson(payloads, 'platform-prerequisites.json'),
  };
  validateOwnershipBoundary(ownershipInput);
  const toc = semanticJson(payloads, 'toc.normalized.json', MAX_PAYLOAD_BYTES);
  const tocIds = validateNormalizedToc(toc);
  const selectedIds = new Set(ownershipInput.tocOwnershipMap.expectedTocIds);
  for (const tocId of selectedIds) if (!tocIds.has(tocId)) throw new Error(`semantic TOC mapping ID missing: ${tocId}`);
  const expectedUse = expectedUseList(toc, selectedIds);
  try {
    if (!payloads.get('use-list.txt').equals(expectedUse)) throw new Error('semantic selected use-list mismatch');
  } finally { expectedUse.fill(0); }

  const destinations = deriveTocDestinations(ownershipInput.tocOwnershipMap);
  const expectedClosure = computeDependencyClosure({
    assignments: ownershipInput.ownershipBoundary.assignments,
    tocOwnershipMap: ownershipInput.tocOwnershipMap,
    destinations,
  });
  const closure = semanticJson(payloads, 'dependency-closure.json');
  if (!Array.isArray(closure) || closure.length !== expectedClosure.length) throw new Error('semantic dependency closure coverage invalid');
  const tocById = new Map(toc.map((entry) => [entry.tocId, entry]));
  const destinationDigests = {
    'baseline.sql': sha256(payloads.get('baseline.sql')),
    'managed-overlays.sql': sha256(payloads.get('managed-overlays.sql')),
  };
  closure.forEach((entry, index) => {
    const bindingKeys = [
      'tocId', 'objectKey', 'destination', 'directDependencies', 'transitiveDependencies',
      'captureASha256', 'captureBSha256', 'tocEntrySha256', 'destinationSha256',
    ];
    exactKeys(entry, [...bindingKeys, 'renderBindingSha256'], [...bindingKeys, 'renderBindingSha256'], `semantic dependency closure ${index}`);
    const expected = expectedClosure[index];
    for (const key of ['tocId', 'objectKey', 'destination', 'directDependencies', 'transitiveDependencies']) {
      if (JSON.stringify(entry[key]) !== JSON.stringify(expected[key])) throw new Error(`semantic dependency closure mismatch: ${key}`);
    }
    if (!SHA256.test(entry.captureASha256) || entry.captureASha256 !== entry.captureBSha256) {
      throw new Error('semantic dependency A/B digest invalid');
    }
    const expectedTocDigest = canonicalSha256(tocById.get(entry.tocId));
    const expectedDestinationDigest = destinationDigests[entry.destination];
    if (entry.tocEntrySha256 !== expectedTocDigest || entry.destinationSha256 !== expectedDestinationDigest) {
      throw new Error('semantic render TOC/destination binding invalid');
    }
    const binding = Object.fromEntries(bindingKeys.map((key) => [key, entry[key]]));
    if (!SHA256.test(entry.renderBindingSha256) || entry.renderBindingSha256 !== canonicalSha256(binding)) {
      throw new Error('semantic render aggregate binding invalid');
    }
  });
  return true;
}

function parseCanonicalJson(bytes, label, maxBytes = MAX_METADATA_BYTES, indent = null) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > maxBytes || bytes.includes(0) || bytes.includes(13)) {
    throw new Error(`${label} bytes invalid`);
  }
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) {
    throw new Error(`${label} UTF-8 invalid`, { cause: error });
  }
  if (!text.endsWith('\n')) throw new Error(`${label} framing invalid`);
  let parsed;
  try { parsed = JSON.parse(text); } catch (error) { throw new Error(`${label} JSON invalid`, { cause: error }); }
  if (`${JSON.stringify(parsed, null, indent)}\n` !== text) throw new Error(`${label} must be canonical JSON`);
  return parsed;
}

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function assertOwnedRegular(stat, label) {
  if (!stat.isFile() || stat.uid !== BigInt(process.geteuid()) || stat.nlink !== 1n) throw new Error(`${label} file identity invalid`);
  const mode = Number(stat.mode & 0o7777n);
  if (![0o600, 0o644].includes(mode)) throw new Error(`${label} file mode invalid`);
}

async function openPinnedFile(parentHandle, parentPath, name, label) {
  const handle = await open(`/proc/self/fd/${parentHandle.fd}/${name}`, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const fdStat = await handle.stat({ bigint: true });
    const pathStat = await lstat(path.join(parentPath, name), { bigint: true });
    assertOwnedRegular(fdStat, label);
    if (!sameIdentity(fdStat, pathStat)) throw new Error(`${label} path identity mismatch`);
    return { handle, fdStat, path: path.join(parentPath, name) };
  } catch (error) {
    await handle.close();
    throw error;
  }
}

async function assertAbsent(filePath, label) {
  try {
    await lstat(filePath, { bigint: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  throw new Error(`${label} unfinished or present`);
}

function readOnlyPayloadView(payloadMap) {
  return Object.freeze({
    keys: () => payloadMap.keys(),
    has: (name) => payloadMap.has(name),
    get: (name) => {
      const bytes = payloadMap.get(name);
      return bytes ? Buffer.from(bytes) : undefined;
    },
  });
}

export async function verifyCaptureTransaction({ baselineDir, ledgerPath, journalPath, onPayloadOpen = () => {} }) {
  if (![baselineDir, ledgerPath, journalPath].every((value) => typeof value === 'string' && path.isAbsolute(value) && !value.includes('\0'))
    || typeof onPayloadOpen !== 'function') throw new Error('capture verifier paths invalid');
  await assertAbsent(journalPath, 'publication journal');

  const baselinePath = path.resolve(baselineDir);
  const ledgerFilePath = path.resolve(ledgerPath);
  const ledgerParentPath = path.dirname(ledgerFilePath);
  let baselineHandle;
  let ledgerParentHandle;
  let ledgerPinned;
  let manifestPinned;
  const payloadPinned = [];
  const payloadMap = new Map();
  let primaryError;
  try {
    baselineHandle = await open(baselinePath, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    ledgerParentHandle = await open(ledgerParentPath, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    const baselineStat = await baselineHandle.stat({ bigint: true });
    const ledgerParentStat = await ledgerParentHandle.stat({ bigint: true });
    if (!baselineStat.isDirectory() || !ledgerParentStat.isDirectory()) throw new Error('transaction parent is not a directory');

    ledgerPinned = await openPinnedFile(ledgerParentHandle, ledgerParentPath, path.basename(ledgerFilePath), 'capture ledger');
    const ledgerBytes = await ledgerPinned.handle.readFile();
    const ledger = validateCaptureLedger(parseCanonicalJson(ledgerBytes, 'capture ledger'));

    manifestPinned = await openPinnedFile(baselineHandle, baselinePath, CAPTURE_MANIFEST_NAME, 'capture manifest');
    const manifestBytes = await manifestPinned.handle.readFile();
    if (sha256(manifestBytes) !== ledger.captureManifestSha256) throw new Error('capture ledger manifest digest mismatch');
    const manifest = validateCaptureManifest(parseCanonicalJson(manifestBytes, 'capture manifest'));
    if (manifest.transactionId !== ledger.transactionId
      || JSON.stringify(manifest.payloadDigests) !== JSON.stringify(ledger.payloadDigests)) {
      throw new Error('capture ledger and manifest digest contract mismatch');
    }

    let totalBytes = 0;
    for (const relative of CAPTURE_PAYLOAD_PATHS) {
      onPayloadOpen(relative);
      const pinned = await openPinnedFile(baselineHandle, baselinePath, relative, `payload ${relative}`);
      payloadPinned.push(pinned);
      if (pinned.fdStat.size > BigInt(MAX_PAYLOAD_BYTES)) throw new Error(`payload size limit exceeded: ${relative}`);
      const bytes = await pinned.handle.readFile();
      totalBytes += bytes.length;
      if (totalBytes > MAX_SNAPSHOT_BYTES) {
        bytes.fill(0);
        throw new Error('payload snapshot size limit exceeded');
      }
      if (sha256(bytes) !== manifest.payloadDigests[relative]) {
        bytes.fill(0);
        throw new Error(`payload digest mismatch: ${relative}`);
      }
      payloadMap.set(relative, bytes);
    }
    validateCapturePayloadSemantics(payloadMap, manifest);

    const [baselineAfter, ledgerParentAfter, ledgerAfter, manifestAfter, ...payloadAfter] = await Promise.all([
      lstat(baselinePath, { bigint: true }), lstat(ledgerParentPath, { bigint: true }),
      lstat(ledgerFilePath, { bigint: true }), lstat(path.join(baselinePath, CAPTURE_MANIFEST_NAME), { bigint: true }),
      ...payloadPinned.map((pinned) => lstat(pinned.path, { bigint: true })),
    ]);
    if (!sameIdentity(baselineStat, baselineAfter) || !sameIdentity(ledgerParentStat, ledgerParentAfter)
      || !sameIdentity(ledgerPinned.fdStat, ledgerAfter) || !sameIdentity(manifestPinned.fdStat, manifestAfter)
      || payloadPinned.some((pinned, index) => !sameIdentity(pinned.fdStat, payloadAfter[index]))) {
      throw new Error('transaction path identity changed during verification');
    }
    await assertAbsent(journalPath, 'publication journal');
    let disposed = false;
    return Object.freeze({
      transactionId: manifest.transactionId,
      manifest: Object.freeze(structuredClone(manifest)),
      ledger: Object.freeze(structuredClone(ledger)),
      payloads: readOnlyPayloadView(payloadMap),
      dispose() {
        if (disposed) return;
        disposed = true;
        for (const bytes of payloadMap.values()) bytes.fill(0);
        payloadMap.clear();
      },
    });
  } catch (error) {
    primaryError = error;
    for (const bytes of payloadMap.values()) bytes.fill(0);
    payloadMap.clear();
    throw error;
  } finally {
    const closeResults = await Promise.allSettled([
      ...payloadPinned.map((pinned) => pinned.handle.close()),
      manifestPinned?.handle.close(), ledgerPinned?.handle.close(), ledgerParentHandle?.close(), baselineHandle?.close(),
    ].filter(Boolean));
    const closeErrors = closeResults.filter((entry) => entry.status === 'rejected').map((entry) => entry.reason);
    if (closeErrors.length) {
      for (const bytes of payloadMap.values()) bytes.fill(0);
      payloadMap.clear();
      throw new AggregateError(primaryError ? [primaryError, ...closeErrors] : closeErrors, 'capture verification close failed');
    }
  }
}
