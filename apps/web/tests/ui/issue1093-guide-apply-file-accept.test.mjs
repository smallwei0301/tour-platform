/**
 * GH-1093（原始）：guide/apply 的 file input 需有 accept 屬性。
 *
 * 演進：先前因 file input 是「假上傳」（submit 不帶檔案）而整段移除；
 * 照片串接改版後恢復為「真上傳」— 個人照片（必填）／個人封面／活動照片
 * 經 /api/guide-applications/upload 實際上傳，URL 隨申請持久化並於
 * 上線時帶入導遊檔案。本測試鎖：
 *   1. 回歸 GH-1093 本義：所有 file input 都綁 image MIME accept。
 *   2. 不得退回假欄位：上傳必須打 upload API。
 *   3. 證件仍不收檔案（人工核驗誠實說明保留）。
 */
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, '../../app/(non-locale)/guide/apply/page.tsx'), 'utf8');

describe('guide/apply 證件與照片步驟（GH-1093 + 照片真上傳）', () => {
  test('所有 file input 都需綁 image MIME accept（GH-1093 本義）', () => {
    const fileInputs = (source.match(/type="file"/g) || []).length;
    const acceptBound = (source.match(/accept=\{PHOTO_ACCEPT\}/g) || []).length;
    assert.ok(fileInputs >= 3, '需有個人照片/封面/活動照片三個上傳欄位');
    assert.equal(acceptBound, fileInputs, '每個 file input 都必須綁 accept');
    assert.match(source, /PHOTO_ACCEPT\s*=\s*'image\/jpeg,image\/png,image\/webp'/);
  });
  test('上傳必須真打 upload API（不得退回假欄位）', () => {
    assert.match(source, /\/api\/guide-applications\/upload/, '需打申請者上傳 API');
    assert.match(source, /profilePhotoUrl/, '上傳結果需進入 submit payload');
  });
  test('證件仍不收檔案：人工核驗誠實說明保留', () => {
    assert.ok(source.includes('請勿在表單中提供證件影本'), '需說明證件核驗流程');
    assert.ok(source.includes('導遊後台'), '需說明上線後可於導遊後台管理照片');
  });
});
