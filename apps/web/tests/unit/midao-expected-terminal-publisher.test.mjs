import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../..');
const subjectPath = path.join(root, 'scripts/database-baseline/publish-expected-terminal.mjs');
const names = ['catalog.expected-terminal.normalized.json', 'catalog-expected-terminal.sha256', 'manifest.json', 'expected-terminal-ledger.json'];
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const stable = (value) => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
const canonical = (value) => Buffer.from(`${JSON.stringify(stable(value))}\n`);
const terminalFixture = await readFile(path.join(root, 'supabase/baselines/v1/catalog.cutoff.normalized.json'));
const originalCwd = process.cwd();
const gitRoot = await mkdtemp(path.join(os.tmpdir(), 'midao-terminal-publisher-git-'));
const primary = path.join(gitRoot, 'primary');
const secondary = path.join(gitRoot, 'secondary');
for (const args of [
  ['init', primary],
  ['-C', primary, '-c', 'user.name=Midao Test', '-c', 'user.email=test@invalid.example', 'commit', '--allow-empty', '-m', 'root'],
  ['-C', primary, 'worktree', 'add', secondary, 'HEAD'],
]) {
  const result = spawnSync('/usr/bin/git', args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
}
process.chdir(primary);
after(async () => { process.chdir(originalCwd); await rm(gitRoot, { recursive: true, force: true }); });

async function api() { return import(`${pathToFileURL(subjectPath).href}?t=${Date.now()}-${Math.random()}`); }
function prepared(catalogSource = terminalFixture) {
  const catalog = Buffer.from(catalogSource);
  const digest = Buffer.from(`${sha256(catalog)}  ${names[0]}\n`);
  const payloads = new Map([[names[0], catalog], [names[1], digest]]);
  const payloadDigests = Object.fromEntries([...payloads].map(([name, bytes]) => [name, sha256(bytes)]));
  const core = { schemaVersion: 1, kind: 'midao-expected-terminal-manifest', captureTransactionId: 'a'.repeat(64), captureManifestSha256: 'b'.repeat(64), historyVersions: [], postCutoffMigrations: [], payloadDigests };
  const transactionId = sha256(canonical(core));
  const manifestBytes = canonical({ ...core, transactionId });
  const ledgerBytes = canonical({ schemaVersion: 1, kind: 'midao-expected-terminal-ledger', transactionId, manifestSha256: sha256(manifestBytes), captureTransactionId: core.captureTransactionId, captureManifestSha256: core.captureManifestSha256, payloadDigests });
  return { payloads, manifestBytes, ledgerBytes, dispose() {} };
}
async function fixture() {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'midao-terminal-publish-'));
  await chmod(parent, 0o700);
  const publishDir = path.join(parent, 'terminal');
  const docs = path.join(parent, 'docs');
  await mkdir(publishDir, { mode: 0o700 }); await mkdir(docs, { mode: 0o700 });
  const captureLedgerPath = path.join(docs, 'baseline-ledger.json');
  await writeFile(captureLedgerPath, '{"capture":true}\n', { mode: 0o600, flag: 'wx' });
  return { parent, repositoryRoot: primary, publishDir, ledgerPath: path.join(docs, names[3]), captureLedgerPath, prepared: prepared(), semanticValidator(value, captureBytes) {
    assert.equal(value.payloads instanceof Map, true); assert.equal(captureBytes.toString(), '{"capture":true}\n'); return true;
  } };
}
function internalPublicationPaths(repositoryRoot) {
  const common = spawnSync('/usr/bin/git', ['-C', repositoryRoot, 'rev-parse', '--git-common-dir'], { encoding: 'utf8' }).stdout.trim();
  const state = path.resolve(repositoryRoot, common);
  return {
    journalPath: path.join(state, 'midao-expected-terminal-publication.journal.json'),
    lockPath: path.join(state, 'midao-baseline-publication.lock'),
  };
}
async function cleanup(fx, mod) {
  const paths = mod?.resolveExpectedTerminalPublicationPaths?.();
  if (paths) await rm(paths.journalPath, { force: true });
  if (fx?.repositoryRoot) await rm(internalPublicationPaths(fx.repositoryRoot).journalPath, { force: true });
  if (fx) await rm(fx.parent, { recursive: true, force: true });
}
function publicationInput(fx, extra = {}) {
  const { repositoryRoot, publishDir, ledgerPath, captureLedgerPath, prepared, semanticValidator } = fx;
  return { repositoryRoot, publishDir, ledgerPath, captureLedgerPath, prepared, semanticValidator, ...extra };
}

// RED: this file intentionally imports the wished-for dedicated module before implementation.
test('publisher rejects group or world writable parent directories before mutation', async () => {
  const mod = await api(); const fx = await fixture();
  try {
    await chmod(fx.publishDir, 0o777);
    await assert.rejects(mod.__internal.publishExpectedTerminalTransaction(publicationInput(fx)), (error) => {
      const chain = `${error?.message ?? ''} ${error?.cause?.message ?? ''}`;
      return /directory.*mode|directory identity/iu.test(chain);
    });
    assert.deepEqual(await readdir(fx.publishDir), []);
    assert.equal(existsSync(fx.ledgerPath), false);
  } finally { await cleanup(fx, mod); }
});

test('FD close failures preserve the primary helper error chain', async () => {
  const mod = await api();
  let observed;
  await assert.rejects(mod.__internal.closeHandlePreserving({
    async close() { throw new Error('CLOSE_SENTINEL'); },
  }, new Error('PRIMARY_HELPER_SENTINEL'), 'test helper'), (error) => { observed = error; return true; });
  assert.match(observed.errors.map(String).join('\n'), /PRIMARY_HELPER_SENTINEL/u);
  assert.match(observed.errors.map(String).join('\n'), /CLOSE_SENTINEL/u);
});

test('formal API owns fixed repository paths and rejects fake terminal semantics before locking', async () => {
  const mod = await api(); const fx = await fixture(); const operations = [];
  const fake = prepared(Buffer.from('{"schemaVersion":1,"terminal":true}\n'));
  try {
    const expectedCommon = spawnSync('/usr/bin/git', ['-C', root, 'rev-parse', '--git-common-dir'], { encoding: 'utf8' }).stdout.trim();
    const expectedState = path.resolve(root, expectedCommon);
    assert.equal(mod.resolveExpectedTerminalPublicationPaths().journalPath, path.join(expectedState, 'midao-expected-terminal-publication.journal.json'));
    assert.equal(mod.resolveExpectedTerminalPublicationPaths().lockPath, path.join(expectedState, 'midao-baseline-publication.lock'));
    await assert.rejects(mod.publishExpectedTerminalTransaction({ ...publicationInput(fx), extra: true }), /input shape/iu);
    await assert.rejects(mod.publishExpectedTerminalTransaction({ prepared: fake }), /terminal catalog|normalized catalog/iu);
    assert.equal(existsSync(mod.resolveExpectedTerminalPublicationPaths().journalPath), false);
    await assert.rejects(mod.__internal.publishExpectedTerminalPublication({ ...fx, prepared: fake, onOperation: (point) => operations.push(point) }), /terminal catalog|normalized catalog/iu);
    assert.deepEqual(operations, []);
  } finally { await cleanup(fx, mod); }
});

test('manifest and ledger transaction semantics reject before any target mutation', async () => {
  const mod = await api(); const fx = await fixture();
  const before = await readdir(fx.publishDir);
  try {
    const ledger = JSON.parse(fx.prepared.ledgerBytes);
    fx.prepared.ledgerBytes = canonical({ ...ledger, transactionId: 'f'.repeat(64) });
    await assert.rejects(mod.publishExpectedTerminalTransaction({ prepared: fx.prepared }), /transaction|semantic|manifest/iu);
    assert.deepEqual(await readdir(fx.publishDir), before);
    assert.equal(existsSync(fx.ledgerPath), false);
  } finally { await cleanup(fx, mod); }
});

test('repo-common directory inode flock interoperates with Task7 namespace and lock precedes recovery', async () => {
  const mod = await api(); const paths = mod.resolveExpectedTerminalPublicationPaths();
  let release; let entered; const gate = new Promise((resolve) => { release = resolve; }); const ready = new Promise((resolve) => { entered = resolve; });
  const holder = mod.__internal.withRepositoryPublicationLock(async () => { entered(); await gate; });
  await ready;
  const probe = spawnSync('/usr/bin/flock', ['--exclusive', '--nonblock', path.dirname(paths.lockPath), '/bin/true'], { cwd: secondary });
  assert.equal(probe.status, 1);
  await assert.rejects(mod.__internal.withRepositoryPublicationLock(async () => {}), /lock is active/iu);
  release(); await holder;
});

test('all four temps are prepared and read back before any existing target is detached', async () => {
  const mod = await api(); const fx = await fixture(); const targetPaths = [
    ...names.slice(0, 3).map((name) => path.join(fx.publishDir, name)), fx.ledgerPath,
  ];
  for (const [index, target] of targetPaths.entries()) await writeFile(target, `prepare-original-${index}\n`, { mode: 0o600, flag: 'wx' });
  const crash = new Error('PREPARE_PHASE_CRASH'); crash[mod.SIMULATED_PROCESS_CRASH] = true;
  let snapshot;
  try {
    await assert.rejects(mod.__internal.publishExpectedTerminalTransaction({ ...fx, fault(point) {
      if (point === `after-temp-write:${names[1]}`) {
        snapshot = {
          targets: targetPaths.map((target) => existsSync(target)),
          backups: [...readdirSync(fx.publishDir), ...readdirSync(path.dirname(fx.ledgerPath))]
            .filter((name) => name.includes('.midao-backup-')),
        };
        throw crash;
      }
    } }), /PREPARE_PHASE_CRASH/u);
    assert.deepEqual(snapshot?.targets, [true, true, true, true]);
    assert.deepEqual(snapshot?.backups, []);
  } finally { await cleanup(fx, mod); }
});

test('rename runtime gate and observed-after-side-effect errors fail closed or rollback in-process', async () => {
  const mod = await api(); const paths = mod.resolveExpectedTerminalPublicationPaths();
  {
    const fx = await fixture();
    try {
      await assert.rejects(mod.__internal.publishExpectedTerminalTransaction({
        ...fx, verifyRenameRuntime() { throw new Error('RENAME_RUNTIME_UNAVAILABLE'); },
      }), /RENAME_RUNTIME_UNAVAILABLE/u);
      assert.equal(existsSync(paths.journalPath), false);
      assert.deepEqual(await readdir(fx.publishDir), []);
    } finally { await cleanup(fx, mod); }
  }
  for (const stage of ['backup', 'promotion']) {
    const fx = await fixture(); const originals = new Map(); let injected = false;
    try {
      for (const name of names.slice(0, 3)) {
        const bytes = Buffer.from(`${stage}-original:${name}\n`); originals.set(path.join(fx.publishDir, name), bytes);
        await writeFile(path.join(fx.publishDir, name), bytes, { mode: 0o600, flag: 'wx' });
      }
      const ledgerBytes = Buffer.from(`${stage}-original:ledger\n`); originals.set(fx.ledgerPath, ledgerBytes);
      await writeFile(fx.ledgerPath, ledgerBytes, { mode: 0o600, flag: 'wx' });
      await assert.rejects(mod.__internal.publishExpectedTerminalTransaction({
        ...fx,
        async renameAdapter(parent, source, destination) {
          await mod.__internal.renameNoReplace(parent, source, destination);
          const isBoundary = stage === 'backup' ? destination.includes('.midao-backup-') : !destination.includes('.midao-');
          if (!injected && isBoundary) { injected = true; throw new Error(`OBSERVED_${stage.toUpperCase()}_ERROR`); }
        },
      }), new RegExp(`OBSERVED_${stage.toUpperCase()}_ERROR|publication`, 'u'));
      for (const [target, bytes] of originals) assert.deepEqual(await readFile(target), bytes);
      assert.equal(existsSync(paths.journalPath), false);
      const residue = [...await readdir(fx.publishDir), ...await readdir(path.dirname(fx.ledgerPath))]
        .filter((name) => /midao-(?:temp|backup)-/u.test(name));
      assert.deepEqual(residue, []);
    } finally { await cleanup(fx, mod); }
  }
});

test('each promotion fault rolls back and a second-target fault restores exact originals', async () => {
  const mod = await api();
  for (const faultName of names) {
    const fx = await fixture(); const originals = new Map();
    try {
      for (const name of names.slice(0, 3)) { const bytes = Buffer.from(`old:${name}\n`); originals.set(path.join(fx.publishDir, name), bytes); await writeFile(path.join(fx.publishDir, name), bytes, { mode: 0o600 }); }
      const oldLedger = Buffer.from('old:ledger\n'); originals.set(fx.ledgerPath, oldLedger); await writeFile(fx.ledgerPath, oldLedger, { mode: 0o600 });
      await assert.rejects(mod.__internal.publishExpectedTerminalTransaction({ ...fx, fault(point) { if (point === `after-rename:${faultName}`) throw new Error(`FAULT:${faultName}`); } }), /FAULT|rolled back|publication/iu);
      for (const [target, bytes] of originals) assert.deepEqual(await readFile(target), bytes);
    } finally { await cleanup(fx, mod); }
  }
});

test('RENAME_NOREPLACE preserves destination occupation and rollback preserves foreign replacement HOLD', async () => {
  const mod = await api();
  for (const scenario of ['occupation', 'replacement']) {
    const fx = await fixture(); const target = path.join(fx.publishDir, names[0]);
    try {
      await assert.rejects(mod.__internal.publishExpectedTerminalTransaction({ ...fx, fault: async (point) => {
        if (scenario === 'occupation' && point === `before-promotion-atomic:${names[0]}`) await writeFile(target, 'foreign\n', { mode: 0o600, flag: 'wx' });
        if (scenario === 'replacement' && point === `after-rename:${names[0]}`) { await rm(target); await writeFile(target, 'foreign\n', { mode: 0o600, flag: 'wx' }); throw new Error('replace'); }
      } }), /HOLD|noreplace|rollback/iu);
      assert.equal(await readFile(target, 'utf8'), 'foreign\n');
      assert.equal(existsSync(internalPublicationPaths(fx.repositoryRoot).journalPath), true);
    } finally { await cleanup(fx, mod); }
  }
});

test('same-content replacement is an identity HOLD', async () => {
  const mod = await api(); const fx = await fixture(); const target = path.join(fx.publishDir, names[0]);
  try {
    await assert.rejects(mod.__internal.publishExpectedTerminalTransaction({ ...fx, fault: async (point) => {
      if (point === 'before-commit-readback') { const bytes = await readFile(target); await rm(target); await writeFile(target, bytes, { mode: 0o600, flag: 'wx' }); }
    } }), /identity|foreign replacement|HOLD|rollback/iu);
    assert.equal(existsSync(internalPublicationPaths(fx.repositoryRoot).journalPath), true);
  } finally { await cleanup(fx, mod); }
});

test('publication journal requires exact mode 0600 during recovery', async () => {
  const mod = await api(); const fx = await fixture(); const paths = internalPublicationPaths(fx.repositoryRoot);
  const crash = new Error('JOURNAL_MODE_CRASH'); crash[mod.SIMULATED_PROCESS_CRASH] = true;
  try {
    await assert.rejects(mod.__internal.publishExpectedTerminalTransaction({ ...fx, fault(point) { if (point === `after-rename:${names[0]}`) throw crash; } }), /JOURNAL_MODE_CRASH/u);
    await chmod(paths.journalPath, 0o644);
    await assert.rejects(mod.__internal.recoverExpectedTerminalPublication(fx), /journal.*mode|identity/iu);
    assert.equal(existsSync(paths.journalPath), true);
  } finally { await cleanup(fx, mod); }
});

test('initial empty journal crash recovers before any target mutation', async () => {
  const mod = await api(); const fx = await fixture(); const paths = internalPublicationPaths(fx.repositoryRoot);
  const crash = new Error('EMPTY_JOURNAL_CRASH'); crash[mod.SIMULATED_PROCESS_CRASH] = true;
  try {
    await assert.rejects(mod.__internal.publishExpectedTerminalTransaction({ ...fx, fault(point) { if (point === 'journal:after-create-before-write') throw crash; } }), /EMPTY_JOURNAL_CRASH/u);
    assert.equal((await readFile(paths.journalPath)).length, 0);
    assert.deepEqual(await readdir(fx.publishDir), []);
    await mod.__internal.recoverExpectedTerminalPublication(fx);
    assert.equal(existsSync(paths.journalPath), false);
  } finally { await cleanup(fx, mod); }
});

test('all twelve journal record-sync boundaries recover idempotently without residue', async () => {
  const mod = await api();
  {
    const inventory = await fixture(); let observedRecords = 0;
    try {
      await mod.__internal.publishExpectedTerminalTransaction({ ...inventory, fault(point) {
        if (point === 'after-journal-record-sync') observedRecords += 1;
      } });
      assert.equal(observedRecords, 12);
    } finally { await cleanup(inventory, mod); }
  }
  for (const boundary of Array.from({ length: 12 }, (_, index) => index + 1)) {
    const fx = await fixture(); const paths = internalPublicationPaths(fx.repositoryRoot); let records = 0;
    const targetPaths = [...names.slice(0, 3).map((name) => path.join(fx.publishDir, name)), fx.ledgerPath];
    const expectedNew = [fx.prepared.payloads.get(names[0]), fx.prepared.payloads.get(names[1]), fx.prepared.manifestBytes, fx.prepared.ledgerBytes];
    const crash = new Error(`JOURNAL_RECORD_${boundary}`); crash[mod.SIMULATED_PROCESS_CRASH] = true;
    try {
      await assert.rejects(mod.__internal.publishExpectedTerminalTransaction({ ...fx, fault(point) {
        if (point === 'after-journal-record-sync' && ++records === boundary) throw crash;
      } }), new RegExp(`JOURNAL_RECORD_${boundary}`, 'u'));
      assert.equal(records, boundary);
      await writeFile(paths.journalPath, '00000020 partial-tail', { flag: 'a' });
      await mod.__internal.recoverExpectedTerminalPublication(fx);
      assert.equal(existsSync(paths.journalPath), false);
      for (let index = 0; index < targetPaths.length; index += 1) {
        if (boundary <= 9) assert.equal(existsSync(targetPaths[index]), false, `boundary ${boundary} target ${index} must roll back`);
        else assert.deepEqual(await readFile(targetPaths[index]), expectedNew[index], `boundary ${boundary} target ${index} must commit`);
      }
      const residue = [...await readdir(fx.publishDir), ...await readdir(path.dirname(fx.ledgerPath))]
        .filter((name) => /midao-(?:temp|backup)-/u.test(name));
      assert.deepEqual(residue, []);
    } finally { await cleanup(fx, mod); }
  }
});

test('truncated tail is removed before recovery append so a second crash remains recoverable', async () => {
  const mod = await api(); const fx = await fixture(); const paths = internalPublicationPaths(fx.repositoryRoot);
  const publishCrash = new Error('TRUNCATED_INFERENCE_PUBLISH_CRASH'); publishCrash[mod.SIMULATED_PROCESS_CRASH] = true;
  const recoveryCrash = new Error('TRUNCATED_INFERENCE_RECOVERY_CRASH'); recoveryCrash[mod.SIMULATED_PROCESS_CRASH] = true;
  try {
    await assert.rejects(mod.__internal.publishExpectedTerminalTransaction({ ...fx, fault(point) {
      if (point === `after-target-rename-before-identity-check:${names[0]}`) throw publishCrash;
    } }), /TRUNCATED_INFERENCE_PUBLISH_CRASH/u);
    await writeFile(paths.journalPath, '00000020 partial-tail', { flag: 'a' });
    await assert.rejects(mod.__internal.recoverExpectedTerminalPublication({ ...fx, fault(point) {
      if (point === 'after-journal-record-sync') throw recoveryCrash;
    } }), /TRUNCATED_INFERENCE_RECOVERY_CRASH/u);
    await mod.__internal.recoverExpectedTerminalPublication(fx);
    assert.equal(existsSync(paths.journalPath), false);
    const residue = [...await readdir(fx.publishDir), ...await readdir(path.dirname(fx.ledgerPath))]
      .filter((name) => /midao-(?:temp|backup)-/u.test(name));
    assert.deepEqual(residue, []);
  } finally { await cleanup(fx, mod); }
});

test('truncated tail recovers but complete corrupt checksum frame is held', async () => {
  const mod = await api();
  for (const corrupt of [false, true]) {
    const fx = await fixture(); const paths = internalPublicationPaths(fx.repositoryRoot); const crash = new Error('CRASH'); crash[mod.SIMULATED_PROCESS_CRASH] = true;
    try {
      await assert.rejects(mod.__internal.publishExpectedTerminalTransaction({ ...fx, fault(point) { if (point === `after-rename:${names[1]}`) throw crash; } }), /CRASH/u);
      await writeFile(paths.journalPath, corrupt ? `00000003 ${'0'.repeat(64)}\n{}\n` : '00000020 partial', { flag: 'a' });
      if (corrupt) await assert.rejects(mod.__internal.recoverExpectedTerminalPublication(fx), /frame digest invalid/iu);
      else await mod.__internal.recoverExpectedTerminalPublication(fx);
      assert.equal(existsSync(paths.journalPath), corrupt);
    } finally { await cleanup(fx, mod); }
  }
});

test('rollback recovery is idempotent after a second crash during restore', async () => {
  const mod = await api(); const fx = await fixture(); const paths = internalPublicationPaths(fx.repositoryRoot);
  const originals = new Map();
  for (const name of names.slice(0, 3)) {
    const bytes = Buffer.from(`original:${name}\n`); originals.set(path.join(fx.publishDir, name), bytes);
    await writeFile(path.join(fx.publishDir, name), bytes, { mode: 0o600, flag: 'wx' });
  }
  const ledgerOriginal = Buffer.from('original:ledger\n'); originals.set(fx.ledgerPath, ledgerOriginal);
  await writeFile(fx.ledgerPath, ledgerOriginal, { mode: 0o600, flag: 'wx' });
  const publishCrash = new Error('PUBLISH_RECOVERY_CRASH'); publishCrash[mod.SIMULATED_PROCESS_CRASH] = true;
  const rollbackCrash = new Error('ROLLBACK_RECOVERY_CRASH'); rollbackCrash[mod.SIMULATED_PROCESS_CRASH] = true;
  try {
    await assert.rejects(mod.__internal.publishExpectedTerminalTransaction({ ...fx, fault(point) {
      if (point === `after-rename:${names[1]}`) throw publishCrash;
    } }), /PUBLISH_RECOVERY_CRASH/u);
    await assert.rejects(mod.__internal.recoverExpectedTerminalPublication({ ...fx, fault(point) {
      if (point === `after-rollback:${names[1]}`) throw rollbackCrash;
    } }), /ROLLBACK_RECOVERY_CRASH/u);
    await mod.__internal.recoverExpectedTerminalPublication(fx);
    for (const [target, bytes] of originals) assert.deepEqual(await readFile(target), bytes);
    assert.equal(existsSync(paths.journalPath), false);
    const residue = [...await readdir(fx.publishDir), ...await readdir(path.dirname(fx.ledgerPath))]
      .filter((name) => /midao-(?:temp|backup)-/u.test(name));
    assert.deepEqual(residue, []);
  } finally { await cleanup(fx, mod); }
});

test('rollback recovery survives a crash immediately after promoted target detach', async () => {
  const mod = await api(); const fx = await fixture(); const paths = internalPublicationPaths(fx.repositoryRoot);
  const originals = new Map();
  for (const name of names.slice(0, 3)) {
    const bytes = Buffer.from(`detach-original:${name}\n`); originals.set(path.join(fx.publishDir, name), bytes);
    await writeFile(path.join(fx.publishDir, name), bytes, { mode: 0o600, flag: 'wx' });
  }
  const ledgerOriginal = Buffer.from('detach-original:ledger\n'); originals.set(fx.ledgerPath, ledgerOriginal);
  await writeFile(fx.ledgerPath, ledgerOriginal, { mode: 0o600, flag: 'wx' });
  const publishCrash = new Error('DETACH_PUBLISH_CRASH'); publishCrash[mod.SIMULATED_PROCESS_CRASH] = true;
  const detachCrash = new Error('ROLLBACK_DETACH_CRASH'); detachCrash[mod.SIMULATED_PROCESS_CRASH] = true;
  try {
    await assert.rejects(mod.__internal.publishExpectedTerminalTransaction({ ...fx, fault(point) {
      if (point === `after-rename:${names[1]}`) throw publishCrash;
    } }), /DETACH_PUBLISH_CRASH/u);
    await assert.rejects(mod.__internal.recoverExpectedTerminalPublication({ ...fx, fault(point) {
      if (point === `after-rollback-detach:${names[1]}`) throw detachCrash;
    } }), /ROLLBACK_DETACH_CRASH/u);
    await mod.__internal.recoverExpectedTerminalPublication(fx);
    for (const [target, bytes] of originals) assert.deepEqual(await readFile(target), bytes);
    assert.equal(existsSync(paths.journalPath), false);
  } finally { await cleanup(fx, mod); }
});

test('durable COMMITTED cleanup failure preserves new targets and resumes cleanup without rollback', async () => {
  const mod = await api(); const fx = await fixture(); const paths = internalPublicationPaths(fx.repositoryRoot);
  const targetPaths = [
    ...names.slice(0, 3).map((name) => path.join(fx.publishDir, name)),
    fx.ledgerPath,
  ];
  const expectedNew = [
    fx.prepared.payloads.get(names[0]),
    fx.prepared.payloads.get(names[1]),
    fx.prepared.manifestBytes,
    fx.prepared.ledgerBytes,
  ];
  const originals = targetPaths.map((target, index) => [target, Buffer.from(`committed-original-${index}\n`)]);
  try {
    for (const [target, bytes] of originals) await writeFile(target, bytes, { mode: 0o600, flag: 'wx' });
    let observed;
    await assert.rejects(mod.__internal.publishExpectedTerminalTransaction({ ...fx, fault(point) {
      if (point === `cleanup:${names[0]}`) throw new Error('COMMITTED_CLEANUP_SENTINEL');
    } }), (error) => { observed = error; return true; });
    const collect = (error, seen = new Set()) => {
      if (!error || seen.has(error)) return [];
      seen.add(error);
      return [String(error), ...collect(error.cause, seen), ...(Array.isArray(error.errors) ? error.errors.flatMap((entry) => collect(entry, seen)) : [])];
    };
    assert.match(collect(observed).join('\n'), /COMMITTED_CLEANUP_SENTINEL/u);
    for (let index = 0; index < targetPaths.length; index += 1) {
      assert.deepEqual(await readFile(targetPaths[index]), expectedNew[index]);
    }
    assert.equal(existsSync(paths.journalPath), true);
    await mod.__internal.recoverExpectedTerminalPublication(fx);
    for (let index = 0; index < targetPaths.length; index += 1) {
      assert.deepEqual(await readFile(targetPaths[index]), expectedNew[index]);
    }
    assert.equal(existsSync(paths.journalPath), false);
    const residue = [...await readdir(fx.publishDir), ...await readdir(path.dirname(fx.ledgerPath))]
      .filter((name) => /midao-(?:temp|backup)-/u.test(name));
    assert.deepEqual(residue, []);
  } finally { await cleanup(fx, mod); }
});

test('COMMITTED target tamper is a HOLD and never rolls back other committed targets', async () => {
  const mod = await api(); const fx = await fixture(); const paths = internalPublicationPaths(fx.repositoryRoot);
  const crash = new Error('COMMITTED_TAMPER_CRASH'); crash[mod.SIMULATED_PROCESS_CRASH] = true;
  const targets = [...names.slice(0, 3).map((name) => path.join(fx.publishDir, name)), fx.ledgerPath];
  try {
    await assert.rejects(mod.__internal.publishExpectedTerminalTransaction({ ...fx, fault(point) {
      if (point === 'after-commit-journal') throw crash;
    } }), /COMMITTED_TAMPER_CRASH/u);
    const untouched = [];
    for (const target of targets.slice(1)) untouched.push({ target, stat: await lstat(target), bytes: await readFile(target) });
    await writeFile(targets[0], 'tampered after commit\n', { mode: 0o600 });
    await assert.rejects(mod.__internal.recoverExpectedTerminalPublication(fx), /committed|HOLD|changed|digest/iu);
    assert.equal(existsSync(paths.journalPath), true);
    for (const snapshot of untouched) {
      const current = await lstat(snapshot.target);
      assert.equal(current.dev, snapshot.stat.dev);
      assert.equal(current.ino, snapshot.stat.ino);
      assert.deepEqual(await readFile(snapshot.target), snapshot.bytes);
    }
  } finally { await cleanup(fx, mod); }
});

test('COMMITTED recovery retains published targets and removes journal and all residue', async () => {
  const mod = await api(); const fx = await fixture(); const paths = internalPublicationPaths(fx.repositoryRoot); const crash = new Error('COMMIT_CRASH'); crash[mod.SIMULATED_PROCESS_CRASH] = true;
  try {
    await assert.rejects(mod.__internal.publishExpectedTerminalTransaction({ ...fx, fault(point) { if (point === 'after-commit-journal') throw crash; } }), /COMMIT_CRASH/u);
    await mod.__internal.recoverExpectedTerminalPublication(fx);
    for (const name of names.slice(0, 3)) assert.equal(existsSync(path.join(fx.publishDir, name)), true);
    assert.equal(existsSync(fx.ledgerPath), true); assert.equal(existsSync(paths.journalPath), false);
    const residue = [...await readdir(fx.publishDir), ...await readdir(path.dirname(fx.ledgerPath))].filter((name) => /midao-(?:temp|backup)-/u.test(name));
    assert.deepEqual(residue, []);
  } finally { await cleanup(fx, mod); }
});

test('COMMITTED semantic recovery closes every pinned target and capture handle', async () => {
  const mod = await api(); const fx = await fixture();
  const crash = new Error('COMMIT_FD_CRASH'); crash[mod.SIMULATED_PROCESS_CRASH] = true;
  try {
    await assert.rejects(mod.__internal.publishExpectedTerminalTransaction({ ...fx, fault(point) { if (point === 'after-commit-journal') throw crash; } }), /COMMIT_FD_CRASH/u);
    const before = (await readdir('/proc/self/fd')).length;
    await mod.__internal.recoverExpectedTerminalPublication(fx);
    const after = (await readdir('/proc/self/fd')).length;
    assert.equal(after, before);
  } finally { await cleanup(fx, mod); }
});

test('COMMITTED recovery revalidates pinned capture ledger identity before cleanup', async () => {
  const mod = await api(); const fx = await fixture(); const paths = internalPublicationPaths(fx.repositoryRoot);
  const crash = new Error('COMMIT_CAPTURE_CRASH'); crash[mod.SIMULATED_PROCESS_CRASH] = true;
  try {
    await assert.rejects(mod.__internal.publishExpectedTerminalTransaction({ ...fx, fault(point) { if (point === 'after-commit-journal') throw crash; } }), /COMMIT_CAPTURE_CRASH/u);
    const sameBytes = await readFile(fx.captureLedgerPath);
    await rm(fx.captureLedgerPath);
    await writeFile(fx.captureLedgerPath, sameBytes, { mode: 0o600, flag: 'wx' });
    sameBytes.fill(0);
    await assert.rejects(mod.__internal.recoverExpectedTerminalPublication(fx), /capture ledger.*identity|HOLD/iu);
    assert.equal(existsSync(paths.journalPath), true);
  } finally { await cleanup(fx, mod); }
});

test('capture ledger is pinned immutable and backups survive until its final recheck', async () => {
  const mod = await api(); const fx = await fixture();
  for (const name of names.slice(0, 3)) await writeFile(path.join(fx.publishDir, name), `old:${name}\n`, { mode: 0o600 });
  await writeFile(fx.ledgerPath, 'old ledger\n', { mode: 0o600 });
  try {
    await assert.rejects(mod.__internal.publishExpectedTerminalTransaction({ ...fx, fault: async (point) => {
      if (point === 'before-capture-final-recheck') {
        const residue = [...await readdir(fx.publishDir), ...await readdir(path.dirname(fx.ledgerPath))].filter((name) => name.includes('.midao-backup-'));
        assert.equal(residue.length, 4);
        await rm(fx.captureLedgerPath); await writeFile(fx.captureLedgerPath, '{"capture":true}\n', { mode: 0o600, flag: 'wx' });
      }
    } }), (error) => /capture ledger.*identity|mutated|HOLD/iu.test(`${error?.message} ${error?.cause?.message}`));
    assert.equal((await readFile(path.join(fx.publishDir, names[0]), 'utf8')), `old:${names[0]}\n`);
  } finally { await cleanup(fx, mod); }
});

test('cleanup errors preserve publication and rollback error chain without leaking FDs', async () => {
  const mod = await api(); const fx = await fixture();
  const flatten = (error, seen = new Set()) => {
    if (!error || seen.has(error)) return [];
    seen.add(error);
    return [String(error), ...flatten(error.cause, seen), ...(Array.isArray(error.errors) ? error.errors.flatMap((entry) => flatten(entry, seen)) : [])];
  };
  try {
    const before = (await readdir('/proc/self/fd')).length;
    let observed;
    await assert.rejects(mod.__internal.publishExpectedTerminalTransaction({ ...fx, fault(point) {
      if (point === `after-rename:${names[1]}`) throw new Error('PRIMARY_SENTINEL');
      if (point === `after-rollback:${names[0]}`) throw new Error('ROLLBACK_SENTINEL');
      if (point === 'cleanup:capture-handle') throw new Error('CLEANUP_SENTINEL');
    } }), (error) => { observed = error; return true; });
    const messages = flatten(observed).join('\n');
    assert.match(messages, /PRIMARY_SENTINEL/u);
    assert.match(messages, /ROLLBACK_SENTINEL/u);
    assert.match(messages, /CLEANUP_SENTINEL/u);
    assert.equal((await readdir('/proc/self/fd')).length, before);
  } finally { await cleanup(fx, mod); }
});
