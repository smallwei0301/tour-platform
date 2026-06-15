import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const mapperMod = path.resolve(ROOT, 'src/lib/activity-plans-rich-mapper.mjs');

// #297 方案詳情「行程介紹」改為站點時間表：每站可有 icon／title／duration／description／imageUrl，
// 同時必須相容舊版單行 { text, imageUrl } 格式。
describe('GH-297 plan_itinerary rich station mapping', () => {
  it('normalizes rich station fields and drops empty stations', async () => {
    const { normalizeRichPlanPayload } = await import(pathToFileURL(mapperMod).href);
    const rich = normalizeRichPlanPayload({
      planItinerary: [
        { icon: '🚩', title: '集合 & 裝備確認', duration: '20 分', description: '導覽說明背景知識。', imageUrl: 'https://example.com/a.jpg' },
        { title: '珊瑚礁岩步道入口', duration: '30 分' },
        { icon: '   ', title: '   ', duration: '   ', description: '   ', imageUrl: '   ' }, // 全空白 → 丟棄
      ],
    });

    assert.deepEqual(rich.plan_itinerary, [
      { title: '集合 & 裝備確認', duration: '20 分', description: '導覽說明背景知識。', icon: '🚩', imageUrl: 'https://example.com/a.jpg' },
      { title: '珊瑚礁岩步道入口', duration: '30 分' },
    ]);
  });

  it('keeps a station that only has an image (image-only station is valid)', async () => {
    const { normalizeRichPlanPayload } = await import(pathToFileURL(mapperMod).href);
    const rich = normalizeRichPlanPayload({
      planItinerary: [{ imageUrl: 'https://example.com/only.jpg' }],
    });
    assert.deepEqual(rich.plan_itinerary, [{ imageUrl: 'https://example.com/only.jpg' }]);
  });

  it('remains backward compatible with legacy { text, imageUrl } rows', async () => {
    const { normalizeRichPlanPayload } = await import(pathToFileURL(mapperMod).href);
    const rich = normalizeRichPlanPayload({
      plan_itinerary: [
        { text: '迪化街導覽', imageUrl: 'https://example.com/i.jpg' },
        { text: '永樂市場自由活動' },
      ],
    });
    assert.deepEqual(rich.plan_itinerary, [
      { text: '迪化街導覽', imageUrl: 'https://example.com/i.jpg' },
      { text: '永樂市場自由活動' },
    ]);
  });
});
