import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// #297 旅客前台：
//  1. 「查看方案詳情」Modal 取消「行程介紹」分頁。
//  2. 「詳細行程」改為依所選方案，顯示該方案後台「行程介紹」（plan_itinerary）站點時間表。
describe('GH-297 traveler plan itinerary display', () => {
  it('PlanDetailModal no longer exposes the 行程介紹 tab', () => {
    const source = read('src/components/activity/PlanDetailModal.tsx');
    // 分頁定義不得再包含 itinerary／行程介紹
    const tabsBlock = source.slice(source.indexOf('const TABS'), source.indexOf('export function PlanDetailModal'));
    assert.doesNotMatch(tabsBlock, /行程介紹/, 'TABS 不應再有「行程介紹」分頁');
    assert.doesNotMatch(tabsBlock, /id:\s*'itinerary'/, 'TABS 不應再有 itinerary 分頁');
    // #multilingual：分頁標籤改用 labelKey，文字存於 messages.planModal。既有 6 分頁仍在。
    const planModal = JSON.parse(read('messages/zh-Hant.json')).planModal;
    for (const [key, label] of [['tabHighlights', '方案亮點'], ['tabCost', '費用資訊'], ['tabMeeting', '集合地點'], ['tabExperience', '體驗地點'], ['tabNotices', '購買須知'], ['tabRefund', '取消政策']]) {
      assert.match(tabsBlock, new RegExp(`labelKey:\\s*'${key}'`), `分頁應保留 labelKey：${key}`);
      assert.equal(planModal[key], label, `planModal.${key} 應為「${label}」`);
    }
  });

  it('detail page renders PlanItinerarySection from selected-plan source only (no activity-level fallback)', () => {
    const source = read('app/[locale]/activities/[region]/[slug]/page.tsx');
    assert.match(source, /import \{ PlanItinerarySection \}/, '應 import PlanItinerarySection');
    assert.match(source, /<PlanItinerarySection[\s\S]*plans=\{datePlanPresentation\.plans/, '應以所選方案來源 datePlanPresentation.plans 餵入');
    // #admin-plan-revert 後續：活動層級 itinerary 備援已移除，不再傳入 fallbackItinerary。
    assert.doesNotMatch(source, /fallbackItinerary=\{activityData\.itinerary\}/, '不應再傳入頁面級 itinerary 退回來源');
    assert.doesNotMatch(source, /activityData\.itinerary\.map/, '不應再直接渲染頁面級 activityData.itinerary');
  });

  it('PlanItinerarySection prompts when unselected, suffixes plan name, and falls back to page itinerary', () => {
    const source = read('src/components/activity/PlanItinerarySection.tsx');
    assert.match(source, /useSelectedPlan/, '需從 SelectedPlanContext 讀取所選方案');
    assert.match(source, /planItinerary/, '需讀取方案的 planItinerary');
    assert.match(source, /id="section-itinerary"/, '需維持 section-itinerary 錨點');
    assert.match(source, /kkd-itinerary/, '需沿用 kkd-itinerary 時間表樣式');
    assert.match(source, /kkd-itinerary-img/, '需支援每站點圖片');
    // 未選方案提示（#multilingual：文字抽進 messages.planItinerary.selectPlanPrompt）
    assert.match(source, /selectPlanPrompt/, '未選方案時需顯示提示文字（t(\'selectPlanPrompt\')）');
    const planItinerary = JSON.parse(read('messages/zh-Hant.json')).planItinerary;
    assert.equal(planItinerary.selectPlanPrompt, '請選擇上方的方案，以獲取行程詳細資訊', '提示文字內容須維持');
    // 標題後標上方案名稱
    assert.match(source, /titleSuffix/, '需於標題後標上所選方案名稱');
    assert.match(source, /selected\?\.label/, '方案名稱優先取自 context 的 label');
    // #admin-plan-revert 後續：不再退回頁面級行程，方案未填時顯示 planNoItinerary。
    assert.doesNotMatch(source, /fallbackItinerary/, '不應再支援頁面級行程退回');
    assert.match(source, /planNoItinerary/, '方案未填行程介紹時顯示提示文字');
    // 站點欄位（與後台站點時間表對齊）
    for (const field of ['icon', 'title', 'duration', 'description', 'imageUrl']) {
      assert.match(source, new RegExp(`step\\.${field}`), `站點需處理欄位：${field}`);
    }
  });
});
