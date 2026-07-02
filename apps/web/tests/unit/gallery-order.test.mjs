import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  reorderImage,
  moveImageBy,
  removeImageAt,
} from '../../src/lib/gallery-order.ts';

const A = 'https://cdn/a.webp';
const B = 'https://cdn/b.webp';
const C = 'https://cdn/c.webp';
const D = 'https://cdn/d.webp';

test('reorderImage 把照片從前面搬到後面', () => {
  assert.deepEqual(reorderImage([A, B, C, D], 0, 2), [B, C, A, D]);
});

test('reorderImage 把照片從後面搬到前面（設為主圖）', () => {
  assert.deepEqual(reorderImage([A, B, C, D], 3, 0), [D, A, B, C]);
});

test('reorderImage 不 mutate 原陣列', () => {
  const original = [A, B, C];
  const result = reorderImage(original, 0, 2);
  assert.deepEqual(original, [A, B, C]);
  assert.notEqual(result, original);
});

test('reorderImage from === to 時順序不變', () => {
  assert.deepEqual(reorderImage([A, B, C], 1, 1), [A, B, C]);
});

test('reorderImage 索引超界會被夾到合法範圍', () => {
  assert.deepEqual(reorderImage([A, B, C], 0, 99), [B, C, A]);
  assert.deepEqual(reorderImage([A, B, C], -5, 2), [B, C, A]);
});

test('reorderImage 單張／空陣列回傳複本', () => {
  assert.deepEqual(reorderImage([A], 0, 0), [A]);
  assert.deepEqual(reorderImage([], 0, 1), []);
});

test('moveImageBy delta -1 往前移一格', () => {
  assert.deepEqual(moveImageBy([A, B, C], 2, -1), [A, C, B]);
});

test('moveImageBy delta +1 往後移一格', () => {
  assert.deepEqual(moveImageBy([A, B, C], 0, 1), [B, A, C]);
});

test('moveImageBy 已在邊界時為 no-op（回傳複本）', () => {
  assert.deepEqual(moveImageBy([A, B, C], 0, -1), [A, B, C]);
  assert.deepEqual(moveImageBy([A, B, C], 2, 1), [A, B, C]);
});

test('removeImageAt 移除指定索引', () => {
  assert.deepEqual(removeImageAt([A, B, C], 1), [A, C]);
});

test('removeImageAt 索引不合法回傳複本', () => {
  const original = [A, B];
  const result = removeImageAt(original, 9);
  assert.deepEqual(result, [A, B]);
  assert.notEqual(result, original);
});
