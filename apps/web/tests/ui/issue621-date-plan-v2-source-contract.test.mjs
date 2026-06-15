import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

test('issue621 date-plan section requests v2 availability and does NOT surface internal source/fallback wording to travelers', async () => {
  const rel = 'src/components/activity/DatePlanSection.tsx';
  const src = await readFile(path.join(ROOT, rel), 'utf8');

  assert.match(
    src,
    /\/availability\?v2=1/,
    'when useBookingV2=true, date-plan availability fetch must hit v2-mode contract endpoint'
  );

  // 旅客前台不得再出現 legacy/備援/fallback 等內部術語或「稍後再試」的誤導文案。
  // legacy 快照是有效且可預約的資料，對旅客顯示這類提示會造成誤解（owner 拍板 2026-06-15：對旅客隱藏）。
  // 來源偵測改由後端 availability route 的 source 欄位 + x-availability-source header 觀測。
  assert.doesNotMatch(
    src,
    /Legacy 備援|（fallback）|聚合結果/,
    'traveler-facing copy must NOT expose legacy/備援/fallback source wording'
  );

  assert.doesNotMatch(
    src,
    /可能延遲，建議稍後再試/,
    'traveler-facing copy must NOT tell travelers to retry when the (valid) legacy snapshot is shown'
  );
});
