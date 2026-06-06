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

const ADMIN_PAGE = 'app/admin/guides/[guideId]/availability/page.tsx';

test('admin availability ruleForm has rule_mode (weekly|single-day) and single_date fields', async () => {
  const src = await readSource(ADMIN_PAGE);
  // ruleForm must declare rule_mode with 'weekly' default
  assert.match(src, /rule_mode.*'weekly'/, 'ruleForm must have rule_mode defaulting to weekly');
  // single_date field must exist in ruleForm
  assert.match(src, /single_date/, 'ruleForm must have single_date field');
});

test('admin availability modal has single-day radio and weekly radio buttons', async () => {
  const src = await readSource(ADMIN_PAGE);
  // Must render single-day radio input
  assert.match(src, /type="radio"[\s\S]{0,200}single-day|single-day[\s\S]{0,200}type="radio"/, 'modal must have single-day radio button');
  // Must render weekly radio input
  assert.match(src, /type="radio"[\s\S]{0,200}weekly|weekly[\s\S]{0,200}type="radio"/, 'modal must have weekly radio button');
});

test('admin availability modal has date input for single-day mode', async () => {
  const src = await readSource(ADMIN_PAGE);
  // Must have a date type input linked to single_date
  assert.match(src, /type="date"[\s\S]{0,100}single_date|single_date[\s\S]{0,100}type="date"/, 'modal must have a type=date input for single_date');
});

test('admin availability weekday select is disabled in single-day mode', async () => {
  const src = await readSource(ADMIN_PAGE);
  // weekday select must be disabled when rule_mode === 'single-day'
  assert.match(src, /disabled=\{ruleForm\.rule_mode\s*===\s*['"]single-day['"]\}/, 'weekday select must be disabled when rule_mode is single-day');
});

test('admin handleSaveRule derives weekday from single_date when single-day mode', async () => {
  const src = await readSource(ADMIN_PAGE);
  // Must derive weekday using getDay() from single_date
  assert.match(src, /getDay\(\)/, 'saveRule must use getDay() to derive weekday from single_date');
  // Must set effective_from and effective_to equal to single_date when single-day
  assert.match(
    src,
    /rule_mode.*single-day[\s\S]{0,400}effective_from.*single_date|effective_from.*single_date[\s\S]{0,400}rule_mode.*single-day/,
    'saveRule must set effective_from to single_date when single-day'
  );
  assert.match(
    src,
    /rule_mode.*single-day[\s\S]{0,400}effective_to.*single_date|effective_to.*single_date[\s\S]{0,400}rule_mode.*single-day/,
    'saveRule must set effective_to to single_date when single-day'
  );
});

test('admin openRuleModal detects single-day from effective_from===effective_to and populates form', async () => {
  const src = await readSource(ADMIN_PAGE);
  // Must have isSingleDay check using effective_from === effective_to (possibly with rule. prefix)
  assert.match(
    src,
    /effective_from\s*===\s*(rule\.)?effective_to/,
    'openRuleModal must detect single-day via effective_from === effective_to'
  );
  // Must populate rule_mode: 'single-day' when isSingleDay
  assert.match(
    src,
    /isSingleDay[\s\S]{0,200}'single-day'|'single-day'[\s\S]{0,200}isSingleDay/,
    'form must be populated with rule_mode single-day when editing single-day rule'
  );
  // Must populate single_date from effective_from
  assert.match(
    src,
    /isSingleDay[\s\S]{0,100}single_date[\s\S]{0,100}effective_from|single_date[\s\S]{0,100}isSingleDay[\s\S]{0,100}effective_from/,
    'single_date must be populated from effective_from when editing single-day rule'
  );
});

test('admin availability rules list renders single-day label for single-day rules', async () => {
  const src = await readSource(ADMIN_PAGE);
  // Rules display should show a readable single-day label like 單日:YYYY-MM-DD
  assert.match(
    src,
    /單日|single.day[\s\S]{0,100}effective_from\s*===\s*effective_to|effective_from\s*===\s*effective_to[\s\S]{0,100}單日/,
    'rules list must render a readable single-day label when effective_from===effective_to'
  );
});
