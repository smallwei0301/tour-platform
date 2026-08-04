import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateServiceForPublication,
  PUBLISHABLE_BOOKING_TYPES,
} from '../../src/lib/midao/service-publication.ts';

// #1758 S3 · Task 24 — 服務草稿「可否送出發布」的 application-layer 前置驗證。
// validateServiceForPublication(draft, questions) 回傳 { valid: boolean, errors: string[] }，不 throw。
// 規則：draft.status 必須 active；name 非空；至少一則說明；至少一個有效方案；
//       所有自訂問卷題目通過 S2 的 validateIntakeQuestion（重用，不重寫）。

function validDraft(overrides = {}) {
  return {
    status: 'active',
    name: '祕島夜間浮潛體驗',
    descriptions: ['專業教練帶隊，含全套裝備與保險。'],
    plans: [{ name: '標準團', booking_type: 'scheduled' }],
    ...overrides,
  };
}

function validQuestion(overrides = {}) {
  return {
    question_key: 'pickup_location',
    label: '接送地點',
    type: 'short_text',
    options: [],
    required: false,
    sort_order: 0,
    ...overrides,
  };
}

// --- 快樂路徑 ---
test('完整合法草稿（無問卷）→ valid，errors 為空', () => {
  const result = validateServiceForPublication(validDraft(), []);
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test('完整合法草稿 + 合法問卷題目 → valid', () => {
  const result = validateServiceForPublication(validDraft(), [
    validQuestion(),
    validQuestion({ question_key: 'group_size', type: 'single_choice', options: ['1-2', '3-5'] }),
  ]);
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test('questions 省略（預設空陣列）→ valid', () => {
  const result = validateServiceForPublication(validDraft());
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test('單一 description 字串（非陣列）亦可 → valid', () => {
  const draft = validDraft();
  delete draft.descriptions;
  draft.description = '一段完整的活動說明。';
  const result = validateServiceForPublication(draft, []);
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test('每種合法 booking_type 皆可通過', () => {
  for (const bookingType of PUBLISHABLE_BOOKING_TYPES) {
    const result = validateServiceForPublication(
      validDraft({ plans: [{ name: '方案', booking_type: bookingType }] }),
      [],
    );
    assert.equal(result.valid, true, `booking_type=${bookingType} 應通過`);
  }
});

// --- draft 非物件 ---
test('draft 非物件 → invalid，回明確錯誤', () => {
  for (const bad of [null, undefined, 'x', 42, []]) {
    const result = validateServiceForPublication(bad, []);
    assert.equal(result.valid, false);
    assert.ok(result.errors.length >= 1);
    assert.match(result.errors.join(' '), /draft/);
  }
});

// --- 1. 狀態 ---
test('draft 狀態為 discarded → invalid', () => {
  const result = validateServiceForPublication(validDraft({ status: 'discarded' }), []);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /active/);
});

test('draft 狀態為 published → invalid', () => {
  const result = validateServiceForPublication(validDraft({ status: 'published' }), []);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /active/);
});

test('draft 狀態缺漏 → invalid', () => {
  const draft = validDraft();
  delete draft.status;
  const result = validateServiceForPublication(draft, []);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /active|狀態/);
});

// --- 2. 名稱 ---
test('活動名稱為空白 → invalid', () => {
  const result = validateServiceForPublication(validDraft({ name: '   ' }), []);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /name|名稱/);
});

test('活動名稱缺漏 → invalid', () => {
  const draft = validDraft();
  delete draft.name;
  const result = validateServiceForPublication(draft, []);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /name|名稱/);
});

// --- 3. 說明文字 ---
test('無任何說明文字（descriptions 全空 + 無 description）→ invalid', () => {
  const result = validateServiceForPublication(
    validDraft({ descriptions: ['', '   '] }),
    [],
  );
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /說明|description/i);
});

test('descriptions 缺漏且無 description → invalid', () => {
  const draft = validDraft();
  delete draft.descriptions;
  const result = validateServiceForPublication(draft, []);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /說明|description/i);
});

// --- 4. 方案／時段 ---
test('plans 為空陣列 → invalid', () => {
  const result = validateServiceForPublication(validDraft({ plans: [] }), []);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /方案|plans/i);
});

test('plans 缺漏 → invalid', () => {
  const draft = validDraft();
  delete draft.plans;
  const result = validateServiceForPublication(draft, []);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /方案|plans/i);
});

test('plans 非陣列 → invalid', () => {
  const result = validateServiceForPublication(
    validDraft({ plans: { name: '方案', booking_type: 'scheduled' } }),
    [],
  );
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /方案|plans/i);
});

test('方案缺 name → invalid', () => {
  const result = validateServiceForPublication(
    validDraft({ plans: [{ booking_type: 'scheduled' }] }),
    [],
  );
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /方案|name/i);
});

test('方案 booking_type 不合法 → invalid', () => {
  const result = validateServiceForPublication(
    validDraft({ plans: [{ name: '方案', booking_type: 'walk_in' }] }),
    [],
  );
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /booking_type/);
});

test('方案 booking_type 缺漏 → invalid', () => {
  const result = validateServiceForPublication(
    validDraft({ plans: [{ name: '方案' }] }),
    [],
  );
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /booking_type/);
});

test('多個方案中至少一個有效即通過方案門檻（無效者仍列錯誤但整體因該有效方案…）', () => {
  // 一好一壞：有效方案數 >= 1，但壞方案仍會列錯誤 → 整體 invalid（因為壞方案有錯）。
  const result = validateServiceForPublication(
    validDraft({
      plans: [
        { name: '好方案', booking_type: 'scheduled' },
        { name: '壞方案', booking_type: 'bad' },
      ],
    }),
    [],
  );
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /booking_type/);
});

// --- 5. 問卷題目重用 S2 驗證 ---
test('問卷題目不合法（type 錯）→ invalid，錯誤點名該題', () => {
  const result = validateServiceForPublication(validDraft(), [
    validQuestion({ type: 'dropdown' }),
  ]);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /type/);
});

test('問卷題目 choice 型 options 為空 → invalid', () => {
  const result = validateServiceForPublication(validDraft(), [
    validQuestion({ type: 'single_choice', options: [] }),
  ]);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /options/);
});

test('questions 非陣列 → invalid', () => {
  const result = validateServiceForPublication(validDraft(), 'not-an-array');
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /questions/i);
});

test('多個問卷題目中一個不合法 → 只該題列錯誤，整體 invalid', () => {
  const result = validateServiceForPublication(validDraft(), [
    validQuestion(),
    validQuestion({ question_key: 'bad_one', type: 'single_choice', options: [] }),
    validQuestion({ question_key: 'ok_two' }),
  ]);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /bad_one/);
});

// --- 多重錯誤同時回報 ---
test('多欄位同時錯誤 → errors 收集所有問題', () => {
  const result = validateServiceForPublication(
    {
      status: 'discarded',
      name: '  ',
      descriptions: [],
      plans: [],
    },
    [validQuestion({ type: 'dropdown' })],
  );
  assert.equal(result.valid, false);
  const joined = result.errors.join(' ');
  assert.match(joined, /active|狀態/);
  assert.match(joined, /name|名稱/);
  assert.match(joined, /說明|description/i);
  assert.match(joined, /方案|plans/i);
  assert.match(joined, /type/);
  assert.ok(result.errors.length >= 5);
});
