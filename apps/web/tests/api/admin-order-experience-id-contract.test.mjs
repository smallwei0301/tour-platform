import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createOrderDb, getAdminOrderDetailDb } from '../../src/lib/db.mjs';

// admin order detail 需帶 experienceId，order-telegram fan-out 才能解析負責導遊。
// 此契約鎖定 fallback 與 Supabase 兩條路徑回傳同一欄位（避免只在記憶體綠燈）。

test('getAdminOrderDetailDb（fallback）回傳 experienceId，對應建單的 activity', async () => {
  const created = await createOrderDb({
    experienceSlug: 'kaohsiung-chaishan-cave-experience',
    scheduleId: 'sch_chaishan_0410',
    peopleCount: 1,
    contactName: 'Ops Exp',
    contactPhone: '0912123123',
    contactEmail: 'ops-exp@example.com',
  });

  const detail = await getAdminOrderDetailDb({ orderId: created.id });
  assert.ok(detail.experienceId, 'admin order detail 應含 experienceId');
  assert.equal(detail.experienceId, created.experienceId);
});

test('Supabase 路徑映射同樣輸出 experienceId（source-contract）', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const dbSrc = readFileSync(join(here, '..', '..', 'src', 'lib', 'db.mjs'), 'utf8');
  assert.match(dbSrc, /experienceId:\s*r\.activity_id/, 'listAdminOrdersDb 應映射 experienceId: r.activity_id');
});
