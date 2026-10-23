import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';
import { parseExperienceYears } from '../../src/lib/midao/midao-experience-years.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const read = (p) => readFile(path.join(ROOT, p), 'utf8');
const PAGE = 'app/(non-locale)/midao2/me/page.tsx';

test('parseExperienceYears：合法值', () => {
  for (const [raw, want] of [[0, 0], [7, 7], [60, 60], ['0', 0], ['12', 12], ['07', 7], ['60', 60]]) {
    assert.equal(parseExperienceYears(raw), want, JSON.stringify(raw));
  }
});

test('parseExperienceYears：非法值一律 null（空值、空白、指數、正負號、小數、越界、型別錯誤）', () => {
  for (const raw of ['', null, undefined, false, true, [], [5], {}, ' 5 ', '1e1', '+5', '-1', '3.5', '007', '61', 'abc', 3.7, -1, 61, NaN, Infinity]) {
    assert.equal(parseExperienceYears(raw), null, JSON.stringify(raw));
  }
});

test('server 與頁面共用同一個解析函式', async () => {
  const db = await read('src/lib/midao/db-midao-showcase.mjs');
  assert.match(db, /parseExperienceYears\(years\)/u);
  const page = await read(PAGE);
  assert.match(page, /parseExperienceYears\(expInput\.trim\(\)\)/u);
  assert.doesNotMatch(page, /Math\.trunc\(Number\(expInput\)\)/u);
});

test('讀取失敗不得預設 0：catch 分支設 null，且全檔不存在 catch 內 setExperienceYears(0)', async () => {
  const page = await read(PAGE);
  assert.match(page, /useState<number \| null>/u);
  assert.match(page, /catch \{[^}]*setExperienceYears\(null\)[^}]*\}/u);
  assert.doesNotMatch(page, /catch \{[^}]*setExperienceYears\(0\)[^}]*\}/u);
});

test('讀取失敗時顯示錯誤與重試，編輯按鈕只在 experienceYears !== null 的分支內渲染', async () => {
  const page = await read(PAGE);
  const errIdx = page.indexOf('experienceYears === null ?');
  const loadErr = page.indexOf('midao2-me-exp-load-error');
  const editBtn = page.indexOf('midao2-me-exp-edit');
  assert.ok(errIdx > 0 && loadErr > errIdx, '應有 experienceYears === null 分支顯示錯誤');
  assert.match(page, /年資讀取失敗/u);
  assert.match(page.slice(loadErr, editBtn), /onClick=\{load\}/u, '重試呼叫 load');
  assert.ok(editBtn > loadErr, '編輯按鈕位於 null 錯誤分支之後（只在非 null 分支渲染）');
  // 錯誤分支（loadErr 到 editBtn 之間）不得含編輯入口
  assert.doesNotMatch(page.slice(errIdx, page.indexOf(') : editingExp ? (', errIdx)), /midao2-me-exp-edit|setEditingExp\(true\)/u);
});
