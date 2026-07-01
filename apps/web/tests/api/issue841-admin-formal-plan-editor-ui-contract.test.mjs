import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

describe('GH-841 admin formal plan editor UI contract', () => {
  it('plans page exposes rich formal-plan fields and payload mapping', () => {
    const source = read('app/admin/activities/[id]/plans/page.tsx');
    // #297 行程介紹改為站點時間表（站點分區編輯 + 每站可上傳/貼圖）
    for (const label of ['語言導覽','最早可出發日','最晚 N 天前確認','N 天前可免費取消','費用包含（每行一項）','費用不包含（每行一項）','行程介紹（站點時間表）','集合地點名稱','體驗地點名稱','購買須知（每行一項）','取消政策（每行一項）','方案最低成團人數','方案最多人數']) {
      assert.match(source, new RegExp(label), `missing label: ${label}`);
    }
    for (const key of ['details_link_text','booking_btn_text','highlights','language','earliest_departure','confirm_by_days','free_cancel_days','plan_inclusions','plan_exclusions','plan_itinerary','meeting_point_name','meeting_address','experience_point_name','experience_address','plan_notices','plan_refund_rules']) {
      assert.match(source, new RegExp(key), `missing payload key: ${key}`);
    }
    for (const required of ['createDefaultForm', 'itineraryForPayload', '+ 新增站點', 'setForm(createDefaultForm())', '...createDefaultForm()']) {
      assert.match(source, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
        `missing rich form init/reset guard: ${required}`);
    }
  });

  it('edit page no longer mounts competing plans editor and shows migration CTA', () => {
    const source = read('app/admin/activities/[id]/edit/page.tsx');
    assert.doesNotMatch(source, /<PlansSection\b/);
    // #admin-plan-revert 後續：legacy 方案卡改為單純導向「方案管理」的 CTA。
    assert.match(source, /前往「方案管理」/);
    assert.match(source, /\/admin\/activities\/\$\{activityId\}\/plans/);
    assert.doesNotMatch(source, /const\s+DEFAULT_PLANS/, 'legacy DEFAULT_PLANS 應移除');
    assert.doesNotMatch(source, /legacy plans 筆數/, 'legacy 方案計數卡應移除');
  });
});
