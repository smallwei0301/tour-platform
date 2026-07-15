/**
 * GH-1097 — admin activities edit a11y: capacity aria-label + image alt.
 */
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(
  resolve(__dirname, '../../app/(non-locale)/admin/activities/[id]/edit/page.tsx'),
  'utf8'
);
// #1615 拆檔：場次管理（含容量 inline 編輯）移至 ScheduleSection 元件（斷言意圖不變）
const scheduleSource = readFileSync(
  resolve(__dirname, '../../src/components/admin/activity-form/ScheduleSection.tsx'),
  'utf8'
);

describe('GH-1097 — admin activities edit a11y', () => {
  test('capacity inline edit input has aria-label', () => {
    assert.ok(
      scheduleSource.includes('aria-label="容量"'),
      'Inline capacity edit input must have aria-label="容量"'
    );
  });
  test('image preview thumbnails have descriptive alt text', () => {
    assert.ok(
      source.includes('活動圖片') && source.includes('預覽'),
      'Image preview thumbnails must have descriptive alt text containing "活動圖片" and "預覽"'
    );
  });
});
