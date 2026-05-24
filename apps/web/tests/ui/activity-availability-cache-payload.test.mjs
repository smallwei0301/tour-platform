import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

async function readSource(relPath) {
  return readFile(path.join(ROOT, relPath), 'utf8');
}

test('availability API uses 15/30/60 tiered cache policy', async () => {
  const src = await readSource('app/api/activities/[slug]/availability/route.ts');

  assert.match(src, /function resolveCacheTierSeconds\(schedules: AvailabilitySchedule\[\]\): 15 \| 30 \| 60/);
  assert.match(src, /if \(minDaysUntilStart <= 3\) return 15;/);
  assert.match(src, /if \(minDaysUntilStart <= 14\) return 30;/);
  assert.match(src, /return 60;/);
  assert.match(src, /'x-availability-cache-tier': String\(sMaxAge\)/);
});

test('availability API response payload keeps only UI-required fields', async () => {
  const src = await readSource('app/api/activities/[slug]/availability/route.ts');

  // Keep required fields.
  assert.match(src, /type AvailabilitySchedule = \{[\s\S]*startAt: string;[\s\S]*capacity: number;[\s\S]*bookedCount: number;[\s\S]*status: string;[\s\S]*planId: string \| null;[\s\S]*\}/);

  // Drop non-required fields from route payload.
  assert.doesNotMatch(src, /fetchedAt/);
  assert.doesNotMatch(src, /minParticipants:/);
  // V2 mode explicitly returns source='v2'; keep this field for source-of-truth diagnostics.
  assert.match(src, /source: 'v2'/);
  assert.doesNotMatch(src, /remaining:/);
});

test('activity detail page keeps ISR shell and does not couple availability to page-level re-render', async () => {
  const src = await readSource('app/activities/[region]/[slug]/page.tsx');

  // Issue #502: force-dynamic with revalidate=60 avoids render lock on cold path
  assert.match(src, /export const dynamic = 'force-dynamic';/);
  assert.match(src, /export const revalidate = 60;/);
  assert.match(src, /DatePlanSection activity=\{activity\} schedules=\{displayedSchedules\} useBookingV2=\{useBookingV2\} \/>/);
});
