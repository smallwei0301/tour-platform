import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRequire } from 'node:module';

const ROOT = path.resolve(process.cwd());
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
  process.env.GH502_RENDER_PROBE_MODE = '1';

  const regionPagePath = path.join(ROOT, 'app/activities/[region]/[slug]/page.tsx');
  const compatPagePath = path.join(ROOT, 'app/activities/[slug]/page.tsx');

  const [regionSrc, compatSrc] = await Promise.all([
    fs.readFile(regionPagePath, 'utf8'),
    fs.readFile(compatPagePath, 'utf8'),
  ]);

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
    id: 'probe-activity-id',
    slug: '__render_probe__',
    title: 'GH502 Render Probe Activity',
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
      getActivityBySlugDb: async () => {
        throw new Error('DB helper should not be called for probe slug');
      },
    },
    '../../../src/lib/db.mjs': {
      getActivityBySlugDb: async () => ({ slug: '__render_probe__', regionSlug: 'taipei', region: '台北市' }),
      buildCanonicalActivityDetailPath: () => '/activities/taipei/__render_probe__',
    },
    '../../../../src/config/feature-flags.mjs': { isBookingV2Enabled: () => false },
    '../../../../src/lib/booking-entry.mjs': { resolveBookingEntryHref: () => '/booking/__render_probe__' },
    '../../../../src/components/activity/DatePlanSection': { DatePlanSection: () => React.createElement('div', null, 'DatePlanSection') },
    '../../../../src/components/activity/ActivityBottomBar': { ActivityBottomBar: () => React.createElement('div', null, 'BottomBar') },
    '../../../../src/components/activity/SectionAnchorNav': { SectionAnchorNav: () => React.createElement('div', null, 'SectionAnchorNav') },
    '../../../../src/components/activity/ImageCarousel': { ImageCarousel: () => React.createElement('div', null, 'ImageCarousel') },
    '../../../../src/components/activity/ActivityQASection': { ActivityQASection: () => React.createElement('div', null, 'ActivityQASection') },
    react: React,
    'react/jsx-runtime': require('react/jsx-runtime'),
  };

  const regionModule = loadCjsModule({
    filePath: regionPagePath,
    source: transpileTsxToCjs(regionSrc, regionPagePath),
    mockMap,
  });

  const metadata = await regionModule.generateMetadata({ params: Promise.resolve({ region: 'taipei', slug: '__render_probe__' }) });
  assert.equal(metadata.title, '__render_probe__ | Tour Platform');
  assert.equal(metadata.description, '探索台灣在地導遊行程');

  const element = await regionModule.default({ params: Promise.resolve({ region: 'taipei', slug: '__render_probe__' }) });
  const html = renderToStaticMarkup(element);
  assert.equal(html.includes('GH502 Render Probe Activity'), true);
  assert.equal(html.includes('data-testid="activity-detail-title"'), true);
  assert.equal(html.includes('DatePlanSection'), true);
  assert.equal(notFoundCalled, false);

  const compatModule = loadCjsModule({
    filePath: compatPagePath,
    source: transpileTsxToCjs(compatSrc, compatPagePath),
    mockMap,
  });

  redirectTarget = null;
  await assert.rejects(
    () => compatModule.default({ params: Promise.resolve({ slug: '__render_probe__' }) }),
    /REDIRECT_CALLED/,
  );
  assert.equal(redirectTarget, '/activities/taipei/__render_probe__');

  assert.equal(regionModule.dynamic, 'force-dynamic');
  assert.equal(regionModule.revalidate, 60);
  assert.equal(compatModule.dynamic, 'force-dynamic');
  assert.equal(compatModule.revalidate, 60);
});
