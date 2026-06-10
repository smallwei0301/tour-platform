/**
 * GH-1093（原始）：guide/apply 的 file input 需有 accept 屬性。
 *
 * 導遊申請資料串接改版後：該兩個 file input 是「假上傳」（submit 從未
 * 帶檔案），已整段移除 — 證件屬敏感個資改為審核時人工核驗，個人照片
 * 改為上線後於導遊後台上傳（該處的 ImageUploader 本就有 accept 限制）。
 * 本測試改鎖新契約：申請頁不得再出現送不出去的 file input，且需有
 * 誠實的流程說明。
 */
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, '../../app/guide/apply/page.tsx'), 'utf8');

describe('guide/apply 證件與照片步驟（post GH-1093）', () => {
  test('不得再有送不出去的 file input（原 GH-1093 對象已移除）', () => {
    assert.ok(!source.includes('type="file"'), '申請頁不得有假檔案上傳欄位');
  });
  test('需提供誠實流程說明（證件人工核驗、照片於導遊後台上傳）', () => {
    assert.ok(source.includes('請勿在表單中提供證件影本'), '需說明證件核驗流程');
    assert.ok(source.includes('導遊後台'), '需說明照片上傳位置');
  });
});
