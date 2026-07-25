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
  'schemas', 'relations', 'sequences', 'columns', 'types', 'constraints', 'indexes', 'routines', 'triggers',
  'rls', 'policies', 'acl', 'owners', 'defaultPrivileges', 'extensions', 'extensionMemberships',
  'publicationMembership', 'managedSchemaInventory', 'managedSchemaOverlays',
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
  assert.equal(valid.ownershipOverlayStatus, 'pending');
  assert.deepEqual(valid.sections.managedSchemaOverlays, []);
  const collisionSafe = structuredClone(valid);
  collisionSafe.sections.relations = [
    { canonicalKey: ['relation', 'a.b', 'c'] },
    { canonicalKey: ['relation', 'a', 'b.c'] },
  ];
  assert.equal(validateRawCatalog(collisionSafe), collisionSafe);
  const ambiguousString = structuredClone(valid);
  ambiguousString.sections.relations = [{ canonicalKey: 'relation:a.b.c' }];
  assert.throws(() => validateRawCatalog(ambiguousString), /canonical key.*array/iu);
  const missing = structuredClone(valid);
  delete missing.sections.acl;
  assert.throws(() => validateRawCatalog(missing), /missing section.*acl/iu);
  const unknown = structuredClone(valid);
  unknown.sections.unknown = [];
  assert.throws(() => validateRawCatalog(unknown), /unknown section/iu);
  const duplicate = structuredClone(valid);
  duplicate.sections.relations.push({ ...duplicate.sections.relations[0] });
  assert.throws(() => validateRawCatalog(duplicate), /duplicate canonical key/iu);
  const unauthorizedOverlay = structuredClone(valid);
  unauthorizedOverlay.sections.managedSchemaOverlays = [{ canonicalKey: ['managed_schema_overlay', 'policy', 'auth', 'users', 'p'] }];
  assert.throws(() => validateRawCatalog(unauthorizedOverlay), /overlays.*pending|pending.*overlays/iu);
  assert.throws(() => validateRawCatalog({ ...valid, transactionReadOnly: false }), /read.only/iu);
  assert.throws(() => validateRawCatalog({ ...valid, extractorVersion: 2 }), /extractor version/iu);
});

test('fixed SQL starts and reads back read-only mode and covers the full pg_catalog matrix', async () => {
  await moduleUnderTest();
  const sql = await readFile(sqlPath, 'utf8');
  assert.match(sql, /BEGIN\s+TRANSACTION\s+ISOLATION\s+LEVEL\s+REPEATABLE\s+READ\s+READ\s+ONLY\s*;/iu);
  assert.match(sql, /current_setting\s*\(\s*'transaction_read_only'/iu);
  for (const token of [
    'pg_namespace', 'pg_class', 'pg_attribute', 'pg_type', 'pg_constraint', 'pg_index',
    'pg_proc', 'pg_trigger', 'pg_policy', 'pg_sequence', 'aclexplode', 'pg_default_acl', 'pg_extension',
    'pg_depend', 'pg_identify_object', 'pg_publication_rel',
  ]) assert.match(sql, new RegExp(`\\b${token}\\b`, 'u'), `SQL missing ${token}`);
  for (const section of sectionNames) assert.match(sql, new RegExp(`'${section}'`, 'u'), `SQL missing section ${section}`);
  assert.match(sql, /CASE\s+WHEN\s+(?:role_id|a\.grantee)\s*=\s*0\s+THEN\s+'PUBLIC'/iu);
  assert.match(sql, /p\.prokind\s+IN\s*\(\s*'f'\s*,\s*'p'\s*,\s*'w'\s*\)/iu);
  assert.match(sql, /CASE\s+WHEN\s+c\.relkind\s*=\s*'S'\s+THEN\s+'s'::"char"\s+ELSE\s+'r'::"char"\s+END/u, 'acldefault sequence code must be lowercase s, not default-ACL uppercase S');
  assert.match(sql, /con\.contypid/iu);
  assert.match(sql, /UNION\s+ALL\s+SELECT\s+'rls'\s*,\s*item\s+FROM\s+rls_rows/iu);
  assert.match(sql, /'managedSchemaOverlays'\s*,\s*'\[\]'::jsonb/iu);
  assert.doesNotMatch(sql, /pg_stat|last_(?:analyze|vacuum)|n_live_tup|sequence.*last_value/iu);
});

test('extractor accepts one JSON document, bounds output, and always removes runner HOME', async () => {
  const { extractCatalog, parseCatalogChildResult } = await moduleUnderTest();
  const text = await readFile(fixturePath, 'utf8');
  const parsedFromContainer = parseCatalogChildResult({
    code: 0, signal: null, stdout: Buffer.from(`${text.trim()}\n`), stderr: Buffer.alloc(0),
  });
  assert.deepEqual(parsedFromContainer.sections.schemas[0].canonicalKey, ['schema', 'public']);
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
  assert.deepEqual(result.sections.schemas[0].canonicalKey, ['schema', 'public']);
  assert.ok(captured.args.includes('-X'));
  await assert.rejects(() => access(home), /ENOENT/iu);
  await assert.rejects(() => extractCatalog({
    psqlPath: '/usr/bin/psql', sqlPath,
    connectionEnv: { PGHOST: 'h', PGPORT: '5432', PGDATABASE: 'd', PGUSER: 'u', PGPASSWORD: 'p', PGSSLMODE: 'verify-full' },
    runChild: async () => ({ code: 0, signal: null, stdout: '{}\n{}\n', stderr: '' }),
  }), /one JSON document|catalog/iu);
  const duplicateJsonKey = text.trim().replace('"schemaVersion": 1,', '"schemaVersion": 1, "schemaVersion": 1,');
  await assert.rejects(() => extractCatalog({
    psqlPath: '/usr/bin/psql', sqlPath,
    connectionEnv: { PGHOST: 'h', PGPORT: '5432', PGDATABASE: 'd', PGUSER: 'u', PGPASSWORD: 'p', PGSSLMODE: 'verify-full' },
    runChild: async () => ({ code: 0, signal: null, stdout: `${duplicateJsonKey}\n`, stderr: '' }),
  }), /duplicate JSON key/iu);
  await assert.rejects(() => extractCatalog({
    psqlPath: '/usr/bin/psql', sqlPath,
    connectionEnv: { PGHOST: 'h', PGPORT: '5432', PGDATABASE: 'd', PGUSER: 'u', PGPASSWORD: 'p', PGSSLMODE: 'verify-full' },
    runChild: async () => ({ code: 0, signal: null, stdout: ` ${text.trim()}\n`, stderr: '' }),
  }), /one JSON document|terminal LF/iu);
});
