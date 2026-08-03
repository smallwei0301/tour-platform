#!/usr/bin/env node
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateNormalizedCatalog } from './validate-normalized-catalog.mjs';

const TARGET_NAMES = Object.freeze([
  'catalog.expected-terminal.normalized.json',
  'catalog-expected-terminal.sha256',
  'manifest.json',
  'expected-terminal-ledger.json',
]);
const JOURNAL_NAME = 'midao-expected-terminal-publication.journal.json';
const LOCK_NAME = 'midao-baseline-publication.lock';
const HEADER_BYTES = 74;
const MAX_JOURNAL_BYTES = 16 * 1024 * 1024;
const MAX_TERMINAL_BYTES = 64 * 1024 * 1024;
const SHA256 = /^[0-9a-f]{64}$/u;
const LOCK_CAPABILITIES = new WeakMap();
export const SIMULATED_PROCESS_CRASH = Symbol('SIMULATED_PROCESS_CRASH');

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const canonical = (value) => Buffer.from(`${JSON.stringify(value)}\n`);
const stable = (value) => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
const stableCanonical = (value) => Buffer.from(`${JSON.stringify(stable(value))}\n`);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const inode = (stat) => Object.freeze({ dev: String(stat.dev), ino: String(stat.ino) });
const sameInode = (stat, expected) => String(stat?.dev) === expected?.dev && String(stat?.ino) === expected?.ino;

function exactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) {
    throw new Error(`${label} shape invalid`);
  }
}

async function statMaybe(target) {
  try { return await lstat(target, { bigint: true }); }
  catch (error) { if (error?.code === 'ENOENT') return null; throw error; }
}

function assertRegular(stat, label) {
  if (!stat?.isFile() || stat.uid !== BigInt(process.geteuid()) || stat.nlink !== 1n) throw new Error(`${label} identity invalid`);
  if (![0o600, 0o644].includes(Number(stat.mode & 0o7777n))) throw new Error(`${label} mode invalid`);
}

async function closeHandlePreserving(handle, primaryError, label) {
  if (!handle) return;
  try { await handle.close(); }
  catch (closeError) {
    if (primaryError) throw new AggregateError([primaryError, closeError], `${label} primary and close failed`);
    throw closeError;
  }
}

async function openDirectory(directory, label) {
  const resolved = path.resolve(directory);
  const handle = await open(resolved, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try {
    const opened = await handle.stat({ bigint: true });
    const named = await lstat(resolved, { bigint: true });
    if (!opened.isDirectory() || opened.uid !== BigInt(process.geteuid()) || (opened.mode & 0o022n) !== 0n
      || !sameInode(named, inode(opened))) {
      throw new Error(`${label} directory identity or mode invalid`);
    }
    return { path: resolved, handle, identity: inode(opened) };
  } catch (error) { await closeHandlePreserving(handle, error, `${label} directory`); throw error; }
}

async function recheckDirectory(parent, label) {
  if (!sameInode(await lstat(parent.path, { bigint: true }), parent.identity)) throw new Error(`${label} directory replaced HOLD`);
}

async function readPinned(parent, name, label, maxBytes = 64 * 1024 * 1024, allowedModes = [0o600, 0o644]) {
  const handle = await open(`/proc/self/fd/${parent.handle.fd}/${name}`, constants.O_RDONLY | constants.O_NOFOLLOW);
  let primary;
  try {
    const opened = await handle.stat({ bigint: true });
    const named = await lstat(path.join(parent.path, name), { bigint: true });
    assertRegular(opened, label);
    if (!allowedModes.includes(Number(opened.mode & 0o7777n))) throw new Error(`${label} mode invalid`);
    if (!sameInode(named, inode(opened)) || opened.size > BigInt(maxBytes)) throw new Error(`${label} identity or size invalid`);
    const bytes = await handle.readFile();
    if (!sameInode(await lstat(path.join(parent.path, name), { bigint: true }), inode(opened))) {
      bytes.fill(0); throw new Error(`${label} changed during read HOLD`);
    }
    return { bytes, identity: inode(opened) };
  } catch (error) { primary = error; throw error; }
  finally { await closeHandlePreserving(handle, primary, label); }
}

async function writeExclusive(parent, name, bytes) {
  await parent.handle.sync();
  const handle = await open(`/proc/self/fd/${parent.handle.fd}/${name}`,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  let primary;
  try {
    await handle.writeFile(bytes); await handle.sync();
    const stat = await handle.stat({ bigint: true }); assertRegular(stat, name);
    await parent.handle.sync();
    const pinned = await readPinned(parent, name, `temp ${name}`);
    try { if (!pinned.bytes.equals(bytes)) throw new Error(`temp read-back mismatch: ${name}`); }
    finally { pinned.bytes.fill(0); }
    return inode(stat);
  } catch (error) { primary = error; throw error; }
  finally { await closeHandlePreserving(handle, primary, `temp ${name}`); }
}

async function renameNoReplace(parent, sourceName, destinationName) {
  for (const name of [sourceName, destinationName]) {
    if (typeof name !== 'string' || !name || name.includes('/') || name.includes('\0') || name === '.' || name === '..') {
      throw new Error('rename noreplace name invalid');
    }
  }
  try {
    execFileSync('/usr/bin/perl', ['-e',
      'use strict; use warnings; @ARGV == 2 or die "argv invalid\\n"; syscall(316, -100, $ARGV[0], -100, $ARGV[1], 1) == 0 or die "rename_noreplace: $!\\n";',
      `/proc/self/fd/3/${sourceName}`, `/proc/self/fd/3/${destinationName}`], {
      stdio: ['ignore', 'ignore', 'pipe', parent.handle.fd], env: { LANG: 'C', LC_ALL: 'C' }, timeout: 5_000, maxBuffer: 4096,
    });
  } catch (error) { throw new Error(`atomic RENAME_NOREPLACE failed: ${sourceName} -> ${destinationName}`, { cause: error }); }
}

function verifyRenameNoReplaceRuntime() {
  if (process.platform !== 'linux' || process.arch !== 'x64') throw new Error('RENAME_RUNTIME_UNAVAILABLE');
  try {
    execFileSync('/usr/bin/perl', ['-e',
      'use strict; use warnings; my $source="/proc/self/fd/999999/midao-source"; my $target="/proc/self/fd/999999/midao-target"; syscall(316, -100, $source, -100, $target, 1); $!{ENOENT} or die "renameat2 runtime probe: $!\\n";'],
    { stdio: ['ignore', 'ignore', 'pipe'], env: { LANG: 'C', LC_ALL: 'C' }, timeout: 5_000, maxBuffer: 4096 });
  } catch (error) { throw new Error('RENAME_RUNTIME_UNAVAILABLE', { cause: error }); }
}

async function removeExpected(parent, name, expected) {
  if (!expected) return;
  const current = await statMaybe(path.join(parent.path, name));
  if (!current) return;
  if (!sameInode(current, expected)) throw new Error(`foreign replacement HOLD: ${name}`);
  await unlink(`/proc/self/fd/${parent.handle.fd}/${name}`); await parent.handle.sync();
}

function journalFrame(value) {
  const body = canonical(value);
  const header = Buffer.from(`${body.length.toString(16).padStart(8, '0')} ${sha256(body)}\n`, 'ascii');
  if (header.length !== HEADER_BYTES) throw new Error('journal frame header invalid');
  return Buffer.concat([header, body]);
}

function parseCanonical(bytes, label) {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (!text.endsWith('\n')) throw new Error(`${label} framing invalid`);
  const value = JSON.parse(text);
  if (`${JSON.stringify(value)}\n` !== text) throw new Error(`${label} canonical JSON invalid`);
  return value;
}

function parseJournalFrames(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > MAX_JOURNAL_BYTES || bytes.includes(0) || bytes.includes(13)) {
    throw new Error('publication journal bytes invalid');
  }
  let offset = 0; let latest = null;
  while (offset < bytes.length) {
    if (bytes.length - offset < HEADER_BYTES) break;
    const match = /^([0-9a-f]{8}) ([0-9a-f]{64})\n$/u.exec(bytes.subarray(offset, offset + HEADER_BYTES).toString('ascii'));
    if (!match) throw new Error('publication journal frame header invalid');
    const length = Number.parseInt(match[1], 16); const start = offset + HEADER_BYTES; const end = start + length;
    if (length < 2 || length > 2 * 1024 * 1024) throw new Error('publication journal frame length invalid');
    if (end > bytes.length) break;
    const body = bytes.subarray(start, end);
    if (sha256(body) !== match[2]) throw new Error('publication journal frame digest invalid');
    latest = parseCanonical(body, 'publication journal record'); offset = end;
  }
  if (!latest) throw new Error('publication journal has no complete record');
  return Object.freeze({ latest, completeOffset: offset });
}

function parseJournal(bytes) {
  return parseJournalFrames(bytes).latest;
}

async function truncateJournalTail(state, expectedIdentity, completeOffset, fault = () => {}) {
  if (!Number.isSafeInteger(completeOffset) || completeOffset < 1) throw new Error('journal complete offset invalid');
  const handle = await open(`/proc/self/fd/${state.handle.fd}/${JOURNAL_NAME}`,
    constants.O_RDWR | constants.O_NOFOLLOW);
  let primary;
  try {
    const opened = await handle.stat({ bigint: true });
    const named = await lstat(path.join(state.path, JOURNAL_NAME), { bigint: true });
    assertRegular(opened, 'publication journal');
    if (!sameInode(opened, expectedIdentity) || !sameInode(named, expectedIdentity)) {
      throw new Error('publication journal changed before tail truncate HOLD');
    }
    await handle.truncate(completeOffset);
    await handle.sync();
    if (!sameInode(await lstat(path.join(state.path, JOURNAL_NAME), { bigint: true }), expectedIdentity)) {
      throw new Error('publication journal changed during tail truncate HOLD');
    }
    await fault('after-journal-tail-truncate');
  } catch (error) { primary = error; throw error; }
  finally { await closeHandlePreserving(handle, primary, 'publication journal tail truncate'); }
}

async function appendJournal(state, journal, expectedIdentity = null, fault = () => {}, onDurable = () => {}) {
  const journalPath = path.join(state.path, JOURNAL_NAME); const frame = journalFrame(journal);
  let handle; let primary;
  try {
    if (expectedIdentity) {
      if (!sameInode(await lstat(journalPath, { bigint: true }), expectedIdentity)) throw new Error('foreign journal replacement HOLD');
      handle = await open(`/proc/self/fd/${state.handle.fd}/${JOURNAL_NAME}`, constants.O_WRONLY | constants.O_APPEND | constants.O_NOFOLLOW);
    } else {
      await state.handle.sync();
      handle = await open(`/proc/self/fd/${state.handle.fd}/${JOURNAL_NAME}`,
        constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      await fault('journal:after-create-before-write');
    }
    const opened = await handle.stat({ bigint: true }); assertRegular(opened, 'publication journal');
    if (Number(opened.mode & 0o7777n) !== 0o600) throw new Error('publication journal mode invalid');
    if (expectedIdentity && !sameInode(opened, expectedIdentity)) throw new Error('foreign journal replacement HOLD');
    if (Number(opened.size) + frame.length > MAX_JOURNAL_BYTES) throw new Error('publication journal too large');
    await handle.writeFile(frame); await handle.sync();
    onDurable();
    if (!sameInode(await lstat(journalPath, { bigint: true }), inode(opened))) throw new Error('foreign journal replacement HOLD');
    if (!expectedIdentity) await state.handle.sync();
    await fault('after-journal-record-sync');
    return inode(opened);
  } catch (error) { primary = error; throw error; }
  finally { frame.fill(0); await closeHandlePreserving(handle, primary, 'publication journal'); }
}

function gitCommonPath(name, repositoryRoot = REPO_ROOT) {
  if (typeof repositoryRoot !== 'string' || !path.isAbsolute(repositoryRoot) || repositoryRoot.includes('\0')) {
    throw new Error('repository root invalid');
  }
  const common = execFileSync('/usr/bin/git', ['-C', repositoryRoot, 'rev-parse', '--git-common-dir'], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    env: { HOME: process.env.HOME ?? '/root', LANG: 'C', LC_ALL: 'C' },
  }).trim();
  if (!common || common.includes('\0')) throw new Error('git common directory invalid');
  return path.join(path.resolve(repositoryRoot, common), name);
}

export function resolveExpectedTerminalPublicationPaths() {
  return Object.freeze({ journalPath: gitCommonPath(JOURNAL_NAME, REPO_ROOT), lockPath: gitCommonPath(LOCK_NAME, REPO_ROOT) });
}

function resolveInternalPublicationPaths(repositoryRoot) {
  return Object.freeze({ journalPath: gitCommonPath(JOURNAL_NAME, repositoryRoot), lockPath: gitCommonPath(LOCK_NAME, repositoryRoot) });
}

async function acquireLock(state) {
  const child = spawn('/usr/bin/flock', ['--exclusive', '--nonblock', '/proc/self/fd/3', '/bin/sh', '-c', 'printf "LOCKED\\n"; cat >/dev/null'],
    { stdio: ['pipe', 'pipe', 'pipe', state.handle.fd] });
  const closed = new Promise((resolve) => child.once('close', resolve));
  try {
    await new Promise((resolve, reject) => {
      let output = ''; let stderr = '';
      child.stderr.setEncoding('utf8'); child.stderr.on('data', (chunk) => { stderr += chunk; });
      child.stdout.setEncoding('utf8'); child.stdout.on('data', (chunk) => { output += chunk; if (output.includes('LOCKED\n')) resolve(); });
      child.once('error', reject); child.once('exit', (code) => { if (!output.includes('LOCKED\n')) reject(new Error(code === 1 ? 'publication lock is active' : `publication flock failed: ${stderr}`)); });
    });
    if (!sameInode(await state.handle.stat({ bigint: true }), state.identity)) throw new Error('repository state directory identity mismatch');
    return { child, closed };
  } catch (error) { child.stdin.end(); await closed.catch(() => {}); throw error; }
}

async function releaseLock(lock) { lock.child.stdin.end(); if (await lock.closed !== 0) throw new Error('publication flock release failed'); }

async function withRepositoryPublicationLock(callback, repositoryRoot = REPO_ROOT) {
  if (typeof callback !== 'function') throw new Error('publication callback invalid');
  const paths = repositoryRoot === REPO_ROOT ? resolveExpectedTerminalPublicationPaths() : resolveInternalPublicationPaths(repositoryRoot);
  let state; let lock; let result; let primary; const cleanup = [];
  try {
    state = await openDirectory(path.dirname(paths.lockPath), 'repository publication state');
    lock = await acquireLock(state);
    const scope = Object.freeze({ ...paths }); LOCK_CAPABILITIES.set(scope, { state, lock });
    try { result = await callback(scope); } finally { LOCK_CAPABILITIES.delete(scope); }
  } catch (error) { primary = error; }
  if (lock) await releaseLock(lock).catch((error) => cleanup.push(error));
  if (state) await state.handle.close().catch((error) => cleanup.push(error));
  if (cleanup.length) throw new AggregateError(primary ? [primary, ...cleanup] : cleanup, 'repository publication lock cleanup failed');
  if (primary) throw primary;
  return result;
}

function targetJournal(entry) { const { bytes, ...record } = entry; return record; }
function serializable(journal) {
  return {
    schemaVersion: 1, transactionId: journal.transactionId, state: journal.state,
    captureLedgerIdentity: journal.captureLedgerIdentity,
    captureLedgerSha256: journal.captureLedgerSha256,
    targets: journal.targets.map(targetJournal),
  };
}

function validateJournal(value, input) {
  exactKeys(value, ['schemaVersion', 'transactionId', 'state', 'captureLedgerIdentity', 'captureLedgerSha256', 'targets'], 'publication journal');
  if (value.schemaVersion !== 1 || !SHA256.test(value.transactionId) || !['PREPARED', 'PROMOTING', 'COMMITTED', 'CLEANED'].includes(value.state)
    || !value.captureLedgerIdentity || typeof value.captureLedgerIdentity !== 'object' || Array.isArray(value.captureLedgerIdentity)
    || Object.keys(value.captureLedgerIdentity).sort().join(',') !== 'dev,ino'
    || !/^\d+$/u.test(value.captureLedgerIdentity.dev) || !/^\d+$/u.test(value.captureLedgerIdentity.ino)
    || !SHA256.test(value.captureLedgerSha256)
    || !Array.isArray(value.targets) || value.targets.length !== 4) throw new Error('publication journal contract invalid');
  value.targets.forEach((entry, index) => {
    exactKeys(entry, ['name', 'parentKey', 'targetPath', 'tempName', 'backupName', 'digest', 'existed', 'originalIdentity', 'tempIdentity', 'backupIdentity', 'promotedIdentity', 'promoted'], `journal target ${index}`);
    const parentPath = index === 3 ? path.dirname(path.resolve(input.ledgerPath)) : path.resolve(input.publishDir);
    if (entry.name !== TARGET_NAMES[index] || entry.parentKey !== (index === 3 ? 'ledger' : 'publish')
      || entry.targetPath !== path.join(parentPath, entry.name) || entry.tempName !== `${entry.name}.midao-temp-${value.transactionId}`
      || entry.backupName !== `${entry.name}.midao-backup-${value.transactionId}` || !SHA256.test(entry.digest)
      || typeof entry.existed !== 'boolean' || typeof entry.promoted !== 'boolean') throw new Error(`journal target ${index} contract invalid`);
  });
  return value;
}

async function inferPromotions(journal, parents) {
  let changed = false;
  for (const entry of journal.targets) {
    if (entry.promoted || !entry.tempIdentity) continue;
    const parent = parents[entry.parentKey]; const target = await statMaybe(entry.targetPath); const temp = await statMaybe(path.join(parent.path, entry.tempName));
    if (target && !temp) {
      const backup = entry.backupIdentity ? await statMaybe(path.join(parent.path, entry.backupName)) : null;
      if (entry.existed && entry.backupIdentity && sameInode(target, entry.backupIdentity) && !backup) {
        // An interrupted rollback already restored the exact original inode.
        continue;
      }
      if (!sameInode(target, entry.tempIdentity)) throw new Error(`ambiguous promoted identity mismatch HOLD: ${entry.name}`);
      entry.promoted = true; entry.promotedIdentity = entry.tempIdentity; changed = true;
    }
  }
  return changed;
}

async function adoptInterruptedArtifacts(journal, parents) {
  let changed = false;
  for (const entry of journal.targets) {
    const parent = parents[entry.parentKey];
    if (!entry.backupIdentity && entry.existed) {
      const backup = await statMaybe(path.join(parent.path, entry.backupName));
      const target = await statMaybe(entry.targetPath);
      if (backup && !target) {
        if (!sameInode(backup, entry.originalIdentity)) throw new Error(`recovery backup identity mismatch HOLD: ${entry.name}`);
        entry.backupIdentity = inode(backup);
        changed = true;
      }
    }
    if (!entry.tempIdentity) {
      const temp = await statMaybe(path.join(parent.path, entry.tempName));
      if (temp) {
        const pinned = await readPinned(parent, entry.tempName, `recovery temp ${entry.name}`);
        try {
          if (sha256(pinned.bytes) !== entry.digest) throw new Error(`recovery temp digest mismatch HOLD: ${entry.name}`);
          entry.tempIdentity = pinned.identity;
          changed = true;
        } finally { pinned.bytes.fill(0); }
      }
    }
  }
  return changed;
}

async function rollback(journal, parents, fault = () => {}, renameAdapter = renameNoReplace) {
  const errors = [];
  for (const entry of [...journal.targets].reverse()) {
    const parent = parents[entry.parentKey];
    try {
      let current = await statMaybe(entry.targetPath);
      if (entry.promoted && current && sameInode(current, entry.promotedIdentity)) {
        if (await statMaybe(path.join(parent.path, entry.tempName))) throw new Error(`rollback temp occupied HOLD: ${entry.name}`);
        await renameAdapter(parent, entry.name, entry.tempName); await parent.handle.sync();
        await fault(`after-rollback-detach:${entry.name}`);
        current = null;
      } else if (entry.promoted && current && entry.existed && sameInode(current, entry.backupIdentity)) {
        // Already restored by an interrupted rollback.
      } else if (entry.promoted && current) throw new Error(`foreign replacement HOLD: ${entry.name}`);
      if (entry.existed && entry.backupIdentity) {
        current = await statMaybe(entry.targetPath);
        if (!current) {
          const backup = await statMaybe(path.join(parent.path, entry.backupName));
          if (!sameInode(backup, entry.backupIdentity)) throw new Error(`backup identity mismatch HOLD: ${entry.name}`);
          await renameAdapter(parent, entry.backupName, entry.name); await parent.handle.sync();
        } else if (!sameInode(current, entry.backupIdentity)) throw new Error(`foreign replacement HOLD: ${entry.name}`);
      } else if (entry.existed) {
        current = await statMaybe(entry.targetPath);
        if (!sameInode(current, entry.originalIdentity)) throw new Error(`original identity unavailable HOLD: ${entry.name}`);
      } else if (await statMaybe(entry.targetPath)) throw new Error(`foreign replacement HOLD: ${entry.name}`);
      await removeExpected(parent, entry.tempName, entry.tempIdentity);
      await removeExpected(parent, entry.backupName, entry.backupIdentity);
      await fault(`after-rollback:${entry.name}`);
    } catch (error) { if (error?.[SIMULATED_PROCESS_CRASH]) throw error; errors.push(error); }
  }
  if (errors.length) throw new AggregateError(errors, 'expected-terminal rollback failed');
}

async function cleanupCommitted(journal, parents, fault = () => {}) {
  const errors = [];
  for (const entry of journal.targets) {
    const parent = parents[entry.parentKey];
    try { await removeExpected(parent, entry.tempName, entry.tempIdentity); await removeExpected(parent, entry.backupName, entry.backupIdentity); await fault(`cleanup:${entry.name}`); }
    catch (error) { errors.push(error); }
  }
  if (errors.length) throw new AggregateError(errors, 'expected-terminal residue cleanup failed');
}

async function exactCommit(journal, parents) {
  for (const entry of journal.targets) {
    if (!entry.promotedIdentity) return false;
    try {
      const pinned = await readPinned(parents[entry.parentKey], entry.name, `committed ${entry.name}`);
      try { if (pinned.identity.dev !== entry.promotedIdentity.dev || pinned.identity.ino !== entry.promotedIdentity.ino || sha256(pinned.bytes) !== entry.digest) return false; }
      finally { pinned.bytes.fill(0); }
    } catch { return false; }
  }
  return true;
}

async function revalidateCommittedSemantics(journal, parents, captureParent, input) {
  const held = [];
  let capture;
  let prepared;
  try {
    for (const entry of journal.targets) {
      const pinned = await readPinned(parents[entry.parentKey], entry.name, `revalidate committed ${entry.name}`);
      held.push(pinned.bytes);
      if (!sameInode(await statMaybe(entry.targetPath), entry.promotedIdentity) || sha256(pinned.bytes) !== entry.digest) {
        throw new Error(`committed target changed HOLD: ${entry.name}`);
      }
    }
    capture = await readPinned(captureParent, path.basename(input.captureLedgerPath), 'capture ledger recovery');
    if (capture.identity.dev !== journal.captureLedgerIdentity.dev || capture.identity.ino !== journal.captureLedgerIdentity.ino
      || sha256(capture.bytes) !== journal.captureLedgerSha256) throw new Error('capture ledger recovery identity or digest HOLD');
    prepared = {
      payloads: new Map([[TARGET_NAMES[0], held[0]], [TARGET_NAMES[1], held[1]]]),
      manifestBytes: held[2], ledgerBytes: held[3],
      dispose() {},
    };
    const semantics = validatePrepared(prepared);
    if (semantics.transactionId !== journal.transactionId) throw new Error('committed transaction semantic mismatch HOLD');
    if (await input.semanticValidator(prepared, capture.bytes) !== true) throw new Error('committed semantic validator rejected recovery HOLD');
  } finally {
    capture?.bytes.fill(0);
    for (const bytes of held) bytes.fill(0);
    prepared?.payloads.clear();
  }
}

async function removeJournal(state, expected) {
  const target = path.join(state.path, JOURNAL_NAME); const current = await lstat(target, { bigint: true });
  if (!sameInode(current, expected)) throw new Error('foreign journal replacement HOLD');
  await unlink(`/proc/self/fd/${state.handle.fd}/${JOURNAL_NAME}`); await state.handle.sync();
}

async function recoverLocked(input, scope) {
  const capability = LOCK_CAPABILITIES.get(scope); if (!capability) throw new Error('recovery lock capability invalid');
  const { state } = capability; let publish; let ledger; let capture; let primary;
  await input.verifyRenameRuntime();
  try {
    const pinned = await readPinned(state, JOURNAL_NAME, 'publication journal', MAX_JOURNAL_BYTES, [0o600]); let journal;
    if (pinned.bytes.length === 0) {
      const emptyIdentity = pinned.identity;
      pinned.bytes.fill(0);
      await removeJournal(state, emptyIdentity);
      return Object.freeze({ transactionId: null, recovered: true, emptyJournal: true });
    }
    try {
      const frames = parseJournalFrames(pinned.bytes);
      journal = validateJournal(frames.latest, input); journal.journalIdentity = pinned.identity;
      if (frames.completeOffset < pinned.bytes.length) {
        await truncateJournalTail(state, pinned.identity, frames.completeOffset, input.fault);
      }
    }
    finally { pinned.bytes.fill(0); }
    publish = await openDirectory(input.publishDir, 'recovery publish'); ledger = await openDirectory(path.dirname(input.ledgerPath), 'recovery ledger');
    capture = await openDirectory(path.dirname(input.captureLedgerPath), 'recovery capture ledger');
    const parents = { publish, ledger };
    const adopted = await adoptInterruptedArtifacts(journal, parents);
    const inferred = await inferPromotions(journal, parents);
    if (adopted || inferred) journal.journalIdentity = await appendJournal(state, serializable(journal), journal.journalIdentity, input.fault);
    const committed = await exactCommit(journal, parents);
    if (['COMMITTED', 'CLEANED'].includes(journal.state) && !committed) {
      throw new Error(`committed target identity or digest changed HOLD: ${journal.state}`);
    }
    if (committed) {
      await revalidateCommittedSemantics(journal, parents, capture, input);
      await cleanupCommitted(journal, parents, input.fault);
    } else await rollback(journal, parents, input.fault, input.renameAdapter);
    journal.state = 'CLEANED'; journal.journalIdentity = await appendJournal(state, serializable(journal), journal.journalIdentity, input.fault);
    await removeJournal(state, journal.journalIdentity);
    return Object.freeze({ transactionId: journal.transactionId, recovered: true });
  } catch (error) { primary = error; throw error; }
  finally {
    const failures = (await Promise.allSettled([publish?.handle.close(), ledger?.handle.close(), capture?.handle.close()].filter(Boolean))).filter((item) => item.status === 'rejected').map((item) => item.reason);
    if (failures.length) throw new AggregateError(primary ? [primary, ...failures] : failures, 'recovery cleanup failed');
  }
}

async function recoverExpectedTerminalPublication(input) {
  const normalized = normalizePublicInput(input, true);
  return withRepositoryPublicationLock((scope) => recoverLocked(normalized, scope), normalized.repositoryRoot);
}

function validateTerminalPayload(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > MAX_TERMINAL_BYTES || bytes.includes(0) || bytes.includes(13)) {
    throw new Error('terminal catalog bytes invalid');
  }
  let value;
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch (error) { throw new Error('terminal catalog JSON invalid', { cause: error }); }
  validateNormalizedCatalog(value);
  const expected = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  try { if (!bytes.equals(expected)) throw new Error('terminal catalog canonical framing invalid'); }
  finally { expected.fill(0); }
}

function validatePrepared(prepared) {
  exactKeys(prepared, ['payloads', 'manifestBytes', 'ledgerBytes', 'dispose'], 'prepared expected-terminal');
  if (!(prepared.payloads instanceof Map) || prepared.payloads.size !== 2 || !Buffer.isBuffer(prepared.manifestBytes)
    || !Buffer.isBuffer(prepared.ledgerBytes) || typeof prepared.dispose !== 'function'
    || TARGET_NAMES.slice(0, 2).some((name) => !Buffer.isBuffer(prepared.payloads.get(name)))) {
    throw new Error('prepared expected-terminal contract invalid');
  }
  validateTerminalPayload(prepared.payloads.get(TARGET_NAMES[0]));
  const manifest = parseCanonical(prepared.manifestBytes, 'expected-terminal manifest');
  const ledger = parseCanonical(prepared.ledgerBytes, 'expected-terminal ledger');
  exactKeys(manifest, ['schemaVersion', 'kind', 'captureTransactionId', 'captureManifestSha256', 'historyVersions', 'postCutoffMigrations', 'payloadDigests', 'transactionId'], 'expected-terminal manifest');
  exactKeys(ledger, ['schemaVersion', 'kind', 'transactionId', 'manifestSha256', 'captureTransactionId', 'captureManifestSha256', 'payloadDigests'], 'expected-terminal ledger');
  const payloadDigests = Object.fromEntries(TARGET_NAMES.slice(0, 2).map((name) => [name, sha256(prepared.payloads.get(name))]));
  const digestMapMatches = (value) => value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === TARGET_NAMES.slice(0, 2).length
    && TARGET_NAMES.slice(0, 2).every((name) => Object.hasOwn(value, name) && value[name] === payloadDigests[name]);
  if (manifest.schemaVersion !== 1 || manifest.kind !== 'midao-expected-terminal-manifest'
    || ledger.schemaVersion !== 1 || ledger.kind !== 'midao-expected-terminal-ledger'
    || !SHA256.test(manifest.transactionId) || ledger.transactionId !== manifest.transactionId
    || !SHA256.test(manifest.captureTransactionId) || ledger.captureTransactionId !== manifest.captureTransactionId
    || !SHA256.test(manifest.captureManifestSha256) || ledger.captureManifestSha256 !== manifest.captureManifestSha256
    || ledger.manifestSha256 !== sha256(prepared.manifestBytes)
    || !digestMapMatches(manifest.payloadDigests)
    || !digestMapMatches(ledger.payloadDigests)
    || !Array.isArray(manifest.historyVersions) || new Set(manifest.historyVersions).size !== manifest.historyVersions.length
    || manifest.historyVersions.some((value) => typeof value !== 'string' || !/^\d{14}$/u.test(value))
    || !Array.isArray(manifest.postCutoffMigrations)) throw new Error('prepared expected-terminal transaction semantics invalid');
  const { transactionId, ...core } = manifest;
  const coreBytes = stableCanonical(core);
  try {
    if (sha256(coreBytes) !== transactionId) throw new Error('prepared expected-terminal transaction derivation invalid');
  } finally { coreBytes.fill(0); }
  const expectedDigest = `${payloadDigests[TARGET_NAMES[0]]}  ${TARGET_NAMES[0]}\n`;
  if (prepared.payloads.get(TARGET_NAMES[1]).toString('utf8') !== expectedDigest) throw new Error('prepared expected-terminal digest payload invalid');
  return Object.freeze({ transactionId, manifest, ledger });
}

async function publishLocked(input, scope) {
  const capability = LOCK_CAPABILITIES.get(scope); if (!capability) throw new Error('publication lock capability invalid');
  const { state } = capability; const journalPath = path.join(state.path, JOURNAL_NAME);
  await input.verifyRenameRuntime();
  if (await statMaybe(journalPath)) await recoverLocked(input, scope);
  const preparedSemantics = validatePrepared(input.prepared);
  let publish; let ledger; let captureParent; let captureHandle; let captureBytes; let journal; let primary; let durableCommitted = false; const cleanupErrors = [];
  try {
    publish = await openDirectory(input.publishDir, 'expected-terminal publish');
    ledger = await openDirectory(path.dirname(input.ledgerPath), 'expected-terminal ledger');
    captureParent = await openDirectory(path.dirname(input.captureLedgerPath), 'capture ledger parent');
  if (path.basename(input.captureLedgerPath) !== 'baseline-ledger.json') throw new Error('capture ledger basename invalid');
    captureHandle = await open(`/proc/self/fd/${captureParent.handle.fd}/${path.basename(input.captureLedgerPath)}`, constants.O_RDONLY | constants.O_NOFOLLOW);
    const captureStat = await captureHandle.stat({ bigint: true }); assertRegular(captureStat, 'capture ledger');
    if (!sameInode(await lstat(input.captureLedgerPath, { bigint: true }), inode(captureStat))) throw new Error('capture ledger identity mismatch HOLD');
    captureBytes = await captureHandle.readFile();
    const validationResult = await input.semanticValidator(input.prepared, captureBytes);
    if (validationResult !== true) throw new Error('semantic validator must return true');
    const bytes = [input.prepared.payloads.get(TARGET_NAMES[0]), input.prepared.payloads.get(TARGET_NAMES[1]), input.prepared.manifestBytes, input.prepared.ledgerBytes];
    const transactionId = preparedSemantics.transactionId; const parents = { publish, ledger };
    const targets = TARGET_NAMES.map((name, index) => ({
      name, parentKey: index === 3 ? 'ledger' : 'publish', targetPath: index === 3 ? path.resolve(input.ledgerPath) : path.join(path.resolve(input.publishDir), name),
      tempName: `${name}.midao-temp-${transactionId}`, backupName: `${name}.midao-backup-${transactionId}`, digest: sha256(bytes[index]),
      existed: false, originalIdentity: null, tempIdentity: null, backupIdentity: null, promotedIdentity: null, promoted: false, bytes: bytes[index],
    }));
    for (const entry of targets) { const existing = await statMaybe(entry.targetPath); if (existing) { assertRegular(existing, `existing ${entry.name}`); entry.existed = true; entry.originalIdentity = inode(existing); } }
    journal = {
      transactionId, state: 'PREPARED',
      captureLedgerIdentity: inode(captureStat), captureLedgerSha256: sha256(captureBytes),
      targets,
    };
    journal.journalIdentity = await appendJournal(state, serializable(journal), null, input.fault);
    for (const entry of targets) {
      const parent = parents[entry.parentKey];
      entry.tempIdentity = await writeExclusive(parent, entry.tempName, entry.bytes);
      await input.fault(`after-temp-write:${entry.name}`);
    }
    for (const entry of targets) {
      const parent = parents[entry.parentKey];
      if (entry.existed) {
        await parent.handle.sync();
        await input.fault(`before-backup-detach:${entry.name}`);
        await input.renameAdapter(parent, entry.name, entry.backupName); await parent.handle.sync();
        const backup = await lstat(path.join(parent.path, entry.backupName), { bigint: true });
        if (!sameInode(backup, entry.originalIdentity)) throw new Error(`backup detach identity mismatch HOLD: ${entry.name}`);
        entry.backupIdentity = inode(backup);
        await input.fault(`after-backup-write:${entry.name}`);
      }
      journal.journalIdentity = await appendJournal(state, serializable(journal), journal.journalIdentity, input.fault);
    }
    journal.state = 'PROMOTING'; journal.journalIdentity = await appendJournal(state, serializable(journal), journal.journalIdentity, input.fault);
    for (const entry of targets) {
      const parent = parents[entry.parentKey]; await recheckDirectory(parent, entry.parentKey);
      if (await statMaybe(entry.targetPath)) throw new Error(`target occupied before promotion HOLD: ${entry.name}`);
      if (entry.existed && !sameInode(await statMaybe(path.join(parent.path, entry.backupName)), entry.backupIdentity)) throw new Error(`backup identity mismatch HOLD: ${entry.name}`);
      await parent.handle.sync();
      await input.fault(`before-promotion-atomic:${entry.name}`);
      await input.renameAdapter(parent, entry.tempName, entry.name); await parent.handle.sync();
      await input.fault(`after-target-rename-before-identity-check:${entry.name}`);
      const promoted = await lstat(entry.targetPath, { bigint: true });
      if (!sameInode(promoted, entry.tempIdentity)) throw new Error(`promoted identity mismatch HOLD: ${entry.name}`);
      entry.promoted = true; entry.promotedIdentity = entry.tempIdentity;
      journal.journalIdentity = await appendJournal(state, serializable(journal), journal.journalIdentity, input.fault);
      await input.onOperation(`rename:${entry.name}`); await input.fault(`after-rename:${entry.name}`);
    }
    await input.fault('before-commit-readback');
    if (!await exactCommit(journal, parents)) throw new Error('published read-back identity or digest mismatch HOLD');
    await input.fault('before-capture-final-recheck');
    const capturePinned = await readPinned(captureParent, path.basename(input.captureLedgerPath), 'capture ledger final');
    try {
      if (capturePinned.identity.dev !== inode(captureStat).dev || capturePinned.identity.ino !== inode(captureStat).ino
        || !capturePinned.bytes.equals(captureBytes)) throw new Error('capture ledger mutated during publication HOLD');
    } finally { capturePinned.bytes.fill(0); }
    journal.state = 'COMMITTED'; journal.journalIdentity = await appendJournal(
      state, serializable(journal), journal.journalIdentity, input.fault,
      () => { durableCommitted = true; },
    );
    await input.fault('after-commit-journal');
    await cleanupCommitted(journal, parents, input.fault);
    journal.state = 'CLEANED'; journal.journalIdentity = await appendJournal(state, serializable(journal), journal.journalIdentity, input.fault);
    await removeJournal(state, journal.journalIdentity);
    return Object.freeze({ transactionId });
  } catch (error) {
    primary = error;
    if (error?.[SIMULATED_PROCESS_CRASH]) throw error;
    if (durableCommitted) {
      primary = new Error('expected-terminal transaction committed; residue cleanup incomplete', { cause: error });
      throw primary;
    }
    if (journal && publish && ledger) {
      try {
        await adoptInterruptedArtifacts(journal, { publish, ledger });
        await inferPromotions(journal, { publish, ledger });
        journal.journalIdentity = await appendJournal(state, serializable(journal), journal.journalIdentity, input.fault);
        await rollback(journal, { publish, ledger }, input.fault, input.renameAdapter);
        await removeJournal(state, journal.journalIdentity);
      } catch (rollbackError) {
        primary = new AggregateError([error, rollbackError], 'expected-terminal publication and rollback failed');
        throw primary;
      }
    }
    primary = new Error('expected-terminal publication failed and rolled back', { cause: error });
    throw primary;
  } finally {
    captureBytes?.fill(0);
    for (const label of ['capture-handle', 'capture-parent', 'publish-parent', 'ledger-parent']) {
      try { await input.fault(`cleanup:${label}`); } catch (error) { cleanupErrors.push(error); }
      try {
        if (label === 'capture-handle') await captureHandle?.close();
        if (label === 'capture-parent') await captureParent?.handle.close();
        if (label === 'publish-parent') await publish?.handle.close();
        if (label === 'ledger-parent') await ledger?.handle.close();
      } catch (error) { cleanupErrors.push(error); }
    }
    if (cleanupErrors.length) throw new AggregateError(primary ? [primary, ...cleanupErrors] : cleanupErrors, 'expected-terminal publication cleanup failed');
  }
}

function normalizePublicInput(input, internal = false) {
  const keys = ['publishDir', 'ledgerPath', 'captureLedgerPath', 'prepared', 'semanticValidator'];
  if (!internal) exactKeys(input, keys, 'expected-terminal publisher input');
  else if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('expected-terminal publisher input shape invalid');
  for (const key of ['publishDir', 'ledgerPath', 'captureLedgerPath']) {
    if (typeof input[key] !== 'string' || !path.isAbsolute(input[key]) || input[key].includes('\0')) throw new Error(`publisher ${key} invalid`);
  }
  if (path.basename(input.ledgerPath) !== TARGET_NAMES[3]) throw new Error(`publisher ledger basename must be ${TARGET_NAMES[3]}`);
  if (typeof input.semanticValidator !== 'function') throw new Error('semantic validator callback invalid');
  const repositoryRoot = internal && input.repositoryRoot !== undefined ? input.repositoryRoot : REPO_ROOT;
  if (typeof repositoryRoot !== 'string' || !path.isAbsolute(repositoryRoot) || repositoryRoot.includes('\0')) {
    throw new Error('internal repositoryRoot invalid');
  }
  validatePrepared(input.prepared);
  return {
    ...input,
    repositoryRoot,
    fault: internal && typeof input.fault === 'function' ? input.fault : () => {},
    onOperation: internal && typeof input.onOperation === 'function' ? input.onOperation : () => {},
    renameAdapter: internal && typeof input.renameAdapter === 'function' ? input.renameAdapter : renameNoReplace,
    verifyRenameRuntime: internal && typeof input.verifyRenameRuntime === 'function' ? input.verifyRenameRuntime : verifyRenameNoReplaceRuntime,
  };
}

export async function publishExpectedTerminalTransaction(input = {}) {
  exactKeys(input, ['prepared'], 'expected-terminal publisher input');
  validatePrepared(input.prepared);
  const { validateExpectedTerminalPublicationSemantics } = await import('./build-expected-terminal.mjs');
  const normalized = normalizePublicInput({
    publishDir: path.join(REPO_ROOT, 'supabase/baselines/v1'),
    ledgerPath: path.join(REPO_ROOT, 'docs/operations/expected-terminal-ledger.json'),
    captureLedgerPath: path.join(REPO_ROOT, 'docs/operations/baseline-ledger.json'),
    prepared: input.prepared,
    semanticValidator: validateExpectedTerminalPublicationSemantics,
  }, true);
  return withRepositoryPublicationLock((scope) => publishLocked(normalized, scope), normalized.repositoryRoot);
}

async function publishExpectedTerminalTransactionInternal(input = {}) {
  const normalized = normalizePublicInput(input, true);
  return withRepositoryPublicationLock((scope) => publishLocked(normalized, scope), normalized.repositoryRoot);
}

export const __internal = Object.freeze({
  publishExpectedTerminalTransaction: publishExpectedTerminalTransactionInternal,
  publishExpectedTerminalPublication: publishExpectedTerminalTransactionInternal,
  recoverExpectedTerminalPublication,
  withRepositoryPublicationLock,
  parseJournal,
  renameNoReplace,
  closeHandlePreserving,
});
