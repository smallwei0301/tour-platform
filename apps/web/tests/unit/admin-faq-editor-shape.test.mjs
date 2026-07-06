/**
 * 管理者後台 activity 編輯頁 FAQ shape 正規化測試。
 *
 * 修復：既有 FAQ 以 canonical {question, answer} 存放，但後台編輯器讀 {q, a}，
 * 未正規化時既有 QA 顯示成空白。toEditorFaq 必須把兩種 shape 都轉成 {q, a}，
 * 讓載入既有行程與 JSON 匯入都能正確帶出既有問答。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { toEditorFaq } from '../../src/components/admin/activity-form/faq-shape.mjs';

test('canonical {question, answer} 轉成編輯器 {q, a}（既有 QA 顯示修復）', () => {
  const stored = [
    { question: '需要自備裝備嗎？', answer: '不用，現場提供。' },
    { question: '雨天會取消嗎？', answer: '視情況調整或延期。' },
  ];
  assert.deepStrictEqual(toEditorFaq(stored), [
    { q: '需要自備裝備嗎？', a: '不用，現場提供。' },
    { q: '雨天會取消嗎？', a: '視情況調整或延期。' },
  ]);
});

test('legacy {q, a} 原樣保留', () => {
  const legacy = [{ q: 'Legacy Q', a: 'Legacy A' }];
  assert.deepStrictEqual(toEditorFaq(legacy), [{ q: 'Legacy Q', a: 'Legacy A' }]);
});

test('混合 shape 皆可讀出', () => {
  const mixed = [
    { question: 'Std Q', answer: 'Std A' },
    { q: 'Leg Q', a: 'Leg A' },
  ];
  assert.deepStrictEqual(toEditorFaq(mixed), [
    { q: 'Std Q', a: 'Std A' },
    { q: 'Leg Q', a: 'Leg A' },
  ]);
});

test('null / undefined / 非陣列回傳空陣列（不炸 .map）', () => {
  assert.deepStrictEqual(toEditorFaq(undefined), []);
  assert.deepStrictEqual(toEditorFaq(null), []);
  assert.deepStrictEqual(toEditorFaq({}), []);
  assert.deepStrictEqual(toEditorFaq('nope'), []);
});

test('陣列內非物件元素被濾除，缺欄位補空字串', () => {
  const dirty = [null, { question: 'Only Q' }, { a: 'Only A' }, 42];
  assert.deepStrictEqual(toEditorFaq(dirty), [
    { q: 'Only Q', a: '' },
    { q: '', a: 'Only A' },
  ]);
});
