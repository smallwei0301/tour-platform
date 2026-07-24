#!/usr/bin/env node
import { chmod, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
export const FIXED_PSQL = '/usr/bin/psql';
export const FIXED_SQL = path.join(scriptDirectory, 'catalog-queries.sql');
export const CATALOG_SECTIONS = Object.freeze([
  'schemas', 'relations', 'columns', 'types', 'constraints', 'indexes', 'routines', 'triggers',
  'rls', 'policies', 'acl', 'owners', 'defaultPrivileges', 'extensions',
  'publicationMembership', 'managedSchemaOverlays',
]);
const ALLOWED_CONNECTION_ENV = new Set([
  'PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD', 'PGSSLMODE', 'PGSSLROOTCERT',
]);
const REQUIRED_CONNECTION_ENV = ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD', 'PGSSLMODE'];
const TOP_LEVEL_KEYS = ['schemaVersion', 'extractorVersion', 'serverVersionNum', 'transactionReadOnly', 'sections'];
const OUTPUT_LIMIT = 16 * 1024 * 1024;

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const actual = Object.keys(value);
  const extra = actual.filter((key) => !expected.includes(key));
  const missing = expected.filter((key) => !actual.includes(key));
  if (extra.length) throw new Error(`${label} unexpected option or key: ${extra[0]}`);
  if (missing.length) throw new Error(`${label} missing key: ${missing[0]}`);
}

function validateScalar(value, key) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0') || value.includes('\n') || value.includes('\r')) {
    throw new Error(`${key} invalid`);
  }
}

export function buildPsqlInvocation(options) {
  exactKeys(options, ['psqlPath', 'sqlPath', 'home', 'connectionEnv'], 'extractor options');
  const { psqlPath, sqlPath, home, connectionEnv } = options;
  if (psqlPath !== FIXED_PSQL || !path.isAbsolute(psqlPath)) throw new Error('psql path substitution refused');
  if (path.resolve(sqlPath) !== FIXED_SQL) throw new Error('SQL path substitution refused');
  if (!path.isAbsolute(home)) throw new Error('runner HOME must be absolute');
  if (!connectionEnv || typeof connectionEnv !== 'object' || Array.isArray(connectionEnv)) throw new Error('connection env invalid');
  for (const key of Object.keys(connectionEnv)) {
    if (!ALLOWED_CONNECTION_ENV.has(key)) throw new Error(`${key} is not allowed in connection env`);
    validateScalar(connectionEnv[key], key);
  }
  for (const key of REQUIRED_CONNECTION_ENV) {
    if (!(key in connectionEnv)) throw new Error(`connection env missing ${key}`);
  }
  if (!/^\d{1,5}$/.test(connectionEnv.PGPORT) || Number(connectionEnv.PGPORT) < 1 || Number(connectionEnv.PGPORT) > 65535) {
    throw new Error('PGPORT invalid');
  }
  return {
    executable: FIXED_PSQL,
    args: ['-X', '--set=ON_ERROR_STOP=1', '--quiet', '--tuples-only', '--no-align', '--file', FIXED_SQL],
    env: {
      HOME: home,
      LANG: 'C',
      LC_ALL: 'C',
      ...connectionEnv,
      PGOPTIONS: '-c default_transaction_read_only=on',
    },
  };
}

export function validateRawCatalog(catalog) {
  exactKeys(catalog, TOP_LEVEL_KEYS, 'catalog');
  if (catalog.schemaVersion !== 1) throw new Error('catalog schema version mismatch');
  if (catalog.extractorVersion !== 1) throw new Error('catalog extractor version mismatch');
  if (!Number.isInteger(catalog.serverVersionNum) || catalog.serverVersionNum < 170000 || catalog.serverVersionNum >= 180000) {
    throw new Error('catalog requires PostgreSQL major 17');
  }
  if (catalog.transactionReadOnly !== true) throw new Error('catalog connection was not read-only');
  if (!catalog.sections || typeof catalog.sections !== 'object' || Array.isArray(catalog.sections)) throw new Error('catalog sections invalid');
  for (const section of Object.keys(catalog.sections)) {
    if (!CATALOG_SECTIONS.includes(section)) throw new Error(`unknown section: ${section}`);
  }
  for (const section of CATALOG_SECTIONS) {
    if (!(section in catalog.sections)) throw new Error(`missing section: ${section}`);
    const entries = catalog.sections[section];
    if (!Array.isArray(entries)) throw new Error(`section ${section} must be an array`);
    const seen = new Set();
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`section ${section} entry invalid`);
      if (typeof entry.canonicalKey !== 'string' || entry.canonicalKey.length === 0) throw new Error(`section ${section} canonical key invalid`);
      if (seen.has(entry.canonicalKey)) throw new Error(`duplicate canonical key in ${section}: ${entry.canonicalKey}`);
      seen.add(entry.canonicalKey);
    }
  }
  return catalog;
}

async function defaultRunChild(invocation, { timeoutMs = 60_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(invocation.executable, invocation.args, {
      env: invocation.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout = [];
    const stderr = [];
    let size = 0;
    let timedOut = false;
    let overflow = false;
    let killTimer;
    const terminate = () => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      child.kill('SIGTERM');
      if (!killTimer) killTimer = setTimeout(() => child.kill('SIGKILL'), 2_000);
    };
    const collect = (target) => (chunk) => {
      size += chunk.length;
      if (size > OUTPUT_LIMIT) {
        overflow = true;
        terminate();
      } else target.push(chunk);
    };
    child.stdout.on('data', collect(stdout));
    child.stderr.on('data', collect(stderr));
    const timer = setTimeout(() => { timedOut = true; terminate(); }, timeoutMs);
    child.once('error', (error) => { clearTimeout(timer); if (killTimer) clearTimeout(killTimer); reject(error); });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      if (timedOut) reject(new Error(`catalog extractor timeout after ${timeoutMs}ms`));
      else if (overflow) reject(new Error('catalog extractor output exceeded limit'));
      else resolve({ code, signal, stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8') });
    });
  });
}

export async function extractCatalog({
  psqlPath = FIXED_PSQL,
  sqlPath = FIXED_SQL,
  connectionEnv,
  runChild = defaultRunChild,
  timeoutMs = 60_000,
} = {}) {
  const home = await mkdtemp(path.join(tmpdir(), 'midao-catalog-home-'));
  await chmod(home, 0o700);
  try {
    const invocation = buildPsqlInvocation({ psqlPath, sqlPath, home, connectionEnv });
    const result = await runChild(invocation, { timeoutMs });
    if (!result || result.code !== 0 || result.signal !== null) throw new Error('catalog psql child failed');
    if (typeof result.stdout !== 'string' || Buffer.byteLength(result.stdout) > OUTPUT_LIMIT) throw new Error('catalog extractor output exceeded limit');
    if (typeof result.stderr !== 'string' || result.stderr.length !== 0) throw new Error('catalog psql emitted unexpected stderr');
    let parsed;
    try {
      parsed = JSON.parse(result.stdout.trim());
    } catch {
      throw new Error('catalog must contain exactly one JSON document');
    }
    return validateRawCatalog(parsed);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}
