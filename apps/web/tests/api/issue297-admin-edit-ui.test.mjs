import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// #297 後台 UI 調整：
//  1. 方案編輯「行程介紹」站點時間表破框修正（flexWrap + box-sizing）。
//  2. 編輯行程「詳細行程時間表」改為預設收合的備援區並加註解。
//  3. 編輯行程移除活動層級「最少／最多人數」輸入（人數限制以方案為準）。
describe('GH-297 admin edit/plans UI adjustments', () => {
  const editSrc = read('app/admin/activities/[id]/edit/page.tsx');
  // #1615 拆檔：方案表單 Modal（含站點時間表編輯器）移至 PlanFormModal 元件，
  // 合併兩檔原始碼做等價斷言（斷言意圖不變）。
  const plansSrc = read('app/admin/activities/[id]/plans/page.tsx') +
    read('src/components/admin/activity-plans/PlanFormModal.tsx');

  it('plans station-timeline editor wraps to avoid 破框 (overflow)', () => {
    // 站點列改用 flexWrap + box-sizing，避免窄螢幕水平溢出
    assert.match(plansSrc, /站點 \$\{i \+ 1\} 名稱/, '站點名稱輸入存在');
    assert.match(plansSrc, /display: 'flex', flexWrap: 'wrap'/, '站點列需可換行避免破框');
    assert.match(plansSrc, /boxSizing: 'border-box'/, '站點輸入需 box-sizing 防溢出');
  });

  it('detailed-itinerary 備援 editor is removed; edit page points to 方案管理 only (#admin-plan-revert)', () => {
    // 活動層級「詳細行程時間表（備援區）」已廢除，改由方案的 planItinerary 呈現。
    assert.doesNotMatch(editSrc, /詳細行程時間表（備援區/, '備援區標題應移除');
    assert.doesNotMatch(editSrc, /儲存行程時間表/, '備援 itinerary 獨立儲存鈕應移除');
    assert.doesNotMatch(editSrc, /const\s+\[itinerary/, '活動層級 itinerary state 應移除');
    // 保留導向「方案管理」的 CTA。
    assert.match(editSrc, /前往「方案管理」/, '需引導至方案管理');
  });

  it('activity-level min/max participant inputs are removed (plan-level is source of truth)', () => {
    // 不再有活動層級「最少人數」輸入標籤
    assert.doesNotMatch(editSrc, /最少人數/, '活動層級「最少人數」輸入應移除');
    // 改放引導說明：人數限制改於方案管理設定
    assert.match(editSrc, /人數限制（最少／最多人數）改於「方案管理」/, '需保留人數限制改於方案管理的說明');
    // 不再於 PUT payload 送活動層級人數
    assert.doesNotMatch(editSrc, /maxParticipants: Number\(maxParticipants\)/, 'PUT payload 不應再送活動層級人數');
  });

  it('traveler detail page derives participant summary from plans, not the removed activity input', () => {
    const detailSrc = read('app/[locale]/activities/[region]/[slug]/page.tsx');
    assert.match(detailSrc, /planParticipantRanges/, '前台摘要需改由方案推導');
    assert.doesNotMatch(detailSrc, /min !== activity\.minParticipants/, '不應再以活動層級值作為比較基準');
  });
});
