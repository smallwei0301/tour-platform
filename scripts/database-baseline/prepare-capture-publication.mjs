import { createHash } from 'node:crypto';
import { validateNormalizedCatalog } from './validate-normalized-catalog.mjs';

const WRITE_PRIVILEGES = Object.freeze(new Set(['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']));
const CAPTURE_PAYLOAD_PATHS = Object.freeze([
  'baseline.sql', 'managed-overlays.sql', 'catalog.cutoff.normalized.json', 'toc.normalized.json',
  'use-list.txt', 'toc-ownership-map.json', 'dependency-closure.json', 'role-map.json',
  'ownership-boundary.json', 'exclusions.json', 'platform-prerequisites.json', 'security-drift.json',
  'catalog-cutoff.sha256',
]);
const SHA256 = /^[0-9a-f]{64}$/u;

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function parseCatalog(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > 32 * 1024 * 1024 || bytes.includes(0) || bytes.includes(13)) {
    throw new Error('cutoff catalog bytes invalid');
  }
  let value;
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (error) {
    throw new Error('cutoff catalog JSON invalid', { cause: error });
  }
  try {
    return validateNormalizedCatalog(value);
  } catch (error) {
    throw new Error('cutoff catalog contract invalid', { cause: error });
  }
}

function canonicalKey(value, label) {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${label} canonical key invalid`);
  return JSON.stringify(value);
}

export function buildCatalogCutoffDigest(catalogBytes) {
  if (!Buffer.isBuffer(catalogBytes) || catalogBytes.length === 0) throw new Error('cutoff catalog bytes invalid');
  return Buffer.from(`${sha256(catalogBytes)}  catalog.cutoff.normalized.json\n`);
}

export function validateCatalogCutoffDigest(catalogBytes, digestBytes) {
  const expected = buildCatalogCutoffDigest(catalogBytes);
  try {
    if (!Buffer.isBuffer(digestBytes) || !digestBytes.equals(expected)) throw new Error('catalog cutoff digest binding invalid');
    return sha256(catalogBytes);
  } finally {
    expected.fill(0);
  }
}

export function deriveKnownSecurityDrift({ normalizedCutoffCatalog, expectedTableCount = 59 }) {
  if (!Number.isSafeInteger(expectedTableCount) || expectedTableCount < 1) throw new Error('security drift expected table count invalid');
  const catalog = parseCatalog(normalizedCutoffCatalog);
  const catalogSha256 = sha256(normalizedCutoffCatalog);
  if (!SHA256.test(catalogSha256)) throw new Error('cutoff catalog digest invalid');

  const rlsByTable = new Map();
  for (const row of catalog.sections.rls) {
    canonicalKey(row?.canonicalKey, 'RLS');
    if (row.schema !== 'public' || typeof row.relation !== 'string' || typeof row.enabled !== 'boolean' || typeof row.forced !== 'boolean') continue;
    if (rlsByTable.has(row.relation)) throw new Error(`duplicate public RLS row: ${row.relation}`);
    rlsByTable.set(row.relation, { enabled: row.enabled, forced: row.forced });
  }

  const exactAcl = new Map();
  for (const row of catalog.sections.acl) {
    const id = canonicalKey(row?.canonicalKey, 'ACL');
    if (row.objectType !== 'relation' || row.schema !== 'public' || row.grantee !== 'authenticated'
      || !WRITE_PRIVILEGES.has(row.privilege)) continue;
    if (typeof row.object !== 'string' || typeof row.grantor !== 'string' || typeof row.grantable !== 'boolean') {
      throw new Error('security drift ACL row invalid');
    }
    exactAcl.set(id, row);
  }
  const entries = [...exactAcl.values()].map((row) => {
    const rls = rlsByTable.get(row.object);
    if (!rls) throw new Error(`security drift table missing RLS row: ${row.object}`);
    return {
      table: row.object,
      grantor: row.grantor,
      grantee: row.grantee,
      privilege: row.privilege,
      grantable: row.grantable,
      rlsEnabled: rls.enabled,
      rlsForced: rls.forced,
    };
  }).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right), 'en'));
  const tables = [...new Set(entries.map((entry) => entry.table))].sort();
  if (tables.length !== expectedTableCount) {
    throw new Error(`security drift table count mismatch: expected ${expectedTableCount}, received ${tables.length}`);
  }
  const artifact = {
    schemaVersion: 1,
    kind: 'midao-known-security-drift',
    status: 'known_drift',
    catalogSha256,
    tableCount: tables.length,
    aclEntryCount: entries.length,
    semantics: {
      aclLayer: 'authenticated retains relation-level write privileges listed below',
      rlsLayer: 'row-level security is an independent enforcement layer and does not erase underlying ACL drift',
      securityApproval: false,
    },
    tables,
    entries,
  };
  return Buffer.from(`${JSON.stringify(artifact)}\n`);
}

export function validateKnownSecurityDrift({ normalizedCutoffCatalog, securityDriftBytes, expectedTableCount = 59 }) {
  const expected = deriveKnownSecurityDrift({ normalizedCutoffCatalog, expectedTableCount });
  try {
    if (!Buffer.isBuffer(securityDriftBytes) || !securityDriftBytes.equals(expected)) throw new Error('security drift artifact binding invalid');
    return true;
  } finally {
    expected.fill(0);
  }
}

function canonical(value) {
  return Buffer.from(`${JSON.stringify(value)}\n`);
}

function assertNoActiveSqlDataOrPsql(text, label) {
  let state = 'normal';
  let blockDepth = 0;
  let dollarTag = '';
  let parenthesisDepth = 0;
  let firstKeyword = null;
  let lineStart = true;
  for (let index = 0; index < text.length;) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '\r' && state !== 'dollar-quote') throw new Error(`${label} SQL lexical framing invalid`);
    if (state === 'line-comment') {
      if (char === '\n') { state = 'normal'; lineStart = true; }
      index += 1;
      continue;
    }
    if (state === 'block-comment') {
      if (char === '/' && next === '*') { blockDepth += 1; index += 2; continue; }
      if (char === '*' && next === '/') { blockDepth -= 1; index += 2; if (blockDepth === 0) state = 'normal'; continue; }
      if (char === '\n') lineStart = true;
      index += 1;
      continue;
    }
    if (state === 'single-quote') {
      if (char === "'" && next === "'") { index += 2; continue; }
      if (char === "'") state = 'normal';
      if (char === '\n') lineStart = true;
      index += 1;
      continue;
    }
    if (state === 'double-quote') {
      if (char === '"' && next === '"') { index += 2; continue; }
      if (char === '"') state = 'normal';
      if (char === '\n') lineStart = true;
      index += 1;
      continue;
    }
    if (state === 'dollar-quote') {
      if (text.startsWith(dollarTag, index)) { index += dollarTag.length; state = 'normal'; continue; }
      if (char === '\n') lineStart = true;
      index += 1;
      continue;
    }

    if (char === '-' && next === '-') { state = 'line-comment'; index += 2; continue; }
    if (char === '/' && next === '*') { state = 'block-comment'; blockDepth = 1; index += 2; continue; }
    if (char === "'") { state = 'single-quote'; lineStart = false; index += 1; continue; }
    if (char === '"') { state = 'double-quote'; lineStart = false; index += 1; continue; }
    if (char === '$') {
      const match = text.slice(index).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/u);
      if (match) { dollarTag = match[0]; state = 'dollar-quote'; lineStart = false; index += dollarTag.length; continue; }
    }
    if (char === '\n') { lineStart = true; index += 1; continue; }
    if (lineStart && (char === ' ' || char === '\t')) { index += 1; continue; }
    if (lineStart && char === '\\') throw new Error(`${label} contains active psql command`);
    if (char === '(') { parenthesisDepth += 1; lineStart = false; index += 1; continue; }
    if (char === ')') { if (parenthesisDepth < 1) throw new Error(`${label} SQL parenthesis invalid`); parenthesisDepth -= 1; lineStart = false; index += 1; continue; }
    if (char === ';' && parenthesisDepth === 0) { firstKeyword = null; lineStart = false; index += 1; continue; }
    if (/[A-Za-z_]/u.test(char)) {
      const match = text.slice(index).match(/^[A-Za-z_][A-Za-z0-9_$]*/u);
      const keyword = match[0].toUpperCase();
      if (parenthesisDepth === 0 && firstKeyword === null) firstKeyword = keyword;
      const dataKeyword = ['COPY', 'INSERT', 'UPDATE', 'DELETE', 'MERGE'].includes(keyword);
      const wrappedData = firstKeyword === 'WITH' || firstKeyword === 'EXPLAIN';
      if (dataKeyword && ((parenthesisDepth === 0 && (firstKeyword === keyword || wrappedData))
        || (parenthesisDepth > 0 && wrappedData))) {
        throw new Error(`${label} SQL data scan failed: active ${keyword}`);
      }
      lineStart = false;
      index += match[0].length;
      continue;
    }
    if (char !== ' ' && char !== '\t') lineStart = false;
    index += 1;
  }
  if (state !== 'normal' || blockDepth !== 0 || parenthesisDepth !== 0) throw new Error(`${label} SQL lexical framing invalid`);
}

function assertSql(bytes, label, { allowEmpty = false } = {}) {
  if (!Buffer.isBuffer(bytes) || (!allowEmpty && bytes.length === 0) || bytes.includes(0)
    || (bytes.length > 0 && bytes.at(-1) !== 10)) throw new Error(`${label} SQL framing invalid`);
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch (error) { throw new Error(`${label} SQL UTF-8 invalid`, { cause: error }); }
  if (/postgres(?:ql)?:\/\/|PGPASSWORD|\\(?:un)?restrict\s+[0-9a-f]{16,}/iu.test(text)) {
    throw new Error(`${label} SQL secret scan failed`);
  }
  assertNoActiveSqlDataOrPsql(text, label);
}

export function validatePublicationSqlPayloads(payloads) {
  if (!(payloads instanceof Map)) throw new Error('publication SQL payload map invalid');
  assertSql(payloads.get('baseline.sql'), 'baseline');
  assertSql(payloads.get('managed-overlays.sql'), 'managed overlays', { allowEmpty: true });
  return true;
}

function canonicalSha256(value) {
  const bytes = canonical(value);
  try { return sha256(bytes); } finally { bytes.fill(0); }
}

function bindRenderClosure(renderResult) {
  let toc;
  try { toc = JSON.parse(renderResult.tocNormalized.toString('utf8')); }
  catch (error) { throw new Error('normalized TOC JSON invalid', { cause: error }); }
  if (!Array.isArray(toc)) throw new Error('normalized TOC shape invalid');
  const tocById = new Map(toc.map((entry) => [entry?.tocId, entry]));
  if (tocById.size !== toc.length) throw new Error('normalized TOC IDs invalid');
  const destinationDigests = {
    'baseline.sql': sha256(renderResult.baselineSql),
    'managed-overlays.sql': sha256(renderResult.managedOverlaysSql),
  };
  return renderResult.dependencyClosure.map((entry, index) => {
    const keys = ['tocId', 'objectKey', 'destination', 'directDependencies', 'transitiveDependencies', 'captureASha256', 'captureBSha256'];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)
      || Object.keys(entry).length !== keys.length || keys.some((key) => !Object.hasOwn(entry, key))) {
      throw new Error(`render dependency closure ${index} shape invalid`);
    }
    const tocEntry = tocById.get(entry.tocId);
    if (!tocEntry || !Object.hasOwn(destinationDigests, entry.destination)
      || !/^[0-9a-f]{64}$/u.test(entry.captureASha256) || entry.captureASha256 !== entry.captureBSha256) {
      throw new Error(`render dependency closure ${index} binding input invalid`);
    }
    const tocEntrySha256 = canonicalSha256(tocEntry);
    const destinationSha256 = destinationDigests[entry.destination];
    const binding = { ...entry, tocEntrySha256, destinationSha256 };
    return Object.freeze({ ...binding, renderBindingSha256: canonicalSha256(binding) });
  });
}

export function composeCapturePublicationPayloads({ catalogBuffers, renderResult, reviewedOwnership, randomBytes }) {
  if (!Array.isArray(catalogBuffers) || catalogBuffers.length !== 2 || catalogBuffers.some((entry) => !Buffer.isBuffer(entry))
    || !catalogBuffers[0].equals(catalogBuffers[1]) || typeof randomBytes !== 'function'
    || reviewedOwnership?.templateOnly !== false || reviewedOwnership?.ownershipBoundary?.status !== 'reviewed') {
    throw new Error('capture publication composer input invalid');
  }
  for (const key of ['baselineSql', 'managedOverlaysSql', 'tocNormalized', 'useList']) {
    if (!Buffer.isBuffer(renderResult?.[key])) throw new Error(`render result ${key} invalid`);
  }
  if (!Array.isArray(renderResult.dependencyClosure)) throw new Error('render dependency closure invalid');
  assertSql(renderResult.baselineSql, 'baseline');
  assertSql(renderResult.managedOverlaysSql, 'managed overlays', { allowEmpty: true });
  if (renderResult.useList.length < 1 || renderResult.useList.length > 64 * 1024 || renderResult.useList.includes(0)
    || renderResult.useList.includes(13) || renderResult.useList.at(-1) !== 10) throw new Error('selected use-list framing invalid');
  try { JSON.parse(renderResult.tocNormalized.toString('utf8')); } catch (error) { throw new Error('normalized TOC JSON invalid', { cause: error }); }

  const transactionBytes = randomBytes(32);
  if (!Buffer.isBuffer(transactionBytes) || transactionBytes.length !== 32 || transactionBytes.every((value) => value === 0)) {
    transactionBytes?.fill?.(0);
    throw new Error('publication transaction entropy invalid');
  }
  const transactionId = transactionBytes.toString('hex');
  transactionBytes.fill(0);

  const boundDependencyClosure = bindRenderClosure(renderResult);
  let payloads;
  try {
  payloads = new Map([
    ['baseline.sql', Buffer.from(renderResult.baselineSql)],
    ['managed-overlays.sql', Buffer.from(renderResult.managedOverlaysSql)],
    ['catalog.cutoff.normalized.json', Buffer.from(catalogBuffers[0])],
    ['toc.normalized.json', Buffer.from(renderResult.tocNormalized)],
    ['use-list.txt', Buffer.from(renderResult.useList)],
    ['toc-ownership-map.json', canonical(reviewedOwnership.tocOwnershipMap)],
    ['dependency-closure.json', canonical(boundDependencyClosure)],
    ['role-map.json', canonical(reviewedOwnership.roleMap)],
    ['ownership-boundary.json', canonical(reviewedOwnership.ownershipBoundary)],
    ['exclusions.json', canonical(reviewedOwnership.exclusions)],
    ['platform-prerequisites.json', canonical(reviewedOwnership.platformPrerequisites)],
  ]);
  const catalog = payloads.get('catalog.cutoff.normalized.json');
  payloads.set('security-drift.json', deriveKnownSecurityDrift({ normalizedCutoffCatalog: catalog }));
  payloads.set('catalog-cutoff.sha256', buildCatalogCutoffDigest(catalog));
  if (JSON.stringify([...payloads.keys()]) !== JSON.stringify(CAPTURE_PAYLOAD_PATHS)) {
    for (const bytes of payloads.values()) bytes.fill(0);
    throw new Error('capture payload path contract invalid');
  }
  const payloadDigests = Object.fromEntries(CAPTURE_PAYLOAD_PATHS.map((name) => [name, sha256(payloads.get(name))]));
  const manifest = {
    schemaVersion: 1,
    kind: 'midao-baseline-capture',
    transactionId,
    payloadDigests,
    capture: {
      count: 2,
      catalogSha256: payloadDigests['catalog.cutoff.normalized.json'],
      tocSha256: payloadDigests['toc.normalized.json'],
      renderedBaselineSha256: payloadDigests['baseline.sql'],
      renderedOverlaySha256: payloadDigests['managed-overlays.sql'],
    },
    toolchain: {
      supabaseCliVersion: '2.87.2',
      dumpSchemaSourceSha256: '5cd57189f6565ddf651ff149995398a4c9b1971ca34a0093a77c011a41f21d64',
      postgresMajor: 17,
      postgresImage: 'postgres@sha256:0027bef26712baaee437a4ea48fdf3d2d2e2bc5f0d81615374408ca320f3c7e3',
    },
    assertions: { catalogEquivalent: true, securityPolicyStatus: 'known_drift', secretScan: 'pass', dataScan: 'pass' },
  };
  let wiped = false;
  return Object.freeze({
    payloads,
    payloadDigests: Object.freeze(payloadDigests),
    manifest: Object.freeze(manifest),
    wipe() {
      if (wiped) return;
      wiped = true;
      for (const bytes of payloads.values()) bytes.fill(0);
      payloads.clear();
    },
  });
  } catch (error) {
    if (payloads) {
      for (const bytes of payloads.values()) bytes.fill(0);
      payloads.clear();
    }
    throw error;
  }
}
