import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const pagePath = new URL('../../app/admin/go-no-go/page.tsx', import.meta.url);
const routePath = new URL('../../app/api/admin/go-no-go/route.ts', import.meta.url);

function extractReadinessStatuses(routeSource) {
  const match = routeSource.match(/type\s+ReadinessStatus\s*=\s*([^;]+);/);
  assert.ok(match, 'api route declares ReadinessStatus union');
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

function extractConfiguredStatuses(pageSource) {
  const match = pageSource.match(/const\s+READINESS_STATUS_CONFIG[\s\S]*?=\s*\{([\s\S]*?)\n\};/);
  assert.ok(match, 'page declares READINESS_STATUS_CONFIG');
  return [...match[1].matchAll(/^\s*([a-zA-Z_][\w]*)\s*:/gm)].map((m) => m[1]);
}

test('Go/No-Go page has UI config for every readiness status returned by API', async () => {
  const [pageSource, routeSource] = await Promise.all([
    readFile(pagePath, 'utf8'),
    readFile(routePath, 'utf8'),
  ]);

  const apiStatuses = extractReadinessStatuses(routeSource);
  const configuredStatuses = new Set(extractConfiguredStatuses(pageSource));

  for (const status of apiStatuses) {
    assert.ok(
      configuredStatuses.has(status),
      `READINESS_STATUS_CONFIG is missing status "${status}"`,
    );
  }
});
