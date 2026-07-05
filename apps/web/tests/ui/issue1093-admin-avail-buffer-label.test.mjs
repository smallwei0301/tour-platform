/**
 * GH-1093 — admin guide availability buffer-time label/id must be properly associated.
 *
 * #1615 拆檔更新：緩衝欄位已抽到共用 RuleScheduleFields
 * （src/components/availability/rule-form-fields.tsx），label htmlFor 與 input id
 * 改由 ids prop 注入；admin 頁仍以歷史 id「avail-buffer-time」注入。
 * 斷言意圖不變：渲染後的 DOM 仍是 label[htmlFor=avail-buffer-time] 對應
 * input#avail-buffer-time 的正確關聯。
 */
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const adminPageSource = readFileSync(
  resolve(__dirname, '../../app/admin/guides/[guideId]/availability/page.tsx'),
  'utf8'
);
const ruleFormFieldsSource = readFileSync(
  resolve(__dirname, '../../src/components/availability/rule-form-fields.tsx'),
  'utf8'
);

describe('GH-1093 — admin guide availability buffer-time label association', () => {
  test('admin page injects the historical buffer id "avail-buffer-time" via ids prop', () => {
    assert.match(
      adminPageSource,
      /buffer:\s*'avail-buffer-time'/,
      'Admin page must keep injecting buffer id "avail-buffer-time" into RuleScheduleFields'
    );
  });
  test('shared RuleScheduleFields associates buffer label htmlFor with input id (ids.buffer)', () => {
    assert.ok(
      ruleFormFieldsSource.includes('htmlFor={ids.buffer}'),
      'Buffer-time label must use htmlFor={ids.buffer}'
    );
    assert.ok(
      ruleFormFieldsSource.includes('id={ids.buffer}'),
      'Buffer-time input must use id={ids.buffer}'
    );
  });
});
