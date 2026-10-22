import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const read = (relativePath) => readFile(path.join(ROOT, relativePath), 'utf8');

const LIST_SCREEN_IMPORT = /import \{ RequestListScreen \} from '[./]+\/src\/features\/midao\/requests\/RequestListScreen';/u;
const DETAIL_SCREEN_IMPORT = /import \{ RequestDetailScreen \} from '[./]+\/src\/features\/midao\/requests\/RequestDetailScreen';/u;

test('midao 與 midao2 需求列表共用同一個 RequestListScreen', async () => {
  const legacy = await read('app/(non-locale)/midao/requests/page.tsx');
  const next = await read('app/(non-locale)/midao2/requests/page.tsx');

  assert.match(legacy, LIST_SCREEN_IMPORT);
  assert.match(next, LIST_SCREEN_IMPORT);
  assert.match(next, /<RequestListScreen detailBasePath="\/midao2\/requests" \/>/u);
  assert.doesNotMatch(legacy, /detailBasePath=/u, 'legacy list keeps the component default');
});

test('midao 與 midao2 需求詳情共用同一個 RequestDetailScreen', async () => {
  const legacy = await read('app/(non-locale)/midao/requests/[requestRef]/page.tsx');
  const next = await read('app/(non-locale)/midao2/requests/[id]/page.tsx');

  assert.match(legacy, DETAIL_SCREEN_IMPORT);
  assert.match(next, DETAIL_SCREEN_IMPORT);
  assert.match(legacy, /<RequestDetailScreen requestRef=\{requestRef\} \/>/u);
  assert.doesNotMatch(legacy, /listHref=/u, 'legacy detail keeps the component default');
  assert.match(next, /<RequestDetailScreen requestRef=\{requestRef\} listHref="\/midao2\/requests" \/>/u);
});

test('requests.api 的寫入只走 decide、mark-replied、convert 與 reply-template canonical v2 endpoint', async () => {
  const api = await read('src/features/midao/requests/requests.api.ts');

  const endpoints = [...api.matchAll(/`(\/api\/v2\/[^`]+)`/gu)].map((match) => match[1]);
  const writes = endpoints.filter((endpoint) => /\/commands\//u.test(endpoint));
  assert.deepEqual(writes.map((endpoint) => endpoint.split('/commands/')[1]).sort(), ['convert', 'decide', 'mark-replied']);
  assert.ok(endpoints.every((endpoint) => endpoint.startsWith('/api/v2/guide/')), 'no legacy or non-guide endpoint');

  const posts = [...api.matchAll(/method: '(\w+)'/gu)].map((match) => match[1]);
  assert.equal(posts.length, 4, 'decide, reply-template, mark-replied, convert only');
  assert.ok(posts.every((method) => method === 'POST'));
  assert.doesNotMatch(api, /\/api\/(orders|payments)\b|\/api\/guide\/(?!.*v2)/u);
});

test('詳情頁返回連結不得寫死，預設維持 legacy /midao/requests', async () => {
  const screen = await read('src/features/midao/requests/RequestDetailScreen.tsx');

  assert.match(
    screen,
    /export function RequestDetailScreen\(\{\s*requestRef,\s*listHref = '\/midao\/requests',?\s*\}: \{\s*requestRef: string;\s*listHref\?: string;?\s*\}\)/u,
  );
  assert.match(screen, /<Link className="midao-request-detail-back" href=\{listHref\}>/u);
  assert.doesNotMatch(screen, /href="\/midao\/requests"/u);
});
