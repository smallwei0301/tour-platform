import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { errorV2 } from '../../src/lib/api.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('errorV2 envelope is standardized for 400/404/500', () => {
  assert.deepEqual(errorV2('VALIDATION_ERROR', 'Invalid input'), {
    success: false,
    error: { code: 'VALIDATION_ERROR', message: 'Invalid input' },
  });

  assert.deepEqual(errorV2('NOT_FOUND', 'Order not found'), {
    success: false,
    error: { code: 'NOT_FOUND', message: 'Order not found' },
  });

  assert.deepEqual(errorV2('SERVER_ERROR', 'boom'), {
    success: false,
    error: { code: 'SERVER_ERROR', message: 'boom' },
  });
});

test('phase-1 legacy routes now use standardized error envelope', () => {
  const promote = read('app/api/admin/guides/promote/route.ts');
  const approved = read('app/api/admin/guides/approved/route.ts');
  const patchGuide = read('app/api/admin/guides/[guideId]/route.ts');

  assert.match(promote, /errorV2\('BAD_REQUEST'/);
  assert.match(promote, /errorV2\('NOT_FOUND'/);
  assert.match(promote, /errorV2\('SERVER_ERROR'/);

  assert.match(approved, /errorV2\('SERVER_ERROR'/);

  assert.match(patchGuide, /errorV2\('BAD_REQUEST'/);
  assert.match(patchGuide, /errorV2\('NOT_FOUND'/);
  assert.match(patchGuide, /errorV2\('SERVER_ERROR'/);

  assert.doesNotMatch(promote, /ok:\s*false/);
  assert.doesNotMatch(approved, /ok:\s*false/);
  assert.doesNotMatch(patchGuide, /ok:\s*false/);
});
