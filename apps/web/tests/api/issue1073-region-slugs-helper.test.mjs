import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  getRegionBySlug,
  isKnownRegionSlug,
  REGION_REGISTRY,
} from '../../src/lib/region-slugs.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');

test('getRegionBySlug returns entry for kaohsiung with 高雄市 dbValue', () => {
  const entry = getRegionBySlug('kaohsiung');
  assert.equal(entry?.slug, 'kaohsiung');
  assert.equal(entry?.displayName, '高雄');
  assert.equal(entry?.dbValue, '高雄市');
});

test('getRegionBySlug returns entry for hualien with 花蓮縣 dbValue', () => {
  assert.equal(getRegionBySlug('hualien')?.dbValue, '花蓮縣');
});

test('getRegionBySlug returns entry for new-taipei (hyphenated)', () => {
  const entry = getRegionBySlug('new-taipei');
  assert.equal(entry?.dbValue, '新北市');
  assert.equal(entry?.displayName, '新北');
});

test('getRegionBySlug returns null for unknown slug', () => {
  assert.equal(getRegionBySlug('atlantis'), null);
});

test('getRegionBySlug returns null for empty, null, undefined, non-string', () => {
  assert.equal(getRegionBySlug(''), null);
  assert.equal(getRegionBySlug(null), null);
  assert.equal(getRegionBySlug(undefined), null);
  assert.equal(getRegionBySlug(123), null);
});

test('isKnownRegionSlug is true for canonical region slugs', () => {
  assert.equal(isKnownRegionSlug('kaohsiung'), true);
  assert.equal(isKnownRegionSlug('taipei'), true);
  assert.equal(isKnownRegionSlug('hualien'), true);
});

test('isKnownRegionSlug is false for unknown or empty', () => {
  assert.equal(isKnownRegionSlug('atlantis'), false);
  assert.equal(isKnownRegionSlug(''), false);
  assert.equal(isKnownRegionSlug(undefined), false);
});

test('REGION_REGISTRY covers Taiwan municipalities and counties (>= 15 entries)', () => {
  assert.ok(Object.keys(REGION_REGISTRY).length >= 15);
});

test('REGION_REGISTRY is frozen (single source of truth, no mutation)', () => {
  assert.ok(Object.isFrozen(REGION_REGISTRY));
});

test('Source contract: ActivitiesContent.tsx accepts optional initialRegion prop', () => {
  const src = readFileSync(
    join(REPO_ROOT, 'app/[locale]/activities/ActivitiesContent.tsx'),
    'utf8',
  );
  assert.match(
    src,
    /initialRegion\s*\?\s*:\s*string/,
    'ActivitiesContent should declare optional initialRegion prop',
  );
  assert.match(
    src,
    /initialRegion/,
    'ActivitiesContent should reference initialRegion in component body',
  );
});

test('Source contract: [region]/page.tsx imports region-slugs helper and renders ActivitiesContent for known region', () => {
  const src = readFileSync(
    join(REPO_ROOT, 'app/[locale]/activities/[region]/page.tsx'),
    'utf8',
  );
  assert.match(
    src,
    /from\s+['"][^'"]*region-slugs(\.mjs)?['"]/,
    'route file should import region-slugs helper',
  );
  assert.match(
    src,
    /getRegionBySlug|isKnownRegionSlug/,
    'route file should call region-slugs helper',
  );
  assert.match(
    src,
    /ActivitiesContent/,
    'route file should render ActivitiesContent for known region slugs',
  );
});

test('Source contract: [region]/page.tsx retains legacy activity-slug fallback for unknown regions', () => {
  const src = readFileSync(
    join(REPO_ROOT, 'app/[locale]/activities/[region]/page.tsx'),
    'utf8',
  );
  assert.match(
    src,
    /getActivityBySlugDb/,
    'route file should retain legacy activity-slug lookup as fallback for unknown region slugs',
  );
});
