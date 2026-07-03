import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = join(__dirname, '..', '..');

// 背景：AdminGuide 是固定在右下角的「?」導覽 FAB（position:fixed;
// z-index:9999），會蓋住 admin modal（如「編輯導遊帳號」的儲存鈕），
// 手機上尤其明顯。owner 要求移除，故 AdminShell 不再掛載、元件檔已刪。

test('AdminShell 不再 import / render AdminGuide FAB', () => {
  const src = readFileSync(join(WEB_ROOT, 'src/components/admin/AdminShell.tsx'), 'utf8');
  assert.ok(!/from '\.\/AdminGuide'/.test(src), 'AdminShell 仍 import AdminGuide');
  assert.ok(!/<AdminGuide\b/.test(src), 'AdminShell 仍 render <AdminGuide>');
});

test('AdminGuide 元件檔已移除（不留死碼）', () => {
  assert.equal(
    existsSync(join(WEB_ROOT, 'src/components/admin/AdminGuide.tsx')),
    false,
    'AdminGuide.tsx 應已刪除',
  );
});
