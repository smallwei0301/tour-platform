#!/usr/bin/env node
import { createHash, createHmac } from 'node:crypto';
import { spawn } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import { createServer as createHttpServer, request as httpRequest } from 'node:http';
import { createConnection, createServer } from 'node:net';
import { basename, isAbsolute, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { materializeFreshWorkdir } from '../database-baseline/materialize-fresh-workdir.mjs';
import { resolveRepositoryPublicationPaths } from '../database-baseline/publish-baseline.mjs';
import { resolveExpectedTerminalPublicationPaths } from '../database-baseline/publish-expected-terminal.mjs';
import { verifyCaptureTransaction, verifyExpectedTerminalTransaction } from '../database-baseline/verify-manifest.mjs';

export const LOCK_PATH = '/tmp/tour-platform-local-supabase.lock';
const SUPABASE_TOOLCHAIN_DIR = '/root/.hermes/toolchains/supabase/2.87.2';
const SUPABASE_TOOLCHAIN_BIN = `${SUPABASE_TOOLCHAIN_DIR}/supabase`;
const SUPABASE_TOOLCHAIN_SHA256 = 'e325dd50b274e88fd1416f93b9e063902827ae326d356ab7f9dc604c3eba5c59';
const MIDAO_E2E_JWT_SECRET = 'midao-local-postgrest-jwt-secret-0123456789abcdef';
const HELP_LINE = 'Try rerunning the command with --debug to troubleshoot the error.';
const FOUNDATION_MIGRATIONS = [
  '20260723000000_midao_backend_mode.sql',
  '20260723001000_midao_notification_outbox.sql',
  '20260723002000_midao_idempotency_records.sql',
  '20260723002500_midao_audit_events.sql',
  '20260723003000_midao_atomic_backend_mode_switch.sql',
  '20260723003500_midao_service_role_acl_hardening.sql',
];
const STOPPED_SERVICE_NAMES = [
  'kong', 'auth', 'inbucket', 'realtime', 'rest', 'storage', 'imgproxy',
  'pg_meta', 'studio', 'edge_runtime', 'analytics', 'vector', 'pooler',
];
// Full-service lanes start with MIDAO_E2E_EXCLUDED_SERVICES, which deliberately
// retains the gateway, GoTrue, and PostgREST services needed for real auth.
const FULL_SERVICE_RUNNING_SERVICE_NAMES = ['kong', 'auth', 'rest'];
const MIDAO_E2E_EXCLUDED_SERVICES = [
  'realtime', 'storage-api', 'imgproxy', 'mailpit', 'postgres-meta',
  'studio', 'edge-runtime', 'logflare', 'vector', 'supavisor',
].join(',');
const MIDAO_DATABASE_ONLY_EXCLUDED_SERVICES = [
  'gotrue', 'realtime', 'storage-api', 'imgproxy', 'kong', 'mailpit',
  'postgrest', 'postgres-meta', 'studio', 'edge-runtime', 'logflare', 'vector', 'supavisor',
].join(',');

export function parseSupabasePin(lockText) {
  let lock;
  try { lock = JSON.parse(lockText); } catch { throw new Error('INVALID_PACKAGE_LOCK'); }
  const version = lock?.packages?.['node_modules/supabase']?.version;
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/u.test(version)) throw new Error('INVALID_SUPABASE_PIN');
  return version;
}

export function resolvePinnedPostgrestRuntime(lockText) {
  let lock;
  try { lock = JSON.parse(lockText); } catch { throw new Error('POSTGREST_RUNTIME_LOCK_INVALID'); }
  const matches = Array.isArray(lock?.images) ? lock.images.filter((entry) => entry?.role === 'api') : [];
  if (matches.length !== 1) throw new Error('POSTGREST_RUNTIME_LOCK_INVALID');
  const image = matches[0];
  if (Object.keys(image).sort().join(',') !== 'architecture,imageId,platform,repoDigest,repository,role,tag'
    || image.repository !== 'public.ecr.aws/supabase/postgrest'
    || !/^v\d+\.\d+$/u.test(image.tag)
    || !/^public\.ecr\.aws\/supabase\/postgrest@sha256:[0-9a-f]{64}$/u.test(image.repoDigest)
    || !/^sha256:[0-9a-f]{64}$/u.test(image.imageId)
    || image.platform !== 'linux/amd64'
    || image.architecture !== 'amd64') {
    throw new Error('POSTGREST_RUNTIME_LOCK_INVALID');
  }
  return { repoDigest: image.repoDigest, imageId: image.imageId };
}

function createLocalSupabaseJwt(role) {
  const encode = (value) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
  const unsigned = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    role, iss: 'supabase', iat: 1_700_000_000, exp: 4_102_444_800,
  })}`;
  const signature = createHmac('sha256', MIDAO_E2E_JWT_SECRET).update(unsigned).digest('base64url');
  return `${unsigned}.${signature}`;
}

export function createLocalSupabaseApiCredentials(apiUrl) {
  if (!/^http:\/\/127\.0\.0\.1:\d{4,5}$/u.test(apiUrl)) throw new Error('MIDAO_LOCAL_API_URL_INVALID');
  const anonKey = createLocalSupabaseJwt('anon');
  const serviceRoleKey = createLocalSupabaseJwt('service_role');
  return {
    publicEnv: {
      SUPABASE_URL: apiUrl,
      NEXT_PUBLIC_SUPABASE_URL: apiUrl,
      SUPABASE_ANON_KEY: anonKey,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
      SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
    },
    containerEnv: {
      PGRST_DB_URI: 'postgres://authenticator:postgres@db:5432/postgres',
      PGRST_DB_SCHEMAS: 'public,storage,graphql_public',
      PGRST_DB_EXTRA_SEARCH_PATH: 'public,extensions',
      PGRST_DB_ANON_ROLE: 'anon',
      PGRST_JWT_SECRET: MIDAO_E2E_JWT_SECRET,
      PGRST_DB_USE_LEGACY_GUCS: 'false',
    },
  };
}

function isPrivateDockerBindHost(value) {
  const octets = String(value).split('.').map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return false;
  return octets[0] === 127 || octets[0] === 10
    || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
    || (octets[0] === 192 && octets[1] === 168);
}

export function buildPinnedPostgrestRun({
  expectedProjectId, runtime, credentials, publishHost = '127.0.0.1',
}) {
  if (!/^[a-z0-9_-]+$/u.test(expectedProjectId)
    || !runtime || !/^public\.ecr\.aws\/supabase\/postgrest@sha256:[0-9a-f]{64}$/u.test(runtime.repoDigest)
    || !/^sha256:[0-9a-f]{64}$/u.test(runtime.imageId)
    || !credentials?.containerEnv || typeof credentials.containerEnv !== 'object'
    || !isPrivateDockerBindHost(publishHost)) {
    throw new Error('POSTGREST_RUN_CONTRACT_INVALID');
  }
  const envNames = Object.keys(credentials.containerEnv).sort();
  if (envNames.join(',') !== [
    'PGRST_DB_ANON_ROLE', 'PGRST_DB_EXTRA_SEARCH_PATH', 'PGRST_DB_SCHEMAS',
    'PGRST_DB_URI', 'PGRST_DB_USE_LEGACY_GUCS', 'PGRST_JWT_SECRET',
  ].join(',') || envNames.some((name) => typeof credentials.containerEnv[name] !== 'string'
    || !credentials.containerEnv[name] || /[\r\n\0]/u.test(credentials.containerEnv[name]))) {
    throw new Error('POSTGREST_RUN_CONTRACT_INVALID');
  }
  return {
    command: 'docker',
    args: [
      'run', '--detach', '--pull', 'never',
      '--name', `supabase_rest_${expectedProjectId}`,
      '--label', `com.supabase.cli.project=${expectedProjectId}`,
      '--label', `com.docker.compose.project=${expectedProjectId}`,
      '--network', `supabase_network_${expectedProjectId}`,
      '--publish', `${publishHost}:54321:3000`,
      ...envNames.flatMap((name) => ['--env', name]),
      runtime.repoDigest,
    ],
    env: { ...credentials.containerEnv },
  };
}

export async function startPinnedPostgrest({
  repoRoot, expectedProjectId, runtime, credentials, publishHost = '127.0.0.1', signal, commandRunner = runCommand,
}) {
  const invocation = buildPinnedPostgrestRun({ expectedProjectId, runtime, credentials, publishHost });
  const image = await commandRunner('docker', [
    'image', 'inspect', '--format', '{{.Id}}\t{{json .RepoDigests}}', '--', runtime.repoDigest,
  ], { cwd: repoRoot, signal });
  let imageDigests;
  const [imageId, digestJson, ...extraImageFields] = String(image.stdout || '').trim().split('\t');
  try { imageDigests = JSON.parse(digestJson); } catch { imageDigests = null; }
  if (image.exitCode !== 0 || image.signal !== null || image.stderr.trim() || extraImageFields.length !== 0
    || imageId !== runtime.imageId || !Array.isArray(imageDigests) || !imageDigests.includes(runtime.repoDigest)) {
    throw new Error('POSTGREST_IMAGE_IDENTITY_INVALID');
  }
  const started = await commandRunner(invocation.command, invocation.args, {
    cwd: repoRoot, signal, env: { ...process.env, ...invocation.env },
  });
  const containerId = String(started.stdout || '').trim();
  if (started.exitCode !== 0 || started.signal !== null || started.stderr.trim()
    || !/^[0-9a-f]{64}$/u.test(containerId)) throw new Error('POSTGREST_START_FAILED');
  const inspected = await commandRunner('docker', ['inspect', '--format', '{{json .}}', '--', containerId], {
    cwd: repoRoot, signal,
  });
  let identity;
  try { identity = JSON.parse(inspected.stdout); } catch { identity = null; }
  const networkName = `supabase_network_${expectedProjectId}`;
  const expectedEnv = Object.entries(credentials.containerEnv).map(([key, value]) => `${key}=${value}`);
  const portBinding = identity?.HostConfig?.PortBindings?.['3000/tcp'];
  if (inspected.exitCode !== 0 || inspected.signal !== null || inspected.stderr.trim()
    || identity?.Id !== containerId || identity?.Name !== `/supabase_rest_${expectedProjectId}`
    || identity?.Image !== runtime.imageId || identity?.Config?.Image !== runtime.repoDigest
    || identity?.Config?.Labels?.['com.supabase.cli.project'] !== expectedProjectId
    || identity?.Config?.Labels?.['com.docker.compose.project'] !== expectedProjectId
    || identity?.HostConfig?.NetworkMode !== networkName
    || Object.keys(identity?.NetworkSettings?.Networks ?? {}).join(',') !== networkName
    || !Array.isArray(portBinding) || portBinding.length !== 1
    || portBinding[0]?.HostIp !== publishHost || portBinding[0]?.HostPort !== '54321'
    || identity?.State?.Status !== 'running'
    || expectedEnv.some((entry) => !identity?.Config?.Env?.includes(entry))) {
    throw new Error('POSTGREST_CONTAINER_IDENTITY_INVALID');
  }
  return { containerId };
}

export async function waitForPostgrestApi({ apiUrl, serviceRoleKey, signal, attempts = 60 }) {
  if (!/^http:\/\/127\.0\.0\.1:\d{4,5}$/u.test(apiUrl)
    || typeof serviceRoleKey !== 'string' || serviceRoleKey.split('.').length !== 3
    || !Number.isSafeInteger(attempts) || attempts < 1 || attempts > 120) {
    throw new Error('POSTGREST_READY_CONTRACT_INVALID');
  }
  let lastStatus = 'unreachable';
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (signal?.aborted) throw new Error('RUNNER_SIGNALLED');
    try {
      const response = await fetch(apiUrl, {
        headers: { apikey: serviceRoleKey, authorization: `Bearer ${serviceRoleKey}` },
        signal: AbortSignal.timeout(2_000),
      });
      lastStatus = String(response.status);
      const body = await response.text();
      if (response.status === 200 && body.length > 2 && body.length < 10_000_000) return;
    } catch (error) {
      if (error?.name === 'AbortError' && signal?.aborted) throw new Error('RUNNER_SIGNALLED');
      lastStatus = 'unreachable';
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
  }
  throw new Error(`POSTGREST_NOT_READY_${lastStatus}`);
}

export async function verifyMidaoE2ERuntimeFixtures({ apiUrl, serviceRoleKey, signal, fetchImpl = fetch }) {
  if (!/^http:\/\/127\.0\.0\.1:\d{4,5}$/u.test(apiUrl)
    || typeof serviceRoleKey !== 'string' || serviceRoleKey.split('.').length !== 3
    || typeof fetchImpl !== 'function') {
    throw new Error('MIDAO_E2E_RUNTIME_FIXTURE_CONTRACT_INVALID');
  }
  const expectedRows = [
    {
      id: '00000000-0000-4000-8000-000000000001',
      display_name: 'Legacy E2E Guide',
      guide_email: 'legacy-e2e@example.invalid',
      guide_password_hash: 'legacy-e2e-local-salt-20260727:d896145fe6dc47d2f618e7c086d5178bbdfbea29a7caa89a561a184f0c722029',
      backend_mode: 'legacy',
      guide_session_version: 1,
      verification_status: 'approved',
    },
    {
      id: '99999999-9999-4999-8999-999999999999',
      display_name: 'Midao E2E Guide',
      guide_email: 'midao-e2e@example.invalid',
      guide_password_hash: 'midao-e2e-local-salt-20260724:d00368494263d0f8b0e57243c336ecc5d8420c1454bf4887b1b7e8d53b2dba35',
      backend_mode: 'midao',
      guide_session_version: 1,
      verification_status: 'approved',
    },
  ];
  const endpoint = new URL('/guide_profiles', apiUrl);
  endpoint.searchParams.set('select', 'id,display_name,guide_email,guide_password_hash,backend_mode,guide_session_version,verification_status');
  endpoint.searchParams.set('id', 'in.(00000000-0000-4000-8000-000000000001,99999999-9999-4999-8999-999999999999)');
  endpoint.searchParams.set('order', 'id.asc');
  const requestSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(2_000)])
    : AbortSignal.timeout(2_000);
  const response = await fetchImpl(endpoint, {
    headers: { apikey: serviceRoleKey, authorization: `Bearer ${serviceRoleKey}` },
    signal: requestSignal,
  });
  if (response.status !== 200) throw new Error(`MIDAO_E2E_RUNTIME_FIXTURE_HTTP_${response.status}`);
  let rows;
  try { rows = await response.json(); } catch { throw new Error('MIDAO_E2E_RUNTIME_FIXTURE_BODY_INVALID'); }
  if (!Array.isArray(rows) || rows.length !== expectedRows.length) {
    throw new Error(`MIDAO_E2E_RUNTIME_FIXTURE_COUNT_${Array.isArray(rows) ? rows.length : 'INVALID'}`);
  }
  const expectedKeys = Object.keys(expectedRows[0]).sort().join(',');
  const valid = rows.every((row, index) => row
    && Object.keys(row).sort().join(',') === expectedKeys
    && Object.entries(expectedRows[index]).every(([key, value]) => row[key] === value));
  if (!valid) throw new Error('MIDAO_E2E_RUNTIME_FIXTURE_INVALID');
}

export async function verifyPinnedSupabaseBinary() {
  const stat = await fsPromises.lstat(SUPABASE_TOOLCHAIN_BIN);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || (stat.mode & 0o111) === 0) throw new Error('UNSAFE_SUPABASE_TOOLCHAIN');
  const digest = createHash('sha256').update(await fsPromises.readFile(SUPABASE_TOOLCHAIN_BIN)).digest('hex');
  if (digest !== SUPABASE_TOOLCHAIN_SHA256) throw new Error('SUPABASE_TOOLCHAIN_DIGEST_MISMATCH');
}

export function parseDockerHostGateway(routeText, cgroupText) {
  if (!/(?:^|\/)docker\/[0-9a-f]+/imu.test(String(cgroupText))) return null;
  for (const line of String(routeText).split(/\r?\n/u).slice(1)) {
    const fields = line.trim().split(/\s+/u);
    if (fields.length < 4 || fields[1] !== '00000000' || (Number.parseInt(fields[3], 16) & 0x2) === 0) continue;
    const hex = fields[2];
    if (!/^[0-9A-Fa-f]{8}$/u.test(hex)) throw new Error('INVALID_DOCKER_GATEWAY');
    return [6, 4, 2, 0].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16)).join('.');
  }
  throw new Error('DOCKER_GATEWAY_NOT_FOUND');
}

export async function startLoopbackBridge({ listenPort, targetHost, targetPort }) {
  const sockets = new Set();
  const server = createServer((client) => {
    sockets.add(client);
    const upstream = createConnection({ host: targetHost, port: targetPort });
    sockets.add(upstream);
    const closeBoth = () => { client.destroy(); upstream.destroy(); };
    client.once('error', closeBoth);
    upstream.once('error', closeBoth);
    client.once('close', () => sockets.delete(client));
    upstream.once('close', () => sockets.delete(upstream));
    client.pipe(upstream).pipe(client);
  });
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(listenPort, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  return {
    host: '127.0.0.1',
    port: address.port,
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
    },
  };
}

export async function startSupabaseRestCompatProxy({ listenPort = 0, targetUrl }) {
  let target;
  try { target = new URL(String(targetUrl)); } catch { target = null; }
  const targetPort = Number(target?.port);
  if ((!Number.isSafeInteger(listenPort) || listenPort < 0 || listenPort > 65535)
    || !target || target.protocol !== 'http:' || target.hostname !== '127.0.0.1'
    || !Number.isSafeInteger(targetPort) || targetPort < 1 || targetPort > 65535
    || target.pathname !== '/' || target.search || target.hash || target.username || target.password) {
    throw new Error('SUPABASE_REST_PROXY_CONTRACT_INVALID');
  }
  const sockets = new Set();
  const upstreamRequests = new Set();
  const server = createHttpServer((request, response) => {
    let incoming;
    try { incoming = new URL(request.url || '', 'http://127.0.0.1'); } catch { incoming = null; }
    const allowedMethods = new Set(['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS']);
    if (!incoming || !allowedMethods.has(request.method || '')
      || (incoming.pathname !== '/rest/v1' && !incoming.pathname.startsWith('/rest/v1/'))) {
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end('{"code":"SUPABASE_REST_PROXY_PATH_INVALID"}');
      return;
    }
    const strippedPath = incoming.pathname.slice('/rest/v1'.length) || '/';
    const upstreamUrl = new URL(target);
    upstreamUrl.pathname = strippedPath;
    upstreamUrl.search = incoming.search;
    const headers = { ...request.headers, host: target.host };
    delete headers.connection;
    const upstream = httpRequest(upstreamUrl, { method: request.method, headers }, (upstreamResponse) => {
      const responseHeaders = { ...upstreamResponse.headers };
      delete responseHeaders.connection;
      response.writeHead(upstreamResponse.statusCode || 502, responseHeaders);
      upstreamResponse.once('error', () => response.destroy());
      upstreamResponse.pipe(response);
    });
    upstreamRequests.add(upstream);
    upstream.once('close', () => upstreamRequests.delete(upstream));
    upstream.once('error', () => {
      if (response.headersSent) response.destroy();
      else {
        response.writeHead(502, { 'content-type': 'application/json' });
        response.end('{"code":"SUPABASE_REST_PROXY_UPSTREAM_FAILED"}');
      }
    });
    request.once('aborted', () => upstream.destroy());
    request.once('error', () => upstream.destroy());
    response.once('close', () => {
      if (!response.writableFinished) upstream.destroy();
    });
    request.pipe(upstream);
  });
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(listenPort, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  return {
    host: '127.0.0.1',
    port: address.port,
    url: `http://127.0.0.1:${address.port}`,
    async close() {
      for (const request of upstreamRequests) request.destroy();
      for (const socket of sockets) socket.destroy();
      await new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
    },
  };
}

async function assertSafeSourceDirectory(path) {
  const stat = await fsPromises.lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('UNSAFE_SUPABASE_SOURCE');
}

async function readSafeSourceFile(path) {
  const before = await fsPromises.lstat(path);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1) throw new Error('UNSAFE_SUPABASE_SOURCE');
  let handle;
  try {
    handle = await fsPromises.open(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    const opened = await handle.stat();
    if (!opened.isFile() || opened.nlink !== 1 || opened.dev !== before.dev || opened.ino !== before.ino) {
      throw new Error('UNSAFE_SUPABASE_SOURCE');
    }
    return await handle.readFile('utf8');
  } finally {
    await handle?.close();
  }
}

async function overwriteSafeFile(filePath, bytes) {
  const before = await fsPromises.lstat(filePath);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1) throw new Error('UNSAFE_MATERIALIZED_CONFIG');
  let handle;
  try {
    handle = await fsPromises.open(filePath, fsConstants.O_WRONLY | fsConstants.O_NOFOLLOW);
    const opened = await handle.stat();
    if (!opened.isFile() || opened.nlink !== 1 || opened.dev !== before.dev || opened.ino !== before.ino) {
      throw new Error('UNSAFE_MATERIALIZED_CONFIG');
    }
    await handle.truncate(0);
    await handle.writeFile(bytes);
    await handle.sync();
  } finally { await handle?.close(); }
}

function buildMidaoE2ELocalConfigWithAuth(canonical, authEnabled) {
  if (typeof canonical !== 'string' || canonical.includes('\0')) {
    throw new Error('MIDAO_E2E_LOCAL_CONFIG_AMBIGUOUS');
  }
  const lines = canonical.split('\n');
  const sectionIndexes = (name) => lines
    .map((line, index) => (line.trim() === `[${name}]` ? index : -1))
    .filter((index) => index >= 0);
  if (sectionIndexes('realtime').length !== 0) {
    throw new Error('MIDAO_E2E_LOCAL_CONFIG_AMBIGUOUS');
  }
  for (const section of ['storage', 'auth']) {
    const indexes = sectionIndexes(section);
    if (indexes.length !== 1) throw new Error('MIDAO_E2E_LOCAL_CONFIG_AMBIGUOUS');
    const sectionEnd = lines.findIndex((line, index) => index > indexes[0] && /^\s*\[/u.test(line));
    const end = sectionEnd < 0 ? lines.length : sectionEnd;
    const enabled = lines
      .map((line, index) => (index > indexes[0] && index < end && /^\s*enabled\s*=/u.test(line) ? index : -1))
      .filter((index) => index >= 0);
    if (enabled.length !== 1 || !/^\s*enabled\s*=\s*true\s*$/u.test(lines[enabled[0]])) {
      throw new Error('MIDAO_E2E_LOCAL_CONFIG_AMBIGUOUS');
    }
    lines[enabled[0]] = `enabled = ${section === 'auth' ? String(authEnabled) : 'false'}`;
  }
  return `${lines.join('\n').trimEnd()}\n\n`
    + '# Task 14 local E2E only: disable unused one-shot jobs that CLI 2.87.2 cannot stream to EOF\n'
    + '# on Docker Engine API 1.43. App guide/admin auth, PostgREST, Kong, and PostgreSQL remain enabled.\n'
    + '[realtime]\nenabled = false\n';
}

export function buildMidaoE2ELocalConfig(canonical) {
  return buildMidaoE2ELocalConfigWithAuth(canonical, false);
}

export function buildMidaoRealAuthE2ELocalConfig(canonical) {
  return buildMidaoE2ELocalConfigWithAuth(canonical, true);
}

export async function prepareBaselineWorkdirWithAdapters({
  repoRoot, lockDir, fullServices = false,
  verifyCapture, verifyExpected, materialize, readFullConfig, rewriteFullConfig,
}) {
  for (const fn of [verifyCapture, verifyExpected, materialize]) {
    if (typeof fn !== 'function') throw new Error('BASELINE_WORKDIR_ADAPTER_INVALID');
  }
  if (fullServices && (typeof readFullConfig !== 'function' || typeof rewriteFullConfig !== 'function')) {
    throw new Error('BASELINE_WORKDIR_FULL_SERVICE_ADAPTER_INVALID');
  }
  const projectId = canonicalProjectId(repoRoot);
  const parent = join(lockDir, 'db-only-workdir');
  let capture; let expected; let materialized; let parentIdentity; let primary;
  try {
    try {
      capture = await verifyCapture();
    expected = await verifyExpected({ capture });
    if (expected.manifest.captureTransactionId !== capture.transactionId
      || expected.manifest.captureManifestSha256 !== capture.ledger.captureManifestSha256) {
      throw new Error('BASELINE_EXPECTED_CAPTURE_BINDING_MISMATCH');
    }
    await fsPromises.rm(parent, { recursive: true, force: true });
    await fsPromises.mkdir(parent, { mode: 0o700 });
    parentIdentity = await fsPromises.lstat(parent);
    if (!parentIdentity.isDirectory() || parentIdentity.isSymbolicLink() || (parentIdentity.mode & 0o777) !== 0o700) {
      throw new Error('UNSAFE_BASELINE_WORKDIR_PARENT');
    }
    materialized = await materialize({
      outputParent: parent,
      projectId,
      postCutoffManifest: expected.manifest,
    });
    if (materialized.transactionId !== capture.transactionId) {
      throw new Error('BASELINE_MATERIALIZER_CAPTURE_BINDING_MISMATCH');
    }
    const materializedVersions = materialized.history.map((name) => name.slice(0, 14));
    if (JSON.stringify(materializedVersions) !== JSON.stringify(expected.manifest.historyVersions)) {
      throw new Error('BASELINE_MATERIALIZER_EXPECTED_HISTORY_MISMATCH');
    }
    let fullServicesAttempted = false;
    return {
      workdir: materialized.workdir,
      history: materialized.history,
      seedPath: materialized.seedPath,
      stageCliReplay: (...args) => materialized.stageCliReplay(...args),
      cleanupCliMetadata: (...args) => materialized.cleanupCliMetadata(...args),
      migrationNames: [...materialized.history],
      captureTransactionId: capture.transactionId,
      expectedTransactionId: expected.transactionId,
      async enableFullServices() {
        if (!fullServices || fullServicesAttempted) throw new Error('BASELINE_WORKDIR_FULL_SERVICE_STATE_INVALID');
        fullServicesAttempted = true;
        const configBytes = await readFullConfig();
        try {
          if (!Buffer.isBuffer(configBytes)) throw new Error('BASELINE_WORKDIR_FULL_SERVICE_CONFIG_INVALID');
          await rewriteFullConfig(materialized.workdir, configBytes);
        } finally { if (Buffer.isBuffer(configBytes)) configBytes.fill(0); }
      },
      async cleanup() {
        let first;
        try { await materialized.cleanup(); } catch (error) { first = error; }
        try {
          const current = await fsPromises.lstat(parent);
          if (current.dev !== parentIdentity.dev || current.ino !== parentIdentity.ino || !current.isDirectory()) {
            throw new Error('BASELINE_WORKDIR_PARENT_IDENTITY_CHANGED');
          }
          await fsPromises.rmdir(parent);
        } catch (error) {
          if (first) throw new AggregateError([first, error], 'baseline workdir cleanup failed');
          throw error;
        }
        if (first) throw first;
      },
    };
  } catch (error) { primary = error; }
  const cleanupErrors = [];
  if (materialized) { try { await materialized.cleanup(); } catch (error) { cleanupErrors.push(error); } }
  if (parentIdentity) {
    try {
      const current = await fsPromises.lstat(parent);
      if (current.dev !== parentIdentity.dev || current.ino !== parentIdentity.ino || !current.isDirectory()) {
        throw new Error('BASELINE_WORKDIR_PARENT_IDENTITY_CHANGED');
      }
      await fsPromises.rmdir(parent);
    } catch (error) { cleanupErrors.push(error); }
  }
    if (cleanupErrors.length) throw new AggregateError([primary, ...cleanupErrors], 'baseline workdir setup failed and cleanup held');
    throw primary;
  } finally { expected?.dispose(); capture?.dispose(); }
}

export async function prepareDatabaseOnlyWorkdir({ repoRoot, lockDir, fullServices = false, realAuth = false }) {
  if (realAuth && !fullServices) throw new Error('MIDAO_REAL_AUTH_REQUIRES_FULL_SERVICES');
  return prepareBaselineWorkdirWithAdapters({
    repoRoot, lockDir, fullServices,
    verifyCapture: () => verifyCaptureTransaction({
      baselineDir: join(repoRoot, 'supabase/baselines/v1'),
      ledgerPath: join(repoRoot, 'docs/operations/baseline-ledger.json'),
      journalPath: resolveRepositoryPublicationPaths().journalPath,
    }),
    verifyExpected: ({ capture }) => verifyExpectedTerminalTransaction({
      baselineDir: join(repoRoot, 'supabase/baselines/v1'),
      ledgerPath: join(repoRoot, 'docs/operations/expected-terminal-ledger.json'),
      captureLedgerPath: join(repoRoot, 'docs/operations/baseline-ledger.json'),
      journalPath: resolveExpectedTerminalPublicationPaths().journalPath,
    }).then((verified) => {
      if (verified.manifest.captureTransactionId !== capture.transactionId
        || verified.manifest.captureManifestSha256 !== capture.ledger.captureManifestSha256) {
        verified.dispose(); throw new Error('BASELINE_EXPECTED_CAPTURE_BINDING_MISMATCH');
      }
      return verified;
    }),
    materialize: ({ outputParent, projectId: id, postCutoffManifest }) => materializeFreshWorkdir({
      outputParent,
      projectId: id,
      postCutoffManifest,
    }),
    readFullConfig: () => readSafeSourceFile(join(repoRoot, 'supabase/config.toml')).then((text) => Buffer.from(text)),
    rewriteFullConfig: async (workdir, bytes) => {
      const canonical = bytes.toString('utf8');
      const localOverlay = realAuth ? buildMidaoRealAuthE2ELocalConfig(canonical) : buildMidaoE2ELocalConfig(canonical);
      await overwriteSafeFile(join(workdir, 'supabase/config.toml'), Buffer.from(localOverlay));
    },
  });
}

export const SUPABASE_PROJECT_ID_MAX_LENGTH = 40;

// Mirrors the project id normalization of the pinned Supabase CLI 2.87.2, measured with 20 clean-room
// probes recorded in docs/operations/session-handoffs/2026-08-08-issue1759-infra-40char-truncation-plan.md (§2.2).
// The order below is load-bearing (probe case 11 proves stripping happens before truncation):
//   1. strip every leading non-[A-Za-z0-9] character (greedy)
//   2. spaces -> underscore, then drop every non-ASCII character (no lowercasing, dots kept verbatim)
//   3. slice(0, 40) — a plain prefix slice: no hash, no ellipsis, trailing punctuation is kept as-is
// When the pinned CLI version changes, rerun the §2.1 probe and update only this function.
export function normalizeSupabaseProjectId(value) {
  return String(value ?? '')
    .replace(/^[^A-Za-z0-9]+/u, '')
    .replace(/ /gu, '_')
    // eslint-disable-next-line no-control-regex
    .replace(/[^\x00-\x7F]/gu, '')
    .slice(0, SUPABASE_PROJECT_ID_MAX_LENGTH);
}

export function canonicalProjectId(repoRoot) {
  const projectId = basename(resolve(repoRoot));
  if (!projectId || !/^[a-z0-9_-]+$/u.test(projectId)) throw new Error('INVALID_PROJECT_ID');
  const normalized = normalizeSupabaseProjectId(projectId);
  if (!normalized) throw new Error('INVALID_PROJECT_ID');
  return normalized;
}

function nonemptyLines(text) {
  return String(text || '').split(/\r?\n/u).filter((line) => line.length > 0);
}

function stripPinnedUpdateNotice(value) {
  return String(value ?? '').replace(
    /A new version of Supabase CLI is available: v\d{1,4}\.\d{1,4}\.\d{1,4} \(currently installed v2\.87\.2\)\r?\nWe recommend updating regularly for new features and bug fixes: https:\/\/supabase\.com\/docs\/guides\/cli\/getting-started#updating-the-supabase-cli\r?\n$/u,
    '',
  );
}

export function validateSupabaseLifecycleStderr(stderr, expectedWorkdirOrContract, legacyStage) {
  let expectedWorkdir;
  let stage;
  let migrationNames;
  let noticesByMigration;
  if (expectedWorkdirOrContract && typeof expectedWorkdirOrContract === 'object' && !Array.isArray(expectedWorkdirOrContract)) {
    const keys = Object.keys(expectedWorkdirOrContract).sort().join(',');
    if (keys !== 'expectedWorkdir,migrationNames,noticesByMigration,stage') throw new Error('CLI_LIFECYCLE_CONTRACT_INVALID');
    ({ expectedWorkdir, stage, migrationNames, noticesByMigration } = expectedWorkdirOrContract);
  } else {
    expectedWorkdir = expectedWorkdirOrContract;
    stage = legacyStage;
    migrationNames = [
      '00000000000001_midao_test_bootstrap.sql',
      ...FOUNDATION_MIGRATIONS.map((name, index) => `${String(index + 2).padStart(14, '0')}_${name}`),
    ];
    noticesByMigration = {
      '00000000000001_midao_test_bootstrap.sql': ['NOTICE (42710): extension "pgcrypto" already exists, skipping'],
    };
  }
  if (!expectedWorkdir) {
    if (stderr !== '') throw new Error(`CLI_UNEXPECTED_STDERR: ${redactSupabaseOutput(stderr).trim()}`);
    return;
  }
  if (!isAbsolute(expectedWorkdir) || !['start', 'reset'].includes(stage)
    || !Array.isArray(migrationNames) || migrationNames.length < 1 || migrationNames.length > 256
    || new Set(migrationNames).size !== migrationNames.length
    || migrationNames.some((name) => typeof name !== 'string' || !/^\d{14}_[a-z0-9][a-z0-9_]*\.sql$/u.test(name))
    || !noticesByMigration || typeof noticesByMigration !== 'object' || Array.isArray(noticesByMigration)
    || Object.keys(noticesByMigration).some((name) => !migrationNames.includes(name))
    || Object.values(noticesByMigration).some((lines) => !Array.isArray(lines) || lines.length > 64
      || lines.some((line) => typeof line !== 'string' || line.length === 0 || /[\r\n\0]/u.test(line)))) {
    throw new Error('CLI_LIFECYCLE_CONTRACT_INVALID');
  }
  const common = [
    `Using workdir ${expectedWorkdir}`,
    ...(stage === 'start' ? ['Starting database...'] : ['Resetting local database...', 'Recreating database...']),
    'Initialising schema...',
    'Seeding globals from roles.sql...',
  ];
  const expectedLines = [
    ...common,
    ...migrationNames.flatMap((name) => [`Applying migration ${name}...`, ...(noticesByMigration[name] ?? [])]),
    ...(stage === 'reset' ? ['Restarting containers...', 'Finished supabase db reset on branch main.'] : []),
  ];
  const lf = `${expectedLines.join('\n')}\n`;
  const crlf = `${expectedLines.join('\r\n')}\r\n`;
  const normalized = stripPinnedUpdateNotice(stderr);
  if (normalized !== lf && normalized !== crlf) throw new Error(`CLI_UNEXPECTED_STDERR: ${redactSupabaseOutput(stderr).trim()}`);
}

export function validateCliWorkdirNotice(stderr, expectedWorkdir, expectedProjectId, fullServices = false) {
  const value = stripPinnedUpdateNotice(stderr);
  if (!expectedWorkdir) {
    if (value !== '') throw new Error('CLI_UNEXPECTED_STDERR');
    return;
  }
  const accepted = [
    `Using workdir ${expectedWorkdir}\n`,
    `Using workdir ${expectedWorkdir}\r\n`,
  ];
  if (expectedProjectId) {
    const stoppedServiceNames = fullServices
      ? STOPPED_SERVICE_NAMES.filter((service) => !FULL_SERVICE_RUNNING_SERVICE_NAMES.includes(service))
      : STOPPED_SERVICE_NAMES;
    const stopped = `Stopped services: [${stoppedServiceNames.map((service) => `supabase_${service}_${expectedProjectId}`).join(' ')}]`;
    accepted.push(
      `Using workdir ${expectedWorkdir}\n${stopped}\n`,
      `Using workdir ${expectedWorkdir}\r\n${stopped}\r\n`,
    );
  }
  if (!accepted.includes(value)) throw new Error(`CLI_UNEXPECTED_STDERR: ${redactSupabaseOutput(value).trim()}`);
}

export function classifySupabaseStatus({ exitCode, stdout, stderr, expectedProjectId, expectedWorkdir }) {
  // #1759 guard: every caller must go through canonicalProjectId(). A non-normalized id here means a new
  // call path bypassed it, and the mismatch would otherwise degrade into an opaque STATUS_UNCLASSIFIED.
  if (expectedProjectId !== normalizeSupabaseProjectId(expectedProjectId)) {
    throw new Error(`STATUS_PROJECT_ID_NOT_NORMALIZED: expected=${JSON.stringify(normalizeSupabaseProjectId(expectedProjectId))} actual=${JSON.stringify(String(expectedProjectId ?? ''))}`);
  }
  const unclassified = (expected) => new Error(
    `STATUS_UNCLASSIFIED: expected=${JSON.stringify(redactSupabaseOutput(expected))}`
    + ` actual=${JSON.stringify(redactSupabaseOutput(String(stderr ?? '')).slice(-2000))}`
    + ` exitCode=${JSON.stringify(exitCode)} stdoutLength=${String(stdout ?? '').length}`,
  );
  if (exitCode === 0) {
    if (String(stderr || '').trim()) throw new Error('STATUS_UNEXPECTED_STDERR');
    return 'running';
  }
  const exactLine = `failed to inspect container health: Error response from daemon: No such container: supabase_db_${expectedProjectId}`;
  const prefixLf = expectedWorkdir ? `Using workdir ${expectedWorkdir}\n` : '';
  const prefixCrlf = expectedWorkdir ? `Using workdir ${expectedWorkdir}\r\n` : '';
  const lf = `${prefixLf}${exactLine}\n${HELP_LINE}\n`;
  const crlf = `${prefixCrlf}${exactLine}\r\n${HELP_LINE}\r\n`;
  if (exitCode !== 1 || String(stdout || '').length !== 0) throw unclassified(lf);
  if (stderr !== lf && stderr !== crlf) throw unclassified(lf);
  return 'not-running';
}

async function flockFileDescriptor(fd) {
  return new Promise((resolveResult, reject) => {
    const child = spawn('flock', ['--exclusive', '--nonblock', '3'], {
      stdio: ['ignore', 'ignore', 'pipe', fd],
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (exitCode) => resolveResult({ exitCode: exitCode ?? 1, stderr }));
  });
}

function safeMode(stat) {
  return stat.mode & 0o777;
}

async function writeJsonAtStart(handle, value) {
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`, 'utf8');
  await handle.truncate(0);
  let offset = 0;
  while (offset < bytes.length) {
    const result = await handle.write(bytes, offset, bytes.length - offset, offset);
    if (!result || result.bytesWritten <= 0) throw new Error('LOCK_METADATA_SHORT_WRITE');
    offset += result.bytesWritten;
  }
  await handle.sync();
}

export async function acquireKernelRunnerLock({ lockDir = LOCK_PATH, metadata = {} } = {}) {
  const ownerUid = typeof process.getuid === 'function' ? process.getuid() : null;
  try {
    await fsPromises.mkdir(lockDir, { mode: 0o700 });
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
  }
  const directory = await fsPromises.lstat(lockDir);
  if (!directory.isDirectory() || directory.isSymbolicLink() || safeMode(directory) !== 0o700 || (ownerUid !== null && directory.uid !== ownerUid)) {
    throw new Error('UNSAFE_LOCK_DIRECTORY');
  }

  const lockFile = resolve(lockDir, 'runner.lock');
  let handle;
  try {
    handle = await fsPromises.open(lockFile, fsConstants.O_CREAT | fsConstants.O_RDWR | fsConstants.O_NOFOLLOW, 0o600);
    const identity = await handle.stat();
    if (!identity.isFile() || identity.nlink !== 1 || safeMode(identity) !== 0o600 || (ownerUid !== null && identity.uid !== ownerUid)) {
      throw new Error('UNSAFE_LOCK_FILE');
    }
    const locked = await flockFileDescriptor(handle.fd);
    if (locked.exitCode !== 0) throw new Error('LOCK_HELD');
    const record = { pid: process.pid, ...metadata };
    await writeJsonAtStart(handle, record);
    return { handle, lockFile, record };
  } catch (error) {
    await handle?.close().catch(() => {});
    if (String(error?.message || '').startsWith('UNSAFE_LOCK') || error?.code === 'ELOOP' || error?.code === 'EISDIR') {
      throw new Error('UNSAFE_LOCK');
    }
    throw error;
  }
}

export async function releaseKernelRunnerLock(lock) {
  if (!lock?.handle) throw new Error('LOCK_RELEASE_IDENTITY_MISSING');
  let failure;
  try {
    await writeJsonAtStart(lock.handle, { ...lock.record, released: true });
  } catch (error) {
    failure = error;
  }
  try {
    await lock.handle.close();
  } catch (error) {
    if (!failure) failure = error;
  }
  if (failure) throw failure;
}

const SUPABASE_CONTAINER_ROLES = Object.freeze([
  'analytics', 'auth', 'db', 'edge_runtime', 'imgproxy', 'inbucket', 'kong', 'meta',
  'pg_meta', 'pooler', 'realtime', 'realtime_health', 'rest', 'storage', 'studio', 'vector',
]);

function expectedProjectResourceNames(expectedProjectId, resourceType) {
  if (resourceType === 'container') {
    return new Set(SUPABASE_CONTAINER_ROLES.map((role) => `supabase_${role}_${expectedProjectId}`));
  }
  if (resourceType === 'network') return new Set([`supabase_network_${expectedProjectId}`]);
  if (resourceType === 'volume') return new Set([`supabase_db_${expectedProjectId}`]);
  throw new Error('OWNERSHIP_RESOURCE_TYPE_INVALID');
}

export function confirmProjectContainers({ expectedProjectId, containers, resourceType = 'container' }) {
  if (!Array.isArray(containers) || containers.length === 0) throw new Error('OWNERSHIP_EMPTY');
  const expectedNames = expectedProjectResourceNames(expectedProjectId, resourceType);
  const seen = new Set();
  const normalized = containers.map((container) => {
    const row = {
      id: String(container?.id || ''),
      name: String(container?.name || ''),
      projectLabel: String(container?.projectLabel || ''),
    };
    if (!row.id || seen.has(row.id) || row.projectLabel !== expectedProjectId || !expectedNames.has(row.name)) {
      throw new Error('OWNERSHIP_INVALID');
    }
    seen.add(row.id);
    return row;
  });
  return normalized.sort((a, b) => a.name.localeCompare(b.name));
}

export function assertOwnershipUnchanged(owned, current) {
  const left = JSON.stringify([...owned].sort((a, b) => a.name.localeCompare(b.name)));
  const right = JSON.stringify([...current].sort((a, b) => a.name.localeCompare(b.name)));
  if (left !== right) throw new Error('OWNERSHIP_DRIFT');
}

export function buildSupabaseCliInvocation(pin, cliArgs) {
  if (pin !== '2.87.2') throw new Error('UNEXPECTED_SUPABASE_PIN');
  return {
    command: SUPABASE_TOOLCHAIN_BIN,
    args: cliArgs,
  };
}

export function redactSupabaseOutput(text, secrets = []) {
  let redacted = String(text ?? '');
  for (const secret of secrets.filter((item) => typeof item === 'string' && item.length > 0).sort((a, b) => b.length - a.length)) {
    redacted = redacted.split(secret).join('[REDACTED]');
  }
  redacted = redacted
    .replace(/(postgres(?:ql)?:\/\/[^:\s/]+:)[^@\s/]+(@)/giu, '$1[REDACTED]$2')
    .replace(/("?(?:anon_key|service_role_key|jwt_secret)"?\s*[:=]\s*"?)[^",\s]+/giu, '$1[REDACTED]');
  return redacted;
}

function redactRunnerDiagnostic(text, secrets = []) {
  return redactSupabaseOutput(text, secrets)
    .replace(/postgres(?:ql)?:\/\/[^\s]+/giu, '[REDACTED_DATABASE_URL]');
}

const SAFE_RUNNER_AGGREGATE_MESSAGES = new Set([
  'baseline workdir cleanup failed',
  'baseline workdir setup failed and cleanup held',
  'start and partial ownership probe failed',
  'reset and ownership probe failed',
  'resource-class cleanup failed',
  'local Supabase run and cleanup failed',
  'owned Supabase asset cleanup failed',
  'PostgREST start and ownership adoption failed',
  'Midao baseline runner and cleanup failed',
]);
const SAFE_RUNNER_ERROR_CODES = new Set([
  'OWNED_CONTAINER_CLEANUP_FAILED',
  'OWNED_NETWORK_CLEANUP_FAILED',
  'OWNED_VOLUME_CLEANUP_FAILED',
  'REPLAY_RESTORE_FAILED',
  'CLI_METADATA_CLEANUP_FAILED',
  'DATABASE_WORKDIR_CLEANUP_FAILED',
  'API_COMPAT_PROXY_CLOSE_FAILED',
  'API_BRIDGE_CLOSE_FAILED',
  'DATABASE_BRIDGE_CLOSE_FAILED',
  'RUNNER_LOCK_RELEASE_FAILED',
]);
const SAFE_RUNNER_ERROR_PREFIX_CODES = Object.freeze([
  'SUPABASE_START_FAILED',
  'SUPABASE_DATABASE_HANDOFF_STOP_FAILED',
  'SUPABASE_SERVICE_START_FAILED',
]);
// #1759 route (a): diagnostic-bearing codes surface their full redacted message instead of the bare code,
// while connection URLs remain hidden from durable runner output.
const SAFE_RUNNER_DIAGNOSTIC_PREFIX_CODES = Object.freeze([
  'STATUS_UNCLASSIFIED',
  'STATUS_PROJECT_ID_NOT_NORMALIZED',
  'MIDAO_E2E_TRAVELER_ADMIN_USER_FAILED_DEBUG',
  'MIDAO_E2E_SEED_FAILED_TMPDEBUG',
  'MIDAO_E2E_LOCAL_ENV_MISSING_TMPDEBUG',
  'MIDAO_SEED_FAILED_TMPDEBUG',
]);

export function formatMidaoRunnerFailure(error, secrets = []) {
  const lines = [];
  const seen = new Set();
  const visit = (entry) => {
    if (!entry || seen.has(entry)) return;
    seen.add(entry);
    const message = entry instanceof Error ? entry.message : String(entry);
    const matchesCode = (code) => message === code || message.startsWith(`${code}:`);
    const safePrefix = SAFE_RUNNER_ERROR_PREFIX_CODES.find(matchesCode);
    const diagnosticPrefix = SAFE_RUNNER_DIAGNOSTIC_PREFIX_CODES.find(matchesCode);
    const safe = SAFE_RUNNER_AGGREGATE_MESSAGES.has(message) || SAFE_RUNNER_ERROR_CODES.has(message)
      ? redactSupabaseOutput(message, secrets)
      : diagnosticPrefix || safePrefix
        ? redactRunnerDiagnostic(message, secrets)
      : safePrefix ?? '[REDACTED_ERROR]';
    lines.push(safe);
    if (entry instanceof AggregateError && Array.isArray(entry.errors)) {
      for (const child of entry.errors) visit(child);
    }
  };
  visit(error);
  return lines.join('\n');
}

async function probeOwnedResources(adapter, expectedProjectId, { allowEmpty = false } = {}) {
  const errors = [];
  const confirm = (result, label) => {
    if (result.status === 'rejected') {
      errors.push(new Error(`${label} ownership probe failed`, { cause: result.reason }));
      return null;
    }
    if (!Array.isArray(result.value)) {
      errors.push(new Error(`${label} ownership probe invalid`));
      return null;
    }
    if (allowEmpty && result.value.length === 0) return [];
    try { return confirmProjectContainers({ expectedProjectId, containers: result.value, resourceType: label }); }
    catch (error) { errors.push(error); return null; }
  };
  if (typeof adapter.networks === 'function' || typeof adapter.volumes === 'function') {
    const [containerResult, networkResult, volumeResult] = await Promise.allSettled([
      adapter.containers(),
      typeof adapter.networks === 'function' ? adapter.networks({ allowEmpty }) : Promise.resolve([]),
      typeof adapter.volumes === 'function' ? adapter.volumes({ allowEmpty }) : Promise.resolve([]),
    ]);
    return {
      containers: confirm(containerResult, 'container'), networks: confirm(networkResult, 'network'),
      volumes: confirm(volumeResult, 'volume'), errors,
    };
  }
  const [containerResult, assetResult] = await Promise.allSettled([
    adapter.containers(), adapter.assets ? adapter.assets({ allowEmpty }) : Promise.resolve(null),
  ]);
  const containers = confirm(containerResult, 'container');
  if (assetResult.status === 'rejected') {
    errors.push(new Error('asset ownership probe failed', { cause: assetResult.reason }));
    return { containers, networks: null, volumes: null, errors };
  }
  const assets = assetResult.value;
  if (assets === null) return { containers, networks: null, volumes: null, errors };
  if (!assets || !Array.isArray(assets.networks) || !Array.isArray(assets.volumes)) {
    errors.push(new Error('asset ownership probe invalid'));
    return { containers, networks: null, volumes: null, errors };
  }
  return {
    containers,
    networks: confirm({ status: 'fulfilled', value: assets.networks }, 'network'),
    volumes: confirm({ status: 'fulfilled', value: assets.volumes }, 'volume'),
    errors,
  };
}

function ownershipAssets(ownership) {
  if (ownership.networks === null && ownership.volumes === null) return null;
  return { networks: ownership.networks ?? [], volumes: ownership.volumes ?? [] };
}

function adoptOwnership(current, probe) {
  for (const resource of ['containers', 'networks', 'volumes']) if (probe[resource] !== null) current[resource] = probe[resource];
}

function requireOwnershipProbe(probe, label) {
  if (probe.errors.length) throw new AggregateError(probe.errors, `${label} ownership probe failed`);
  return probe;
}

function adoptRequiredOwnership(current, probe, label) {
  adoptOwnership(current, probe);
  return requireOwnershipProbe(probe, label);
}

function extendRequiredOwnership(current, probe, label) {
  requireOwnershipProbe(probe, label);
  for (const resource of ['containers', 'networks', 'volumes']) {
    if (probe[resource] === null) continue;
    if (current[resource] !== null) {
      const nextRows = new Set(probe[resource].map((row) => JSON.stringify(row)));
      if (current[resource].some((row) => !nextRows.has(JSON.stringify(row)))) throw new Error('OWNERSHIP_DRIFT');
    }
    current[resource] = probe[resource];
  }
  return probe;
}

export async function runWithLocalSupabase({
  adapter, expectedProjectId, childArgs, signal, reportStage = () => {},
  initialize = 'start-then-reset', onReady,
}) {
  if (!['start-then-reset', 'start-only'].includes(initialize)
    || (onReady !== undefined && typeof onReady !== 'function')
    || (onReady && Array.isArray(childArgs) && childArgs.length > 0)) throw new Error('RUNNER_CALLBACK_CONTRACT_INVALID');
  const ownership = { containers: null, networks: null, volumes: null };
  let localEnv;
  let value;
  let primaryError;
  try {
    reportStage('status');
    const status = await adapter.status();
    const classification = classifySupabaseStatus({ ...status, expectedProjectId });
    if (classification === 'running') throw new Error('ALREADY_RUNNING');
    if (typeof adapter.assertNoPreexistingResources !== 'function') {
      throw new Error('RUNNER_PRESTART_OWNERSHIP_CONTRACT_MISSING');
    }
    reportStage('pre-start-residue');
    await adapter.assertNoPreexistingResources();
    try {
      reportStage('start');
      await adapter.start();
    } catch (startError) {
      reportStage('start-failed-identity');
      const probe = await probeOwnedResources(adapter, expectedProjectId, { allowEmpty: true });
      adoptOwnership(ownership, probe);
      if (probe.errors.length) throw new AggregateError([startError, ...probe.errors], 'start and partial ownership probe failed');
      throw startError;
    }
    if (initialize === 'start-then-reset') {
      reportStage('pre-reset-identity');
      adoptRequiredOwnership(ownership, await probeOwnedResources(adapter, expectedProjectId), 'pre-reset');
      reportStage('pre-reset-health');
      if (adapter.waitForDatabase) await adapter.waitForDatabase(ownership.containers);
      reportStage('reset');
      try { await adapter.reset(); }
      catch (resetError) {
        reportStage('post-reset-failed-identity');
        const probe = await probeOwnedResources(adapter, expectedProjectId, { allowEmpty: true });
        adoptOwnership(ownership, probe);
        if (probe.errors.length) throw new AggregateError([resetError, ...probe.errors], 'reset and ownership probe failed');
        throw resetError;
      }
      reportStage('post-reset-identity');
      adoptRequiredOwnership(ownership, await probeOwnedResources(adapter, expectedProjectId), 'post-reset');
      reportStage('post-reset-health');
      if (adapter.waitForDatabase) await adapter.waitForDatabase(ownership.containers);
    } else {
      reportStage('post-start-identity');
      adoptRequiredOwnership(ownership, await probeOwnedResources(adapter, expectedProjectId), 'post-start');
      reportStage('post-start-health');
      if (adapter.waitForDatabase) await adapter.waitForDatabase(ownership.containers);
    }
    reportStage('status-json');
    localEnv = adapter.statusJson ? await adapter.statusJson() : {};
    reportStage('ready');
    if (adapter.ready) await adapter.ready(localEnv);
    if (onReady) {
      reportStage('on-ready');
      const refreshOwnership = async () => {
        reportStage('refresh-identity');
        extendRequiredOwnership(
          ownership,
          await probeOwnedResources(adapter, expectedProjectId),
          'refresh',
        );
        return { ownedContainers: ownership.containers, ownedAssets: ownershipAssets(ownership) };
      };
      value = await onReady({
        localEnv,
        ownedContainers: ownership.containers,
        ownedAssets: ownershipAssets(ownership),
        refreshOwnership,
      });
    } else if (adapter.child) {
      reportStage('child');
      const child = await adapter.child(childArgs, localEnv);
      if (child.exitCode !== 0) throw new Error(`CHILD_FAILED_${child.exitCode}`);
    }
    reportStage('complete');
  } catch (error) {
    primaryError = error;
  }

  let cleanupError;
  if (Object.values(ownership).some((value) => value !== null)) {
    const cleanupErrors = [];
    reportStage('cleanup-identity');
    const current = await probeOwnedResources(adapter, expectedProjectId, { allowEmpty: true });
    cleanupErrors.push(...current.errors);
    const safe = { containers: [], networks: [], volumes: [] };
    for (const resource of ['containers', 'networks', 'volumes']) {
      if (ownership[resource] === null || current[resource] === null) continue;
      try {
        assertOwnershipUnchanged(ownership[resource], current[resource]);
        safe[resource] = ownership[resource];
      } catch (error) { cleanupErrors.push(error); }
    }
    if (Object.values(safe).some((resources) => resources.length > 0)) {
      reportStage('cleanup');
      try { await adapter.stop(safe.containers, { networks: safe.networks, volumes: safe.volumes }); }
      catch (error) { cleanupErrors.push(error); }
    }
    if (cleanupErrors.length === 1) [cleanupError] = cleanupErrors;
    else if (cleanupErrors.length > 1) cleanupError = new AggregateError(cleanupErrors, 'resource-class cleanup failed');
  }
  const signalError = signal?.aborted ? new Error('RUNNER_SIGNALLED') : null;
  const errors = [primaryError, cleanupError, signalError].filter(Boolean);
  if (errors.length > 1) throw new AggregateError(errors, 'local Supabase run and cleanup failed');
  if (errors.length === 1) throw errors[0];
  return { exitCode: 0, localEnv, value };
}

export function runCommand(command, args, { cwd, env = process.env, signal } = {}) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(command, args, { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const onAbort = () => {
      try { process.kill(-child.pid, 'SIGTERM'); } catch (error) {
        if (error?.code !== 'ESRCH') child.kill('SIGTERM');
      }
    };
    const detachAbort = () => signal?.removeEventListener('abort', onAbort);
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', (error) => { detachAbort(); reject(error); });
    child.once('close', (exitCode, childSignal) => {
      detachAbort();
      resolveResult({ exitCode: exitCode ?? 1, signal: childSignal, stdout, stderr });
    });
  });
}

export async function startMidaoApiServer({ repoRoot, nodeBin, environment, signal, port = 43127 }) {
  const numericPort = Number(port);
  if (!isAbsolute(repoRoot) || !isAbsolute(nodeBin) || !environment || typeof environment !== 'object'
    || !Number.isSafeInteger(numericPort) || numericPort < 1024 || numericPort > 65535) {
    throw new Error('MIDAO_API_SERVER_CONTRACT_INVALID');
  }
  const nextBin = join(repoRoot, 'node_modules/next/dist/bin/next');
  const [nodeStat, nextStat] = await Promise.all([fsPromises.lstat(nodeBin), fsPromises.lstat(nextBin)]);
  if (!nodeStat.isFile() || nodeStat.isSymbolicLink() || (nodeStat.mode & 0o111) === 0
    || !nextStat.isFile() || nextStat.isSymbolicLink()) {
    throw new Error('MIDAO_API_SERVER_BINARY_INVALID');
  }
  const baseUrl = `http://127.0.0.1:${numericPort}`;
  const child = spawn(nodeBin, [nextBin, 'dev', '--hostname', '127.0.0.1', '--port', String(numericPort)], {
    cwd: join(repoRoot, 'apps/web'),
    env: {
      ...environment,
      PORT: String(numericPort),
      NODE_ENV: 'development',
      VERCEL_ENV: 'preview',
      MIDAO_E2E_LOCAL: '1',
      NEXT_TELEMETRY_DISABLED: '1',
      CHOKIDAR_USEPOLLING: '1',
      WATCHPACK_POLLING: 'true',
      CHOKIDAR_INTERVAL: '1000',
    },
    detached: true,
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  let exited = false;
  const closed = new Promise((resolveClose) => {
    child.once('close', () => { exited = true; resolveClose(); });
    child.once('error', () => { exited = true; resolveClose(); });
  });
  const close = async () => {
    if (!exited) {
      try { process.kill(-child.pid, 'SIGTERM'); } catch (error) {
        if (error?.code !== 'ESRCH') child.kill('SIGTERM');
      }
      await Promise.race([closed, new Promise((resolveDelay) => setTimeout(resolveDelay, 10_000))]);
    }
    if (!exited) {
      try { process.kill(-child.pid, 'SIGKILL'); } catch (error) {
        if (error?.code !== 'ESRCH') child.kill('SIGKILL');
      }
      await closed;
    }
  };
  try {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      if (signal?.aborted) throw new Error('RUNNER_SIGNALLED');
      if (exited) throw new Error('MIDAO_API_SERVER_EXITED');
      try {
        const response = await fetch(`${baseUrl}/images/placeholder-avatar.svg`, {
          signal: AbortSignal.timeout(2_000),
        });
        if (response.status === 200) return { baseUrl, close };
      } catch (error) {
        if (signal?.aborted) throw new Error('RUNNER_SIGNALLED');
      }
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
    }
    throw new Error('MIDAO_API_SERVER_TIMEOUT');
  } catch (error) {
    await close();
    throw error;
  }
}

function parseContainerRows(stdout, expectedProjectId) {
  return nonemptyLines(stdout).map((line) => {
    const [id, name, label] = line.split('\t');
    return { id, name, projectLabel: label || '' };
  });
}

export function mapStatusEnvironment(raw) {
  let status;
  try { status = JSON.parse(raw); } catch { throw new Error('INVALID_STATUS_JSON'); }
  if (typeof status.DB_URL !== 'string' || !status.DB_URL) throw new Error('STATUS_JSON_MISSING_DB_URL');
  const environment = {
    DATABASE_URL: status.DB_URL,
    SUPABASE_DB_URL: status.DB_URL,
  };
  const optional = ['API_URL', 'ANON_KEY', 'SERVICE_ROLE_KEY'];
  const present = optional.filter((key) => typeof status[key] === 'string' && status[key]);
  if (present.length !== 0 && present.length !== optional.length) throw new Error('STATUS_JSON_INCOMPLETE_API_ENV');
  if (present.length === optional.length) Object.assign(environment, {
    SUPABASE_URL: status.API_URL,
    NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
    SUPABASE_ANON_KEY: status.ANON_KEY,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
  });
  return environment;
}

export function buildMidaoPlaywrightEnvironment({ parentEnv = process.env, localEnv, port = '43127' }) {
  if (!localEnv || typeof localEnv !== 'object') throw new Error('MIDAO_E2E_LOCAL_ENV_REQUIRED');
  const numericPort = Number(port);
  if (!Number.isSafeInteger(numericPort) || numericPort < 1024 || numericPort > 65535) {
    throw new Error('MIDAO_E2E_PORT_INVALID');
  }
  const baseUrl = `http://127.0.0.1:${numericPort}`;
  const environment = {
    ...parentEnv,
    ...localEnv,
    MIDAO_E2E_LOCAL: '1',
    MIDAO_E2E_PORT: String(numericPort),
    NEXT_PUBLIC_BASE_URL: baseUrl,
    NEXT_PUBLIC_APP_URL: baseUrl,
    GUIDE_SESSION_SECRET: 'midao-e2e-local-guide-secret-0123456789abcdef',
    ADMIN_ACCESS_TOKEN: 'midao-e2e-local-admin-token-0123456789abcdef',
    ADMIN_EMAIL_ALLOWLIST: 'admin@example.invalid',
    ADMIN_EMAIL: 'admin@example.invalid',
    MIDAO_BACKEND_ENABLED: '1',
    MIDAO_BACKEND_MUTATIONS_ENABLED: '1',
    MIDAO_BACKEND_MODE_SWITCH_ENABLED: '1',
  };
  delete environment.PLAYWRIGHT_NO_WEBSERVER;
  return environment;
}

export function resolveMidaoDatabaseHealthTimeoutSeconds(value = process.env.MIDAO_DB_HEALTH_TIMEOUT_SECONDS) {
  if (value === undefined || value === '') return 180;
  if (typeof value !== 'string' || !/^[1-9]\d*$/u.test(value)) {
    throw new Error('MIDAO_DB_HEALTH_TIMEOUT_SECONDS_INVALID');
  }
  const seconds = Number(value);
  if (!Number.isSafeInteger(seconds)) throw new Error('MIDAO_DB_HEALTH_TIMEOUT_SECONDS_INVALID');
  return seconds;
}

export function createActualAdapter({
  repoRoot, pin, nodeBin, signal, cliWorkdir, lifecycleContract,
  fullServices = false, enableFullServices, commandRunner = runCommand,
}) {
  const expectedProjectId = canonicalProjectId(repoRoot);
  const databaseHealthTimeoutSeconds = resolveMidaoDatabaseHealthTimeoutSeconds(process.env.MIDAO_DB_HEALTH_TIMEOUT_SECONDS);
  if (cliWorkdir && basename(resolve(cliWorkdir)) !== expectedProjectId) throw new Error('CLI_WORKDIR_PROJECT_IDENTITY_MISMATCH');
  if (fullServices && typeof enableFullServices !== 'function') throw new Error('FULL_SERVICE_CONFIG_ADAPTER_INVALID');
  const cli = (args, { cleanup = false } = {}) => {
    const effectiveArgs = cliWorkdir ? [...args, '--workdir', cliWorkdir] : args;
    const invocation = buildSupabaseCliInvocation(pin, effectiveArgs);
    return commandRunner(invocation.command, invocation.args, {
      cwd: repoRoot,
      signal: cleanup ? undefined : signal,
      env: {
        ...process.env,
        PATH: `${SUPABASE_TOOLCHAIN_DIR}:${process.env.PATH ?? ''}`,
        DOCKER_API_VERSION: '1.43',
        DO_NOT_TRACK: '1',
        SUPABASE_TELEMETRY_DISABLED: '1',
      },
    });
  };
  const containers = async () => {
    const projectId = canonicalProjectId(repoRoot);
    const result = await commandRunner('docker', [
      'ps', '-a', '--no-trunc', '--filter', `label=com.supabase.cli.project=${projectId}`,
      '--format', '{{.ID}}\t{{.Names}}\t{{.Label "com.supabase.cli.project"}}',
    ], { cwd: repoRoot });
    if (result.exitCode !== 0 || result.stderr.trim()) throw new Error('DOCKER_IDENTITY_FAILED');
    const listed = parseContainerRows(result.stdout, projectId);
    const normalized = [];
    let transientCount = 0;
    for (const row of listed) {
      if (row.name.endsWith(`_${projectId}`)) { normalized.push(row); continue; }
      transientCount += 1;
      const inspected = await commandRunner('docker', ['inspect', '--format', '{{json .}}', '--', row.id], { cwd: repoRoot });
      if (transientCount > 1 || inspected.exitCode !== 0 || inspected.stderr.trim()) throw new Error('DOCKER_TRANSIENT_IDENTITY_FAILED');
      let identity;
      try { identity = JSON.parse(inspected.stdout); } catch { throw new Error('DOCKER_TRANSIENT_IDENTITY_FAILED'); }
      const healthCommand = '{:ok, _} = Application.ensure_all_started(:realtime)\n{:ok, _} = Realtime.Tenants.health_check("realtime-dev")';
      if (identity?.Id !== row.id || identity?.Name !== `/${row.name}`
        || !/^\/[a-z]+_[a-z]+$/u.test(identity.Name)
        || identity?.Config?.Image !== 'public.ecr.aws/supabase/realtime:v2.80.12'
        || JSON.stringify(identity?.Config?.Cmd) !== JSON.stringify(['/app/bin/realtime', 'eval', healthCommand])
        || JSON.stringify(identity?.Config?.Entrypoint) !== JSON.stringify(['/usr/bin/tini', '-s', '-g', '--', '/app/run.sh'])
        || identity?.Config?.Labels?.['com.supabase.cli.project'] !== projectId
        || identity?.Config?.Labels?.['com.docker.compose.project'] !== projectId
        || Object.keys(identity?.Config?.Labels ?? {}).sort().join(',') !== 'com.docker.compose.project,com.supabase.cli.project'
        || !Array.isArray(identity?.Mounts) || identity.Mounts.length !== 0
        || identity?.HostConfig?.NetworkMode !== `supabase_network_${projectId}`
        || identity?.HostConfig?.AutoRemove !== false
        || identity?.State?.Status !== 'exited' || identity?.State?.ExitCode !== 0) {
        throw new Error('DOCKER_TRANSIENT_IDENTITY_FAILED');
      }
      normalized.push({ id: row.id, name: `supabase_realtime_health_${projectId}`, projectLabel: projectId });
    }
    return normalized.length === 0
      ? []
      : confirmProjectContainers({ expectedProjectId: projectId, containers: normalized, resourceType: 'container' });
  };
  const networks = async ({ allowEmpty = false } = {}) => {
    const projectId = canonicalProjectId(repoRoot);
    const result = await commandRunner('docker', [
      'network', 'ls', '--no-trunc', '--filter', `label=com.supabase.cli.project=${projectId}`,
      '--format', '{{.ID}}\t{{.Name}}\t{{.Label "com.supabase.cli.project"}}',
    ], { cwd: repoRoot });
    if (result.exitCode !== 0 || result.stderr.trim()) throw new Error('DOCKER_NETWORK_IDENTITY_FAILED');
    const rows = parseContainerRows(result.stdout, projectId);
    return allowEmpty && rows.length === 0 ? [] : confirmProjectContainers({
      expectedProjectId: projectId, containers: rows, resourceType: 'network',
    });
  };
  const volumes = async ({ allowEmpty = false } = {}) => {
    const projectId = canonicalProjectId(repoRoot);
    const result = await commandRunner('docker', [
      'volume', 'ls', '--filter', `label=com.supabase.cli.project=${projectId}`,
      '--format', '{{.Name}}\t{{.Label "com.supabase.cli.project"}}',
    ], { cwd: repoRoot });
    if (result.exitCode !== 0 || result.stderr.trim()) throw new Error('DOCKER_VOLUME_IDENTITY_FAILED');
    const listedRows = nonemptyLines(result.stdout).map((line) => {
      const [name, projectLabel] = line.split('\t');
      return { name, projectLabel };
    });
    const rows = [];
    for (const listed of listedRows) {
      const inspected = await commandRunner('docker', [
        'volume', 'inspect', '--format', '{{.Name}}\t{{.CreatedAt}}\t{{.Driver}}\t{{.Scope}}\t{{index .Labels "com.supabase.cli.project"}}', '--', listed.name,
      ], { cwd: repoRoot });
      if (inspected.exitCode !== 0 || inspected.stderr.trim()) throw new Error('DOCKER_VOLUME_IDENTITY_FAILED');
      const inspectedRows = nonemptyLines(inspected.stdout);
      if (inspectedRows.length !== 1) throw new Error('DOCKER_VOLUME_IDENTITY_FAILED');
      const [name, createdAt, driver, scope, projectLabel] = inspectedRows[0].split('\t');
      if (name !== listed.name || projectLabel !== listed.projectLabel || !createdAt || !driver || !scope) throw new Error('DOCKER_VOLUME_IDENTITY_FAILED');
      rows.push({ id: createdAt, name, projectLabel, driver, scope });
    }
    return allowEmpty && rows.length === 0 ? [] : confirmProjectContainers({
      expectedProjectId: projectId, containers: rows, resourceType: 'volume',
    });
  };
  const assets = async ({ allowEmpty = false } = {}) => ({
    networks: await networks({ allowEmpty }), volumes: await volumes({ allowEmpty }),
  });
  const assertNoPreexistingResources = async () => {
    const [existingContainers, existingNetworks, existingVolumes] = await Promise.all([
      containers(), networks({ allowEmpty: true }), volumes({ allowEmpty: true }),
    ]);
    if (existingContainers.length || existingNetworks.length || existingVolumes.length) {
      throw new Error('PREEXISTING_PROJECT_RESOURCES');
    }
  };
  const waitForDatabase = async (owned) => {
    const expectedName = `supabase_db_${canonicalProjectId(repoRoot)}`;
    const database = owned.filter((container) => container.name === expectedName);
    if (database.length !== 1) throw new Error('DATABASE_CONTAINER_IDENTITY_INVALID');
    for (let attempt = 0; attempt < databaseHealthTimeoutSeconds; attempt += 1) {
      if (signal?.aborted) throw new Error('RUNNER_SIGNALLED');
      const result = await commandRunner('docker', ['inspect', '--format', '{{.State.Health.Status}}', database[0].id], { cwd: repoRoot });
      if (result.exitCode !== 0 || result.stderr.trim()) throw new Error('DATABASE_HEALTH_INSPECT_FAILED');
      if (result.stdout.trim() === 'healthy') return;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 1000));
    }
    throw new Error('DATABASE_HEALTH_TIMEOUT');
  };
  const bootstrapProbe = "SELECT COALESCE(to_regclass('supabase_migrations.schema_migrations')::text, '--absent--'); SELECT column_name || '|' || data_type || '|' || udt_name || '|' || is_nullable FROM information_schema.columns WHERE table_schema='supabase_migrations' AND table_name='schema_migrations' ORDER BY ordinal_position;";
  const bootstrapCreate = "CREATE SCHEMA IF NOT EXISTS supabase_migrations; CREATE TABLE supabase_migrations.schema_migrations (version text NOT NULL PRIMARY KEY, statements text[], name text); INSERT INTO supabase_migrations.schema_migrations(version, statements, name) VALUES ('00000000000000', ARRAY[]::text[], 'midao_history_bootstrap');";
  const bootstrapVerify = "SELECT column_name || '|' || data_type || '|' || udt_name || '|' || is_nullable FROM information_schema.columns WHERE table_schema='supabase_migrations' AND table_name='schema_migrations' ORDER BY ordinal_position; SELECT '--history--'; SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;";
  const expectedBootstrapSchema = 'version|text|text|NO\nstatements|ARRAY|_text|YES\nname|text|text|YES';
  const expectedBootstrapHistory = `${expectedBootstrapSchema}\n--history--\n00000000000000`;
  const runBootstrapQuery = (databaseId, query) => commandRunner('docker', [
    'exec', '--env', 'PGPASSWORD=postgres', databaseId,
    'psql', '--username', 'supabase_admin', '--dbname', 'postgres',
    '--set=ON_ERROR_STOP=1', '--tuples-only', '--no-align', '--command', query,
  ], { cwd: repoRoot });
  const verifyBootstrapHistory = async (databaseId) => {
    const result = await runBootstrapQuery(databaseId, bootstrapVerify);
    if (result.exitCode !== 0 || result.stderr.trim() || result.stdout.trim() !== expectedBootstrapHistory) {
      throw new Error('DATABASE_BOOTSTRAP_HISTORY_INVALID');
    }
  };
  const ensureBootstrapHistory = async (owned) => {
    const expectedName = `supabase_db_${canonicalProjectId(repoRoot)}`;
    const database = owned.filter((container) => container.name === expectedName);
    if (database.length !== 1) throw new Error('DATABASE_CONTAINER_IDENTITY_INVALID');
    const probe = await runBootstrapQuery(database[0].id, bootstrapProbe);
    if (probe.exitCode !== 0 || probe.stderr.trim()) {
      const diagnostic = redactSupabaseOutput(probe.stderr).trim().slice(-1000);
      throw new Error(diagnostic ? `DATABASE_BOOTSTRAP_HISTORY_PROBE_FAILED: ${diagnostic}` : 'DATABASE_BOOTSTRAP_HISTORY_PROBE_FAILED');
    }
    const observed = probe.stdout.trim();
    if (observed === '--absent--') {
      const created = await runBootstrapQuery(database[0].id, bootstrapCreate);
      if (created.exitCode !== 0 || created.stderr.trim()) throw new Error('DATABASE_BOOTSTRAP_HISTORY_CREATE_FAILED');
    } else if (observed !== `supabase_migrations.schema_migrations\n${expectedBootstrapSchema}`) {
      throw new Error('DATABASE_BOOTSTRAP_HISTORY_PREEXISTING_INVALID');
    }
    await verifyBootstrapHistory(database[0].id);
    return database[0].id;
  };
  return {
    status: async () => ({ ...(await cli(['status'])), expectedWorkdir: cliWorkdir }),
    start: async () => {
      const databaseResult = await cli(fullServices
        ? ['start', '--ignore-health-check', '--exclude', MIDAO_DATABASE_ONLY_EXCLUDED_SERVICES]
        : ['db', 'start']);
      if (databaseResult.exitCode !== 0) {
        const diagnostic = redactSupabaseOutput(databaseResult.stderr).trim();
        throw new Error(diagnostic ? `SUPABASE_START_FAILED: ${diagnostic}` : 'SUPABASE_START_FAILED');
      }
      if (!fullServices) {
        validateSupabaseLifecycleStderr(databaseResult.stderr, lifecycleContract
          ? { ...lifecycleContract, expectedWorkdir: cliWorkdir, stage: 'start' }
          : cliWorkdir, lifecycleContract ? undefined : 'start');
      }
      if (!fullServices) return;
      const databaseContainers = await containers();
      await waitForDatabase(databaseContainers);
      await ensureBootstrapHistory(databaseContainers);
      await enableFullServices();
      const stopped = await cli(['stop']);
      if (stopped.exitCode !== 0) {
        const diagnostic = redactSupabaseOutput(stopped.stderr).trim();
        throw new Error(diagnostic ? `SUPABASE_DATABASE_HANDOFF_STOP_FAILED: ${diagnostic}` : 'SUPABASE_DATABASE_HANDOFF_STOP_FAILED');
      }
      const serviceResult = await cli(['start', '--exclude', MIDAO_E2E_EXCLUDED_SERVICES]);
      if (serviceResult.exitCode !== 0) {
        const diagnostic = redactSupabaseOutput(serviceResult.stderr).trim();
        throw new Error(diagnostic ? `SUPABASE_SERVICE_START_FAILED: ${diagnostic}` : 'SUPABASE_SERVICE_START_FAILED');
      }
      const serviceContainers = await containers();
      await waitForDatabase(serviceContainers);
      const serviceDatabase = serviceContainers.filter((container) => container.name === `supabase_db_${canonicalProjectId(repoRoot)}`);
      if (serviceDatabase.length !== 1) throw new Error('DATABASE_CONTAINER_IDENTITY_INVALID');
      await verifyBootstrapHistory(serviceDatabase[0].id);
    },
    containers,
    networks,
    volumes,
    assets,
    assertNoPreexistingResources,
    waitForDatabase,
    reset: async () => {
      const result = await cli(['db', 'reset', '--local']);
      if (result.exitCode !== 0) {
        const diagnostic = redactSupabaseOutput(result.stderr).trim();
        throw new Error(diagnostic ? `SUPABASE_RESET_FAILED: ${diagnostic}` : 'SUPABASE_RESET_FAILED');
      }
      validateSupabaseLifecycleStderr(result.stderr, lifecycleContract
        ? { ...lifecycleContract, expectedWorkdir: cliWorkdir, stage: 'reset' }
        : cliWorkdir, lifecycleContract ? undefined : 'reset');
    },
    statusJson: async () => {
      const result = await cli(['status', '-o', 'json']);
      if (result.exitCode !== 0) throw new Error('SUPABASE_STATUS_JSON_FAILED');
      validateCliWorkdirNotice(result.stderr, cliWorkdir, canonicalProjectId(repoRoot), fullServices);
      return mapStatusEnvironment(result.stdout);
    },
    ready: async (env) => {
      let lastError;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const result = await commandRunner(nodeBin, ['-e', "import('pg').then(async({default:pg})=>{const c=new pg.Client({connectionString:process.env.DATABASE_URL});await c.connect();await c.query('SELECT 1');await c.end()})"], {
          cwd: repoRoot, env: { ...process.env, ...env }, signal,
        });
        if (result.exitCode === 0) return;
        lastError = result;
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
      }
      throw new Error(`DATABASE_NOT_READY_${lastError?.exitCode ?? 'unknown'}`);
    },
    child: async (paths, env) => {
      const result = await commandRunner(nodeBin, ['--test', '--test-concurrency=1', ...paths], {
        cwd: repoRoot, env: { ...process.env, ...env, NODE_OPTIONS: '--experimental-strip-types' }, signal,
      });
      const secrets = Object.values(env);
      if (result.stdout) process.stdout.write(redactSupabaseOutput(result.stdout, secrets));
      if (result.stderr) process.stderr.write(redactSupabaseOutput(result.stderr, secrets));
      return result;
    },
    stop: async (owned, ownedAssets) => {
      const errors = [];
      const containerIds = owned.map((container) => container.id);
      if (containerIds.length > 0) {
        const containerResult = await commandRunner('docker', ['rm', '--force', '--', ...containerIds], { cwd: repoRoot });
        if (containerResult.exitCode !== 0) errors.push(new Error('OWNED_CONTAINER_CLEANUP_FAILED'));
      }
      if (ownedAssets.networks.length > 0) {
        const networkResult = await commandRunner('docker', ['network', 'rm', ...ownedAssets.networks.map((network) => network.id)], { cwd: repoRoot });
        if (networkResult.exitCode !== 0) errors.push(new Error('OWNED_NETWORK_CLEANUP_FAILED'));
      }
      if (ownedAssets.volumes.length > 0) {
        const volumeResult = await commandRunner('docker', ['volume', 'rm', ...ownedAssets.volumes.map((volume) => volume.name)], { cwd: repoRoot });
        if (volumeResult.exitCode !== 0) errors.push(new Error('OWNED_VOLUME_CLEANUP_FAILED'));
      }
      if (errors.length > 0) throw new AggregateError(errors, 'owned Supabase asset cleanup failed');
    },
  };
}

export function parseMidaoRunnerInvocation(args) {
  if (!Array.isArray(args) || args.some((entry) => typeof entry !== 'string')) {
    throw new Error('MIDAO_RUNNER_ARGS_INVALID');
  }
  let mode = 'postgres';
  let childArgs = [...args];
  if (childArgs[0] === '--playwright') {
    mode = 'playwright';
    childArgs = childArgs.slice(1);
  } else if (childArgs[0] === '--playwright-real-auth') {
    mode = 'playwright-real-auth';
    childArgs = childArgs.slice(1);
  } else if (childArgs[0] === '--api-real-auth') {
    mode = 'api-real-auth';
    childArgs = childArgs.slice(1);
  } else if (childArgs[0] === '--postgrest') {
    mode = 'postgrest';
    childArgs = childArgs.slice(1);
  } else if (childArgs[0]?.startsWith('--')) {
    throw new Error('MIDAO_RUNNER_ARGS_INVALID');
  }
  const pattern = mode === 'playwright' || mode === 'playwright-real-auth'
    ? /^apps\/web\/e2e\/[a-z0-9][a-z0-9-]*\.spec\.ts$/u
    : /^apps\/web\/tests\/integration\/midao-[a-z0-9][a-z0-9-]*\.test\.mjs$/u;
  const realAuthSpec = 'apps/web/e2e/midao-inquiry-conversion-chain.spec.ts';
  const apiRealAuthTest = 'apps/web/tests/integration/midao-inquiry-conversion-api-chain.test.mjs';
  if (
    (mode !== 'postgres' && childArgs.length === 0)
    || childArgs.some((entry) => !pattern.test(entry))
    || (mode === 'playwright-real-auth' && (childArgs.length !== 1 || childArgs[0] !== realAuthSpec))
    || (mode === 'api-real-auth' && (childArgs.length !== 1 || childArgs[0] !== apiRealAuthTest))
  ) {
    throw new Error(`MIDAO_${mode.toUpperCase()}_ARGS_INVALID`);
  }
  return { mode, childArgs };
}

// Fixed deterministic id/credentials for the Package 4 API real-auth
// traveler fixture. Created via GoTrue's own Admin API rather than raw SQL
// against auth.users/auth.identities: this pinned GoTrue version enforces
// several undocumented constraints (a generated confirmed_at column, a
// zero-UUID instance_id requirement, and multiple NOT-NULL string columns
// beyond the four historically documented ones) that only ever surface as an
// opaque 500 "Database error querying schema" with no column name attached.
// The Admin API is the officially supported user-creation path and
// guarantees every internal column GoTrue expects is populated correctly.
const MIDAO_E2E_TRAVELER_ID = '55555555-5555-4555-8555-555555555555';
const MIDAO_E2E_TRAVELER_EMAIL = 'midao-e2e-traveler@example.invalid';
const MIDAO_E2E_TRAVELER_PASSWORD = 'midao-e2e-traveler-local-only';

async function createOrUpdateMidaoTravelerAuthUser({ supabaseUrl, serviceRoleKey, signal }) {
  try {
    const endpoint = new URL(`/auth/v1/admin/users/${MIDAO_E2E_TRAVELER_ID}`, supabaseUrl);
    const headers = {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      'content-type': 'application/json',
    };
    const body = JSON.stringify({
      email: MIDAO_E2E_TRAVELER_EMAIL,
      password: MIDAO_E2E_TRAVELER_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: 'Midao E2E Traveler', role: 'traveler' },
    });
    const timeoutSignal = AbortSignal.timeout(30_000);
    const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
    let response = await fetch(endpoint, { method: 'PUT', headers, body, signal: combinedSignal });
    if (response.status === 404) {
      const createEndpoint = new URL('/auth/v1/admin/users', supabaseUrl);
      response = await fetch(createEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ id: MIDAO_E2E_TRAVELER_ID, ...JSON.parse(body) }),
        signal: combinedSignal,
      });
    }
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`MIDAO_E2E_TRAVELER_ADMIN_USER_FAILED_DEBUG: HTTP_${response.status} ${text.slice(0, 2000)}`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('MIDAO_E2E_TRAVELER_ADMIN_USER_FAILED_DEBUG:')) throw error;
    throw new Error(`MIDAO_E2E_TRAVELER_ADMIN_USER_FAILED_DEBUG: UNEXPECTED ${error && error.name} ${error && error.message}`);
  }
}

async function main() {
  const repoRoot = process.cwd();
  const projectId = canonicalProjectId(repoRoot);
  const packageLock = await fsPromises.readFile(resolve(repoRoot, 'package-lock.json'), 'utf8');
  const pin = parseSupabasePin(packageLock);
  if (pin !== '2.87.2') throw new Error('SUPABASE_PIN_MISMATCH');
  const postgrestRuntime = resolvePinnedPostgrestRuntime(await fsPromises.readFile(
    resolve(repoRoot, 'supabase/baselines/v1/toolchain-lock.json'),
    'utf8',
  ));
  await verifyPinnedSupabaseBinary();
  const nodeBin = process.execPath;
  const stat = await fsPromises.readFile(`/proc/${process.pid}/stat`, 'utf8');
  const close = stat.lastIndexOf(')');
  const metadata = { pid: process.pid, processStartTicks: stat.slice(close + 2).split(/\s+/u)[19], repoRoot };
  const controller = new AbortController();
  const abort = () => controller.abort(new Error('RUNNER_SIGNALLED'));
  process.on('SIGTERM', abort);
  process.on('SIGINT', abort);

  let lock;
  let databaseBridge;
  let apiBridge;
  let apiCompatProxy;
  let apiServer;
  let databaseWorkdir;
  let replay;
  let primaryError;
  try {
    lock = await acquireKernelRunnerLock({ lockDir: LOCK_PATH, metadata });
    const gateway = parseDockerHostGateway(
      await fsPromises.readFile('/proc/net/route', 'utf8'),
      await fsPromises.readFile('/proc/1/cgroup', 'utf8'),
    );
    if (gateway) databaseBridge = await startLoopbackBridge({ listenPort: 54322, targetHost: gateway, targetPort: 54322 });
    const invocation = parseMidaoRunnerInvocation(process.argv.slice(2));
    const playwrightMode = invocation.mode === 'playwright';
    const realAuthPlaywrightMode = invocation.mode === 'playwright-real-auth';
    const apiRealAuthMode = invocation.mode === 'api-real-auth';
    const realAuthMode = realAuthPlaywrightMode || apiRealAuthMode;
    const postgrestMode = invocation.mode === 'postgrest';
    const childArgs = invocation.childArgs;
    if (gateway && (playwrightMode || realAuthMode || postgrestMode)) {
      apiBridge = await startLoopbackBridge({ listenPort: 54321, targetHost: gateway, targetPort: 54321 });
    }
    databaseWorkdir = await prepareDatabaseOnlyWorkdir({
      repoRoot, lockDir: LOCK_PATH, fullServices: realAuthMode, realAuth: realAuthMode,
    });
    replay = await databaseWorkdir.stageCliReplay();
    if (!playwrightMode && childArgs.length === 0) childArgs.push(
      'apps/web/tests/integration/midao-foundation-schema-postgres.test.mjs',
      'apps/web/tests/integration/midao-mode-switch-postgres.test.mjs',
      'apps/web/tests/integration/midao-mode-switch-concurrency-postgres.test.mjs',
    );
    const { parseLocalConnectionEnv, replayExactMigrations } = await import('../database-baseline/build-expected-terminal.mjs');
    const reportStage = (stage) => process.stderr.write(`MIDAO_STAGE=${stage}\n`);
    await runWithLocalSupabase({
      adapter: createActualAdapter({
        repoRoot, pin, nodeBin, signal: controller.signal, cliWorkdir: databaseWorkdir.workdir,
        lifecycleContract: { migrationNames: [replay.bootstrapName], noticesByMigration: {} },
        fullServices: realAuthMode,
        enableFullServices: realAuthMode ? () => databaseWorkdir.enableFullServices() : undefined,
      }),
      expectedProjectId: projectId,
      initialize: 'start-only',
      onReady: async ({ localEnv, refreshOwnership }) => {
        await replayExactMigrations({
          databaseUrl: localEnv.DATABASE_URL,
          pendingMigrationsDir: replay.pendingMigrationsDir,
          history: databaseWorkdir.history,
          signal: controller.signal,
        });
        const seed = await runCommand('/usr/bin/psql', ['-X', '--set=ON_ERROR_STOP=1', '--quiet', '--file', databaseWorkdir.seedPath], {
          cwd: databaseWorkdir.workdir, env: parseLocalConnectionEnv(localEnv.DATABASE_URL), signal: controller.signal,
        });
        if (seed.exitCode !== 0 || seed.signal !== null) throw new Error(`MIDAO_SEED_FAILED: ${redactSupabaseOutput(seed.stderr).slice(-4000).trim()}`);
        let child;
        let childSecrets = Object.values(localEnv);
        if (realAuthMode) {
          const overlayPath = join(repoRoot, 'scripts/testing/midao-api-real-auth-seed.sql');
          const overlay = await runCommand('/usr/bin/psql', ['-X', '--set=ON_ERROR_STOP=1', '--quiet', '--file', overlayPath], {
            cwd: repoRoot, env: parseLocalConnectionEnv(localEnv.DATABASE_URL), signal: controller.signal,
          });
          if (overlay.exitCode !== 0 || overlay.signal !== null) throw new Error(`MIDAO_E2E_SEED_FAILED_TMPDEBUG: ${redactSupabaseOutput(overlay.stderr, []).slice(-4000).trim()}`);
          for (const name of ['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
            if (typeof localEnv[name] !== 'string' || !localEnv[name]) throw new Error(`MIDAO_E2E_LOCAL_ENV_MISSING_TMPDEBUG:${name}`);
          }
          await createOrUpdateMidaoTravelerAuthUser({
            supabaseUrl: localEnv.SUPABASE_URL,
            serviceRoleKey: localEnv.SUPABASE_SERVICE_ROLE_KEY,
            signal: controller.signal,
          });
          reportStage('real-auth-runtime-fixture-ready');
          const e2eEnv = {
            ...buildMidaoPlaywrightEnvironment({ localEnv }),
            MIDAO_E2E_TRAVELER_EMAIL: 'midao-e2e-traveler@example.invalid',
            MIDAO_E2E_TRAVELER_PASSWORD: 'midao-e2e-traveler-local-only',
            NEXT_PUBLIC_TRANSFER_PAYMENT_ENABLED: '1',
          };
          childSecrets = Object.values(e2eEnv);
          if (apiRealAuthMode) {
            apiServer = await startMidaoApiServer({
              repoRoot,
              nodeBin,
              environment: e2eEnv,
              signal: controller.signal,
            });
            child = await runCommand(nodeBin, ['--test', '--test-concurrency=1', ...childArgs], {
              cwd: repoRoot,
              env: { ...e2eEnv, MIDAO_API_BASE_URL: apiServer.baseUrl },
              signal: controller.signal,
            });
          } else {
            child = await runCommand(join(repoRoot, 'node_modules/.bin/playwright'), [
              'test', '--workers=1', ...childArgs.map((entry) => entry.slice('apps/web/'.length)),
            ], { cwd: join(repoRoot, 'apps/web'), env: e2eEnv, signal: controller.signal });
          }
        } else if (playwrightMode || postgrestMode) {
          const overlayPath = join(repoRoot, 'scripts/testing/midao-e2e-seed.sql');
          const overlay = await runCommand('/usr/bin/psql', ['-X', '--set=ON_ERROR_STOP=1', '--quiet', '--file', overlayPath], {
            cwd: repoRoot, env: parseLocalConnectionEnv(localEnv.DATABASE_URL), signal: controller.signal,
          });
          if (overlay.exitCode !== 0 || overlay.signal !== null) throw new Error(`MIDAO_E2E_SEED_FAILED: ${redactSupabaseOutput(overlay.stderr).slice(-4000).trim()}`);
          const directApiUrl = 'http://127.0.0.1:54321';
          apiCompatProxy = await startSupabaseRestCompatProxy({ listenPort: 0, targetUrl: directApiUrl });
          const credentials = createLocalSupabaseApiCredentials(apiCompatProxy.url);
          let apiStartError;
          try {
            await startPinnedPostgrest({
              repoRoot,
              expectedProjectId: projectId,
              runtime: postgrestRuntime,
              credentials,
              publishHost: gateway ?? '127.0.0.1',
              signal: controller.signal,
            });
          } catch (error) { apiStartError = error; }
          let apiAdoptionError;
          try { await refreshOwnership(); } catch (error) { apiAdoptionError = error; }
          const apiErrors = [apiStartError, apiAdoptionError].filter(Boolean);
          if (apiErrors.length > 1) throw new AggregateError(apiErrors, 'PostgREST start and ownership adoption failed');
          if (apiErrors.length === 1) throw apiErrors[0];
          Object.assign(localEnv, credentials.publicEnv);
          await waitForPostgrestApi({
            apiUrl: directApiUrl,
            serviceRoleKey: credentials.publicEnv.SUPABASE_SERVICE_ROLE_KEY,
            signal: controller.signal,
          });
          await verifyMidaoE2ERuntimeFixtures({
            apiUrl: directApiUrl,
            serviceRoleKey: credentials.publicEnv.SUPABASE_SERVICE_ROLE_KEY,
            signal: controller.signal,
          });
          reportStage('runtime-fixture-ready');
          for (const name of ['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
            if (typeof localEnv[name] !== 'string' || !localEnv[name]) throw new Error(`MIDAO_E2E_LOCAL_ENV_MISSING:${name}`);
          }
          if (playwrightMode) {
            const e2eEnv = buildMidaoPlaywrightEnvironment({ localEnv });
            child = await runCommand(join(repoRoot, 'node_modules/.bin/playwright'), [
              'test', '--workers=1', ...childArgs.map((entry) => entry.slice('apps/web/'.length)),
            ], { cwd: join(repoRoot, 'apps/web'), env: e2eEnv, signal: controller.signal });
          } else {
            child = await runCommand(nodeBin, ['--test', '--test-concurrency=1', ...childArgs], {
              cwd: repoRoot,
              env: { ...process.env, ...localEnv, NODE_OPTIONS: '--experimental-strip-types' },
              signal: controller.signal,
            });
          }
        } else {
          child = await runCommand(nodeBin, ['--test', '--test-concurrency=1', ...childArgs], {
            cwd: repoRoot, env: { ...process.env, ...localEnv, NODE_OPTIONS: '--experimental-strip-types' }, signal: controller.signal,
          });
        }
        if (child.stdout) process.stdout.write(redactSupabaseOutput(child.stdout, childSecrets));
        if (child.stderr) process.stderr.write(redactSupabaseOutput(child.stderr, childSecrets));
        if (child.exitCode !== 0 || child.signal !== null) throw new Error(`CHILD_FAILED_${child.exitCode}`);
      },
      signal: controller.signal,
      reportStage,
    });
  } catch (error) { primaryError = error; }
  process.removeListener('SIGTERM', abort);
  process.removeListener('SIGINT', abort);
  const cleanupErrors = [];
  let replayRestored = !replay;
  if (replay) {
    try { await replay.restore(); replayRestored = true; }
    catch (error) { cleanupErrors.push(new Error('REPLAY_RESTORE_FAILED', { cause: error })); }
  }
  if (databaseWorkdir && replayRestored) {
    try { await databaseWorkdir.cleanupCliMetadata(); }
    catch (error) { cleanupErrors.push(new Error('CLI_METADATA_CLEANUP_FAILED', { cause: error })); }
  }
  if (databaseWorkdir) {
    try { await databaseWorkdir.cleanup(); }
    catch (error) { cleanupErrors.push(new Error('DATABASE_WORKDIR_CLEANUP_FAILED', { cause: error })); }
  }
  if (apiCompatProxy) {
    try { await apiCompatProxy.close(); }
    catch (error) { cleanupErrors.push(new Error('API_COMPAT_PROXY_CLOSE_FAILED', { cause: error })); }
  }
  if (apiServer) {
    try { await apiServer.close(); }
    catch (error) { cleanupErrors.push(new Error('MIDAO_API_SERVER_CLOSE_FAILED', { cause: error })); }
  }
  if (apiBridge) {
    try { await apiBridge.close(); }
    catch (error) { cleanupErrors.push(new Error('API_BRIDGE_CLOSE_FAILED', { cause: error })); }
  }
  if (databaseBridge) {
    try { await databaseBridge.close(); }
    catch (error) { cleanupErrors.push(new Error('DATABASE_BRIDGE_CLOSE_FAILED', { cause: error })); }
  }
  if (lock) {
    try { await releaseKernelRunnerLock(lock); }
    catch (error) { cleanupErrors.push(new Error('RUNNER_LOCK_RELEASE_FAILED', { cause: error })); }
  }
  const errors = [primaryError, ...cleanupErrors].filter(Boolean);
  if (errors.length > 1) throw new AggregateError(errors, 'Midao baseline runner and cleanup failed');
  if (errors.length === 1) throw errors[0];
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    process.stderr.write(`${formatMidaoRunnerFailure(error)}\n`);
    process.exitCode = 1;
  });
}
