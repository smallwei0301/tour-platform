#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import {
  lstat,
  mkdtemp,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_MIGRATIONS_DIR = 'supabase/migrations';
const DEFAULT_OUTPUT = 'supabase/baselines/v1/frozen-migrations.sha256';
const DEFAULT_CUTOFF = '20260723000000_midao_backend_mode.sql';
export const DEFAULT_EXPECTED_COUNT = 130;
const HASH = /^[0-9a-f]{64}$/;
const SAFE_SQL_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]*\.sql$/;

function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertRelativeRepoPath(value, expected, label) {
  if (value !== expected || path.isAbsolute(value) || value.includes('..') || value.includes('\\')) {
    throw new Error(`${label} path invalid`);
  }
}

async function assertDirectory(pathname, label) {
  const info = await lstat(pathname);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`${label} must be a real directory`);
  if (await realpath(pathname) !== path.resolve(pathname)) throw new Error(`${label} realpath mismatch`);
}

async function readRegularFileNoFollow(pathname, label) {
  let handle;
  try {
    handle = await open(pathname, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    throw new Error(`${label} symlink or missing file rejected`, { cause: error });
  }
  try {
    const before = await handle.stat();
    if (!before.isFile()) throw new Error(`${label} must be a regular file`);
    if (before.nlink !== 1) throw new Error(`${label} hardlink nlink must equal 1`);
    const bytes = await handle.readFile();
    const after = await handle.stat();
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
      throw new Error(`${label} changed during read`);
    }
    return bytes;
  } finally {
    await handle.close();
  }
}

function validateOptions(options) {
  const repoRoot = path.resolve(options.repoRoot);
  const migrationsDir = options.migrationsDir ?? DEFAULT_MIGRATIONS_DIR;
  const cutoffName = options.cutoffName ?? DEFAULT_CUTOFF;
  const expectedCount = options.expectedCount ?? DEFAULT_EXPECTED_COUNT;
  assertRelativeRepoPath(migrationsDir, DEFAULT_MIGRATIONS_DIR, 'migrations');
  if (!SAFE_SQL_NAME.test(cutoffName) || cutoffName.endsWith('.rollback.sql')) throw new Error('cutoff filename invalid');
  if (!Number.isSafeInteger(expectedCount) || expectedCount < 1) throw new Error('expected count invalid');
  return { repoRoot, migrationsDir, cutoffName, expectedCount };
}

export async function collectFrozenMigrations(options) {
  const config = validateOptions(options);
  const directory = path.resolve(config.repoRoot, config.migrationsDir);
  await assertDirectory(config.repoRoot, 'repo root');
  await assertDirectory(path.resolve(config.repoRoot, 'supabase'), 'supabase');
  await assertDirectory(directory, 'migrations');

  const cutoffPath = path.resolve(directory, config.cutoffName);
  await readRegularFileNoFollow(cutoffPath, 'cutoff migration');

  const directoryEntries = await readdir(directory, { withFileTypes: true });
  const filenames = directoryEntries
    .map((entry) => entry.name)
    .filter((name) => SAFE_SQL_NAME.test(name))
    .filter((name) => !name.endsWith('.rollback.sql'))
    .filter((name) => name < config.cutoffName)
    .sort(compareCodeUnits);

  if (filenames.length !== config.expectedCount) {
    throw new Error(`frozen migration count mismatch: expected ${config.expectedCount}, received ${filenames.length}; unexpected backdated or missing migration`);
  }
  if (new Set(filenames).size !== filenames.length) throw new Error('duplicate frozen migration filename');

  const entries = [];
  for (const filename of filenames) {
    const bytes = await readRegularFileNoFollow(path.resolve(directory, filename), `migration ${filename}`);
    entries.push({
      filename,
      path: `${DEFAULT_MIGRATIONS_DIR}/${filename}`,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
  }
  return entries;
}

export function renderFrozenManifest(entries) {
  if (!Array.isArray(entries) || entries.length === 0) throw new Error('manifest entries required');
  let previous = '';
  const seen = new Set();
  const lines = entries.map((entry) => {
    if (!SAFE_SQL_NAME.test(entry?.filename ?? '') || entry.filename.endsWith('.rollback.sql')) throw new Error('manifest filename invalid');
    if (!HASH.test(entry?.sha256 ?? '')) throw new Error('manifest hash invalid');
    if (entry.path !== `${DEFAULT_MIGRATIONS_DIR}/${entry.filename}`) throw new Error('manifest path invalid');
    if (seen.has(entry.filename)) throw new Error('duplicate manifest filename');
    if (previous && compareCodeUnits(entry.filename, previous) <= 0) throw new Error('manifest order invalid');
    seen.add(entry.filename);
    previous = entry.filename;
    return `${entry.sha256}  ${entry.path}`;
  });
  return `${lines.join('\n')}\n`;
}

export function parseFrozenManifest(manifestText) {
  if (typeof manifestText !== 'string' || !manifestText.endsWith('\n') || manifestText.includes('\r') || manifestText.includes('\0')) {
    throw new Error('manifest format invalid');
  }
  const lines = manifestText.slice(0, -1).split('\n');
  if (lines.length === 0 || lines.some((line) => line.length === 0)) throw new Error('manifest format invalid');
  const entries = [];
  const seen = new Set();
  let previous = '';
  for (const line of lines) {
    const match = /^([0-9a-f]{64})  (supabase\/migrations\/([^/]+\.sql))$/u.exec(line);
    if (!match) throw new Error(line.includes('..') ? 'manifest path invalid' : 'manifest format invalid');
    const [, sha256, manifestPath, filename] = match;
    if (!SAFE_SQL_NAME.test(filename) || filename.endsWith('.rollback.sql')) throw new Error('manifest path invalid');
    if (seen.has(filename)) throw new Error('duplicate manifest filename');
    if (previous && compareCodeUnits(filename, previous) <= 0) throw new Error('manifest order invalid');
    seen.add(filename);
    previous = filename;
    entries.push({ filename, path: manifestPath, sha256 });
  }
  return entries;
}

export async function verifyFrozenManifest(options) {
  const config = validateOptions(options);
  const published = parseFrozenManifest(options.manifestText);
  if (published.length !== config.expectedCount) throw new Error('manifest count mismatch');
  const current = await collectFrozenMigrations(config);
  for (let index = 0; index < current.length; index += 1) {
    if (published[index]?.filename !== current[index].filename) {
      throw new Error(`manifest missing or unexpected migration at index ${index}`);
    }
    if (published[index].path !== current[index].path || published[index].sha256 !== current[index].sha256) {
      throw new Error(`migration byte drift: ${current[index].filename}`);
    }
  }
  return current;
}

async function atomicWrite(outputPath, content) {
  const parent = path.dirname(outputPath);
  await assertDirectory(parent, 'manifest output directory');
  const tempRoot = await mkdtemp(path.resolve(parent, '.frozen-manifest-'));
  const temporary = path.resolve(tempRoot, 'manifest.tmp');
  try {
    const handle = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    try {
      await handle.writeFile(content, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, outputPath);
    const readBack = await readRegularFileNoFollow(outputPath, 'published manifest');
    if (readBack.toString('utf8') !== content) throw new Error('published manifest read-back mismatch');
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

function parseArgs(argv) {
  const options = {
    repoRoot: process.cwd(),
    migrationsDir: DEFAULT_MIGRATIONS_DIR,
    cutoffName: DEFAULT_CUTOFF,
    expectedCount: DEFAULT_EXPECTED_COUNT,
    output: DEFAULT_OUTPUT,
    check: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--check') options.check = true;
    else if (argument === '--output') options.output = argv[++index];
    else if (argument === '--migrations-dir') options.migrationsDir = argv[++index];
    else if (argument === '--cutoff-name') options.cutoffName = argv[++index];
    else if (argument === '--expected-count') options.expectedCount = Number(argv[++index]);
    else throw new Error(`unknown argument: ${argument}`);
  }
  assertRelativeRepoPath(options.output, DEFAULT_OUTPUT, 'output');
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const outputPath = path.resolve(options.repoRoot, options.output);
  if (options.check) {
    const manifestText = (await readRegularFileNoFollow(outputPath, 'published manifest')).toString('utf8');
    await verifyFrozenManifest({ ...options, manifestText });
    return;
  }
  const entries = await collectFrozenMigrations(options);
  const manifestText = renderFrozenManifest(entries);
  await atomicWrite(outputPath, manifestText);
  await verifyFrozenManifest({ ...options, manifestText });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`frozen migration manifest: ${error instanceof Error ? error.message : 'unknown error'}\n`);
    process.exitCode = 1;
  });
}

export const __internal = {
  DEFAULT_CUTOFF,
  DEFAULT_EXPECTED_COUNT,
  DEFAULT_MIGRATIONS_DIR,
  DEFAULT_OUTPUT,
  readRegularFileNoFollow,
};
