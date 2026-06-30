import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRequire } from 'node:module';

// 行程公開頁是 server component，方案資料走 SSR（getActivityBySlugDb），不是
// page.route('**/api/**') 可攔截的 seam，故無法用純前端 Playwright mock plans。
// 這支 render 測試在沙箱內以「真實頁面 JSX + 真實 zh-Hant 文案」渲染，僅 mock
// 掉資料來源（其中 resolveActivityPriceUnit 注入 per_group / per_person），實證
// 活動層級起價單位（hero／側欄／底部 CTA 預設）會跟著方案計價方式輸出「團／人」。
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const require = createRequire(import.meta.url);

const intlMessages = require('../../messages/zh-Hant.json');
function lookupMessage(namespace, key) {
  return `${namespace}.${key}`.split('.').reduce((o, k) => (o == null ? o : o[k]), intlMessages);
}
function makeT(namespace = 'activityDetail') {
  const t = (key, params) => {
    let s = lookupMessage(namespace, key);
    if (typeof s !== 'string') return key;
    if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
    return s;
  };
  t.raw = (key) => lookupMessage(namespace, key);
  return t;
}
const nextIntlServerMock = {
  getTranslations: async (opts = {}) => makeT(opts.namespace),
  setRequestLocale: () => {},
};

function transpileTsxToCjs(source, fileName) {
  const out = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
    fileName,
    reportDiagnostics: true,
  });
  const diagnostics = out.diagnostics || [];
  assert.equal(diagnostics.length, 0, diagnostics.map((d) => d.messageText).join('\n'));
  return out.outputText;
}

function loadCjsModule({ filePath, source, mockMap }) {
  const module = { exports: {} };
  const dirname = path.dirname(filePath);
  const sandbox = {
    module,
    exports: module.exports,
    process,
    console,
    setTimeout,
    clearTimeout,
    require: (specifier) => {
      if (mockMap[specifier]) return mockMap[specifier];
      if (specifier.startsWith('./') || specifier.startsWith('../')) {
        const resolved = path.resolve(dirname, specifier);
        if (mockMap[resolved]) return mockMap[resolved];
      }
      return require(specifier);
    },
  };
  vm.runInNewContext(source, sandbox, { filename: filePath });
  return module.exports;
}

async function renderDetailPage({ priceUnit }) {
  const pagePath = path.join(ROOT, 'app/[locale]/activities/[region]/[slug]/page.tsx');
  const src = await fs.readFile(pagePath, 'utf8');

  const activityFixture = {
    id: 'db-activity-id',
    slug: 'kaohsiung-charter',
    title: '高雄包車一日遊',
    tagline: '包車方案',
    shortDescription: '短描述',
    description: '長描述',
    region: '高雄市',
    regionSlug: 'kaohsiung',
    category: 'city-walk',
    priceTwd: 7500,
    durationDisplay: '1 小時',
    minParticipants: 1,
    maxParticipants: 10,
    imageUrls: [],
    inclusions: ['導覽'],
    exclusions: [],
    notices: ['準時集合'],
    refundRules: ['出發前 3 天可免費取消'],
    safetyNotice: '注意安全',
    faq: [],
    schedules: [],
    reviews: [],
    guide: null,
    coverImageUrl: null,
    // 兩個皆為每團報價的方案；實際單位由注入的 resolveActivityPriceUnit 決定
    plans: [
      { id: 'p1', label: '4 人成行包車方案', priceType: priceUnit === 'per_group' ? 'per_group' : 'per_person' },
      { id: 'p2', label: '2 人成行包車方案', priceType: priceUnit === 'per_group' ? 'per_group' : 'per_person' },
    ],
  };

  // 底部 CTA：把收到的 priceLabel prop 直接渲染出來以便斷言（預設未選方案狀態）
  const bottomBarSpy = { priceLabel: null };

  const mockMap = {
    'next/navigation': { notFound: () => { throw new Error('NOT_FOUND'); }, redirect: () => { throw new Error('REDIRECT'); } },
    'next-intl/server': nextIntlServerMock,
    'next/link': { __esModule: true, default: ({ href, children }) => React.createElement('a', { href }, children) },
    'next/image': { __esModule: true, default: ({ alt }) => React.createElement('img', { alt }) },
    '../../../../../src/lib/db.mjs': { getActivityBySlugDb: async (slug) => ({ ...activityFixture, slug }) },
    '../../../../../src/lib/activity-review-stats.mjs': { resolveActivityReviewStats: () => ({ score: 5.0, count: 0 }) },
    '../../../../../src/lib/social-proof-quotes.mjs': { normalizeSocialProofQuotes: () => [], resolveSocialProofAuthor: (a) => a || '旅客' },
    '../../../../../src/lib/activity-jsonld.mjs': {
      buildActivityProductJsonLd: () => ({ '@type': 'Product' }),
      resolveActivityOgImage: (url) => url || 'https://example.com/og.jpg',
      serialiseJsonLd: (v) => JSON.stringify(v),
    },
    '../../../../../src/config/feature-flags.mjs': { isBookingV2Enabled: () => false },
    '../../../../../src/lib/booking-entry.mjs': {
      resolveBookingEntryHref: () => '/booking/x',
      resolvePlanBookingHref: () => '/booking/x',
      inferPlanIdForBookingUrl: () => null,
    },
    '../../../../../src/lib/date-plan-source.mjs': {
      resolveDatePlanPresentation: () => ({ plans: [], showMissingCanonicalMessage: false }),
    },
    // 注入活動層級單位（本測試的受測點）
    '../../../../../src/lib/activity-price-unit.mjs': { resolveActivityPriceUnit: () => priceUnit },
    '../../../../../src/components/activity/DatePlanSection': { DatePlanSection: () => React.createElement('div', null, 'DatePlanSection') },
    '../../../../../src/components/activity/PlanItinerarySection': { PlanItinerarySection: () => React.createElement('div', null, 'PlanItinerarySection') },
    '../../../../../src/components/activity/ActivityBottomBar': {
      ActivityBottomBar: ({ priceLabel }) => {
        bottomBarSpy.priceLabel = priceLabel;
        return React.createElement('div', { 'data-testid': 'bottom-bar' }, priceLabel);
      },
    },
    '../../../../../src/components/activity/SelectedPlanContext': {
      SelectedPlanProvider: ({ children }) => React.createElement(React.Fragment, null, children),
      useSelectedPlan: () => ({ selected: null, setSelected: () => {} }),
    },
    '../../../../../src/components/activity/SectionAnchorNav': { SectionAnchorNav: () => React.createElement('div') },
    '../../../../../src/components/activity/ImageCarousel': { ImageCarousel: () => React.createElement('div') },
    '../../../../../src/components/activity/ReviewPhotos': { ReviewPhotos: () => React.createElement('div') },
    '../../../../../src/components/activity/ActivityQASection': { ActivityQASection: () => React.createElement('div') },
    '../../../../../src/components/activity/PublicPromoBanner': { PublicPromoBanner: () => React.createElement('div') },
    '../../../../../src/components/activity/ActivityRecommendations': { ActivityRecommendations: () => React.createElement('div') },
    '../../../../../src/components/ui/PublicIcon': { PublicIcon: ({ name }) => React.createElement('span', { 'data-public-icon': name }) },
    react: React,
    'react/jsx-runtime': require('react/jsx-runtime'),
  };

  const mod = loadCjsModule({ filePath: pagePath, source: transpileTsxToCjs(src, pagePath), mockMap });
  const element = await mod.default({ params: Promise.resolve({ locale: 'zh-Hant', region: 'kaohsiung', slug: 'kaohsiung-charter' }) });
  const html = renderToStaticMarkup(element);
  return { html, bottomBarSpy };
}

test('每團報價：hero／側欄起價單位顯示「團」、底部 CTA 顯示「NT$7,500 / 團」', async () => {
  const { html, bottomBarSpy } = await renderDetailPage({ priceUnit: 'per_group' });
  // hero（kkd-price-row）+ 側欄（kkd-booking-price-block）兩處皆應為「起 / 團」
  const occurrences = html.split('起 / 團').length - 1;
  assert.ok(occurrences >= 2, `預期至少兩處「起 / 團」，實際 ${occurrences}`);
  // 不得殘留「起 / 人」
  assert.equal(html.includes('起 / 人'), false, 'per_group 不應出現「起 / 人」');
  // 底部 CTA 預設標籤
  assert.equal(bottomBarSpy.priceLabel, 'NT$7,500 / 團');
});

test('每人報價（回歸）：維持「起 / 人」與「NT$7,500 / 人」', async () => {
  const { html, bottomBarSpy } = await renderDetailPage({ priceUnit: 'per_person' });
  assert.ok(html.includes('起 / 人'), 'per_person 應顯示「起 / 人」');
  assert.equal(html.includes('起 / 團'), false, 'per_person 不應出現「起 / 團」');
  assert.equal(bottomBarSpy.priceLabel, 'NT$7,500 / 人');
});
