import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../..');
const extractorPath = path.join(repoRoot, 'scripts/database-baseline/extract-catalog.mjs');
const sqlPath = path.join(repoRoot, 'scripts/database-baseline/catalog-queries.sql');
const fixturePath = path.join(here, '../fixtures/database-baseline/catalog-minimal.json');
const sectionNames = [
  'schemas', 'relations', 'columns', 'types', 'constraints', 'indexes', 'routines', 'triggers',
  'rls', 'policies', 'acl', 'owners', 'defaultPrivileges', 'extensions',
  'publicationMembership', 'managedSchemaOverlays',
];

async function moduleUnderTest() {
  assert.equal(existsSync(extractorPath), true, 'catalog extractor missing');
  return import(`${pathToFileURL(extractorPath).href}?t=${Date.now()}`);
}

async function fixture() {
  return JSON.parse(await readFile(fixturePath, 'utf8'));
}

test('catalog extractor and fixed SQL exist', async () => {
  await moduleUnderTest();
  assert.equal(existsSync(sqlPath), true, 'fixed catalog SQL missing');
});

test('psql invocation is absolute fixed read-only and ignores all ambient process env', async () => {
  const { buildPsqlInvocation, FIXED_PSQL, FIXED_SQL } = await moduleUnderTest();
  const original = { ...process.env };
  Object.assign(process.env, {
    HOME: '/hostile/home', PATH: '/hostile/bin', DATABASE_URL: 'postgres://hostile',
    PGOPTIONS: '-c default_transaction_read_only=off', PGSERVICE: 'hostile',
    PGSERVICEFILE: '/hostile/service', PGPASSFILE: '/hostile/pass', PGHOST: 'hostile',
  });
  try {
    const invocation = buildPsqlInvocation({
      psqlPath: '/usr/bin/psql',
      sqlPath,
      home: '/runner/empty-home',
      connectionEnv: {
        PGHOST: 'db.example.invalid', PGPORT: '5432', PGDATABASE: 'postgres',
        PGUSER: 'readonly', PGPASSWORD: '[REDACTED]', PGSSLMODE: 'verify-full',
      },
    });
    assert.equal(FIXED_PSQL, '/usr/bin/psql');
    assert.equal(FIXED_SQL, sqlPath);
    assert.equal(invocation.executable, '/usr/bin/psql');
    assert.deepEqual(invocation.args, ['-X', '--set=ON_ERROR_STOP=1', '--quiet', '--tuples-only', '--no-align', '--file', sqlPath]);
    assert.deepEqual(Object.keys(invocation.env).sort(), [
      'HOME', 'LANG', 'LC_ALL', 'PGDATABASE', 'PGHOST', 'PGOPTIONS', 'PGPASSWORD',
      'PGPORT', 'PGSSLMODE', 'PGUSER',
    ]);
    assert.equal(invocation.env.HOME, '/runner/empty-home');
    assert.equal(invocation.env.PGOPTIONS, '-c default_transaction_read_only=on');
    assert.equal(invocation.env.PGSERVICE, undefined);
    assert.equal(invocation.env.PGPASSFILE, undefined);
    assert.equal(invocation.env.PATH, undefined);
    assert.equal(invocation.env.DATABASE_URL, undefined);
  } finally {
    process.env = original;
  }
});

test('hostile paths env keys and caller SQL are refused before spawn', async () => {
  const { buildPsqlInvocation } = await moduleUnderTest();
  const base = {
    psqlPath: '/usr/bin/psql', sqlPath, home: '/runner/home',
    connectionEnv: { PGHOST: 'host', PGPORT: '5432', PGDATABASE: 'db', PGUSER: 'user', PGPASSWORD: 'secret', PGSSLMODE: 'verify-full' },
  };
  assert.throws(() => buildPsqlInvocation({ ...base, psqlPath: '/usr/local/bin/psql' }), /psql path/iu);
  assert.throws(() => buildPsqlInvocation({ ...base, sqlPath: '/tmp/hostile.sql' }), /SQL path/iu);
  assert.throws(() => buildPsqlInvocation({ ...base, callerSql: 'DROP TABLE x' }), /unexpected option|caller SQL/iu);
  for (const key of ['PGOPTIONS', 'PGSERVICE', 'PGSERVICEFILE', 'PGPASSFILE', 'DATABASE_URL', 'PATH', 'HOME']) {
    assert.throws(() => buildPsqlInvocation({ ...base, connectionEnv: { ...base.connectionEnv, [key]: 'hostile' } }), new RegExp(key, 'iu'));
  }
});

test('raw catalog requires every exact section and rejects duplicate canonical keys', async () => {
  const { CATALOG_SECTIONS, validateRawCatalog } = await moduleUnderTest();
  const valid = await fixture();
  assert.deepEqual(CATALOG_SECTIONS, sectionNames);
  assert.equal(validateRawCatalog(valid), valid);
  const missing = structuredClone(valid);
  delete missing.sections.acl;
  assert.throws(() => validateRawCatalog(missing), /missing section.*acl/iu);
  const unknown = structuredClone(valid);
  unknown.sections.unknown = [];
  assert.throws(() => validateRawCatalog(unknown), /unknown section/iu);
  const duplicate = structuredClone(valid);
  duplicate.sections.relations.push({ ...duplicate.sections.relations[0] });
  assert.throws(() => validateRawCatalog(duplicate), /duplicate canonical key/iu);
  assert.throws(() => validateRawCatalog({ ...valid, transactionReadOnly: false }), /read.only/iu);
  assert.throws(() => validateRawCatalog({ ...valid, extractorVersion: 2 }), /extractor version/iu);
});

test('fixed SQL starts and reads back read-only mode and covers the full pg_catalog matrix', async () => {
  await moduleUnderTest();
  const sql = await readFile(sqlPath, 'utf8');
  assert.match(sql, /BEGIN\s+READ\s+ONLY\s*;/iu);
  assert.match(sql, /current_setting\s*\(\s*'transaction_read_only'/iu);
  for (const token of [
    'pg_namespace', 'pg_class', 'pg_attribute', 'pg_type', 'pg_constraint', 'pg_index',
    'pg_proc', 'pg_trigger', 'pg_policy', 'aclexplode', 'pg_default_acl', 'pg_extension',
    'pg_publication_rel',
  ]) assert.match(sql, new RegExp(`\\b${token}\\b`, 'u'), `SQL missing ${token}`);
  for (const section of sectionNames) assert.match(sql, new RegExp(`'${section}'`, 'u'), `SQL missing section ${section}`);
  assert.doesNotMatch(sql, /pg_stat|last_(?:analyze|vacuum)|n_live_tup|sequence.*last_value/iu);
});

test('extractor accepts one JSON document, bounds output, and always removes runner HOME', async () => {
  const { extractCatalog } = await moduleUnderTest();
  const text = await readFile(fixturePath, 'utf8');
  let captured;
  let home;
  const result = await extractCatalog({
    psqlPath: '/usr/bin/psql',
    sqlPath,
    connectionEnv: { PGHOST: 'host', PGPORT: '5432', PGDATABASE: 'db', PGUSER: 'user', PGPASSWORD: 'secret', PGSSLMODE: 'verify-full' },
    runChild: async (invocation) => {
      captured = invocation;
      home = invocation.env.HOME;
      await writeFile(path.join(home, '.psqlrc'), '\\set ON_ERROR_STOP off\n');
      return { code: 0, signal: null, stdout: `${text.trim()}\n`, stderr: '' };
    },
  });
  assert.equal(result.sections.schemas[0].canonicalKey, 'schema:public');
  assert.ok(captured.args.includes('-X'));
  await assert.rejects(() => access(home), /ENOENT/iu);
  await assert.rejects(() => extractCatalog({
    psqlPath: '/usr/bin/psql', sqlPath,
    connectionEnv: { PGHOST: 'h', PGPORT: '5432', PGDATABASE: 'd', PGUSER: 'u', PGPASSWORD: 'p', PGSSLMODE: 'verify-full' },
    runChild: async () => ({ code: 0, signal: null, stdout: '{}\n{}\n', stderr: '' }),
  }), /one JSON document|catalog/iu);
});
