// Locks the guide profile API surface for image fields + the three new
// upload endpoints. Source-grep only (no DB / Supabase needed).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, '../..');

async function readSrc(rel) {
  return readFile(path.join(WEB_ROOT, rel), 'utf8');
}

test('/api/guide/profile GET returns the three image fields + slug', async () => {
  const src = await readSrc('app/api/guide/profile/route.ts');
  for (const f of ['profile_photo_url', 'hero_image_url', 'gallery_urls', 'slug']) {
    assert.match(src, new RegExp(`\\b${f}\\b`), `missing field ${f} in profile route`);
  }
});

test('/api/guide/profile PATCH whitelist accepts the three image fields', async () => {
  const src = await readSrc('app/api/guide/profile/route.ts');
  // EDITABLE_FIELDS literal must contain each image field as a string.
  for (const f of ['profile_photo_url', 'hero_image_url', 'gallery_urls']) {
    assert.match(src, new RegExp(`EDITABLE_FIELDS[\\s\\S]*?'${f}'`));
  }
});

test('/api/guide/profile PATCH enforces gallery_urls cap of 12', async () => {
  const src = await readSrc('app/api/guide/profile/route.ts');
  // Either `GALLERY_MAX = 12` or an inline `> 12`.
  assert.match(src, /GALLERY_MAX\s*=\s*12|gallery_urls[\s\S]*?>\s*12/);
});

const UPLOAD_ROUTES = [
  'app/api/guide/profile/upload-avatar/route.ts',
  'app/api/guide/profile/upload-hero/route.ts',
  'app/api/guide/profile/upload-gallery/route.ts',
];

for (const rel of UPLOAD_ROUTES) {
  test(`${rel} exists and authenticates with verifyGuideSession + CSRF`, async () => {
    const abs = path.join(WEB_ROOT, rel);
    await stat(abs); // throws if missing
    const src = await readFile(abs, 'utf8');
    assert.match(src, /export async function POST/);
    assert.match(src, /verifyGuideSession\(/);
    assert.match(src, /validateCsrf\(/);
    // Path must be pinned to session.guideId so a guide can't write to
    // another guide's prefix.
    assert.match(src, /session\.guideId/);
  });
}

test('upload-gallery enforces the 12-image cap before storing', async () => {
  const src = await readSrc('app/api/guide/profile/upload-gallery/route.ts');
  assert.match(src, /GALLERY_MAX\s*=\s*12/);
  assert.match(src, /current\.length\s*>=\s*GALLERY_MAX/);
});

test('upload-hero and upload-gallery validate aspect ratio with sharp', async () => {
  const hero = await readSrc('app/api/guide/profile/upload-hero/route.ts');
  const gal = await readSrc('app/api/guide/profile/upload-gallery/route.ts');
  // sharp imported, target ratios present, dimension floor present.
  assert.match(hero, /from\s+['"]sharp['"]/);
  assert.match(hero, /16\s*\/\s*9/);
  assert.match(gal, /from\s+['"]sharp['"]/);
  assert.match(gal, /3\s*\/\s*2/);
});

test('guide profile edit page uses the three upload endpoints + chip inputs', async () => {
  const src = await readSrc('app/(non-locale)/guide/profile/page.tsx');
  assert.match(src, /\/api\/guide\/profile\/upload-avatar/);
  assert.match(src, /\/api\/guide\/profile\/upload-hero/);
  assert.match(src, /\/api\/guide\/profile\/upload-gallery/);
  // Three-section structure: imagery / basic info / gallery.
  assert.match(src, /形象圖片/);
  assert.match(src, /基本資訊/);
  assert.match(src, /照片集/);
  // Chip-style input pattern (Enter / 逗號 to commit) — handles 全形逗號 too.
  assert.match(src, /ChipsInput/);
});
