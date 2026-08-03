import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../..');
const verifierPath = path.join(root, 'scripts/database-baseline/verify-manifest.mjs');
const preparerPath = path.join(root, 'scripts/database-baseline/prepare-capture-publication.mjs');
const schemaDir = path.join(root, 'scripts/database-baseline/schemas');
const schemaNames = ['capture-manifest.schema.json', 'baseline-manifest.schema.json', 'baseline-ledger.schema.json'];
const payloadPaths = [
  'baseline.sql', 'managed-overlays.sql', 'catalog.cutoff.normalized.json', 'toc.normalized.json',
  'use-list.txt', 'toc-ownership-map.json', 'dependency-closure.json', 'role-map.json',
  'ownership-boundary.json', 'exclusions.json', 'platform-prerequisites.json', 'security-drift.json',
  'catalog-cutoff.sha256',
];

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const canonical = (value) => `${JSON.stringify(value)}\n`;

async function subject() {
  assert.ok(existsSync(verifierPath), 'verify-manifest.mjs missing');
  return import(`${pathToFileURL(verifierPath).href}?t=${Date.now()}`);
}

function manifestFor(digests) {
  return {
    schemaVersion: 1,
    kind: 'midao-baseline-capture',
    transactionId: 'a'.repeat(64),
    payloadDigests: digests,
    capture: {
      count: 2,
      catalogSha256: digests['catalog.cutoff.normalized.json'],
      tocSha256: digests['toc.normalized.json'],
      renderedBaselineSha256: digests['baseline.sql'],
      renderedOverlaySha256: digests['managed-overlays.sql'],
    },
    toolchain: {
      supabaseCliVersion: '2.87.2',
      dumpSchemaSourceSha256: '5cd57189f6565ddf651ff149995398a4c9b1971ca34a0093a77c011a41f21d64',
      postgresMajor: 17,
      postgresImage: 'postgres@sha256:0027bef26712baaee437a4ea48fdf3d2d2e2bc5f0d81615374408ca320f3c7e3',
    },
    assertions: { catalogEquivalent: true, securityPolicyStatus: 'known_drift', secretScan: 'pass', dataScan: 'pass' },
  };
}

function buildKnownDriftCatalogFixture() {
  const acl = [];
  const rls = [];
  for (let index = 0; index < 59; index += 1) {
    const table = `table_${String(index).padStart(2, '0')}`;
    acl.push({
      canonicalKey: ['acl', 'relation', 'public', table, 'postgres', 'authenticated', 'UPDATE', false],
      objectType: 'relation', schema: 'public', object: table, grantor: 'postgres', grantee: 'authenticated',
      privilege: 'UPDATE', grantable: false, usesDefaultAcl: false,
    });
    rls.push({ canonicalKey: ['rls', 'public', table], schema: 'public', relation: table, enabled: true, forced: false });
  }
  const sectionNames = [
    'schemas', 'relations', 'sequences', 'columns', 'types', 'constraints', 'indexes', 'routines', 'triggers',
    'rls', 'policies', 'acl', 'owners', 'defaultPrivileges', 'extensions', 'extensionMemberships',
    'publicationMembership', 'managedSchemaInventory', 'managedSchemaOverlays',
  ];
  const sections = Object.fromEntries(sectionNames.map((name) => [name, []]));
  sections.acl = acl;
  sections.rls = rls;
  return Buffer.from(`${JSON.stringify({
    schemaVersion: 1, normalizerVersion: 1, extractorVersion: 1, serverMajorVersion: 17,
    ownershipOverlayStatus: 'pending', sections,
  }, null, 2)}\n`);
}

function buildReviewedPublicationFixture(catalog) {
  const catalogValue = JSON.parse(catalog.toString('utf8'));
  const roles = [{ name: 'application-owner', ownerDomain: 'application' }];
  const assignments = [];
  const tocEntries = [];
  const tocLines = [];
  let tocId = 1;
  for (const [section, rows] of Object.entries(catalogValue.sections)) {
    for (const row of rows) {
      assignments.push({
        objectKey: row.canonicalKey, section, ownerDomain: 'application', role: 'application-owner',
        dependsOn: [], rationale: 'reviewed fixture assignment',
      });
      if (section === 'acl') {
        tocEntries.push({ tocId, objectKey: row.canonicalKey, ownerDomain: 'application' });
        tocLines.push(`${tocId}; 0 0 ACL public TABLE ${row.object} postgres`);
        tocId += 1;
      }
    }
  }
  const normalizedToc = tocLines.map((line) => {
    const match = /^(\d+); (\d+) (\d+) ACL public (.+) postgres$/u.exec(line);
    return {
      tocId: Number(match[1]), catalogOid: Number(match[2]), objectOid: Number(match[3]),
      descriptor: 'ACL', schema: 'public', identity: match[4], owner: 'postgres',
    };
  });
  const expectedTocIds = tocEntries.map((entry) => entry.tocId);
  const entryDigest = '1'.repeat(64);
  return {
    reviewedOwnership: {
      templateOnly: false,
      ownershipBoundary: { schemaVersion: 1, status: 'reviewed', assignments },
      roleMap: { schemaVersion: 1, roles },
      exclusions: { schemaVersion: 1, entries: [] },
      platformPrerequisites: { schemaVersion: 1, objects: [] },
      tocOwnershipMap: { schemaVersion: 1, expectedTocIds, entries: tocEntries },
    },
    renderResult: {
      baselineSql: Buffer.from('CREATE SCHEMA IF NOT EXISTS public;\n'),
      managedOverlaysSql: Buffer.alloc(0),
      tocNormalized: Buffer.from(canonical(normalizedToc)),
      useList: Buffer.from(`${tocLines.join('\n')}\n`),
      dependencyClosure: tocEntries.map((entry) => ({
        tocId: entry.tocId, objectKey: entry.objectKey, destination: 'baseline.sql',
        directDependencies: [], transitiveDependencies: [],
        captureASha256: entryDigest, captureBSha256: entryDigest,
      })),
    },
  };
}

async function fixture() {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'midao-manifest-'));
  await chmod(parent, 0o700);
  const baselineDir = path.join(parent, 'v1');
  const docsDir = path.join(parent, 'docs');
  await mkdir(baselineDir, { mode: 0o700 });
  await mkdir(docsDir, { mode: 0o700 });
  const { composeCapturePublicationPayloads } = await import(`${pathToFileURL(preparerPath).href}?t=${Date.now()}`);
  const catalog = buildKnownDriftCatalogFixture();
  const publication = buildReviewedPublicationFixture(catalog);
  const prepared = composeCapturePublicationPayloads({
    catalogBuffers: [catalog, Buffer.from(catalog)], ...publication,
    randomBytes: (size) => Buffer.alloc(size, 0xaa),
  });
  for (const relative of payloadPaths) {
    await writeFile(path.join(baselineDir, relative), prepared.payloads.get(relative), { mode: 0o600, flag: 'wx' });
  }
  const manifest = structuredClone(prepared.manifest);
  const digests = structuredClone(prepared.payloadDigests);
  const manifestBytes = Buffer.from(canonical(manifest));
  await writeFile(path.join(baselineDir, 'capture-manifest.json'), manifestBytes, { mode: 0o600, flag: 'wx' });
  const ledger = {
    schemaVersion: 1,
    kind: 'midao-baseline-capture-ledger',
    transactionId: manifest.transactionId,
    captureManifestSha256: sha256(manifestBytes),
    payloadDigests: digests,
  };
  const ledgerPath = path.join(docsDir, 'baseline-ledger.json');
  await writeFile(ledgerPath, canonical(ledger), { mode: 0o600, flag: 'wx' });
  prepared.wipe();
  catalog.fill(0);
  return { parent, baselineDir, ledgerPath, journalPath: path.join(parent, 'publication.journal.json'), manifest, ledger };
}

async function rewritePayloadsAndOuterDigests(fx, replacements) {
  const manifest = structuredClone(fx.manifest);
  for (const [name, bytes] of replacements) {
    await writeFile(path.join(fx.baselineDir, name), bytes, { mode: 0o600 });
    manifest.payloadDigests[name] = sha256(bytes);
    if (name === 'baseline.sql') manifest.capture.renderedBaselineSha256 = manifest.payloadDigests[name];
    if (name === 'managed-overlays.sql') manifest.capture.renderedOverlaySha256 = manifest.payloadDigests[name];
    if (name === 'toc.normalized.json') manifest.capture.tocSha256 = manifest.payloadDigests[name];
  }
  const manifestBytes = Buffer.from(canonical(manifest));
  await writeFile(path.join(fx.baselineDir, 'capture-manifest.json'), manifestBytes, { mode: 0o600 });
  const ledger = structuredClone(fx.ledger);
  ledger.payloadDigests = structuredClone(manifest.payloadDigests);
  ledger.captureManifestSha256 = sha256(manifestBytes);
  await writeFile(fx.ledgerPath, canonical(ledger), { mode: 0o600 });
  manifestBytes.fill(0);
}

test('capture manifest schemas and validators lock exact non-recursive digest contracts', async () => {
  for (const name of schemaNames) {
    assert.ok(existsSync(path.join(schemaDir, name)), `${name} missing`);
    const schema = JSON.parse(await readFile(path.join(schemaDir, name), 'utf8'));
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.equal(schema.additionalProperties, false);
  }
  const { CAPTURE_PAYLOAD_PATHS, validateCaptureManifest, validateCaptureLedger } = await subject();
  assert.deepEqual(CAPTURE_PAYLOAD_PATHS, payloadPaths);
  const digests = Object.fromEntries(payloadPaths.map((name, index) => [name, String(index % 10).repeat(64)]));
  const manifest = manifestFor(digests);
  const ledger = {
    schemaVersion: 1, kind: 'midao-baseline-capture-ledger', transactionId: manifest.transactionId,
    captureManifestSha256: 'd'.repeat(64), payloadDigests: digests,
  };
  assert.equal(validateCaptureManifest(manifest).transactionId, manifest.transactionId);
  assert.equal(validateCaptureLedger(ledger).captureManifestSha256, 'd'.repeat(64));

  for (const mutate of [
    (value) => { value.payloadDigests['capture-manifest.json'] = 'e'.repeat(64); },
    (value) => { delete value.payloadDigests['baseline.sql']; },
    (value) => { value.argv = ['--password=secret']; },
    (value) => { value.MIDAO_USE_LIST_B64 = 'MTsgc3ludGhldGljCg=='; },
    (value) => { value.restrictKey = 'f'.repeat(64); },
    (value) => { value.transactionId = '../unsafe'; },
    (value) => { value.capture.catalogSha256 = 'b'.repeat(64); },
    (value) => { value.capture.tocSha256 = 'c'.repeat(64); },
  ]) {
    const invalid = structuredClone(manifest);
    mutate(invalid);
    assert.throws(() => validateCaptureManifest(invalid), /manifest|payload|unknown|transaction|forbidden|digest/iu);
  }
});

test('transaction verifier refuses journal and metadata mismatch before payload opens and returns an identity-bound snapshot', async () => {
  const { verifyCaptureTransaction } = await subject();
  const fx = await fixture();
  try {
    let opens = 0;
    const verified = await verifyCaptureTransaction({
      baselineDir: fx.baselineDir,
      ledgerPath: fx.ledgerPath,
      journalPath: fx.journalPath,
      onPayloadOpen: () => { opens += 1; },
    });
    assert.equal(opens, payloadPaths.length);
    assert.deepEqual([...verified.payloads.keys()], payloadPaths);
    const payloadCopy = verified.payloads.get('baseline.sql');
    assert.equal(payloadCopy.toString(), 'CREATE SCHEMA IF NOT EXISTS public;\n');
    verified.dispose();
    verified.dispose();
    assert.equal(verified.payloads.has('baseline.sql'), false);
    payloadCopy.fill(0);

    await writeFile(fx.journalPath, canonical({ state: 'PROMOTING' }), { mode: 0o600, flag: 'wx' });
    opens = 0;
    await assert.rejects(verifyCaptureTransaction({ baselineDir: fx.baselineDir, ledgerPath: fx.ledgerPath, journalPath: fx.journalPath, onPayloadOpen: () => { opens += 1; } }), /journal|unfinished/iu);
    assert.equal(opens, 0);
    await rm(fx.journalPath);

    const mismatched = structuredClone(fx.ledger);
    mismatched.payloadDigests['baseline.sql'] = 'f'.repeat(64);
    await writeFile(fx.ledgerPath, canonical(mismatched), { mode: 0o600 });
    opens = 0;
    await assert.rejects(verifyCaptureTransaction({ baselineDir: fx.baselineDir, ledgerPath: fx.ledgerPath, journalPath: fx.journalPath, onPayloadOpen: () => { opens += 1; } }), /ledger|manifest|digest/iu);
    assert.equal(opens, 0);
  } finally {
    await rm(fx.parent, { recursive: true, force: true });
  }
});

test('transaction verifier rejects semantic payload mutation even when payload, manifest, and ledger digests are all updated', async () => {
  const { verifyCaptureTransaction } = await subject();
  const fx = await fixture();
  try {
    const rolePath = path.join(fx.baselineDir, 'role-map.json');
    const roleMap = JSON.parse(await readFile(rolePath, 'utf8'));
    roleMap.roles[0].ownerDomain = 'platform';
    const roleBytes = Buffer.from(canonical(roleMap));
    await writeFile(rolePath, roleBytes, { mode: 0o600 });

    const manifest = structuredClone(fx.manifest);
    manifest.payloadDigests['role-map.json'] = sha256(roleBytes);
    const manifestBytes = Buffer.from(canonical(manifest));
    await writeFile(path.join(fx.baselineDir, 'capture-manifest.json'), manifestBytes, { mode: 0o600 });
    const ledger = structuredClone(fx.ledger);
    ledger.payloadDigests['role-map.json'] = manifest.payloadDigests['role-map.json'];
    ledger.captureManifestSha256 = sha256(manifestBytes);
    await writeFile(fx.ledgerPath, canonical(ledger), { mode: 0o600 });

    await assert.rejects(
      verifyCaptureTransaction({ baselineDir: fx.baselineDir, ledgerPath: fx.ledgerPath, journalPath: fx.journalPath }),
      /ownership|role|semantic/iu,
    );
    roleBytes.fill(0);
    manifestBytes.fill(0);
  } finally {
    await rm(fx.parent, { recursive: true, force: true });
  }
});

test('transaction verifier binds rendered SQL, normalized TOC identity, and per-entry render digests', async () => {
  const { verifyCaptureTransaction } = await subject();
  for (const scenario of ['sql', 'toc', 'entry-digest']) {
    const fx = await fixture();
    try {
      if (scenario === 'sql') {
        await rewritePayloadsAndOuterDigests(fx, new Map([
          ['baseline.sql', Buffer.from('CREATE SCHEMA IF NOT EXISTS public;\nCREATE TABLE public.foreign_ddl(id bigint);\n')],
        ]));
      } else if (scenario === 'toc') {
        const toc = JSON.parse(await readFile(path.join(fx.baselineDir, 'toc.normalized.json'), 'utf8'));
        toc[0].identity = `${toc[0].identity}_foreign`;
        const tocBytes = Buffer.from(canonical(toc));
        const useLines = (await readFile(path.join(fx.baselineDir, 'use-list.txt'), 'utf8')).trimEnd().split('\n');
        useLines[0] = `${toc[0].tocId}; ${toc[0].catalogOid} ${toc[0].objectOid} ${toc[0].descriptor} ${toc[0].schema} ${toc[0].identity} ${toc[0].owner}`;
        await rewritePayloadsAndOuterDigests(fx, new Map([
          ['toc.normalized.json', tocBytes], ['use-list.txt', Buffer.from(`${useLines.join('\n')}\n`)],
        ]));
      } else {
        const closure = JSON.parse(await readFile(path.join(fx.baselineDir, 'dependency-closure.json'), 'utf8'));
        closure[0].captureASha256 = 'f'.repeat(64);
        closure[0].captureBSha256 = 'f'.repeat(64);
        await rewritePayloadsAndOuterDigests(fx, new Map([
          ['dependency-closure.json', Buffer.from(canonical(closure))],
        ]));
      }
      await assert.rejects(
        verifyCaptureTransaction({ baselineDir: fx.baselineDir, ledgerPath: fx.ledgerPath, journalPath: fx.journalPath }),
        /render|binding|TOC|dependency|semantic/iu,
      );
    } finally {
      await rm(fx.parent, { recursive: true, force: true });
    }
  }
});

test('transaction verifier detects changed payload bytes and never returns a partial snapshot', async () => {
  const { verifyCaptureTransaction } = await subject();
  const fx = await fixture();
  try {
    await writeFile(path.join(fx.baselineDir, 'baseline.sql'), 'tampered\n', { mode: 0o600 });
    let delivered = false;
    await assert.rejects(
      verifyCaptureTransaction({ baselineDir: fx.baselineDir, ledgerPath: fx.ledgerPath, journalPath: fx.journalPath }).then(() => { delivered = true; }),
      /payload.*digest|digest.*payload/iu,
    );
    assert.equal(delivered, false);
  } finally {
    await rm(fx.parent, { recursive: true, force: true });
  }
});

test('known security drift is derived from exactly 59 public authenticated write-grant tables and bound to cutoff bytes', async () => {
  const { buildCatalogCutoffDigest, deriveKnownSecurityDrift, validateCatalogCutoffDigest, validateKnownSecurityDrift } = await import(`${pathToFileURL(preparerPath).href}?t=${Date.now()}`);
  const catalogValue = JSON.parse(buildKnownDriftCatalogFixture().toString('utf8'));
  catalogValue.sections.acl.push({
    canonicalKey: ['acl', 'relation', 'public', 'ignored_select', 'postgres', 'authenticated', 'SELECT', false],
    objectType: 'relation', schema: 'public', object: 'ignored_select', grantor: 'postgres', grantee: 'authenticated',
    privilege: 'SELECT', grantable: false, usesDefaultAcl: false,
  });
  const catalog = Buffer.from(`${JSON.stringify(catalogValue)}\n`);
  const drift = deriveKnownSecurityDrift({ normalizedCutoffCatalog: catalog });
  const parsed = JSON.parse(drift.toString('utf8'));
  assert.equal(parsed.status, 'known_drift');
  assert.equal(parsed.tableCount, 59);
  assert.equal(parsed.aclEntryCount, 59);
  assert.equal(parsed.entries.every((entry) => entry.grantee === 'authenticated' && entry.privilege === 'UPDATE' && entry.rlsEnabled), true);
  assert.equal(validateKnownSecurityDrift({ normalizedCutoffCatalog: catalog, securityDriftBytes: drift }), true);
  const digest = buildCatalogCutoffDigest(catalog);
  assert.match(digest.toString('ascii'), /^[0-9a-f]{64}  catalog\.cutoff\.normalized\.json\n$/u);
  assert.equal(validateCatalogCutoffDigest(catalog, digest), parsed.catalogSha256);
  assert.throws(() => deriveKnownSecurityDrift({ normalizedCutoffCatalog: catalog, expectedTableCount: 58 }), /table count mismatch/iu);
  const duplicateCatalogValue = structuredClone(catalogValue);
  duplicateCatalogValue.sections.acl.push(structuredClone(duplicateCatalogValue.sections.acl[0]));
  const duplicateCatalog = Buffer.from(`${JSON.stringify(duplicateCatalogValue)}\n`);
  assert.throws(() => deriveKnownSecurityDrift({ normalizedCutoffCatalog: duplicateCatalog }), /catalog contract invalid/iu);
  assert.throws(() => validateCatalogCutoffDigest(catalog, Buffer.from(`${parsed.catalogSha256}\n`)), /binding invalid/iu);
  const changed = Buffer.from(catalog);
  changed[changed.length - 2] ^= 1;
  assert.throws(() => validateKnownSecurityDrift({ normalizedCutoffCatalog: changed, securityDriftBytes: drift }), /JSON invalid|binding invalid/iu);
  catalog.fill(0); drift.fill(0); digest.fill(0); changed.fill(0); duplicateCatalog.fill(0);
});

test('13-path composer derives payload bytes and digests internally and wipes its owned snapshot', async () => {
  const { composeCapturePublicationPayloads } = await import(`${pathToFileURL(preparerPath).href}?t=${Date.now()}`);
  const { validateCaptureManifest, validateCapturePayloadSemantics } = await subject();
  const catalogA = buildKnownDriftCatalogFixture();
  const catalogB = Buffer.from(catalogA);
  const publication = buildReviewedPublicationFixture(catalogA);
  const { reviewedOwnership } = publication;
  const prepared = composeCapturePublicationPayloads({
    catalogBuffers: [catalogA, catalogB], reviewedOwnership,
    renderResult: publication.renderResult,
    randomBytes: (size) => Buffer.alloc(size, 0xab),
  });
  assert.deepEqual([...prepared.payloads.keys()], payloadPaths);
  assert.equal(Object.keys(prepared.payloadDigests).length, 13);
  assert.equal(validateCaptureManifest(structuredClone(prepared.manifest)).transactionId, 'ab'.repeat(32));
  assert.equal(validateCapturePayloadSemantics(prepared.payloads, prepared.manifest), true);
  const compactCatalog = Buffer.from(`${JSON.stringify(JSON.parse(catalogA.toString('utf8')))}\n`);
  const compactPrepared = composeCapturePublicationPayloads({
    catalogBuffers: [compactCatalog, Buffer.from(compactCatalog)], reviewedOwnership,
    renderResult: publication.renderResult, randomBytes: (size) => Buffer.alloc(size, 0xac),
  });
  assert.throws(
    () => validateCapturePayloadSemantics(compactPrepared.payloads, compactPrepared.manifest),
    /catalog\.cutoff.*canonical JSON/iu,
  );
  compactPrepared.wipe();
  compactCatalog.fill(0);
  const owned = [...prepared.payloads.values()];
  assert.throws(() => composeCapturePublicationPayloads({
    catalogBuffers: [catalogA, Buffer.from('different\n')], reviewedOwnership,
    renderResult: {}, randomBytes: (size) => Buffer.alloc(size, 1),
  }), /composer input/iu);
  assert.throws(() => composeCapturePublicationPayloads({
    catalogBuffers: [catalogA, catalogB], reviewedOwnership,
    renderResult: {
      baselineSql: Buffer.from('COPY public.example FROM stdin;\n'), managedOverlaysSql: Buffer.alloc(0),
      tocNormalized: Buffer.from('[]\n'), useList: Buffer.from('1; synthetic\n'), dependencyClosure: [],
    }, randomBytes: (size) => Buffer.alloc(size, 1),
  }), /data scan/iu);
  assert.throws(() => composeCapturePublicationPayloads({
    catalogBuffers: [catalogA, catalogB], reviewedOwnership,
    renderResult: {
      baselineSql: Buffer.from('SELECT 1;\n\\! id\n'), managedOverlaysSql: Buffer.alloc(0),
      tocNormalized: Buffer.from('[]\n'), useList: Buffer.from('1; synthetic\n'), dependencyClosure: [],
    }, randomBytes: (size) => Buffer.alloc(size, 1),
  }), /psql command/iu);
  const lexicalSql = Buffer.from([
    '-- INSERT INTO public.comment_only VALUES (1);',
    "SELECT 'COPY public.string_only FROM stdin';",
    'GRANT UPDATE ON TABLE public.example TO authenticated;',
    'ALTER TABLE public.child ADD CONSTRAINT child_parent_fk FOREIGN KEY (parent_id) REFERENCES public.parent(id) ON DELETE CASCADE;',
    'CREATE FUNCTION public.fixture() RETURNS void LANGUAGE plpgsql AS $body$',
    'BEGIN',
    '  INSERT INTO public.inside_function VALUES (1);',
    '  -- \\active_only_outside_lexer',
    'END',
    '$body$;',
    '',
  ].join('\n'));
  const lexicalPrepared = composeCapturePublicationPayloads({
    catalogBuffers: [catalogA, catalogB], reviewedOwnership,
    renderResult: { ...publication.renderResult, baselineSql: lexicalSql },
    randomBytes: (size) => Buffer.alloc(size, 2),
  });
  lexicalPrepared.wipe();
  for (const activeSql of [
    'INSERT INTO public.example VALUES (1);\n',
    'COPY public.example FROM stdin;\n',
    'WITH changed AS (INSERT INTO public.example VALUES (1) RETURNING *) SELECT * FROM changed;\n',
    'EXPLAIN ANALYZE INSERT INTO public.example VALUES (1);\n',
    'EXPLAIN (ANALYZE, BUFFERS) INSERT INTO public.example VALUES (1);\n',
    'EXPLAIN ANALYZE WITH changed AS (DELETE FROM public.example RETURNING *) SELECT * FROM changed;\n',
    '  \\! id\n',
  ]) {
    assert.throws(() => composeCapturePublicationPayloads({
      catalogBuffers: [catalogA, catalogB], reviewedOwnership,
      renderResult: { ...publication.renderResult, baselineSql: Buffer.from(activeSql) },
      randomBytes: (size) => Buffer.alloc(size, 3),
    }), /data|psql|SQL/iu);
  }
  prepared.wipe();
  assert.equal(prepared.payloads.size, 0);
  assert.equal(owned.every((bytes) => bytes.every((value) => value === 0)), true);
  catalogA.fill(0); catalogB.fill(0);
});
