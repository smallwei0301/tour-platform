import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
// #1615 拆檔：admin availability 頁的例外開放 CTA 移至 admin-sections、
// Modal 內容移至 admin-conflict-override-modal（純結構搬移、零行為變更）；
// 來源契約改讀「頁面＋其子元件」串接內容，斷言意圖不變。
const GUIDE_AVAILABILITY_SOURCES = [
  'app/admin/guides/[guideId]/availability/page.tsx',
  'src/components/availability/admin-sections.tsx',
  'src/components/availability/admin-conflict-override-modal.tsx',
].map((rel) => path.join(ROOT, rel));
// #1615 拆檔：admin edit 的場次 Modal（含 helper copy）移至 ScheduleSection 元件
const ACTIVITY_EDIT_PAGE = path.join(ROOT, 'src/components/admin/activity-form/ScheduleSection.tsx');

async function readSource(filePath) {
  return readFile(filePath, 'utf8');
}

test('guide availability page renders conflict-override CTA, modal copy, and POST wiring for issue1257', async () => {
  const src = (await Promise.all(GUIDE_AVAILABILITY_SOURCES.map(readSource))).join('\n');

  assert.match(src, /例外開放此場/, 'blocked conflict slot should expose the conflict-override CTA');
  assert.match(src, /例外開放衝突時段/, 'modal title should explain this is a conflict override');
  assert.match(src, /這不是一般新增場次/, 'modal should warn this flow is not normal availability creation');
  assert.match(src, /例外開放原因/, 'modal should require a reason field');
  assert.match(src, /需要助手/, 'modal should expose requires-helper toggle');
  assert.match(src, /助手狀態/, 'modal should expose helper status selector');
  assert.match(src, /導遊可見備註/, 'modal should expose guide-visible note');
  assert.match(src, /內部管理備註/, 'modal should expose internal admin note');
  assert.match(src, /api\/v2\/admin\/guides\/\$\{guideId\}\/conflict-overrides/, 'submit path must call the admin conflict-override route');
  assert.match(src, /allowed_with_admin_override/, 'client refresh/update path must preserve override-specific canonical state');
});

test('admin schedule modal helper copy clarifies normal schedules do not bypass guide/resource conflicts', async () => {
  const src = await readSource(ACTIVITY_EDIT_PAGE);

  assert.match(src, /activity_schedules 與指定日期場次不會略過導遊／資源衝突/, 'helper copy must say schedule creation does not bypass conflicts');
  assert.match(src, /如遇既有預約衝突，請改到導遊時間管理預覽後使用「例外開放此場」/, 'helper copy must redirect conflict cases to the guide availability exception flow');
  assert.doesNotMatch(src, /新增場次就能直接覆蓋衝突/, 'helper copy must not imply normal schedules override conflicts');
});
