import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// 行程公開頁（server component，方案資料走 SSR getActivityBySlugDb 而非 /api，
// 無法用 page.route mock plans）— 以 source-contract 鎖定「活動層級起價單位
// 跟著方案 price_type 走」的接線，避免回歸成寫死「/ 人」。
const here = path.dirname(fileURLToPath(import.meta.url));
const repoWeb = path.resolve(here, '../..');
const pagePath = path.join(repoWeb, 'app/[locale]/activities/[region]/[slug]/page.tsx');
const pageSrc = readFileSync(pagePath, 'utf8');

test('頁面 import resolveActivityPriceUnit 並由方案推導單位', () => {
  assert.match(pageSrc, /import\s+\{\s*resolveActivityPriceUnit\s*\}\s+from\s+['"][^'"]*activity-price-unit\.mjs['"]/);
  assert.match(pageSrc, /resolveActivityPriceUnit\(formalPlans\)/);
  assert.match(pageSrc, /const\s+isGroupPriced\s*=\s*activityPriceUnit\s*===\s*'per_group'/);
});

test('hero 與側欄起價單位依 isGroupPriced 切換 priceUnitGroup／priceUnit', () => {
  const ternary = pageSrc.match(/isGroupPriced \? t\('priceUnitGroup'\) : t\('priceUnit'\)/g) || [];
  // hero（kkd-price-unit）+ 側欄（kkd-booking-price-block）兩處
  assert.equal(ternary.length, 2, `預期兩處動態起價單位，實際 ${ternary.length}`);
  // 每個 t('priceUnit') 都必須是三元的 else 分支 → 兩者數量需相等（無殘留寫死）
  const bareUnit = pageSrc.match(/t\('priceUnit'\)/g) || [];
  assert.equal(bareUnit.length, ternary.length, '存在未被 isGroupPriced 判斷包住的 t(\'priceUnit\')');
});

test('底部 CTA 預設標籤依 isGroupPriced 切換 priceLabelBottomGroup／priceLabelBottom', () => {
  assert.match(
    pageSrc,
    /t\(isGroupPriced \? 'priceLabelBottomGroup' : 'priceLabelBottom',\s*\{\s*price:/,
  );
});

test('zh-Hant／en messages 具備每團單位 key', () => {
  for (const locale of ['zh-Hant', 'en']) {
    const msgs = JSON.parse(readFileSync(path.join(repoWeb, `messages/${locale}.json`), 'utf8'));
    assert.ok(msgs.activityDetail?.priceUnitGroup, `${locale} 缺 activityDetail.priceUnitGroup`);
    assert.ok(msgs.activityDetail?.priceLabelBottomGroup, `${locale} 缺 activityDetail.priceLabelBottomGroup`);
  }
});
