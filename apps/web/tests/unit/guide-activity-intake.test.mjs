import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeIntake,
  buildActivityIntakePrompt,
  INTAKE_REGION_OPTIONS,
  INTAKE_CATEGORY_OPTIONS,
  STANDARD_REFUND_RULES,
} from '../../src/lib/guide-activity-intake.mjs';

function validBody(overrides = {}) {
  return {
    title: '柴山秘境之旅',
    region: '高雄市',
    category: 'mountain',
    priceTwd: '1800',
    durationText: '4.5 小時',
    meetingPoint: '龍門亭入口',
    description: '帶旅客走柴山一般人不知道的三個秘境：龍谷大峽谷、小錐麓、金瓜洞，沿途有獼猴與港景。',
    ...overrides,
  };
}

test('normalizeIntake：完整必填 → ok 並回傳正規化值', () => {
  const result = normalizeIntake(validBody());
  assert.equal(result.ok, true);
  assert.equal(result.value.title, '柴山秘境之旅');
  assert.equal(result.value.region, '高雄市');
  assert.equal(result.value.category, 'mountain');
  assert.equal(result.value.priceTwd, 1800);
  assert.equal(typeof result.value.priceTwd, 'number');
});

test('normalizeIntake：售價容許逗號與「元」', () => {
  const result = normalizeIntake(validBody({ priceTwd: '1,800 元' }));
  assert.equal(result.ok, true);
  assert.equal(result.value.priceTwd, 1800);
});

test('normalizeIntake：缺必填 → ok=false 並列出原因', () => {
  const result = normalizeIntake({ title: '', region: '', category: '', priceTwd: '', durationText: '', meetingPoint: '', description: '' });
  assert.equal(result.ok, false);
  assert.match(result.message, /title/);
  assert.match(result.message, /region/);
  assert.match(result.message, /priceTwd/);
});

test('normalizeIntake：非法地區 → 拒絕', () => {
  const result = normalizeIntake(validBody({ region: '台東縣' }));
  assert.equal(result.ok, false);
  assert.match(result.message, /地區必須是/);
});

test('normalizeIntake：非法類別代碼 → 拒絕', () => {
  const result = normalizeIntake(validBody({ category: 'adventure' }));
  assert.equal(result.ok, false);
  assert.match(result.message, /類別必須是/);
});

test('normalizeIntake：售價為 0 或非數字 → 拒絕', () => {
  assert.equal(normalizeIntake(validBody({ priceTwd: '0' })).ok, false);
  assert.equal(normalizeIntake(validBody({ priceTwd: '免費' })).ok, false);
});

test('normalizeIntake：描述太短 → 拒絕', () => {
  const result = normalizeIntake(validBody({ description: '走柴山' }));
  assert.equal(result.ok, false);
  assert.match(result.message, /description/);
});

test('buildActivityIntakePrompt：包含 schema、退款規則與導遊原始內容', () => {
  const { value } = normalizeIntake(validBody({
    noticesRaw: '請穿運動鞋',
    plansRaw: '半日 1800、全日含午餐 3000',
    guideName: 'Andy Lee',
  }));
  const prompt = buildActivityIntakePrompt(value);

  // 角色與輸出格式指示
  assert.match(prompt, /Midao 祕島/);
  assert.match(prompt, /只輸出/);
  assert.match(prompt, /```json/);
  // schema 關鍵欄位
  assert.match(prompt, /durationMinutes/);
  assert.match(prompt, /planRefundRules/);
  // 標準退款規則
  assert.match(prompt, new RegExp(STANDARD_REFUND_RULES[0].slice(0, 8)));
  // 導遊原始內容被嵌入
  assert.match(prompt, /柴山秘境之旅/);
  assert.match(prompt, /龍門亭入口/);
  assert.match(prompt, /請穿運動鞋/);
  assert.match(prompt, /半日 1800/);
  assert.match(prompt, /Andy Lee/);
});

test('buildActivityIntakePrompt：選填留空時標記請 AI 生成', () => {
  const { value } = normalizeIntake(validBody());
  const prompt = buildActivityIntakePrompt(value);
  assert.match(prompt, /導遊未填，請依行程內容合理生成/);
});

test('常數：地區 8 個、類別 4 個', () => {
  assert.equal(INTAKE_REGION_OPTIONS.length, 8);
  assert.equal(INTAKE_CATEGORY_OPTIONS.length, 4);
});
