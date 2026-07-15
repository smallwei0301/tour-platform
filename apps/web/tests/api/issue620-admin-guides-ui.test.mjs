/**
 * Issue #620 – Admin UI: sidebar scrollable + guide name clickable
 * Static contract tests using readFileSync (no runtime needed).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = join(__dirname, '../..');

test('AdminShell sidebar nav has overflowY: auto', () => {
  const filePath = join(webRoot, 'src/components/admin/AdminShell.tsx');
  assert.ok(existsSync(filePath), `AdminShell.tsx should exist at ${filePath}`);
  const content = readFileSync(filePath, 'utf8');
  // Either CSS property form is acceptable
  const hasOverflow =
    content.includes("overflowY: 'auto'") ||
    content.includes('overflowY: "auto"') ||
    content.includes('overflow-y: auto');
  assert.ok(hasOverflow, 'AdminShell sidebar/nav should have overflowY: auto');
});

test('admin/guides page has clickable guide name linking to /admin/guides/', () => {
  const filePath = join(webRoot, 'app/(non-locale)/admin/guides/page.tsx');
  assert.ok(existsSync(filePath), `admin/guides/page.tsx should exist at ${filePath}`);
  const content = readFileSync(filePath, 'utf8');
  // Should have a Link or href pointing to /admin/guides/${...}
  const hasLink =
    content.includes('/admin/guides/${') ||
    content.includes('/admin/guides/`') ||
    content.includes("href={`/admin/guides/");
  assert.ok(hasLink, 'admin/guides page should have clickable guide name linking to /admin/guides/[id]');
});

test('admin/guides/[guideId]/page.tsx exists', () => {
  const filePath = join(webRoot, 'app/(non-locale)/admin/guides/[guideId]/page.tsx');
  assert.ok(existsSync(filePath), `[guideId]/page.tsx should exist at ${filePath}`);
  const content = readFileSync(filePath, 'utf8');
  // Should show at least name and status
  assert.ok(content.includes('display_name') || content.includes('fullName'), 'detail page should show guide name');
  assert.ok(content.includes('/admin/guides'), 'detail page should have a back link to /admin/guides');
});
