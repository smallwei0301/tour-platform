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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const require = createRequire(import.meta.url);

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

test('GH-502 render-path isolation: module import + metadata + component render + route behavior', async () => {
  process.env.GH502_RENDER_PROBE_MODE = '0';

  const regionPagePath = path.join(ROOT, 'app/activities/[region]/[slug]/page.tsx');
  const compatPagePath = path.join(ROOT, 'app/activities/[slug]/page.tsx');

  const regionSrc = await fs.readFile(regionPagePath, 'utf8');
  // compat route may not exist if consolidated into [region]/[slug] only
  let compatSrc = null;
  try { compatSrc = await fs.readFile(compatPagePath, 'utf8'); } catch { /* no compat route */ }

  let redirectTarget = null;
  let notFoundCalled = false;

  const nextNavigationMock = {
    notFound: () => {
      notFoundCalled = true;
      throw new Error('NOT_FOUND_CALLED');
    },
    redirect: (to) => {
      redirectTarget = to;
      throw new Error('REDIRECT_CALLED');
    },
  };

  const activityFixture = {
    id: 'db-activity-id',
    slug: 'real-slug',
    title: 'DB Activity Title',
    tagline: 'render-path probe',
    shortDescription: 'Probe short description',
    description: 'Probe long description',
    region: '台北市',
    regionSlug: 'taipei',
    category: 'city-walk',
    priceTwd: 1234,
    durationDisplay: '2 小時',
    minParticipants: 1,
    maxParticipants: 8,
    imageUrls: [],
    inclusions: ['導覽服務'],
    exclusions: [],
    notices: ['準時集合'],
    refundRules: ['出發前 3 天可免費取消'],
    safetyNotice: '請穿著防滑鞋',
    faq: [],
    schedules: [],
    reviews: [],
    guide: null,
    coverImageUrl: null,
  };

  const mockMap = {
    'next/navigation': nextNavigationMock,
    'next/link': { __esModule: true, default: ({ href, children }) => React.createElement('a', { href }, children) },
    '../../../../src/lib/db.mjs': {
      getActivityBySlugDb: async (slug) => ({ ...activityFixture, slug }),
    },
    '../../../src/lib/db.mjs': {
      getActivityBySlugDb: async () => ({ slug: 'real-slug', regionSlug: 'taipei', region: '台北市' }),
      buildCanonicalActivityDetailPath: () => '/activities/taipei/real-slug',
    },
    '../../../../src/lib/activity-review-stats.mjs': {
      resolveActivityReviewStats: () => ({ score: 5.0, count: 0 }),
    },
    '../../../../src/lib/social-proof-quotes.mjs': {
      normalizeSocialProofQuotes: () => [],
      resolveSocialProofAuthor: (a) => a || '旅客回饋',
    },
    // #1378: 詳情頁新增 Product JSON-LD / OG helper 依賴（.mjs 無法被 require()，須 mock）
    '../../../../src/lib/activity-jsonld.mjs': {
      buildActivityProductJsonLd: () => ({ '@type': 'Product' }),
      resolveActivityOgImage: (url) => url || 'https://example.com/og.jpg',
      serialiseJsonLd: (v) => JSON.stringify(v),
    },
    '../../../../src/config/feature-flags.mjs': { isBookingV2Enabled: () => false },
    '../../../../src/lib/booking-entry.mjs': { resolveBookingEntryHref: () => '/booking/__render_probe__' },
    '../../../../src/lib/date-plan-source.mjs': {
      resolveDatePlanPresentation: () => ({
        source: 'legacy',
        selectedDatePlan: null,
        datePlanCards: [],
      }),
    },
    '../../../../src/components/activity/DatePlanSection': { DatePlanSection: () => React.createElement('div', null, 'DatePlanSection') },
    '../../../../src/components/activity/PlanItinerarySection': { PlanItinerarySection: () => React.createElement('div', null, 'PlanItinerarySection') },
    '../../../../src/components/activity/ActivityBottomBar': { ActivityBottomBar: () => React.createElement('div', null, 'BottomBar') },
    '../../../../src/components/activity/SectionAnchorNav': { SectionAnchorNav: () => React.createElement('div', null, 'SectionAnchorNav') },
    '../../../../src/components/activity/SelectedPlanContext': { SelectedPlanProvider: ({ children }) => React.createElement(React.Fragment, null, children), useSelectedPlan: () => ({ selected: null, setSelected: () => {} }) },
    '../../../../src/components/activity/ImageCarousel': { ImageCarousel: () => React.createElement('div', null, 'ImageCarousel') },
    '../../../../src/components/activity/ReviewPhotos': { ReviewPhotos: () => React.createElement('div', null, 'ReviewPhotos') },
    '../../../../src/components/activity/ActivityQASection': { ActivityQASection: () => React.createElement('div', null, 'ActivityQASection') },
    // #1381: 公開促銷碼 banner（client component，mock 為 noop）
    '../../../../src/components/activity/PublicPromoBanner': { PublicPromoBanner: () => React.createElement('div', null, 'PublicPromoBanner') },
    // #1382: 推薦區塊（client component，mock 為 noop）
    '../../../../src/components/activity/ActivityRecommendations': { ActivityRecommendations: () => React.createElement('div', null, 'ActivityRecommendations') },
    '../../../../src/components/ui/PublicIcon': { PublicIcon: ({ name }) => React.createElement('span', { 'data-public-icon': name }) },
    react: React,
    'react/jsx-runtime': require('react/jsx-runtime'),
  };

  const regionModule = loadCjsModule({
    filePath: regionPagePath,
    source: transpileTsxToCjs(regionSrc, regionPagePath),
    mockMap,
  });

  const metadata = await regionModule.generateMetadata({ params: Promise.resolve({ region: 'taipei', slug: 'real-slug' }) });
  // GH-502 + #1378: metadata 與頁面以 React cache() 共用同一次 lookup（仍只有一次 DB
  // 查詢），成功時 title/description/og:image 反映真實活動；lookup 失敗才 fallback
  // 回 humanized slug（見下方 timeout-behavior 測試仍鎖 fail-fast 行為）。
  assert.equal(metadata.title, 'DB Activity Title | Midao 祕島');
  assert.equal(metadata.description, 'Probe short description');

  const element = await regionModule.default({ params: Promise.resolve({ region: 'taipei', slug: 'real-slug' }) });
  const html = renderToStaticMarkup(element);
  assert.equal(html.includes('DB Activity Title'), true);
  assert.equal(html.includes('data-testid="activity-detail-title"'), true);
  assert.equal(html.includes('DatePlanSection'), true);
  assert.equal(notFoundCalled, false);

  if (compatSrc) {
    const compatModule = loadCjsModule({
      filePath: compatPagePath,
      source: transpileTsxToCjs(compatSrc, compatPagePath),
      mockMap,
    });

    redirectTarget = null;
    await assert.rejects(
      () => compatModule.default({ params: Promise.resolve({ slug: 'real-slug' }) }),
      /REDIRECT_CALLED/,
    );
    assert.equal(redirectTarget, '/activities/taipei/real-slug');
    assert.equal(compatModule.dynamic, 'force-dynamic');
    assert.equal(compatModule.revalidate, 60);
  }

  // Issue #502 後續：詳情頁改回 ISR（移除緊急 force-dynamic，保留 revalidate=60）。
  // 事故主因已移除、保留 8s timeout guard；force-dynamic 不得再宣告。
  assert.notEqual(regionModule.dynamic, 'force-dynamic');
  assert.equal(regionModule.revalidate, 60);
});

test('GH-502 probe safety: production-like env must not serve fake probe activity', async () => {
  process.env.GH502_RENDER_PROBE_MODE = '1';
  process.env.NODE_ENV = 'production';

  const regionPagePath = path.join(ROOT, 'app/activities/[region]/[slug]/page.tsx');
  const regionSrc = await fs.readFile(regionPagePath, 'utf8');

  let notFoundCalled = false;
  const nextNavigationMock = {
    notFound: () => {
      notFoundCalled = true;
      throw new Error('NOT_FOUND_CALLED');
    },
  };

  const mockMap = {
    'next/navigation': nextNavigationMock,
    'next/link': { __esModule: true, default: ({ href, children }) => React.createElement('a', { href }, children) },
    '../../../../src/lib/db.mjs': {
      getActivityBySlugDb: async () => null,
    },
    '../../../../src/lib/activity-review-stats.mjs': {
      resolveActivityReviewStats: () => ({ score: 5.0, count: 0 }),
    },
    '../../../../src/lib/social-proof-quotes.mjs': {
      normalizeSocialProofQuotes: () => [],
      resolveSocialProofAuthor: (a) => a || '旅客回饋',
    },
    // #1378: 詳情頁新增 Product JSON-LD / OG helper 依賴（.mjs 無法被 require()，須 mock）
    '../../../../src/lib/activity-jsonld.mjs': {
      buildActivityProductJsonLd: () => ({ '@type': 'Product' }),
      resolveActivityOgImage: (url) => url || 'https://example.com/og.jpg',
      serialiseJsonLd: (v) => JSON.stringify(v),
    },
    '../../../../src/config/feature-flags.mjs': { isBookingV2Enabled: () => false },
    '../../../../src/lib/booking-entry.mjs': { resolveBookingEntryHref: () => '/booking/__render_probe__' },
    '../../../../src/lib/date-plan-source.mjs': {
      resolveDatePlanPresentation: () => ({
        source: 'legacy',
        selectedDatePlan: null,
        datePlanCards: [],
      }),
    },
    '../../../../src/components/activity/DatePlanSection': { DatePlanSection: () => React.createElement('div', null, 'DatePlanSection') },
    '../../../../src/components/activity/PlanItinerarySection': { PlanItinerarySection: () => React.createElement('div', null, 'PlanItinerarySection') },
    '../../../../src/components/activity/ActivityBottomBar': { ActivityBottomBar: () => React.createElement('div', null, 'BottomBar') },
    '../../../../src/components/activity/SectionAnchorNav': { SectionAnchorNav: () => React.createElement('div', null, 'SectionAnchorNav') },
    '../../../../src/components/activity/SelectedPlanContext': { SelectedPlanProvider: ({ children }) => React.createElement(React.Fragment, null, children), useSelectedPlan: () => ({ selected: null, setSelected: () => {} }) },
    '../../../../src/components/activity/ImageCarousel': { ImageCarousel: () => React.createElement('div', null, 'ImageCarousel') },
    '../../../../src/components/activity/ReviewPhotos': { ReviewPhotos: () => React.createElement('div', null, 'ReviewPhotos') },
    '../../../../src/components/activity/ActivityQASection': { ActivityQASection: () => React.createElement('div', null, 'ActivityQASection') },
    // #1381: 公開促銷碼 banner（client component，mock 為 noop）
    '../../../../src/components/activity/PublicPromoBanner': { PublicPromoBanner: () => React.createElement('div', null, 'PublicPromoBanner') },
    // #1382: 推薦區塊（client component，mock 為 noop）
    '../../../../src/components/activity/ActivityRecommendations': { ActivityRecommendations: () => React.createElement('div', null, 'ActivityRecommendations') },
    '../../../../src/components/ui/PublicIcon': { PublicIcon: ({ name }) => React.createElement('span', { 'data-public-icon': name }) },
    react: React,
    'react/jsx-runtime': require('react/jsx-runtime'),
  };

  const regionModule = loadCjsModule({
    filePath: regionPagePath,
    source: transpileTsxToCjs(regionSrc, regionPagePath),
    mockMap,
  });

  await assert.rejects(
    () => regionModule.default({ params: Promise.resolve({ region: 'taipei', slug: '__render_probe__' }) }),
    /NOT_FOUND_CALLED/,
  );
  assert.equal(notFoundCalled, true);
});

test('GH-502 render-path isolation: non-probe render path uses DB result and does not fallback to 404 shell', async () => {
  process.env.GH502_RENDER_PROBE_MODE = '0';

  const regionPagePath = path.join(ROOT, 'app/activities/[region]/[slug]/page.tsx');
  const regionSrc = await fs.readFile(regionPagePath, 'utf8');

  let notFoundCalled = false;
  const nextNavigationMock = {
    notFound: () => {
      notFoundCalled = true;
      throw new Error('NOT_FOUND_CALLED');
    },
  };

  const activityFixture = {
    id: 'db-activity-id',
    slug: 'real-slug',
    title: 'DB Activity Title',
    tagline: 'from-db',
    shortDescription: 'DB short',
    description: 'DB long',
    region: '台北市',
    regionSlug: 'taipei',
    category: 'city-walk',
    priceTwd: 1800,
    durationDisplay: '3 小時',
    minParticipants: 1,
    maxParticipants: 6,
    imageUrls: [],
    inclusions: ['導覽服務'],
    exclusions: [],
    notices: ['準時集合'],
    refundRules: ['出發前 3 天可免費取消'],
    safetyNotice: '注意安全',
    faq: [],
    schedules: [],
    reviews: [],
    guide: null,
    coverImageUrl: null,
  };

  const mockMap = {
    'next/navigation': nextNavigationMock,
    'next/link': { __esModule: true, default: ({ href, children }) => React.createElement('a', { href }, children) },
    '../../../../src/lib/db.mjs': {
      getActivityBySlugDb: async (slug) => ({ ...activityFixture, slug }),
    },
    '../../../../src/lib/activity-review-stats.mjs': {
      resolveActivityReviewStats: () => ({ score: 5.0, count: 0 }),
    },
    '../../../../src/lib/social-proof-quotes.mjs': {
      normalizeSocialProofQuotes: () => [],
      resolveSocialProofAuthor: (a) => a || '旅客回饋',
    },
    // #1378: 詳情頁新增 Product JSON-LD / OG helper 依賴（.mjs 無法被 require()，須 mock）
    '../../../../src/lib/activity-jsonld.mjs': {
      buildActivityProductJsonLd: () => ({ '@type': 'Product' }),
      resolveActivityOgImage: (url) => url || 'https://example.com/og.jpg',
      serialiseJsonLd: (v) => JSON.stringify(v),
    },
    '../../../../src/config/feature-flags.mjs': { isBookingV2Enabled: () => false },
    '../../../../src/lib/booking-entry.mjs': { resolveBookingEntryHref: () => '/booking/real-slug' },
    '../../../../src/lib/date-plan-source.mjs': {
      resolveDatePlanPresentation: () => ({
        source: 'legacy',
        selectedDatePlan: null,
        datePlanCards: [],
      }),
    },
    '../../../../src/components/activity/DatePlanSection': { DatePlanSection: () => React.createElement('div', null, 'DatePlanSection') },
    '../../../../src/components/activity/PlanItinerarySection': { PlanItinerarySection: () => React.createElement('div', null, 'PlanItinerarySection') },
    '../../../../src/components/activity/ActivityBottomBar': { ActivityBottomBar: () => React.createElement('div', null, 'BottomBar') },
    '../../../../src/components/activity/SectionAnchorNav': { SectionAnchorNav: () => React.createElement('div', null, 'SectionAnchorNav') },
    '../../../../src/components/activity/SelectedPlanContext': { SelectedPlanProvider: ({ children }) => React.createElement(React.Fragment, null, children), useSelectedPlan: () => ({ selected: null, setSelected: () => {} }) },
    '../../../../src/components/activity/ImageCarousel': { ImageCarousel: () => React.createElement('div', null, 'ImageCarousel') },
    '../../../../src/components/activity/ReviewPhotos': { ReviewPhotos: () => React.createElement('div', null, 'ReviewPhotos') },
    '../../../../src/components/activity/ActivityQASection': { ActivityQASection: () => React.createElement('div', null, 'ActivityQASection') },
    // #1381: 公開促銷碼 banner（client component，mock 為 noop）
    '../../../../src/components/activity/PublicPromoBanner': { PublicPromoBanner: () => React.createElement('div', null, 'PublicPromoBanner') },
    // #1382: 推薦區塊（client component，mock 為 noop）
    '../../../../src/components/activity/ActivityRecommendations': { ActivityRecommendations: () => React.createElement('div', null, 'ActivityRecommendations') },
    '../../../../src/components/ui/PublicIcon': { PublicIcon: ({ name }) => React.createElement('span', { 'data-public-icon': name }) },
    react: React,
    'react/jsx-runtime': require('react/jsx-runtime'),
  };

  const regionModule = loadCjsModule({
    filePath: regionPagePath,
    source: transpileTsxToCjs(regionSrc, regionPagePath),
    mockMap,
  });

  const element = await regionModule.default({ params: Promise.resolve({ region: 'taipei', slug: 'real-slug' }) });
  const html = renderToStaticMarkup(element);

  assert.equal(notFoundCalled, false);
  assert.equal(html.includes('DB Activity Title'), true);
  assert.equal(html.includes('data-testid="activity-detail-title"'), true);
});
