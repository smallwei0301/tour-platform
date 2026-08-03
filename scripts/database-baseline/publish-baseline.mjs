#!/usr/bin/env node
import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomBytes as cryptoRandomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { chmod, lstat, mkdtemp, open, readFile, readdir, rename, rm, rmdir, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { inspectCandidateHandoff, validateOwnershipBoundary } from './validate-ownership-boundary.mjs';
import { createLockedRenderAdapter, loadCaptureToolchain } from './capture-production-catalog.mjs';
import { renderArchivePair } from './render-baseline-from-archive.mjs';
import { composeCapturePublicationPayloads } from './prepare-capture-publication.mjs';
import { verifyLockedPg17Runtime, verifyRenameNoReplaceRuntime } from './verify-toolchain-lock.mjs';
import {
  CAPTURE_PAYLOAD_PATHS,
  validateCapturePayloadSemantics,
  validateCaptureLedger,
  validateCaptureManifest,
  verifyCaptureTransaction,
} from './verify-manifest.mjs';

const MANIFEST_NAME = 'capture-manifest.json';
const CANDIDATE_MANIFEST_NAME = 'capture-manifest.candidate.json';
const LEDGER_NAME = 'baseline-ledger.json';
const SHA256 = /^[0-9a-f]{64}$/u;
const REPOSITORY_LOCK_CONTEXTS = new WeakMap();
let renameRuntimeVerification = null;
export const SIMULATED_PROCESS_CRASH = Symbol('SIMULATED_PROCESS_CRASH');

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const canonical = (value) => Buffer.from(`${JSON.stringify(value)}\n`);

function parseCanonical(bytes, label, maxBytes = 2 * 1024 * 1024) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > maxBytes || bytes.includes(0) || bytes.includes(13)) {
    throw new Error(`${label} bytes invalid`);
  }
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (!text.endsWith('\n')) throw new Error(`${label} framing invalid`);
  const value = JSON.parse(text);
  if (`${JSON.stringify(value)}\n` !== text) throw new Error(`${label} must be canonical JSON`);
  return value;
}

const identity = (stat) => Object.freeze({ dev: String(stat.dev), ino: String(stat.ino) });
const sameIdentity = (stat, expected) => String(stat.dev) === expected?.dev && String(stat.ino) === expected?.ino;

async function statMaybe(filePath) {
  try { return await lstat(filePath, { bigint: true }); } catch (error) { if (error?.code === 'ENOENT') return null; throw error; }
}

function assertOwnedRegular(stat, label) {
  if (!stat?.isFile() || stat.uid !== BigInt(process.geteuid()) || stat.nlink !== 1n) throw new Error(`${label} identity invalid`);
  const mode = Number(stat.mode & 0o7777n);
  if (![0o600, 0o644].includes(mode)) throw new Error(`${label} mode invalid`);
}

async function syncDirectory(handle) {
  await handle.sync();
}

async function writeExclusive(parent, name, bytes) {
  const fdPath = `/proc/self/fd/${parent.handle.fd}/${name}`;
  const handle = await open(fdPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
    const stat = await handle.stat({ bigint: true });
    assertOwnedRegular(stat, name);
    await syncDirectory(parent.handle);
    return identity(stat);
  } finally {
    await handle.close();
  }
}

async function readPinned(parent, name, label, maxBytes = 64 * 1024 * 1024) {
  const fdPath = `/proc/self/fd/${parent.handle.fd}/${name}`;
  const handle = await open(fdPath, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const fdStat = await handle.stat({ bigint: true });
    const pathStat = await lstat(path.join(parent.path, name), { bigint: true });
    assertOwnedRegular(fdStat, label);
    if (!sameIdentity(pathStat, identity(fdStat)) || fdStat.size > BigInt(maxBytes)) throw new Error(`${label} identity or size invalid`);
    const bytes = await handle.readFile();
    const after = await lstat(path.join(parent.path, name), { bigint: true });
    if (!sameIdentity(after, identity(fdStat))) {
      bytes.fill(0);
      throw new Error(`${label} changed during read`);
    }
    return { bytes, identity: identity(fdStat) };
  } finally {
    await handle.close();
  }
}

async function openDirectory(directory, label) {
  const resolved = path.resolve(directory);
  const handle = await open(resolved, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  const fdStat = await handle.stat({ bigint: true });
  const pathStat = await lstat(resolved, { bigint: true });
  if (!fdStat.isDirectory() || fdStat.uid !== BigInt(process.geteuid()) || !sameIdentity(pathStat, identity(fdStat))) {
    await handle.close();
    throw new Error(`${label} directory identity invalid`);
  }
  return {
    path: resolved, handle, identity: identity(fdStat),
    uid: Number(fdStat.uid), mode: Number(fdStat.mode & 0o7777n),
  };
}

async function recheckDirectory(parent, label) {
  const pathStat = await lstat(parent.path, { bigint: true });
  if (!sameIdentity(pathStat, parent.identity)) throw new Error(`${label} directory replaced`);
}

async function renameNoReplace(parent, sourceName, destinationName) {
  renameRuntimeVerification ??= verifyRenameNoReplaceRuntime();
  await renameRuntimeVerification;
  if (process.platform !== 'linux' || process.arch !== 'x64') throw new Error('rename noreplace runtime unsupported');
  for (const [label, name] of [['source', sourceName], ['destination', destinationName]]) {
    if (typeof name !== 'string' || name.length === 0 || name.includes('/') || name.includes('\0') || name === '.' || name === '..') {
      throw new Error(`rename noreplace ${label} invalid`);
    }
  }
  const source = `/proc/self/fd/3/${sourceName}`;
  const destination = `/proc/self/fd/3/${destinationName}`;
  try {
    execFileSync('/usr/bin/perl', [
      '-e',
      'use strict; use warnings; @ARGV == 2 or die "argv invalid\\n"; syscall(316, -100, $ARGV[0], -100, $ARGV[1], 1) == 0 or die "rename_noreplace: $!\\n";',
      source,
      destination,
    ], {
      env: { LANG: 'C', LC_ALL: 'C' },
      stdio: ['ignore', 'ignore', 'pipe', parent.handle.fd],
      timeout: 5_000,
      maxBuffer: 4_096,
    });
  } catch (error) {
    throw new Error(`atomic rename noreplace failed: ${sourceName} -> ${destinationName}`, { cause: error });
  }
}

async function removeOwned(parent, name, expectedIdentity) {
  if (!expectedIdentity) return;
  const filePath = path.join(parent.path, name);
  const stat = await statMaybe(filePath);
  if (!stat) return;
  if (!sameIdentity(stat, expectedIdentity)) throw new Error(`foreign replacement HOLD: ${name}`);
  await unlink(`/proc/self/fd/${parent.handle.fd}/${name}`);
  await syncDirectory(parent.handle);
}

const JOURNAL_HEADER_BYTES = 74;
const JOURNAL_MAX_BYTES = 16 * 1024 * 1024;

function journalFrame(journal) {
  const body = canonical(journal);
  if (body.length > 2 * 1024 * 1024) throw new Error('publication journal record too large');
  const header = Buffer.from(`${body.length.toString(16).padStart(8, '0')} ${sha256(body)}\n`, 'ascii');
  if (header.length !== JOURNAL_HEADER_BYTES) throw new Error('publication journal frame header invalid');
  return { body, frame: Buffer.concat([header, body]) };
}

function parseJournalLog(bytes, label = 'publication journal') {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > JOURNAL_MAX_BYTES || bytes.includes(0) || bytes.includes(13)) {
    throw new Error(`${label} bytes invalid`);
  }
  let offset = 0;
  let latest = null;
  while (offset < bytes.length) {
    const remaining = bytes.length - offset;
    if (remaining < JOURNAL_HEADER_BYTES) break;
    const header = bytes.subarray(offset, offset + JOURNAL_HEADER_BYTES).toString('ascii');
    const match = /^([0-9a-f]{8}) ([0-9a-f]{64})\n$/u.exec(header);
    if (!match) throw new Error(`${label} frame header invalid`);
    const length = Number.parseInt(match[1], 16);
    if (length < 2 || length > 2 * 1024 * 1024) throw new Error(`${label} frame length invalid`);
    const bodyStart = offset + JOURNAL_HEADER_BYTES;
    const bodyEnd = bodyStart + length;
    if (bodyEnd > bytes.length) break;
    const body = bytes.subarray(bodyStart, bodyEnd);
    if (sha256(body) !== match[2]) throw new Error(`${label} frame digest invalid`);
    latest = parseCanonical(body, `${label} record`);
    offset = bodyEnd;
  }
  if (!latest) throw new Error(`${label} has no complete record`);
  return latest;
}

async function persistJournal(journalParent, journalName, journal, expectedIdentity = null, fault = () => {}) {
  const journalPath = path.join(journalParent.path, journalName);
  const { body, frame } = journalFrame(journal);
  let handle;
  try {
    if (expectedIdentity === null) {
      handle = await open(`/proc/self/fd/${journalParent.handle.fd}/${journalName}`,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW | constants.O_APPEND, 0o600);
    } else {
      const currentBefore = await lstat(journalPath, { bigint: true });
      if (!sameIdentity(currentBefore, expectedIdentity)) throw new Error('foreign journal replacement HOLD');
      handle = await open(`/proc/self/fd/${journalParent.handle.fd}/${journalName}`,
        constants.O_WRONLY | constants.O_NOFOLLOW | constants.O_APPEND);
    }
    const opened = await handle.stat({ bigint: true });
    assertOwnedRegular(opened, 'publication journal');
    if (expectedIdentity !== null && !sameIdentity(opened, expectedIdentity)) throw new Error('foreign journal replacement HOLD');
    if (Number(opened.size) + frame.length > JOURNAL_MAX_BYTES) throw new Error('publication journal log too large');
    const currentAfterOpen = await lstat(journalPath, { bigint: true });
    if (!sameIdentity(currentAfterOpen, identity(opened))) throw new Error('foreign journal replacement HOLD');
    await fault('before-journal-append');
    await handle.writeFile(frame);
    await fault('after-journal-append-before-sync');
    await handle.sync();
    await fault('after-journal-record-sync');
    const currentAfterSync = await lstat(journalPath, { bigint: true });
    if (!sameIdentity(currentAfterSync, identity(opened))) throw new Error('foreign journal replacement HOLD');
    if (expectedIdentity === null) await syncDirectory(journalParent.handle);
    return identity(opened);
  } finally {
    body.fill(0);
    frame.fill(0);
    await handle?.close();
  }
}

function targetRecord(parentKey, name, bytes, transactionId) {
  return {
    parentKey,
    name,
    targetPath: null,
    tempName: `${name}.midao-temp-${transactionId}`,
    backupName: `${name}.midao-backup-${transactionId}`,
    existed: false,
    originalIdentity: null,
    backupIdentity: null,
    tempIdentity: null,
    promotedIdentity: null,
    promoted: false,
    bytes,
  };
}

function serializableJournal(journal) {
  return {
    schemaVersion: 1,
    transactionId: journal.transactionId,
    state: journal.state,
    payloadDigests: journal.payloadDigests,
    captureManifestSha256: journal.captureManifestSha256,
    targets: journal.targets.map(({ bytes, ...entry }) => entry),
  };
}

async function rollback(journal, parents, fault = () => {}) {
  const errors = [];
  for (const entry of [...journal.targets].reverse()) {
    const parent = parents[entry.parentKey];
    try {
      let current = await statMaybe(path.join(parent.path, entry.name));
      if (entry.promoted && current && sameIdentity(current, entry.promotedIdentity)) {
        if (await statMaybe(path.join(parent.path, entry.tempName))) throw new Error(`rollback temp occupied HOLD: ${entry.name}`);
        await renameNoReplace(parent, entry.name, entry.tempName);
        await syncDirectory(parent.handle);
        const detached = await lstat(path.join(parent.path, entry.tempName), { bigint: true });
        if (!sameIdentity(detached, entry.promotedIdentity)) {
          try {
            if (!await statMaybe(path.join(parent.path, entry.name))) {
              await renameNoReplace(parent, entry.tempName, entry.name);
              await syncDirectory(parent.handle);
            }
          } catch { /* Preserve both pathnames and the primary HOLD reason. */ }
          throw new Error(`rollback promoted detach identity mismatch HOLD: ${entry.name}`);
        }
        current = null;
      } else if (entry.promoted && current && entry.existed && sameIdentity(current, entry.backupIdentity)) {
        // A prior rollback already restored the original detached inode.
      } else if (entry.promoted && current) {
        throw new Error(`foreign replacement HOLD: ${entry.name}`);
      }

      if (entry.existed && !entry.backupIdentity) {
        current = await statMaybe(path.join(parent.path, entry.name));
        if (!current || !sameIdentity(current, entry.originalIdentity)) {
          throw new Error(`original target unavailable without detached backup HOLD: ${entry.name}`);
        }
      } else if (entry.existed && entry.backupIdentity) {
        current = await statMaybe(path.join(parent.path, entry.name));
        if (current) {
          if (!sameIdentity(current, entry.backupIdentity)) throw new Error(`foreign replacement HOLD: ${entry.name}`);
        } else {
          const backup = await statMaybe(path.join(parent.path, entry.backupName));
          if (!backup || !sameIdentity(backup, entry.backupIdentity)) throw new Error(`rollback backup identity mismatch: ${entry.name}`);
          await renameNoReplace(parent, entry.backupName, entry.name);
          await syncDirectory(parent.handle);
          const restored = await lstat(path.join(parent.path, entry.name), { bigint: true });
          if (!sameIdentity(restored, entry.backupIdentity)) throw new Error(`rollback restore identity mismatch HOLD: ${entry.name}`);
        }
      } else if (!entry.existed && current) {
        throw new Error(`foreign replacement HOLD: ${entry.name}`);
      }
      await removeOwned(parent, entry.tempName, entry.tempIdentity);
      await removeOwned(parent, entry.backupName, entry.backupIdentity);
      await fault(`after-rollback:${entry.name}`);
    } catch (error) {
      if (error?.[SIMULATED_PROCESS_CRASH] === true) throw error;
      errors.push(error);
    }
  }
  if (errors.length) throw new AggregateError(errors, 'publication rollback failed');
}

async function cleanupCommitted(journal, parents) {
  for (const entry of journal.targets) {
    const parent = parents[entry.parentKey];
    await removeOwned(parent, entry.tempName, entry.tempIdentity);
    await removeOwned(parent, entry.backupName, entry.backupIdentity);
  }
}

export function parsePublishCli(args) {
  const usage = 'Usage: publish-baseline.mjs --candidate-handoff .hermes/tmp/baseline-capture-handoff.json --output supabase/baselines/v1 --ledger docs/operations/baseline-ledger.json';
  if (!Array.isArray(args) || args.length !== 6
    || args[0] !== '--candidate-handoff' || args[1] !== '.hermes/tmp/baseline-capture-handoff.json'
    || args[2] !== '--output' || args[3] !== 'supabase/baselines/v1'
    || args[4] !== '--ledger' || args[5] !== 'docs/operations/baseline-ledger.json') throw new Error(usage);
  return {
    handoffPath: args[1], outputDir: args[3], ledgerPath: args[5],
  };
}

function validatePaths(input) {
  for (const key of ['candidateDir', 'baselineDir', 'ledgerPath', 'journalPath', 'lockPath']) {
    if (typeof input[key] !== 'string' || !path.isAbsolute(input[key]) || input[key].includes('\0')) throw new Error(`publication ${key} invalid`);
  }
  if (path.basename(input.ledgerPath) !== LEDGER_NAME) throw new Error(`publication ledger basename must be ${LEDGER_NAME}`);
  if (path.dirname(input.journalPath) !== path.dirname(input.lockPath)) throw new Error('publication lock and journal namespace mismatch');
}

function exactObjectKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) {
    throw new Error(`${label} shape invalid`);
  }
}

function validateIdentityRecord(value, nullable, label) {
  if (nullable && value === null) return null;
  exactObjectKeys(value, ['dev', 'ino'], label);
  if (!/^(?:0|[1-9][0-9]*)$/u.test(value.dev) || !/^(?:0|[1-9][0-9]*)$/u.test(value.ino)) {
    throw new Error(`${label} invalid`);
  }
  return value;
}

async function acquirePublicationLock(stateParent) {
  let child;
  try {
    const before = await stateParent.handle.stat({ bigint: true });
    if (!before.isDirectory() || !sameIdentity(before, stateParent.identity)) {
      throw new Error('repository publication state directory identity mismatch');
    }
    child = spawn('/usr/bin/flock', [
      '--exclusive', '--nonblock', '/proc/self/fd/3', '/bin/sh', '-c', 'printf "LOCKED\\n"; cat >/dev/null',
    ], { stdio: ['pipe', 'pipe', 'pipe', stateParent.handle.fd] });
    const closed = new Promise((resolve) => child.once('close', resolve));
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    await new Promise((resolve, reject) => {
      let stdout = '';
      const fail = (error) => reject(error);
      child.once('error', fail);
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        stdout += chunk;
        if (stdout.includes('LOCKED\n')) {
          child.removeListener('error', fail);
          resolve();
        }
      });
      child.once('exit', (code) => {
        if (!stdout.includes('LOCKED\n')) reject(new Error(code === 1
          ? 'publication lock is active'
          : `publication flock failed (${code}): ${stderr.trim()}`));
      });
    });
    const after = await stateParent.handle.stat({ bigint: true });
    if (!sameIdentity(after, stateParent.identity)) throw new Error('repository publication state directory identity mismatch');
    return { child, closed, identity: stateParent.identity };
  } catch (error) {
    child?.stdin?.end();
    if (child && child.exitCode === null) await new Promise((resolve) => child.once('close', resolve)).catch(() => {});
    throw error;
  }
}

async function releasePublicationLock(acquired) {
  if (!acquired?.child || !(acquired.closed instanceof Promise)) return;
  acquired.child.stdin.end();
  const code = await acquired.closed;
  if (code !== 0) throw new Error(`publication flock release failed (${code})`);
}

function validateRecoveryJournal(value, input) {
  exactObjectKeys(value, ['schemaVersion', 'transactionId', 'state', 'payloadDigests', 'captureManifestSha256', 'targets'], 'publication journal');
  if (value.schemaVersion !== 1 || !SHA256.test(value.transactionId)
    || !['PREPARED', 'PROMOTING', 'COMMITTED', 'CLEANED'].includes(value.state) || !Array.isArray(value.targets)) {
    throw new Error('publication journal header invalid');
  }
  validateCaptureLedger({
    schemaVersion: 1, kind: 'midao-baseline-capture-ledger', transactionId: value.transactionId,
    captureManifestSha256: value.captureManifestSha256, payloadDigests: value.payloadDigests,
  });
  const expectedNames = [...CAPTURE_PAYLOAD_PATHS, MANIFEST_NAME, LEDGER_NAME];
  if (value.targets.length !== expectedNames.length) throw new Error('publication journal target count invalid');
  value.targets.forEach((entry, index) => {
    exactObjectKeys(entry, [
      'parentKey', 'name', 'targetPath', 'tempName', 'backupName', 'existed', 'originalIdentity',
      'backupIdentity', 'tempIdentity', 'promotedIdentity', 'promoted',
    ], `journal target ${index}`);
    const name = expectedNames[index];
    const parentKey = index === expectedNames.length - 1 ? 'ledger' : 'baseline';
    const parentPath = parentKey === 'baseline' ? path.resolve(input.baselineDir) : path.dirname(path.resolve(input.ledgerPath));
    if (entry.parentKey !== parentKey || entry.name !== name || entry.targetPath !== path.join(parentPath, name)
      || entry.tempName !== `${name}.midao-temp-${value.transactionId}`
      || entry.backupName !== `${name}.midao-backup-${value.transactionId}`
      || typeof entry.existed !== 'boolean' || typeof entry.promoted !== 'boolean') {
      throw new Error(`journal target ${index} contract invalid`);
    }
    validateIdentityRecord(entry.originalIdentity, true, `journal original ${index}`);
    validateIdentityRecord(entry.backupIdentity, true, `journal backup ${index}`);
    validateIdentityRecord(entry.tempIdentity, true, `journal temp ${index}`);
    validateIdentityRecord(entry.promotedIdentity, true, `journal promoted ${index}`);
    if (entry.existed !== (entry.originalIdentity !== null) || (entry.promoted && entry.promotedIdentity === null)) {
      throw new Error(`journal target ${index} state invalid`);
    }
  });
  return value;
}

function expectedTargetDigest(journal, entry) {
  if (Object.hasOwn(journal.payloadDigests, entry.name)) return journal.payloadDigests[entry.name];
  if (entry.name === MANIFEST_NAME) return journal.captureManifestSha256;
  if (entry.name === LEDGER_NAME) {
    return sha256(canonical(validateCaptureLedger({
      schemaVersion: 1, kind: 'midao-baseline-capture-ledger', transactionId: journal.transactionId,
      captureManifestSha256: journal.captureManifestSha256, payloadDigests: journal.payloadDigests,
    })));
  }
  throw new Error(`journal target digest unavailable: ${entry.name}`);
}

async function adoptJournaledArtifacts(journal, parents) {
  let changed = false;
  for (const entry of journal.targets) {
    const parent = parents[entry.parentKey];
    if (!entry.tempIdentity) {
      const temp = await statMaybe(path.join(parent.path, entry.tempName));
      if (temp) {
        assertOwnedRegular(temp, `recovery planned temp ${entry.name}`);
        const pinned = await readPinned(parent, entry.tempName, `recovery planned temp ${entry.name}`);
        try {
          if (sha256(pinned.bytes) !== expectedTargetDigest(journal, entry)) {
            throw new Error(`recovery planned temp content mismatch HOLD: ${entry.name}`);
          }
          entry.tempIdentity = pinned.identity;
          changed = true;
        } finally { pinned.bytes.fill(0); }
      }
    }
    if (entry.existed && !entry.backupIdentity) {
      const backup = await statMaybe(path.join(parent.path, entry.backupName));
      if (backup) {
        assertOwnedRegular(backup, `recovery planned backup ${entry.name}`);
        const current = await statMaybe(path.join(parent.path, entry.name));
        if (!current) {
          if (!sameIdentity(backup, entry.originalIdentity)) {
            throw new Error(`recovery detached backup identity mismatch HOLD: ${entry.name}`);
          }
          entry.backupIdentity = identity(backup);
          changed = true;
        } else {
          if (!sameIdentity(current, entry.originalIdentity)) {
            throw new Error(`recovery planned backup original identity mismatch HOLD: ${entry.name}`);
          }
          const [backupPinned, originalPinned] = await Promise.all([
            readPinned(parent, entry.backupName, `recovery planned backup ${entry.name}`),
            readPinned(parent, entry.name, `recovery original ${entry.name}`),
          ]);
          try {
            if (!backupPinned.bytes.equals(originalPinned.bytes)) {
              throw new Error(`recovery planned backup content mismatch HOLD: ${entry.name}`);
            }
            entry.backupIdentity = backupPinned.identity;
            changed = true;
          } finally { backupPinned.bytes.fill(0); originalPinned.bytes.fill(0); }
        }
      }
    }
  }
  return changed;
}

async function inferInterruptedRenames(journal, parents) {
  let changed = false;
  for (const entry of journal.targets) {
    if (entry.promoted || !entry.tempIdentity) continue;
    const parent = parents[entry.parentKey];
    const [target, temp] = await Promise.all([
      statMaybe(path.join(parent.path, entry.name)), statMaybe(path.join(parent.path, entry.tempName)),
    ]);
    if (target && !temp) {
      if (!sameIdentity(target, entry.tempIdentity)) throw new Error(`ambiguous promoted identity mismatch HOLD: ${entry.name}`);
      entry.promoted = true;
      entry.promotedIdentity = entry.tempIdentity;
      changed = true;
    }
  }
  return changed;
}

async function readJournaledPromotedTarget(journal, parents, name, label) {
  const entry = journal.targets.find((candidate) => candidate.name === name);
  if (!entry || !entry.promoted || !entry.promotedIdentity) throw new Error(`${label} journaled promotion missing`);
  const pinned = await readPinned(parents[entry.parentKey], name, label);
  if (pinned.identity.dev !== entry.promotedIdentity.dev || pinned.identity.ino !== entry.promotedIdentity.ino) {
    pinned.bytes.fill(0);
    throw new Error(`${label} promoted identity mismatch HOLD`);
  }
  return pinned;
}

async function diskHasExactCommitMarker(journal, parents) {
  const owned = [];
  const payloads = new Map();
  try {
    const ledger = await readJournaledPromotedTarget(journal, parents, LEDGER_NAME, 'recovery ledger');
    const manifest = await readJournaledPromotedTarget(journal, parents, MANIFEST_NAME, 'recovery manifest');
    owned.push(ledger.bytes, manifest.bytes);
    const ledgerValue = validateCaptureLedger(parseCanonical(ledger.bytes, 'recovery ledger'));
    const manifestValue = validateCaptureManifest(parseCanonical(manifest.bytes, 'recovery manifest'));
    const metadataMatches = ledgerValue.transactionId === journal.transactionId
      && ledgerValue.captureManifestSha256 === journal.captureManifestSha256
      && sha256(manifest.bytes) === journal.captureManifestSha256
      && manifestValue.transactionId === journal.transactionId
      && JSON.stringify(ledgerValue.payloadDigests) === JSON.stringify(journal.payloadDigests)
      && JSON.stringify(manifestValue.payloadDigests) === JSON.stringify(journal.payloadDigests);
    if (!metadataMatches) return false;
    for (const name of CAPTURE_PAYLOAD_PATHS) {
      const pinned = await readJournaledPromotedTarget(journal, parents, name, `recovery payload ${name}`);
      owned.push(pinned.bytes);
      if (sha256(pinned.bytes) !== journal.payloadDigests[name]) return false;
      payloads.set(name, pinned.bytes);
    }
    validateCapturePayloadSemantics(payloads, manifestValue);
    return true;
  } catch {
    return false;
  } finally {
    for (const bytes of owned) bytes.fill(0);
    payloads.clear();
  }
}

async function recoverCapturePublication(input, repositoryLockScope) {
  for (const key of ['baselineDir', 'ledgerPath', 'journalPath', 'lockPath']) {
    if (typeof input[key] !== 'string' || !path.isAbsolute(input[key]) || input[key].includes('\0')) {
      throw new Error(`recovery ${key} invalid`);
    }
  }
  if (path.basename(input.ledgerPath) !== LEDGER_NAME) throw new Error(`recovery ledger basename must be ${LEDGER_NAME}`);
  if (path.dirname(input.journalPath) !== path.dirname(input.lockPath)) throw new Error('recovery namespace mismatch');
  const repositoryLock = REPOSITORY_LOCK_CONTEXTS.get(repositoryLockScope);
  if (!repositoryLock) throw new Error('repository recovery lock capability invalid');
  const fault = typeof input.fault === 'function' ? input.fault : () => {};
  if (input.journalPath !== repositoryLockScope.journalPath || input.lockPath !== repositoryLockScope.lockPath) {
    throw new Error('repository recovery namespace mismatch');
  }
  let stateParent;
  let baseline;
  let ledgerParent;
  let recoveryLock;
  let journalIdentity;
  let primaryError;
  try {
    stateParent = repositoryLock.stateParent;
    recoveryLock = repositoryLock.acquired;
    const journalPinned = await readPinned(stateParent, path.basename(input.journalPath), 'publication journal', JOURNAL_MAX_BYTES);
    journalIdentity = journalPinned.identity;
    if (journalPinned.bytes.length === 0) {
      try {
        const current = await lstat(input.journalPath, { bigint: true });
        if (!sameIdentity(current, journalIdentity)) throw new Error('foreign empty journal replacement HOLD');
        await unlink(`/proc/self/fd/${stateParent.handle.fd}/${path.basename(input.journalPath)}`);
        await syncDirectory(stateParent.handle);
        return null;
      } finally {
        journalPinned.bytes.fill(0);
      }
    }
    let journal;
    try {
      journal = validateRecoveryJournal(parseJournalLog(journalPinned.bytes), input);
    } finally {
      journalPinned.bytes.fill(0);
    }
    journal.journalIdentity = journalIdentity;
    baseline = await openDirectory(input.baselineDir, 'recovery baseline');
    ledgerParent = await openDirectory(path.dirname(input.ledgerPath), 'recovery ledger');
    const parents = { baseline, ledger: ledgerParent };
    const adopted = await adoptJournaledArtifacts(journal, parents);
    const inferred = await inferInterruptedRenames(journal, parents);
    if (adopted || inferred) {
      journal.journalIdentity = await persistJournal(
        stateParent, path.basename(input.journalPath), serializableJournal(journal), journal.journalIdentity, fault,
      );
      journalIdentity = journal.journalIdentity;
    }
    if (await diskHasExactCommitMarker(journal, parents)) {
      await cleanupCommitted(journal, parents);
    } else {
      await rollback(journal, parents, fault);
    }
    const journalBeforeClean = await lstat(input.journalPath, { bigint: true });
    if (!sameIdentity(journalBeforeClean, journalIdentity)) throw new Error('foreign journal replacement HOLD');
    journal.state = 'CLEANED';
    journal.journalIdentity = await persistJournal(
      stateParent, path.basename(input.journalPath), serializableJournal(journal), journalIdentity, fault,
    );
    const currentJournal = await lstat(input.journalPath, { bigint: true });
    if (!sameIdentity(currentJournal, journal.journalIdentity)) throw new Error('foreign journal replacement HOLD');
    await unlink(`/proc/self/fd/${stateParent.handle.fd}/${path.basename(input.journalPath)}`);
    await syncDirectory(stateParent.handle);
    return Object.freeze({ transactionId: journal.transactionId, recovered: true });
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    const closeResults = await Promise.allSettled([
      baseline?.handle.close(), ledgerParent?.handle.close(),
    ].filter(Boolean));
    const closeErrors = closeResults.filter((entry) => entry.status === 'rejected').map((entry) => entry.reason);
    if (closeErrors.length) {
      throw new AggregateError(primaryError ? [primaryError, ...closeErrors] : closeErrors, 'publication recovery cleanup failed');
    }
  }
}

async function publishPreparedCaptureTransaction(input, repositoryLockScope) {
  validatePaths(input);
  const repositoryLock = repositoryLockScope === undefined ? null : REPOSITORY_LOCK_CONTEXTS.get(repositoryLockScope);
  if (repositoryLockScope !== undefined && !repositoryLock) throw new Error('repository publication lock capability invalid');
  const onOperation = typeof input.onOperation === 'function' ? input.onOperation : () => {};
  const fault = typeof input.fault === 'function' ? input.fault : () => {};
  const manifest = validateCaptureManifest(structuredClone(input.manifest));
  if (!SHA256.test(manifest.transactionId)) throw new Error('publication transaction invalid');
  if (input.expectedCandidateIdentity) {
    exactObjectKeys(input.expectedCandidateIdentity, ['dev', 'ino', 'uid', 'mode'], 'expected candidate identity');
    validateIdentityRecord({ dev: input.expectedCandidateIdentity.dev, ino: input.expectedCandidateIdentity.ino }, false, 'expected candidate identity');
    if (input.expectedCandidateIdentity.uid !== process.geteuid() || input.expectedCandidateIdentity.mode !== '0700') {
      throw new Error('expected candidate identity invalid');
    }
  }
  if (!repositoryLock && await statMaybe(input.journalPath)) {
    await recoverCapturePublication(input);
  } else if (repositoryLock && await statMaybe(input.journalPath)) {
    throw new Error('locked publication recovery required');
  }

  let candidate;
  let baseline;
  let ledgerParent;
  let stateParent;
  let lockLease;
  let journal;
  let primaryError;
  let rolledBack = false;
  const publicationBuffers = [];
  const cleanupErrors = [];
  try {
    candidate = await openDirectory(input.candidateDir, 'candidate');
    if (input.expectedCandidateIdentity
      && (candidate.identity.dev !== input.expectedCandidateIdentity.dev
        || candidate.identity.ino !== input.expectedCandidateIdentity.ino
        || candidate.uid !== input.expectedCandidateIdentity.uid
        || candidate.mode !== 0o700)) {
      throw new Error('candidate handoff identity mismatch');
    }
    baseline = await openDirectory(input.baselineDir, 'baseline');
    ledgerParent = await openDirectory(path.dirname(input.ledgerPath), 'ledger parent');
    stateParent = repositoryLock?.stateParent ?? await openDirectory(path.dirname(input.journalPath), 'state parent');
    const parents = { baseline, ledger: ledgerParent };

    const payloadBytes = new Map();
    for (const relative of CAPTURE_PAYLOAD_PATHS) {
      const source = await readPinned(candidate, relative, `candidate ${relative}`);
      if (sha256(source.bytes) !== manifest.payloadDigests[relative]) {
        source.bytes.fill(0);
        throw new Error(`candidate payload digest mismatch: ${relative}`);
      }
      payloadBytes.set(relative, source.bytes);
      publicationBuffers.push(source.bytes);
    }
    validateCapturePayloadSemantics(payloadBytes, manifest);
    const manifestBytes = canonical(manifest);
    publicationBuffers.push(manifestBytes);
    const ledger = validateCaptureLedger({
      schemaVersion: 1,
      kind: 'midao-baseline-capture-ledger',
      transactionId: manifest.transactionId,
      captureManifestSha256: sha256(manifestBytes),
      payloadDigests: manifest.payloadDigests,
    });
    const ledgerBytes = canonical(ledger);
    publicationBuffers.push(ledgerBytes);

    const acquiredLock = repositoryLock?.acquired ?? await acquirePublicationLock(stateParent);
    lockLease = repositoryLock ? null : acquiredLock;
    if (await statMaybe(input.journalPath)) throw new Error('unfinished publication journal requires recovery');

    const targets = [
      ...CAPTURE_PAYLOAD_PATHS.map((name) => targetRecord('baseline', name, payloadBytes.get(name), manifest.transactionId)),
      targetRecord('baseline', MANIFEST_NAME, manifestBytes, manifest.transactionId),
      targetRecord('ledger', path.basename(input.ledgerPath), ledgerBytes, manifest.transactionId),
    ];
    for (const entry of targets) {
      const parent = parents[entry.parentKey];
      entry.targetPath = path.join(parent.path, entry.name);
      const existing = await statMaybe(entry.targetPath);
      if (existing) {
        assertOwnedRegular(existing, `existing target ${entry.name}`);
        entry.existed = true;
        entry.originalIdentity = identity(existing);
      }
    }
    journal = {
      transactionId: manifest.transactionId,
      state: 'PREPARED',
      payloadDigests: manifest.payloadDigests,
      captureManifestSha256: ledger.captureManifestSha256,
      targets,
    };
    const journalName = path.basename(input.journalPath);
    journal.journalIdentity = await persistJournal(
      stateParent, journalName, serializableJournal(journal), null, fault,
    );

    for (const entry of targets) {
      const parent = parents[entry.parentKey];
      if (entry.existed) {
        await fault(`before-backup-detach:${entry.name}`);
        await renameNoReplace(parent, entry.name, entry.backupName);
        await syncDirectory(parent.handle);
        const backup = await lstat(path.join(parent.path, entry.backupName), { bigint: true });
        if (!sameIdentity(backup, entry.originalIdentity)) {
          try {
            if (!await statMaybe(entry.targetPath)) {
              await renameNoReplace(parent, entry.backupName, entry.name);
              await syncDirectory(parent.handle);
            }
          } catch { /* Preserve both pathnames and the primary HOLD reason. */ }
          throw new Error(`existing target changed during atomic detach HOLD: ${entry.name}`);
        }
        entry.backupIdentity = identity(backup);
        await fault(`after-backup-write:${entry.name}`);
      }
      entry.tempIdentity = await writeExclusive(parent, entry.tempName, entry.bytes);
      await fault(`after-temp-write:${entry.name}`);
      journal.journalIdentity = await persistJournal(
        stateParent, journalName, serializableJournal(journal), journal.journalIdentity, fault,
      );
    }

    journal.state = 'PROMOTING';
    journal.journalIdentity = await persistJournal(
        stateParent, journalName, serializableJournal(journal), journal.journalIdentity, fault,
      );
    for (const entry of targets) {
      const parent = parents[entry.parentKey];
      await recheckDirectory(parent, entry.parentKey);
      const current = await statMaybe(entry.targetPath);
      if (current !== null) throw new Error(`target occupied before promotion HOLD: ${entry.name}`);
      if (entry.existed) {
        const backup = await statMaybe(path.join(parent.path, entry.backupName));
        if (!backup || !sameIdentity(backup, entry.backupIdentity) || !sameIdentity(backup, entry.originalIdentity)) {
          throw new Error(`detached backup identity mismatch HOLD: ${entry.name}`);
        }
      }
      await fault(`before-rename:${entry.name}`);
      await fault(`before-promotion-atomic:${entry.name}`);
      await renameNoReplace(parent, entry.tempName, entry.name);
      await syncDirectory(parent.handle);
      await fault(`after-target-rename-before-identity-check:${entry.name}`);
      const promoted = await lstat(entry.targetPath, { bigint: true });
      if (!sameIdentity(promoted, entry.tempIdentity)) throw new Error(`promoted identity mismatch HOLD: ${entry.name}`);
      entry.promotedIdentity = entry.tempIdentity;
      entry.promoted = true;
      journal.journalIdentity = await persistJournal(
        stateParent, journalName, serializableJournal(journal), journal.journalIdentity, fault,
      );
      await onOperation(`rename:${entry.name}`);
      await fault(`after-rename:${entry.name}`);
    }

    await fault('before-commit-readback');
    for (const entry of targets) {
      const actual = await readJournaledPromotedTarget(journal, parents, entry.name, `published ${entry.name}`);
      if (sha256(actual.bytes) !== sha256(entry.bytes)) {
        actual.bytes.fill(0);
        throw new Error(`published read-back mismatch: ${entry.name}`);
      }
      actual.bytes.fill(0);
    }
    journal.state = 'COMMITTED';
    journal.journalIdentity = await persistJournal(
        stateParent, journalName, serializableJournal(journal), journal.journalIdentity, fault,
      );
    await fault('after-commit-journal');
    await cleanupCommitted(journal, parents);
    journal.state = 'CLEANED';
    journal.journalIdentity = await persistJournal(
        stateParent, journalName, serializableJournal(journal), journal.journalIdentity, fault,
      );
    const journalStat = await lstat(input.journalPath, { bigint: true });
    if (!journalStat.isFile() || !sameIdentity(journalStat, journal.journalIdentity)) {
      throw new Error('foreign journal replacement HOLD');
    }
    await unlink(`/proc/self/fd/${stateParent.handle.fd}/${journalName}`);
    await syncDirectory(stateParent.handle);
    for (const bytes of payloadBytes.values()) bytes.fill(0);
    manifestBytes.fill(0);
    ledgerBytes.fill(0);
    return Object.freeze({ transactionId: manifest.transactionId });
  } catch (error) {
    primaryError = error;
    if (error?.[SIMULATED_PROCESS_CRASH] === true) throw error;
    if (journal && baseline && ledgerParent) {
      try {
        await inferInterruptedRenames(journal, { baseline, ledger: ledgerParent });
        if (stateParent && journal.journalIdentity) {
          journal.journalIdentity = await persistJournal(
            stateParent, path.basename(input.journalPath), serializableJournal(journal), journal.journalIdentity, fault,
          );
        }
        await rollback(journal, { baseline, ledger: ledgerParent }, fault);
        if (stateParent && await statMaybe(input.journalPath)) {
          const journalStat = await lstat(input.journalPath, { bigint: true });
          if (!sameIdentity(journalStat, journal.journalIdentity)) throw new Error('foreign journal replacement HOLD');
          await unlink(`/proc/self/fd/${stateParent.handle.fd}/${path.basename(input.journalPath)}`);
          await syncDirectory(stateParent.handle);
        }
        rolledBack = true;
      } catch (rollbackError) {
        if (rollbackError?.[SIMULATED_PROCESS_CRASH] === true) {
          primaryError = rollbackError;
          throw rollbackError;
        }
        throw new AggregateError([error, rollbackError], 'publication and rollback failed');
      }
    }
    throw new Error(rolledBack ? 'publication failed and rolled back' : 'publication failed before transaction preparation', { cause: error });
  } finally {
    for (const bytes of publicationBuffers) bytes.fill(0);
    if (lockLease && !repositoryLock) {
      try { await releasePublicationLock(lockLease); }
      catch (error) { cleanupErrors.push(error); }
    }
    const closeResults = await Promise.allSettled([
      candidate?.handle.close(), baseline?.handle.close(), ledgerParent?.handle.close(),
      repositoryLock ? null : stateParent?.handle.close(),
    ].filter(Boolean));
    cleanupErrors.push(...closeResults.filter((entry) => entry.status === 'rejected').map((entry) => entry.reason));
    if (cleanupErrors.length) {
      throw new AggregateError(primaryError ? [primaryError, ...cleanupErrors] : cleanupErrors, 'publication cleanup failed');
    }
  }
}

export async function publishCaptureTransaction(input = {}) {
  exactObjectKeys(input, ['handoffPath', 'baselineDir', 'ledgerPath'], 'public publisher input');
  for (const key of ['handoffPath', 'baselineDir', 'ledgerPath']) {
    if (typeof input[key] !== 'string' || !path.isAbsolute(input[key]) || input[key].includes('\0')) {
      throw new Error(`public publisher ${key} invalid`);
    }
  }
  if (path.basename(input.ledgerPath) !== LEDGER_NAME) throw new Error(`public publisher ledger basename must be ${LEDGER_NAME}`);
  return withRepositoryPublicationLock(async (publicationPaths) => {
    if (await statMaybe(publicationPaths.journalPath)) {
      await recoverCapturePublication({
        baselineDir: input.baselineDir,
        ledgerPath: input.ledgerPath,
        journalPath: publicationPaths.journalPath,
        lockPath: publicationPaths.lockPath,
      }, publicationPaths);
    }
    const descriptor = await inspectCandidateHandoff(input.handoffPath);
    validateOwnershipBoundary(descriptor.input);
    let candidate;
    let adapter;
    let home;
    let rendered;
    let prepared;
    let verified;
    let result;
    let primaryError;
    const sources = [];
    const generated = [];
    const cleanupErrors = [];
    try {
      candidate = await openDirectory(descriptor.candidatePath, 'publication candidate');
      if (candidate.identity.dev !== descriptor.candidateIdentity.dev || candidate.identity.ino !== descriptor.candidateIdentity.ino
        || candidate.uid !== descriptor.candidateIdentity.uid || candidate.mode !== 0o700) {
        throw new Error('publication candidate identity mismatch');
      }
      const sourceNames = [
        'catalog-a.normalized.json', 'catalog-b.normalized.json', 'toc-a.txt', 'toc-b.txt',
      ];
      for (const name of sourceNames) sources.push(await readPinned(candidate, name, `candidate source ${name}`));
      if (!sources[0].bytes.equals(sources[1].bytes)) throw new Error('publication A/B normalized catalog mismatch');
      let sourceCatalog;
      try { sourceCatalog = JSON.parse(sources[0].bytes.toString('utf8')); }
      catch (error) { throw new Error('publication cutoff catalog JSON invalid', { cause: error }); }
      if (JSON.stringify(sourceCatalog) !== JSON.stringify(descriptor.input.catalog)) {
        throw new Error('reviewed ownership catalog does not match captured cutoff catalog');
      }

      const loadedToolchain = await loadCaptureToolchain();
      await verifyLockedPg17Runtime(loadedToolchain.lock);
      home = await mkdtemp(path.join(tmpdir(), 'midao-baseline-publish-home-'));
      await chmod(home, 0o700);
      adapter = await createLockedRenderAdapter({
        toolchain: loadedToolchain.trusted,
        archivePaths: [
          `/proc/self/fd/${candidate.handle.fd}/capture-a.dump`,
          `/proc/self/fd/${candidate.handle.fd}/capture-b.dump`,
        ],
        home,
      });
      rendered = await renderArchivePair({
        tocBuffers: [sources[2].bytes, sources[3].bytes],
        assignments: descriptor.input.ownershipBoundary.assignments,
        tocOwnershipMap: descriptor.input.tocOwnershipMap,
        randomBytes: cryptoRandomBytes,
        renderBatch: adapter.renderBatch,
      });
      prepared = composeCapturePublicationPayloads({
        catalogBuffers: [sources[0].bytes, sources[1].bytes],
        renderResult: rendered,
        reviewedOwnership: descriptor.input,
        randomBytes: cryptoRandomBytes,
      });
      validateCaptureManifest(structuredClone(prepared.manifest));
      validateCapturePayloadSemantics(prepared.payloads, prepared.manifest);
      for (const name of CAPTURE_PAYLOAD_PATHS) {
        generated.push({ name, identity: await writeExclusive(candidate, name, prepared.payloads.get(name)) });
      }
      result = await publishPreparedCaptureTransaction({
        candidateDir: descriptor.candidatePath,
        expectedCandidateIdentity: descriptor.candidateIdentity,
        baselineDir: input.baselineDir,
        ledgerPath: input.ledgerPath,
        journalPath: publicationPaths.journalPath,
        lockPath: publicationPaths.lockPath,
        manifest: prepared.manifest,
      }, publicationPaths);
      verified = await verifyCaptureTransaction({
        baselineDir: input.baselineDir,
        ledgerPath: input.ledgerPath,
        journalPath: publicationPaths.journalPath,
      });
      if (verified.transactionId !== result.transactionId) throw new Error('published transaction read-back mismatch');
    } catch (error) {
      primaryError = error;
    }
    verified?.dispose?.();
    if (adapter) await adapter.close().catch((error) => cleanupErrors.push(error));
    for (const bytes of [rendered?.baselineSql, rendered?.managedOverlaysSql, rendered?.useList, rendered?.tocNormalized]) bytes?.fill?.(0);
    prepared?.wipe?.();
    for (const source of sources) source.bytes.fill(0);
    if (candidate) {
      for (const entry of [...generated].reverse()) {
        await removeOwned(candidate, entry.name, entry.identity).catch((error) => cleanupErrors.push(error));
      }
      if (!primaryError && result && cleanupErrors.length === 0) {
        try {
          const names = await readdir(`/proc/self/fd/${candidate.handle.fd}`);
          for (const name of names) {
            if (path.basename(name) !== name || name === '.' || name === '..') throw new Error('candidate cleanup entry invalid');
            const stat = await lstat(`/proc/self/fd/${candidate.handle.fd}/${name}`, { bigint: true });
            if (!stat.isFile() || stat.uid !== BigInt(process.geteuid()) || stat.nlink !== 1n || Number(stat.mode & 0o7777n) !== 0o600) {
              throw new Error(`candidate cleanup foreign entry HOLD: ${name}`);
            }
            await unlink(`/proc/self/fd/${candidate.handle.fd}/${name}`);
          }
          await candidate.handle.sync();
        } catch (error) {
          cleanupErrors.push(error);
        }
      }
      await candidate.handle.close().catch((error) => cleanupErrors.push(error));
      if (!primaryError && result && cleanupErrors.length === 0) {
        let root;
        try {
          root = await openDirectory(descriptor.rootPath, 'candidate root cleanup');
          if (root.identity.dev !== descriptor.rootIdentity.dev || root.identity.ino !== descriptor.rootIdentity.ino) {
            throw new Error('candidate root cleanup identity mismatch');
          }
          const candidateStat = await lstat(descriptor.candidatePath, { bigint: true });
          if (!sameIdentity(candidateStat, { dev: descriptor.candidateIdentity.dev, ino: descriptor.candidateIdentity.ino })) {
            throw new Error('candidate cleanup foreign directory HOLD');
          }
          await rmdir(`/proc/self/fd/${root.handle.fd}/${path.basename(descriptor.candidatePath)}`);
          const handoffStat = await lstat(descriptor.handoffPath, { bigint: true });
          if (!sameIdentity(handoffStat, descriptor.handoffIdentity)) throw new Error('candidate handoff cleanup identity mismatch');
          await unlink(`/proc/self/fd/${root.handle.fd}/${path.basename(descriptor.handoffPath)}`);
          await root.handle.sync();
        } catch (error) {
          cleanupErrors.push(error);
        } finally {
          await root?.handle.close().catch((error) => cleanupErrors.push(error));
        }
      }
    }
    if (home) await rm(home, { recursive: true, force: true }).catch((error) => cleanupErrors.push(error));
    if (cleanupErrors.length) throw new AggregateError(primaryError ? [primaryError, ...cleanupErrors] : cleanupErrors, 'public publication cleanup failed');
    if (primaryError) throw primaryError;
    return result;
  });
}

async function loadCandidateManifest(candidatePath, expectedIdentity) {
  const candidate = await openDirectory(candidatePath, 'candidate manifest');
  try {
    if (candidate.identity.dev !== expectedIdentity.dev || candidate.identity.ino !== expectedIdentity.ino
      || candidate.uid !== expectedIdentity.uid || candidate.mode !== 0o700) {
      throw new Error('candidate manifest directory identity mismatch');
    }
    const pinned = await readPinned(candidate, CANDIDATE_MANIFEST_NAME, 'candidate manifest', 2 * 1024 * 1024);
    try {
      return validateCaptureManifest(parseCanonical(pinned.bytes, 'candidate manifest'));
    } finally {
      pinned.bytes.fill(0);
    }
  } finally {
    await candidate.handle.close();
  }
}

function gitCommonStatePath(name) {
  if (typeof name !== 'string' || !/^midao-baseline-publication\.(?:journal\.json|lock)$/u.test(name)) {
    throw new Error('git common publication name invalid');
  }
  const value = execFileSync('/usr/bin/git', ['rev-parse', '--git-common-dir'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { HOME: process.env.HOME ?? '/root', LANG: 'C', LC_ALL: 'C' },
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  if (!value || value.includes('\0')) throw new Error('git common publication path invalid');
  return path.join(path.resolve(value), name);
}

export function resolveRepositoryPublicationPaths() {
  return Object.freeze({
    journalPath: gitCommonStatePath('midao-baseline-publication.journal.json'),
    lockPath: gitCommonStatePath('midao-baseline-publication.lock'),
  });
}

async function withRepositoryPublicationLock(callback) {
  if (typeof callback !== 'function') throw new Error('repository publication callback invalid');
  const paths = resolveRepositoryPublicationPaths();
  let stateParent;
  let acquired;
  let result;
  let primaryError;
  const cleanupErrors = [];
  try {
    stateParent = await openDirectory(path.dirname(paths.lockPath), 'repository publication state');
    acquired = await acquirePublicationLock(stateParent);
    const scope = Object.freeze({ ...paths });
    REPOSITORY_LOCK_CONTEXTS.set(scope, { stateParent, acquired });
    try { result = await callback(scope); }
    finally { REPOSITORY_LOCK_CONTEXTS.delete(scope); }
  } catch (error) {
    primaryError = error;
  }
  if (acquired) {
    try { await releasePublicationLock(acquired); }
    catch (error) { cleanupErrors.push(error); }
  }
  if (stateParent && acquired) {
    try {
      const current = await lstat(path.dirname(paths.lockPath), { bigint: true });
      if (!current.isDirectory() || !sameIdentity(current, acquired.identity)) {
        throw new Error('foreign repository publication state directory replacement HOLD');
      }
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  if (stateParent) await stateParent.handle.close().catch((error) => cleanupErrors.push(error));
  if (cleanupErrors.length) throw new AggregateError(primaryError ? [primaryError, ...cleanupErrors] : cleanupErrors, 'repository publication lock cleanup failed');
  if (primaryError) throw primaryError;
  return result;
}

async function main() {
  const cli = parsePublishCli(process.argv.slice(2));
  const result = await publishCaptureTransaction({
    handoffPath: path.resolve(cli.handoffPath),
    baselineDir: path.resolve(cli.outputDir),
    ledgerPath: path.resolve(cli.ledgerPath),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
