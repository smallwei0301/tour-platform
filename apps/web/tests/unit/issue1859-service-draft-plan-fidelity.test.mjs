/**
 * Issue #1859 Task B — 草稿 plan 欄位保真 + 多方案編輯/下架 UI 契約。
 *
 * 背景：Task A 讓 midao_ensure_native_service_draft 依 D2 帶回既有方案（8 個欄位）。
 * 但前端 mergeServiceDraft 只保留 name / booking_type / slug，下一次 autosave 就會把
 * base_price / duration_minutes / price_type / min_participants / max_participants 抹掉，
 * 發布時 S6 的 COALESCE 會套預設值 → 既有方案價格歸零。
 *
 * 本測試分兩段：
 *   1. 行為測試：transpile service-types.ts 後直接驗證 mergeServiceDraft 的欄位級保真
 *      （模式同 tests/unit/issue1411-message-rate-limit.test.mjs）。
 *   2. 來源契約：釘住 D6 的多方案編輯器、下架確認文案、頂部揭露列、slug 唯讀。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relative) => readFileSync(resolve(WEB_ROOT, relative), 'utf8');

async function importServiceTypes() {
  const sourcePath = path.join(WEB_ROOT, 'src/features/midao/services/service-types.ts');
  const scratchDir = await mkdtemp(path.join(tmpdir(), 'tour-platform-issue1859-'));
  const compiledPath = path.join(scratchDir, 'service-types.test.mjs');
  const source = await readFile(sourcePath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
    fileName: sourcePath,
  }).outputText;
  await writeFile(compiledPath, compiled, 'utf8');
  try {
    return await import(`${pathToFileURL(compiledPath).href}?t=${Date.now()}`);
  } finally {
    await rm(scratchDir, { recursive: true, force: true });
  }
}

const FULL_PLAN = Object.freeze({
  slug: 'morning-tour',
  name: '日間小團',
  booking_type: 'scheduled',
  duration_minutes: 180,
  price_type: 'per_person',
  base_price: 1800,
  min_participants: 2,
  max_participants: 8,
});

test('D2：含完整 8 欄位的方案經過 mergeServiceDraft 後欄位級完全保真', async () => {
  const { mergeServiceDraft } = await importServiceTypes();
  const merged = mergeServiceDraft({ name: '山徑晨光', description: '說明', plans: [{ ...FULL_PLAN }], questions: [] });

  assert.equal(merged.plans.length, 1);
  const plan = merged.plans[0];
  assert.equal(plan.slug, FULL_PLAN.slug, 'slug 是 S6 upsert 的身分鍵，不得遺失');
  assert.equal(plan.name, FULL_PLAN.name);
  assert.equal(plan.booking_type, FULL_PLAN.booking_type);
  assert.equal(plan.base_price, FULL_PLAN.base_price, 'base_price 被抹除會導致既有方案價格歸零');
  assert.equal(plan.duration_minutes, FULL_PLAN.duration_minutes);
  assert.equal(plan.price_type, FULL_PLAN.price_type);
  assert.equal(plan.min_participants, FULL_PLAN.min_participants);
  assert.equal(plan.max_participants, FULL_PLAN.max_participants);
});

test('D2：多個既有方案全部保真且順序不變', async () => {
  const { mergeServiceDraft } = await importServiceTypes();
  const second = {
    slug: 'sunset-private',
    name: '黃昏包團',
    booking_type: 'request',
    duration_minutes: 240,
    price_type: 'per_group',
    base_price: 9600,
    min_participants: 1,
    max_participants: 6,
  };
  const merged = mergeServiceDraft({ plans: [{ ...FULL_PLAN }, { ...second }] });

  assert.equal(merged.plans.length, 2);
  assert.deepEqual(merged.plans[0], { ...FULL_PLAN });
  assert.deepEqual(merged.plans[1], { ...second });
});

test('保真規則：僅缺失欄位補預設，已存在的值一律不覆寫', async () => {
  const { mergeServiceDraft } = await importServiceTypes();
  const merged = mergeServiceDraft({ plans: [{ name: '新方案', booking_type: 'instant' }] });
  const plan = merged.plans[0];

  assert.equal(plan.name, '新方案');
  assert.equal(plan.booking_type, 'instant');
  assert.equal(plan.duration_minutes, 60);
  assert.equal(plan.price_type, 'per_person');
  assert.equal(plan.base_price, 0);
  assert.equal(plan.min_participants, 1);
  assert.equal(plan.max_participants, 10);
  assert.ok(!('slug' in plan), '前端不得為新方案捏造 slug（交給 S6 的 plan- || md5 規則）');
});

test('保真規則：0 與型別不合法的值分別被保留與退回預設', async () => {
  const { mergeServiceDraft } = await importServiceTypes();
  const merged = mergeServiceDraft({
    plans: [
      { name: '免費導覽', booking_type: 'scheduled', base_price: 0, min_participants: 1 },
      { name: '壞資料', booking_type: 'scheduled', base_price: '1800', duration_minutes: null, price_type: 'per_seat' },
    ],
  });

  assert.equal(merged.plans[0].base_price, 0, 'base_price=0 是合法值，不得被預設值蓋掉');
  assert.equal(merged.plans[1].base_price, 0, '非數字的 base_price 退回預設 0');
  assert.equal(merged.plans[1].duration_minutes, 60);
  assert.equal(merged.plans[1].price_type, 'per_person', '未知 price_type 退回 per_person');
});

test('ServicePlan 型別涵蓋 D2 全部欄位且維持 snake_case', () => {
  const types = read('src/features/midao/services/service-types.ts');
  for (const field of ['duration_minutes', 'price_type', 'base_price', 'min_participants', 'max_participants']) {
    assert.match(types, new RegExp(`${field}`, 'u'), `ServicePlan 缺少 ${field}`);
  }
  assert.doesNotMatch(types, /basePrice|durationMinutes|minParticipants|maxParticipants|priceType/u, 'D2 欄位名不得改成 camelCase');
});

test('D6.1/D6.2：基本資料步驟改為多方案編輯器並提供新增方案', () => {
  const basics = read('src/features/midao/services/ServiceBasicsStep.tsx');
  assert.match(basics, /form\.plans\.map\(/u, '必須列出草稿內全部方案');
  assert.match(basics, /新增方案/u);
  assert.doesNotMatch(basics, /第一個方案名稱/u, '不得再只編輯 plans\\[0\\]');
  for (const field of ['duration_minutes', 'price_type', 'base_price', 'min_participants', 'max_participants']) {
    assert.match(basics, new RegExp(field, 'u'), `方案編輯器缺少 ${field} 欄位`);
  }
});

test('D6.3：下架單一方案有不可忽略的確認文案，且僅從陣列移除', () => {
  const basics = read('src/features/midao/services/ServiceBasicsStep.tsx');
  assert.match(basics, /下架此方案/u);
  assert.match(basics, /下架後旅人將無法選購此方案/u);
  assert.match(basics, /既有訂單不受影響/u);
  assert.match(basics, /發布後生效/u);
  assert.match(basics, /filter\(|slice\(/u, '下架＝自陣列移除，不呼叫任何刪除 API');
  assert.doesNotMatch(basics, /fetch\(|status:\s*'inactive'/u, '前端不得自行呼叫 API 或寫 status 欄位');
});

test('D6.4：頁面頂部揭露列在有方案時說明未列出的方案會被下架', () => {
  const basics = read('src/features/midao/services/ServiceBasicsStep.tsx');
  assert.match(basics, /form\.plans\.length > 0/u, '揭露列僅在 plans.length > 0 時顯示');
  assert.match(basics, /個方案/u);
  assert.match(basics, /未列在這個畫面上的方案會被下架/u);
});

test('D6.5：slug 對嚮導唯讀顯示，前端不重寫 S6 的 slug 產生規則', () => {
  const basics = read('src/features/midao/services/ServiceBasicsStep.tsx');
  assert.match(basics, /readOnly/u, 'slug 必須可見但不可編輯');
  assert.doesNotMatch(basics, /md5|createHash|plan-\$\{/u, '不得在前端重寫 slug 產生規則');
});

test('預覽逐方案顯示價格、人數與時長，且不放寬發布條件', () => {
  const preview = read('src/features/midao/services/ServicePreviewStep.tsx');
  assert.match(preview, /base_price/u);
  assert.match(preview, /duration_minutes/u);
  assert.match(preview, /min_participants/u);
  assert.match(preview, /max_participants/u);
  assert.match(preview, /if \(form\.plans\.length === 0\) errors\.push/u, 'validateLocally 的既有發布條件不得放寬');
  assert.match(preview, /booking_type 不合法/u);
});

test('E2E 覆蓋「既有多方案載入 → 只改第一個方案名稱 → 存檔 payload 仍含全部方案與價格」', () => {
  const spec = read('e2e/midao-services.spec.ts');
  assert.match(spec, /#1859 既有多方案載入後保真/u, '缺少 #1859 既有多方案保真情境');
  assert.match(spec, /#1859 下架單一方案/u, '缺少 #1859 下架單一方案情境');
  assert.match(spec, /base_price: 1800/u, 'E2E 必須驗證送出的 payload 仍帶 base_price');
  assert.match(spec, /getByLabel\('方案 1 名稱'\)/u, 'E2E 選擇器需同步為多方案編輯器的標籤');
  assert.doesNotMatch(spec, /getByLabel\('第一個方案名稱'\)/u, '不得再指向舊的單一方案標籤');
});
