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
const OWNERLESS_TOC_DESCRIPTORS = new Set(['COMMENT', 'EXTENSION']);

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function canonicalSha256(value) {
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`);
  try { return sha256(bytes); } finally { bytes.fill(0); }
}

function stableCanonicalSha256(value) {
  const bytes = Buffer.from(`${JSON.stringify(stable(value))}\n`);
  try { return sha256(bytes); } finally { bytes.fill(0); }
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
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

export const EXPECTED_TERMINAL_PAYLOAD_PATHS = Object.freeze([
  'catalog.expected-terminal.normalized.json', 'catalog-expected-terminal.sha256',
]);
const EXPECTED_TERMINAL_DIGEST_KEYS = Object.freeze([...EXPECTED_TERMINAL_PAYLOAD_PATHS].sort());
const EXPECTED_TERMINAL_MANIFEST_NAME = 'manifest.json';
const EXPECTED_TERMINAL_HISTORY = Object.freeze([
  '00000000000001', '20260723000000', '20260723001000', '20260723002000',
  '20260723002500', '20260723003000', '20260723003500', '20260723004000',
  '20260723010000', '20260723011000', '20260723020000', '20260723021000',
  '20260723022000', '20260723023000', '20260729160000', '20260729170000',
  '20260729180000', '20260729190000', '20260730093000', '20260804103000',
  '20260804113000', '20260806090000', '20260806091000', '20260806120000',
  '20260810033421', '20260812150000',
]);
const EXPECTED_TERMINAL_MIGRATIONS = Object.freeze([
  Object.freeze({ filename: '20260723000000_midao_backend_mode.sql', sha256: 'fe108aa5ca68f135f49e22cbb5074941ce8ff5464a6d91a56f9f4cbdae437b17' }),
  Object.freeze({ filename: '20260723001000_midao_notification_outbox.sql', sha256: '6babce9053d6a3f7658276c9cfbbfc5ec0f10ffaeadf4fa07ed904b5f5c66569' }),
  Object.freeze({ filename: '20260723002000_midao_idempotency_records.sql', sha256: '051719cce046ce438668b9424a707b709f5bc1c254a537a525f07261b1a8d7db' }),
  Object.freeze({ filename: '20260723002500_midao_audit_events.sql', sha256: '62fa29d6d4d8fe119867ef05e69eba465f52b5cfa2ca96bddd83e93da9b9bcca' }),
  Object.freeze({ filename: '20260723003000_midao_atomic_backend_mode_switch.sql', sha256: 'c59afc5ee72da4d76ae77fb984db4b34d8f160198544ba233d0fb9f2190c90e5' }),
  Object.freeze({ filename: '20260723003500_midao_service_role_acl_hardening.sql', sha256: 'f16fd369b9ce0b405c38ec2df5a46676cc84ba2de087b3b010cc00e4415353e5' }),
  Object.freeze({ filename: '20260723004000_midao_request_read_projection.sql', sha256: '639f430e666666c2ee9418f8dd2240d0d2c1b1038345378bee11436fc99aeabb' }),
  Object.freeze({ filename: '20260723010000_midao_atomic_booking_approval.sql', sha256: 'a97d57a82bf2e70425325498b0ca96bdf64c1c3322cf81288135a71abaebc968' }),
  Object.freeze({ filename: '20260723011000_midao_atomic_booking_decision_command.sql', sha256: 'c3abc1a6cc5984bcc5239c9728ebd8d46020c43fa577382f87d2775cfb5fdf8a' }),
  Object.freeze({ filename: '20260723020000_midao_service_drafts_and_questions.sql', sha256: '38e1cd3177d459f5bae1f77366878ef809f8b6e22f323b79a7e82ddf8a410042' }),
  Object.freeze({ filename: '20260723021000_midao_service_publication_versions.sql', sha256: '0d9d5b0acb56d657fbacc638622bc36faa35b682b7d2727db80aa63cb872bda6' }),
  Object.freeze({ filename: '20260723022000_midao_atomic_service_publication.sql', sha256: 'b7b06f0029052c2187401e2b7b160545ab757099fee8ba088bc98c9743e9029c' }),
  Object.freeze({ filename: '20260723023000_midao_atomic_publication_restore.sql', sha256: 'feb4e8db59acbb1703b56ee81417026bc077b0bed12669811c52ac98db832421' }),
  Object.freeze({ filename: '20260729160000_issue1777_atomic_settlement_and_payout_confirm.sql', sha256: 'e916be151520837e7d4e2c8fd3575dc11377ffcee88ed6bbd0f7149f18a3208c' }),
  Object.freeze({ filename: '20260729170000_issue1777_refund_adjustment_ledger.sql', sha256: 'af3e498e2acd6dd0410182fd8aef60d098315df79d4d39cfbf246256840849b6' }),
  Object.freeze({ filename: '20260729180000_issue1777_revoke_atomic_fns_from_anon.sql', sha256: 'a4294771928c98a5b071168db76c8f8301bd4db933e0fb214c1bae891476be24' }),
  Object.freeze({ filename: '20260729190000_issue1777_post_review_fixes.sql', sha256: '0819ea2d54f0759ed35a995e2e4d8488e072cf22c8d2857aa7604ec6acd3668a' }),
  Object.freeze({ filename: '20260730093000_issue1777_refund_delta_accumulation.sql', sha256: '7d96dc7146424de74354fbde2af3f768e0877513e83065b601adb9120578ddd0' }),
  Object.freeze({ filename: '20260804103000_issue1777_atomic_refund_reversal.sql', sha256: '4b77a1dae78b79a43a117fa727f891b152df370653dd31dce6deee8642ab74cc' }),
  Object.freeze({ filename: '20260804113000_issue1777_settlement_recompute_amounts.sql', sha256: 'a09d73cf64af5437db45a3bc2c62af07f02c76e5724f5dcf5d4cca32ebd32331' }),
  Object.freeze({ filename: '20260806090000_midao_inquiries.sql', sha256: '2d7a2467540991d0a5faf33243ab06ca19d205f233f959fb76a8a07073638a70' }),
  Object.freeze({ filename: '20260806091000_midao_booking_intake_pricing_and_confirmation.sql', sha256: 'bf8cd71196adcb6a915455d67679c2642eee8dde123c11bf6f4405b067e27e85' }),
  Object.freeze({ filename: '20260806120000_midao_atomic_inquiry_conversion.sql', sha256: '33e9d312bc8079c1414e4900b995dbb0f1ef02384394ed27b128c2c53b8356e3' }),
  Object.freeze({ filename: '20260810033421_issue1811_atomic_booking_order_materialization.sql', sha256: '4fb09d6863a992c089be849198e13f85537a06f586797cb1ec159a8503372d5c' }),
  Object.freeze({ filename: '20260812150000_issue1812_addon_atomic_materialization.sql', sha256: '4f46c444e3b5bfda3e459c90d658538ffd5058d2d6d016daeaeb299a5a106d24' }),
]);

export function validateExpectedTerminalManifest(manifest) {
  const keys = ['captureManifestSha256', 'captureTransactionId', 'historyVersions', 'kind', 'payloadDigests', 'postCutoffMigrations', 'schemaVersion', 'transactionId'];
  exactKeys(manifest, keys, keys, 'expected-terminal manifest');
  if (manifest.schemaVersion !== 1 || manifest.kind !== 'midao-expected-terminal-manifest') throw new Error('expected-terminal manifest identity invalid');
  for (const key of ['transactionId', 'captureTransactionId', 'captureManifestSha256']) validateDigest(manifest[key], `expected-terminal ${key}`);
  validatePayloadDigests(manifest.payloadDigests, EXPECTED_TERMINAL_DIGEST_KEYS);
  if (JSON.stringify(manifest.historyVersions) !== JSON.stringify(EXPECTED_TERMINAL_HISTORY)) {
    throw new Error('expected-terminal exact history invalid');
  }
  if (!Array.isArray(manifest.postCutoffMigrations) || manifest.postCutoffMigrations.length !== EXPECTED_TERMINAL_MIGRATIONS.length) throw new Error('expected-terminal migrations invalid');
  for (const [index, migration] of manifest.postCutoffMigrations.entries()) {
    exactKeys(migration, ['filename', 'sha256'], ['filename', 'sha256'], 'expected-terminal migration');
    if (migration.filename !== EXPECTED_TERMINAL_MIGRATIONS[index].filename
      || migration.sha256 !== EXPECTED_TERMINAL_MIGRATIONS[index].sha256) throw new Error('expected-terminal exact migration invalid');
  }
  const { transactionId, ...core } = manifest;
  if (stableCanonicalSha256(core) !== transactionId) throw new Error('expected-terminal content-derived transaction mismatch');
  rejectForbiddenMetadata(manifest);
  return manifest;
}

export function validateExpectedTerminalLedger(ledger) {
  const keys = ['captureManifestSha256', 'captureTransactionId', 'kind', 'manifestSha256', 'payloadDigests', 'schemaVersion', 'transactionId'];
  exactKeys(ledger, keys, keys, 'expected-terminal ledger');
  if (ledger.schemaVersion !== 1 || ledger.kind !== 'midao-expected-terminal-ledger') throw new Error('expected-terminal ledger identity invalid');
  for (const key of ['transactionId', 'captureTransactionId', 'captureManifestSha256', 'manifestSha256']) validateDigest(ledger[key], `expected-terminal ledger ${key}`);
  validatePayloadDigests(ledger.payloadDigests, EXPECTED_TERMINAL_DIGEST_KEYS);
  rejectForbiddenMetadata(ledger);
  return ledger;
}

function semanticJson(payloads, name, maxBytes = MAX_METADATA_BYTES, indent = null) {
  const bytes = payloads.get(name);
  if (!Buffer.isBuffer(bytes)) throw new Error(`semantic payload missing: ${name}`);
  return parseCanonicalJson(bytes, name, maxBytes, indent);
}

export function validateNormalizedToc(entries) {
  if (!Array.isArray(entries) || entries.length === 0) throw new Error('normalized TOC must be a non-empty array');
  const ids = new Set();
  for (const [index, entry] of entries.entries()) {
    exactKeys(entry,
      ['tocId', 'catalogOid', 'objectOid', 'descriptor', 'schema', 'identity', 'owner'],
      ['tocId', 'catalogOid', 'objectOid', 'descriptor', 'schema', 'identity', 'owner'], `normalized TOC ${index}`);
    if (!Number.isSafeInteger(entry.tocId) || entry.tocId < 1 || ids.has(entry.tocId)
      || !Number.isSafeInteger(entry.catalogOid) || entry.catalogOid < 0
      || !Number.isSafeInteger(entry.objectOid) || entry.objectOid < 0
      || [entry.descriptor, entry.schema, entry.identity].some((value) => typeof value !== 'string' || value.length === 0 || /[\0\r\n]/u.test(value))
      || !((typeof entry.owner === 'string' && entry.owner.length > 0 && !/[\0\r\n]/u.test(entry.owner))
        || (entry.owner === null && OWNERLESS_TOC_DESCRIPTORS.has(entry.descriptor)))) {
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

export async function verifyExpectedTerminalTransaction({
  baselineDir, ledgerPath, captureLedgerPath, journalPath, onPayloadOpen = () => {},
}) {
  if (![baselineDir, ledgerPath, captureLedgerPath, journalPath].every((value) => typeof value === 'string' && path.isAbsolute(value) && !value.includes('\0'))
    || typeof onPayloadOpen !== 'function') throw new Error('expected-terminal verifier paths invalid');
  await assertAbsent(journalPath, 'expected-terminal publication journal');
  const baselinePath = path.resolve(baselineDir);
  const ledgerFilePath = path.resolve(ledgerPath);
  const captureLedgerFilePath = path.resolve(captureLedgerPath);
  const ledgerParentPath = path.dirname(ledgerFilePath);
  const captureLedgerParentPath = path.dirname(captureLedgerFilePath);
  let baselineHandle; let ledgerParentHandle; let captureLedgerParentHandle;
  let ledgerPinned; let manifestPinned; let captureLedgerPinned;
  let ledgerBytes; let manifestBytes; let captureLedgerBytes;
  const payloadPinned = []; const payloadMap = new Map();
  let primaryError;
  try {
    baselineHandle = await open(baselinePath, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    ledgerParentHandle = await open(ledgerParentPath, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    captureLedgerParentHandle = await open(captureLedgerParentPath, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    const baselineStat = await baselineHandle.stat({ bigint: true });
    const ledgerParentStat = await ledgerParentHandle.stat({ bigint: true });
    const captureLedgerParentStat = await captureLedgerParentHandle.stat({ bigint: true });
    if (![baselineStat, ledgerParentStat, captureLedgerParentStat].every((stat) => stat.isDirectory())) throw new Error('expected-terminal transaction parent is not a directory');
    ledgerPinned = await openPinnedFile(ledgerParentHandle, ledgerParentPath, path.basename(ledgerFilePath), 'expected-terminal ledger');
    manifestPinned = await openPinnedFile(baselineHandle, baselinePath, EXPECTED_TERMINAL_MANIFEST_NAME, 'expected-terminal manifest');
    captureLedgerPinned = await openPinnedFile(captureLedgerParentHandle, captureLedgerParentPath, path.basename(captureLedgerFilePath), 'capture ledger reference');
    if ([ledgerPinned, manifestPinned, captureLedgerPinned].some((pinned) => pinned.fdStat.size > BigInt(MAX_METADATA_BYTES))) throw new Error('expected-terminal metadata size limit exceeded');
    ledgerBytes = await ledgerPinned.handle.readFile(); manifestBytes = await manifestPinned.handle.readFile(); captureLedgerBytes = await captureLedgerPinned.handle.readFile();
    const ledger = validateExpectedTerminalLedger(parseCanonicalJson(ledgerBytes, 'expected-terminal ledger'));
    if (sha256(manifestBytes) !== ledger.manifestSha256) throw new Error('expected-terminal manifest digest mismatch');
    const manifest = validateExpectedTerminalManifest(parseCanonicalJson(manifestBytes, 'expected-terminal manifest'));
    const captureLedger = validateCaptureLedger(parseCanonicalJson(captureLedgerBytes, 'capture ledger reference'));
    if (manifest.transactionId !== ledger.transactionId || JSON.stringify(manifest.payloadDigests) !== JSON.stringify(ledger.payloadDigests)
      || manifest.captureTransactionId !== ledger.captureTransactionId || manifest.captureManifestSha256 !== ledger.captureManifestSha256
      || ledger.captureTransactionId !== captureLedger.transactionId || ledger.captureManifestSha256 !== captureLedger.captureManifestSha256) {
      throw new Error('expected-terminal transaction metadata contract mismatch');
    }
    let totalBytes = 0;
    for (const relative of EXPECTED_TERMINAL_PAYLOAD_PATHS) {
      onPayloadOpen(relative);
      const pinned = await openPinnedFile(baselineHandle, baselinePath, relative, `expected-terminal payload ${relative}`);
      payloadPinned.push(pinned);
      if (pinned.fdStat.size > BigInt(MAX_PAYLOAD_BYTES)) throw new Error(`expected-terminal payload size limit exceeded: ${relative}`);
      const bytes = await pinned.handle.readFile(); totalBytes += bytes.length;
      if (totalBytes > MAX_SNAPSHOT_BYTES) { bytes.fill(0); throw new Error('expected-terminal snapshot size limit exceeded'); }
      if (sha256(bytes) !== manifest.payloadDigests[relative]) { bytes.fill(0); throw new Error(`expected-terminal payload digest mismatch: ${relative}`); }
      payloadMap.set(relative, bytes);
    }
    const { validateExpectedTerminalPublicationSemantics } = await import('./build-expected-terminal.mjs');
    validateExpectedTerminalPublicationSemantics({ payloads: payloadMap, manifestBytes, ledgerBytes }, captureLedgerBytes);
    const [baselineAfter, ledgerParentAfter, captureLedgerParentAfter, ledgerAfter, manifestAfter, captureLedgerAfter, ...payloadAfter] = await Promise.all([
      lstat(baselinePath, { bigint: true }), lstat(ledgerParentPath, { bigint: true }), lstat(captureLedgerParentPath, { bigint: true }),
      lstat(ledgerFilePath, { bigint: true }), lstat(path.join(baselinePath, EXPECTED_TERMINAL_MANIFEST_NAME), { bigint: true }), lstat(captureLedgerFilePath, { bigint: true }),
      ...payloadPinned.map((pinned) => lstat(pinned.path, { bigint: true })),
    ]);
    if (!sameIdentity(baselineStat, baselineAfter) || !sameIdentity(ledgerParentStat, ledgerParentAfter)
      || !sameIdentity(captureLedgerParentStat, captureLedgerParentAfter) || !sameIdentity(ledgerPinned.fdStat, ledgerAfter)
      || !sameIdentity(manifestPinned.fdStat, manifestAfter) || !sameIdentity(captureLedgerPinned.fdStat, captureLedgerAfter)
      || payloadPinned.some((pinned, index) => !sameIdentity(pinned.fdStat, payloadAfter[index]))) throw new Error('expected-terminal transaction path identity changed during verification');
    await assertAbsent(journalPath, 'expected-terminal publication journal');
    let disposed = false;
    return Object.freeze({
      transactionId: manifest.transactionId,
      manifest: Object.freeze(structuredClone(manifest)), ledger: Object.freeze(structuredClone(ledger)), payloads: readOnlyPayloadView(payloadMap),
      dispose() {
        if (disposed) return; disposed = true;
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
    for (const bytes of [ledgerBytes, manifestBytes, captureLedgerBytes]) bytes?.fill(0);
    const closeResults = await Promise.allSettled([
      ...payloadPinned.map((pinned) => pinned.handle.close()), manifestPinned?.handle.close(), ledgerPinned?.handle.close(), captureLedgerPinned?.handle.close(),
      captureLedgerParentHandle?.close(), ledgerParentHandle?.close(), baselineHandle?.close(),
    ].filter(Boolean));
    const closeErrors = closeResults.filter((entry) => entry.status === 'rejected').map((entry) => entry.reason);
    if (closeErrors.length) {
      for (const bytes of payloadMap.values()) bytes.fill(0);
      payloadMap.clear();
      throw new AggregateError(primaryError ? [primaryError, ...closeErrors] : closeErrors, 'expected-terminal verification close failed');
    }
  }
}
