import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Each render has an isolated process TZ and a sandbox Date; parallel tests keep their clocks.
const require = createRequire(import.meta.url);
if (process.env.CIVIL_DATE_CHILD) {
  const instant = process.env.CIVIL_DATE_INSTANT;
  const NativeDate = Date;
  class FrozenDate extends NativeDate {
    constructor(...args) { super(...(args.length ? args : [instant])); }
    static now() { return NativeDate.parse(instant); }
  }
  const messages = require('../../messages/zh-Hant.json');
  const t = (key, params = {}) => Object.entries(params).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, String(v)), messages.datePicker[key]);
  t.raw = key => messages.datePicker[key];
  const filename = fileURLToPath(new URL('../../src/components/activity/DatePicker.tsx', import.meta.url));
  const output = ts.transpileModule(readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, { module, exports: module.exports, Date: FrozenDate, require: name => name === 'next-intl' ? { useTranslations: () => t } : require(name) }, { filename });
  const schedules = ['2026-09-30', '2026-10-01', '2026-10-05'].map(date => ({ startAt: `${date}T01:00:00Z`, capacity: 8, bookedCount: 0, status: 'open' }));
  console.log(renderToStaticMarkup(React.createElement(module.exports.DatePicker, { schedules, selectedDate: process.env.CIVIL_DATE_SELECTED, onSelect() {} })));
} else {
  for (const [tz, instant, today] of [
    ['UTC', '2026-10-01T12:00:00Z', '10/1'],
    ['America/Los_Angeles', '2026-10-01T19:00:00Z', '10/1'],
    ['Asia/Taipei', '2026-10-01T04:00:00Z', '10/1'],
    ['America/Los_Angeles', '2026-10-01T06:59:59Z', '9/30'],
    ['America/Los_Angeles', '2026-10-01T07:00:01Z', '10/1'],
    ['Asia/Taipei', '2026-09-30T15:59:59Z', '9/30'],
    ['Asia/Taipei', '2026-09-30T16:00:01Z', '10/1'],
  ]) {
    test(`real DatePicker SSR civil pills ${tz} ${instant}`, () => {
      const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { encoding: 'utf8', env: { ...process.env, TZ: tz, CIVIL_DATE_CHILD: '1', CIVIL_DATE_INSTANT: instant, CIVIL_DATE_SELECTED: '2026-10-05' } });
      assert.equal(child.status, 0, child.stderr);
      const pills = [...child.stdout.matchAll(/<button\b[^>]*class="tp-date-pill[^>]*>[\s\S]*?<\/button>/g)].map(match => match[0]);
      assert.equal(pills.length, 30);
      assert.ok(pills[0].includes(`>${today}</span>`), 'first pill is the local civil day');
      assert.ok(!pills[0].includes('disabled=""'), 'first pill availability matches its displayed civil day');
      assert.ok(pills[0].includes(`>週${today === '9/30' ? '三' : '四'}</span>`));
      for (const [date, weekday] of [['10/1', '四'], ['10/5', '一']]) {
        const pill = pills.find(html => html.includes(`>${date}</span>`));
        assert.ok(pill.includes(`>週${weekday}</span>`), `${date} weekday matches its civil key`);
        assert.ok(!pill.includes('disabled=""'), `${date} availability uses its displayed key`);
      }
      const selected = pills.filter(html => /class="tp-date-pill selected/.test(html));
      assert.equal(selected.length, 1);
      assert.ok(selected[0].includes('>10/5</span>'), 'selected key stays Oct 5');
    });
  }
}
