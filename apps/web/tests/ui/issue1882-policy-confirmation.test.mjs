import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const require = createRequire(import.meta.url);
test('real confirmation component renders the current shared snapshot across plan states', async () => {
  const policy = await import('../../src/lib/public-policy/copy.mjs');
  const source = readFileSync(new URL('../../src/components/activity/SelectedPlanConfirmation.tsx', import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  let selected = null;
  const module = { exports: {} };
  vm.runInNewContext(output, { module, exports: module.exports, require: name => name === 'next-intl' ? { useLocale: () => 'zh-Hant' } : name === './SelectedPlanContext' ? { useSelectedPlan: () => ({ selected }) } : name.includes('public-policy/copy') ? policy : require(name) });
  for (const [state, snapshot, expected] of [
    ['initial', null, null], ['selected zero', { id: 'zero', confirmByDays: 0 }, '0'],
    ['pending availability', { id: 'seven', confirmByDays: 7 }, '7'],
    ['detail cancelled', { id: 'seven', confirmByDays: 7 }, '7'],
    ['unconfigured plan', { id: 'unset', confirmByDays: null }, null],
    ['Back restored snapshot', { id: 'zero', confirmByDays: 0 }, '0'],
    ['cleared', null, null],
  ]) {
    selected = snapshot;
    const html = renderToStaticMarkup(React.createElement(module.exports.SelectedPlanConfirmation));
    if (expected === null) assert.equal(html, '', state);
    else assert.ok(html.includes(`前 ${expected} 天`), state);
  }
});
test('all detail public refund consumers use canonical copy, selection writers carry confirmation', () => {
  for (const file of ['app/[locale]/activities/[region]/[slug]/page.tsx', 'src/components/activity/PlanDetailModal.tsx']) {
    const source = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
    assert.ok(source.includes('publicRefundRules'), file);
    assert.ok(!/activity\.refundRules|plan\.planRefundRules|t\('trustRefundPrefix'\)|t\('policyConfirm'\)/.test(source), file);
  }
  const source = readFileSync(new URL('../../src/components/activity/DatePlanSection.tsx', import.meta.url), 'utf8');
  assert.match(source, /confirmByDays: currentPlan\.confirmByDays/);
  assert.equal([...source.matchAll(/confirmByDays: plan\.confirmByDays/g)].length, 3, 'card, date-picker and booking-link selection writers');
});

test('real details/card/close handlers keep committed A0 when previewing and cancelling B7', () => {
  const source = readFileSync(new URL('../../src/components/activity/DatePlanSection.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('DatePlanSection.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const handlers = [];
  function visit(node) {
    if (ts.isJsxAttribute(node) && ['onClick', 'onClose'].includes(node.name.getText(ast)) && node.initializer && ts.isJsxExpression(node.initializer)) {
      handlers.push({ name: node.name.getText(ast), expression: node.initializer.expression.getText(ast), element: node.parent.parent.getText(ast) });
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  const details = handlers.find(h => h.name === 'onClick' && h.element.includes('className="kkd-link-sm"'));
  const card = handlers.find(h => h.name === 'onClick' && h.expression.includes('if (!canBook) return;'));
  const close = handlers.find(h => h.name === 'onClose' && h.expression.includes('setModalPlan(null)'));
  assert.ok(details && card && close, 'use handlers extracted from real production JSX');
  const A = { id: 'A', label: 'A', confirmByDays: 0 };
  const B = { id: 'B', label: 'B', confirmByDays: 7, priceType: 'per_person' };
  let committed = A;
  let preview = null;
  let requestedDate = '2026-10-05';
  const sandbox = {
    plan: B, canBook: true, selectedPlan: A.id, selectedDate: requestedDate, scheduleId: 'schedule-A', planPrice: 100,
    ensureLiveAvailability: () => {},
    setModalPlan: next => { preview = next; },
    setSelectedDate: next => { requestedDate = next; },
    setSelectedPlan: next => { sandbox.selectedPlan = next; },
    setSharedSelectedPlan: next => { committed = next; },
  };
  function load(handler) {
    const js = ts.transpileModule(`const handler = ${handler.expression};`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
    return vm.runInNewContext(`${js}\nhandler;`, { ...sandbox });
  }
  const detailsClick = load(details), cardClick = load(card), modalClose = load(close);
  let stopped = false;
  detailsClick({ stopPropagation() { stopped = true; } });
  // A nested DOM click propagates to the card unless the real handler stops it.
  if (!stopped) cardClick();
  assert.equal(preview.id, 'B');
  assert.equal(committed.id, 'A', 'preview must not commit B via the parent card');
  assert.equal(committed.confirmByDays, 0);
  assert.equal(requestedDate, '2026-10-05', 'preview must not clear A date');
  modalClose();
  assert.equal(preview, null);
  assert.equal(committed.id, 'A', 'closing/cancelling preview preserves committed A');
  cardClick();
  assert.equal(committed.id, 'B', 'a direct card click still commits B');
  assert.equal(committed.confirmByDays, 7);
  assert.equal(requestedDate, null, 'direct plan switch still resets prior plan date');
});
