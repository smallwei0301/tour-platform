import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { derivePlanMetaFromActivityPlans } from '../../src/lib/booking-v2-plan-meta.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');

const PLAN_A = {
  id: 'plan-a-uuid',
  slug: 'half-day-morning',
  label: 'A. 早鳥半日探秘',
  basePrice: 1800,
  priceType: 'per_person',
  minParticipants: 1,
  maxParticipants: 10,
};

const PLAN_B = {
  id: 'plan-b-uuid',
  slug: 'full-day-complete',
  label: 'B. 全日深度探秘（含午餐）',
  basePrice: 3000,
  priceType: 'per_person',
  minParticipants: 2,
  maxParticipants: 8,
};

test('derivePlanMetaFromActivityPlans matches by UUID id with basePrice 3000', () => {
  const meta = derivePlanMetaFromActivityPlans([PLAN_A, PLAN_B], 'plan-b-uuid');
  assert.equal(meta?.basePrice, 3000);
  assert.equal(meta?.name, 'B. 全日深度探秘（含午餐）');
  assert.equal(meta?.priceType, 'per_person');
  assert.equal(meta?.minParticipants, 2);
  assert.equal(meta?.maxParticipants, 8);
});

test('derivePlanMetaFromActivityPlans matches by slug fallback', () => {
  const meta = derivePlanMetaFromActivityPlans([PLAN_A, PLAN_B], 'full-day-complete');
  assert.equal(meta?.basePrice, 3000);
});

test('derivePlanMetaFromActivityPlans returns null for unknown planKey', () => {
  assert.equal(derivePlanMetaFromActivityPlans([PLAN_A, PLAN_B], 'unknown-plan'), null);
});

test('derivePlanMetaFromActivityPlans returns null for missing/empty inputs', () => {
  assert.equal(derivePlanMetaFromActivityPlans(null, 'plan-a-uuid'), null);
  assert.equal(derivePlanMetaFromActivityPlans([], 'plan-a-uuid'), null);
  assert.equal(derivePlanMetaFromActivityPlans([PLAN_A], ''), null);
  assert.equal(derivePlanMetaFromActivityPlans([PLAN_A], null), null);
  assert.equal(derivePlanMetaFromActivityPlans([PLAN_A], undefined), null);
});

test('derivePlanMetaFromActivityPlans returns null when basePrice missing or invalid', () => {
  assert.equal(derivePlanMetaFromActivityPlans([{ id: 'x' }], 'x'), null);
  assert.equal(derivePlanMetaFromActivityPlans([{ id: 'x', basePrice: 0 }], 'x'), null);
  assert.equal(derivePlanMetaFromActivityPlans([{ id: 'x', basePrice: -5 }], 'x'), null);
  assert.equal(derivePlanMetaFromActivityPlans([{ id: 'x', basePrice: 'foo' }], 'x'), null);
});

test('derivePlanMetaFromActivityPlans normalizes priceType per_group correctly', () => {
  const groupPlan = { id: 'g', basePrice: 5000, priceType: 'per_group' };
  assert.equal(derivePlanMetaFromActivityPlans([groupPlan], 'g')?.priceType, 'per_group');
});

test('derivePlanMetaFromActivityPlans defaults priceType to per_person for unknown value', () => {
  const oddPlan = { id: 'o', basePrice: 1000, priceType: 'mystery' };
  assert.equal(derivePlanMetaFromActivityPlans([oddPlan], 'o')?.priceType, 'per_person');
});

test('derivePlanMetaFromActivityPlans defaults minParticipants to 1 when missing', () => {
  const meta = derivePlanMetaFromActivityPlans([{ id: 'x', basePrice: 100 }], 'x');
  assert.equal(meta?.minParticipants, 1);
  assert.equal(meta?.maxParticipants, null);
});

test('derivePlanMetaFromActivityPlans tolerates null entries in plans array', () => {
  const meta = derivePlanMetaFromActivityPlans([null, undefined, PLAN_A], 'plan-a-uuid');
  assert.equal(meta?.basePrice, 1800);
});

test('Source contract: booking page imports derivePlanMetaFromActivityPlans', () => {
  const src = readFileSync(
    join(REPO_ROOT, 'app/(non-locale)/booking/[activityId]/page.tsx'),
    'utf8',
  );
  assert.match(
    src,
    /from\s+['"][^'"]*booking-v2-plan-meta(\.mjs)?['"]/,
    'booking page should import booking-v2-plan-meta helper',
  );
  assert.match(
    src,
    /derivePlanMetaFromActivityPlans/,
    'booking page should call derivePlanMetaFromActivityPlans',
  );
});

test('Source contract: booking page uses fallback chain so unitPrice never reads activity.priceTwd while plan meta is available', () => {
  const src = readFileSync(
    join(REPO_ROOT, 'app/(non-locale)/booking/[activityId]/page.tsx'),
    'utf8',
  );
  assert.match(
    src,
    /effectivePlanMeta/,
    'booking page should expose effectivePlanMeta fallback',
  );
  assert.match(
    src,
    /effectivePlanMeta\?\.basePrice\s*\?\?\s*activity\.priceTwd/,
    'unitPrice should fall back to activity.priceTwd only after effectivePlanMeta',
  );
});

test('Source contract: Activity.plans interface declares basePrice + priceType so first-paint derivation type-checks', () => {
  const src = readFileSync(
    join(REPO_ROOT, 'app/(non-locale)/booking/[activityId]/page.tsx'),
    'utf8',
  );
  const interfaceBlock = src.split('interface Activity')[1]?.split('interface ')[0] || '';
  assert.match(interfaceBlock, /basePrice/, 'Activity.plans should declare basePrice field');
  assert.match(interfaceBlock, /priceType/, 'Activity.plans should declare priceType field');
});
