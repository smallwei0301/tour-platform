import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Source-contract: admin notification-settings route is admin-gated and
// delegates to the notification-settings gateway (GET matrix / PATCH cells).

const here = dirname(fileURLToPath(import.meta.url));
const routeSrc = readFileSync(
  join(here, '..', '..', 'app', 'api', 'admin', 'notification-settings', 'route.ts'),
  'utf8',
);

test('route guards with isAdminAuthorized', () => {
  assert.match(routeSrc, /isAdminAuthorized/);
  assert.match(routeSrc, /pickAdminCredentials/);
  assert.match(routeSrc, /UNAUTHORIZED/);
});

test('GET returns the matrix from the gateway', () => {
  assert.match(routeSrc, /getNotificationMatrix/);
  assert.match(routeSrc, /export async function GET/);
});

test('PATCH delegates cell toggles to setNotificationCells', () => {
  assert.match(routeSrc, /setNotificationCells/);
  assert.match(routeSrc, /export async function (PATCH|POST)/);
});

test('exposes the matrix dimensions for the UI', () => {
  assert.match(routeSrc, /NOTIFY_EVENTS/);
  assert.match(routeSrc, /NOTIFY_RECIPIENTS/);
  assert.match(routeSrc, /NOTIFY_CHANNELS/);
});
