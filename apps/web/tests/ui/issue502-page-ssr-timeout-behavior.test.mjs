import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
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
  assert.equal(diagnostics.length, 0, diagnostics.map((d) => String(d.messageText)).join('\n'));
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

function createNeverResolving() {
  return new Promise(() => {});
}

test('GH-502: render-path activity lookup fails fast when DB promise hangs', async () => {
  const regionPagePath = path.join(ROOT, 'app/activities/[region]/[slug]/page.tsx');
  const compatPagePath = path.join(ROOT, 'app/activities/[slug]/page.tsx');
  const regionSrc = await fs.readFile(regionPagePath, 'utf8');
  // compat route may not exist if consolidated into [region]/[slug] only
  let compatSrc = null;
  try { compatSrc = await fs.readFile(compatPagePath, 'utf8'); } catch { /* no compat route */ }

  const regionNever = createNeverResolving();
  const compatNever = createNeverResolving();

  const mockMap = {
    'next/navigation': {
      notFound: () => {
        throw new Error('NOT_FOUND_CALLED');
      },
      redirect: () => {
        throw new Error('REDIRECT_CALLED');
      },
    },
    'next/link': { __esModule: true, default: ({ href, children }) => React.createElement('a', { href }, children) },
    '../../../../src/lib/db.mjs': {
      getActivityBySlugDb: async () => regionNever,
    },
    '../../../src/lib/db.mjs': {
      getActivityBySlugDb: async () => compatNever,
      buildCanonicalActivityDetailPath: () => '/activities/taipei/fallback-slug',
    },
    '../../../../src/config/feature-flags.mjs': { isBookingV2Enabled: () => false },
    '../../../../src/lib/booking-entry.mjs': { resolveBookingEntryHref: () => '/booking/__render_probe__' },
    '../../../../src/components/activity/DatePlanSection': { DatePlanSection: () => React.createElement('div', null, 'DatePlanSection') },
    '../../../../src/components/activity/ActivityBottomBar': { ActivityBottomBar: () => React.createElement('div', null, 'BottomBar') },
    '../../../../src/components/activity/SectionAnchorNav': { SectionAnchorNav: () => React.createElement('div', null, 'SectionAnchorNav') },
    '../../../../src/components/activity/SelectedPlanContext': { SelectedPlanProvider: ({ children }) => React.createElement(React.Fragment, null, children), useSelectedPlan: () => ({ selected: null, setSelected: () => {} }) },
    '../../../../src/components/activity/ImageCarousel': { ImageCarousel: () => React.createElement('div', null, 'ImageCarousel') },
    '../../../../src/components/activity/ActivityQASection': { ActivityQASection: () => React.createElement('div', null, 'ActivityQASection') },
    '../../../../src/components/ui/PublicIcon': { PublicIcon: ({ name }) => React.createElement('span', { 'data-public-icon': name }) },
    react: React,
    'react/jsx-runtime': require('react/jsx-runtime'),
  };

  const previousTimeoutEnv = process.env.GH502_ACTIVITY_LOOKUP_TIMEOUT_MS;
  process.env.GH502_ACTIVITY_LOOKUP_TIMEOUT_MS = '30';

  try {
    const regionModule = loadCjsModule({
      filePath: regionPagePath,
      source: transpileTsxToCjs(regionSrc, regionPagePath),
      mockMap,
    });

    const regionStart = Date.now();
    await assert.rejects(
      () => regionModule.default({ params: Promise.resolve({ region: 'taipei', slug: 'hangy-slug' }) }),
      /NOT_FOUND_CALLED/,
    );
    const regionElapsed = Date.now() - regionStart;
    assert.ok(regionElapsed >= 10, `expected region route timeout guard delay, got ${regionElapsed}ms`);
    assert.ok(regionElapsed < 220, `region route guard should fail fast, got ${regionElapsed}ms`);

    if (compatSrc) {
      const compatModule = loadCjsModule({
        filePath: compatPagePath,
        source: transpileTsxToCjs(compatSrc, compatPagePath),
        mockMap,
      });

      const compatStart = Date.now();
      await assert.rejects(
        () => compatModule.default({ params: Promise.resolve({ slug: 'hangy-slug' }) }),
        /NOT_FOUND_CALLED/,
      );
      const compatElapsed = Date.now() - compatStart;
      assert.ok(compatElapsed >= 10, `expected compat route timeout guard delay, got ${compatElapsed}ms`);
      assert.ok(compatElapsed < 220, `compat route guard should fail fast, got ${compatElapsed}ms`);
    }
  } finally {
    if (previousTimeoutEnv === undefined) {
      delete process.env.GH502_ACTIVITY_LOOKUP_TIMEOUT_MS;
    } else {
      process.env.GH502_ACTIVITY_LOOKUP_TIMEOUT_MS = previousTimeoutEnv;
    }
  }
});
