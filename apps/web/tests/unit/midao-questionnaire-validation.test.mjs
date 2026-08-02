import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateIntakeQuestion } from '../../src/lib/midao/questionnaire-schema.mjs';

// #1758 S2 · Task 23 — 自訂問卷題目在存進資料庫前的 application-layer 驗證。
// 對照 S1 schema (activity_intake_questions) 的 CHECK constraints，讓錯誤訊息更友善。
// validateIntakeQuestion(question) 回傳 { valid: boolean, errors: string[] }，不 throw。

function base(overrides = {}) {
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

test('合法 short_text 題目 → valid，errors 為空', () => {
  const result = validateIntakeQuestion(base());
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test('合法 single_choice 題目（非空 options）→ valid', () => {
  const result = validateIntakeQuestion(
    base({ type: 'single_choice', options: ['大人', '小孩'] }),
  );
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test('合法 multi_choice 題目 → valid', () => {
  const result = validateIntakeQuestion(
    base({ type: 'multi_choice', options: ['浮潛', '登山', '獨木舟'] }),
  );
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test('合法 long_text 題目 → valid', () => {
  const result = validateIntakeQuestion(base({ type: 'long_text', options: [] }));
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test('非物件輸入 → invalid，回明確錯誤', () => {
  for (const bad of [null, undefined, 'x', 42, []]) {
    const result = validateIntakeQuestion(bad);
    assert.equal(result.valid, false);
    assert.ok(result.errors.length >= 1);
  }
});

// --- type ---
test('type 不在四選項內 → invalid，錯誤訊息點名 type 與允許值（非泛用 invalid input）', () => {
  const result = validateIntakeQuestion(base({ type: 'dropdown' }));
  assert.equal(result.valid, false);
  const joined = result.errors.join(' ');
  assert.match(joined, /type/);
  assert.match(joined, /single_choice/);
  assert.doesNotMatch(joined.toLowerCase(), /^invalid input$/);
});

test('type 缺漏 → invalid', () => {
  const q = base();
  delete q.type;
  const result = validateIntakeQuestion(q);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /type/);
});

// --- options: choice 型 ---
test('choice 型 options 為空陣列 → invalid', () => {
  const result = validateIntakeQuestion(base({ type: 'single_choice', options: [] }));
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /options/);
});

test('choice 型 options 缺漏 → invalid', () => {
  const q = base({ type: 'multi_choice' });
  delete q.options;
  const result = validateIntakeQuestion(q);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /options/);
});

test('choice 型 options 含空字串 → invalid', () => {
  const result = validateIntakeQuestion(
    base({ type: 'single_choice', options: ['大人', '   '] }),
  );
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /options/);
});

test('choice 型 options 含非字串 → invalid', () => {
  const result = validateIntakeQuestion(
    base({ type: 'single_choice', options: ['大人', 3] }),
  );
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /options/);
});

test('choice 型 options 有重複值 → invalid，訊息點名重複', () => {
  const result = validateIntakeQuestion(
    base({ type: 'multi_choice', options: ['浮潛', '登山', '浮潛'] }),
  );
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /options|重複|duplicate/i);
});

test('choice 型 options 非陣列 → invalid', () => {
  const result = validateIntakeQuestion(
    base({ type: 'single_choice', options: '大人,小孩' }),
  );
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /options/);
});

// --- options: text 型 ---
test('text 型 options 帶值 → invalid（必須空陣列）', () => {
  const result = validateIntakeQuestion(
    base({ type: 'short_text', options: ['不該有值'] }),
  );
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /options/);
});

test('text 型 options 缺漏 → 視為空陣列 → valid', () => {
  const q = base({ type: 'long_text' });
  delete q.options;
  const result = validateIntakeQuestion(q);
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

// --- required ---
test('required 非 boolean → invalid', () => {
  const result = validateIntakeQuestion(base({ required: 'yes' }));
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /required/);
});

test('required 缺漏 → 視為 false → valid', () => {
  const q = base();
  delete q.required;
  const result = validateIntakeQuestion(q);
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

// --- sort_order ---
test('sort_order 為負數 → invalid', () => {
  const result = validateIntakeQuestion(base({ sort_order: -1 }));
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /sort_order/);
});

test('sort_order 非整數 → invalid', () => {
  const result = validateIntakeQuestion(base({ sort_order: 1.5 }));
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /sort_order/);
});

test('sort_order 為字串 → invalid', () => {
  const result = validateIntakeQuestion(base({ sort_order: '0' }));
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /sort_order/);
});

test('sort_order 缺漏 → 視為 0 → valid', () => {
  const q = base();
  delete q.sort_order;
  const result = validateIntakeQuestion(q);
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

// --- question_key ---
test('question_key 空字串 → invalid', () => {
  const result = validateIntakeQuestion(base({ question_key: '' }));
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /question_key/);
});

test('question_key 缺漏 → invalid', () => {
  const q = base();
  delete q.question_key;
  const result = validateIntakeQuestion(q);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /question_key/);
});

test('question_key 含大寫 → invalid', () => {
  const result = validateIntakeQuestion(base({ question_key: 'PickupLocation' }));
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /question_key/);
});

test('question_key 含連字號/空白/其他符號 → invalid', () => {
  for (const key of ['pickup-location', 'pickup location', 'pickup.location', '接送地點']) {
    const result = validateIntakeQuestion(base({ question_key: key }));
    assert.equal(result.valid, false, `key=${key} 應為 invalid`);
    assert.match(result.errors.join(' '), /question_key/);
  }
});

test('question_key 合法 snake_case（含數字底線）→ valid', () => {
  for (const key of ['a', 'pickup_location', 'group_size_2', 'q1']) {
    const result = validateIntakeQuestion(base({ question_key: key }));
    assert.equal(result.valid, true, `key=${key} 應為 valid`);
  }
});

test('question_key 非字串 → invalid', () => {
  const result = validateIntakeQuestion(base({ question_key: 123 }));
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /question_key/);
});

// --- 多重錯誤同時回報 ---
test('多個欄位同時錯誤 → errors 收集所有問題', () => {
  const result = validateIntakeQuestion({
    question_key: 'Bad-Key',
    type: 'dropdown',
    options: 'x',
    required: 'no',
    sort_order: -3,
  });
  assert.equal(result.valid, false);
  const joined = result.errors.join(' ');
  assert.match(joined, /question_key/);
  assert.match(joined, /type/);
  assert.match(joined, /required/);
  assert.match(joined, /sort_order/);
  assert.ok(result.errors.length >= 4);
});
