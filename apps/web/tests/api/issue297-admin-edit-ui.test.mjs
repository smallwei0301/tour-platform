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
  const plansSrc = read('app/admin/activities/[id]/plans/page.tsx');

  it('plans station-timeline editor wraps to avoid 破框 (overflow)', () => {
    // 站點列改用 flexWrap + box-sizing，避免窄螢幕水平溢出
    assert.match(plansSrc, /站點 \$\{i \+ 1\} 名稱/, '站點名稱輸入存在');
    assert.match(plansSrc, /display: 'flex', flexWrap: 'wrap'/, '站點列需可換行避免破框');
    assert.match(plansSrc, /boxSizing: 'border-box'/, '站點輸入需 box-sizing 防溢出');
  });

  it('detailed-itinerary timetable is collapsed and annotated as a fallback area', () => {
    assert.match(editSrc, /詳細行程時間表（備援區/, '標題需標示為備援區並可收合');
    assert.match(editSrc, /<details>/, '需以 <details> 收合');
    assert.match(editSrc, /此區為<strong>備援區<\/strong>/, '需註解此區為備援區');
    assert.match(editSrc, /一般修改請從<strong>「方案管理」<\/strong>進入/, '需引導改從方案管理編輯');
    // 備援編輯器也套用破框修正
    assert.match(editSrc, /flexWrap: 'wrap'/, '備援站點列也需可換行避免破框');
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
    const detailSrc = read('app/activities/[region]/[slug]/page.tsx');
    assert.match(detailSrc, /planParticipantRanges/, '前台摘要需改由方案推導');
    assert.doesNotMatch(detailSrc, /min !== activity\.minParticipants/, '不應再以活動層級值作為比較基準');
  });
});
