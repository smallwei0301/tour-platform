import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

test('GH-502 render path guard: activity detail page must fail fast when activity lookup hangs', async () => {
  const root = ROOT;
  const pagePath = path.join(root, 'app/[locale]/activities/[region]/[slug]/page.tsx');
  const src = await fs.readFile(pagePath, 'utf8');

  // generateMetadata should stay independent from DB calls.
  const metadataBlock = src.split('export async function generateMetadata')[1]?.split('export default async function ActivityDetailPage')[0] || '';
  assert.equal(metadataBlock.includes('getActivityBySlugDb('), false);

  // Runtime render path should not await activity lookup without timeout guard.
  const pageBlock = src.split('export default async function ActivityDetailPage')[1] || '';
  assert.equal(pageBlock.includes('const activity = await getActivityBySlugDb(slug);'), false);

  // Must include an explicit timeout race/guard around activity lookup in page render path.
  assert.equal(
    pageBlock.includes('Promise.race([') || pageBlock.includes('withTimeout('),
    true,
    'missing timeout guard for render-path activity lookup',
  );

  // Compat route (/activities/[slug]) check — optional, may not exist if consolidated into [region]/[slug]
  const compatPagePath = path.join(root, 'app/[locale]/activities/[slug]/page.tsx');
  let compatSrc = null;
  try { compatSrc = await fs.readFile(compatPagePath, 'utf8'); } catch { /* compat route removed */ }
  if (compatSrc) {
    const compatBlock = compatSrc.split('export default async function ActivityDetailCompatPage')[1] || '';
    assert.equal(
      compatBlock.includes('const activity = await getActivityBySlugDb(slug);'),
      false,
      'compat route still uses unguarded DB await',
    );
    assert.equal(
      compatBlock.includes('Promise.race([') || compatBlock.includes('withTimeout('),
      true,
      'missing timeout guard for compat route activity lookup',
    );
  }
});
