/**
 * TDD tests for issue #829 — Dynamic sitemap entries for public activity detail pages
 *
 * Tests are written first (red phase) before implementation.
 * Pattern follows tests/api/issue626-seo-metadata.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(__dirname, '../../app');
const srcDir = resolve(__dirname, '../../src');

function readFile(relPath, baseDir = appDir) {
  return readFileSync(resolve(baseDir, relPath), 'utf8');
}

// ---------------------------------------------------------------------------
// Import the module under test (will fail until sitemap-activities.mjs exists)
// ---------------------------------------------------------------------------
const { mapActivitiesToSitemapEntries, getActivitySitemapEntries } = await import(
  resolve(srcDir, 'lib/sitemap-activities.mjs')
);

// Real fixture activities (real slugs/regions) for the smoke suite. The
// listPublishedActivitiesDb fallback adds status:'published' when mapping
// fixtures (db.mjs:2364); we mirror that here.
const { activities: fixtureActivities } = await import(resolve(srcDir, 'fixtures/data.ts'));
const publishedFixtures = fixtureActivities.map((a) => ({ ...a, status: 'published' }));

const BASE_URL = 'https://example.com';
const NOW = new Date('2026-05-27T00:00:00Z');

// ---------------------------------------------------------------------------
// 1. mapActivitiesToSitemapEntries — pure unit tests
// ---------------------------------------------------------------------------

describe('#829 — mapActivitiesToSitemapEntries: 正向收錄', () => {
  it('已發佈活動產生 /activities/{region}/{slug} 項目', () => {
    const result = mapActivitiesToSitemapEntries(
      [{ slug: 'chaishan', region: '高雄市', regionSlug: 'kaohsiung', status: 'published' }],
      { baseUrl: BASE_URL, now: NOW }
    );
    assert.equal(result.length, 1);
    assert.equal(result[0].url, `${BASE_URL}/activities/kaohsiung/chaishan`);
  });

  it('含有正確的 changeFrequency 與 priority', () => {
    const result = mapActivitiesToSitemapEntries(
      [{ slug: 'test-activity', region: '高雄市', regionSlug: 'kaohsiung', status: 'published' }],
      { baseUrl: BASE_URL, now: NOW }
    );
    assert.equal(result[0].changeFrequency, 'daily');
    assert.equal(result[0].priority, 0.8);
  });
});

describe('#829 — mapActivitiesToSitemapEntries: region 正規化（無 regionSlug）', () => {
  it('台北市 → taipei（中→英對照）', () => {
    const result = mapActivitiesToSitemapEntries(
      [{ slug: 'x', region: '台北市', status: 'published' }],
      { baseUrl: BASE_URL, now: NOW }
    );
    assert.equal(result.length, 1);
    assert.equal(result[0].url, `${BASE_URL}/activities/taipei/x`);
  });

  it('高雄 → kaohsiung（短名稱也能正規化）', () => {
    const result = mapActivitiesToSitemapEntries(
      [{ slug: 'y', region: '高雄', status: 'published' }],
      { baseUrl: BASE_URL, now: NOW }
    );
    assert.equal(result[0].url, `${BASE_URL}/activities/kaohsiung/y`);
  });
});

describe('排除自動化測試殘留 slug（playwright-/e2e- 前綴）', () => {
  it('playwright-e2e-<timestamp> 不進 sitemap 即使 status=published', () => {
    const result = mapActivitiesToSitemapEntries(
      [
        { slug: 'playwright-e2e-1775872569478-1775872569552', region: '台北市', regionSlug: 'taipei', status: 'published' },
        { slug: 'playwright-e2e-1775872048549-1775872048625', region: '台北市', regionSlug: 'taipei', status: 'published' },
      ],
      { baseUrl: BASE_URL, now: NOW }
    );
    assert.equal(result.length, 0);
  });

  it('e2e-accept-test-* 不進 sitemap 即使 status=published', () => {
    const result = mapActivitiesToSitemapEntries(
      [{ slug: 'e2e-accept-test-001', region: '台北市', regionSlug: 'taipei', status: 'published' }],
      { baseUrl: BASE_URL, now: NOW }
    );
    assert.equal(result.length, 0);
  });

  it('PLAYWRIGHT-... 大寫前綴也被排除（case-insensitive）', () => {
    const result = mapActivitiesToSitemapEntries(
      [{ slug: 'PLAYWRIGHT-e2e-upper', region: '台北市', regionSlug: 'taipei', status: 'published' }],
      { baseUrl: BASE_URL, now: NOW }
    );
    assert.equal(result.length, 0);
  });

  it('正常活動 slug 不受影響', () => {
    const result = mapActivitiesToSitemapEntries(
      [
        { slug: 'kaohsiung-chaishan-cave-experience', region: '高雄市', regionSlug: 'kaohsiung', status: 'published' },
        { slug: 'andy-lee-private-tour', region: '台北市', regionSlug: 'taipei', status: 'published' },
        { slug: 'e2eish-but-not-prefix', region: '台北市', regionSlug: 'taipei', status: 'published' },
      ],
      { baseUrl: BASE_URL, now: NOW }
    );
    assert.equal(result.length, 3);
    assert.ok(result.some((r) => r.url.endsWith('/kaohsiung-chaishan-cave-experience')));
    assert.ok(result.some((r) => r.url.endsWith('/e2eish-but-not-prefix')));
  });
});

describe('#829 — mapActivitiesToSitemapEntries: 排除未發佈', () => {
  it('status:draft 不產生項目', () => {
    const result = mapActivitiesToSitemapEntries(
      [{ slug: 'draft-activity', region: '高雄市', regionSlug: 'kaohsiung', status: 'draft' }],
      { baseUrl: BASE_URL, now: NOW }
    );
    assert.equal(result.length, 0);
  });

  it('無 status 欄位不產生項目', () => {
    const result = mapActivitiesToSitemapEntries(
      [{ slug: 'no-status', region: '高雄市', regionSlug: 'kaohsiung' }],
      { baseUrl: BASE_URL, now: NOW }
    );
    assert.equal(result.length, 0);
  });
});

describe('#829 — mapActivitiesToSitemapEntries: 略過空 slug', () => {
  it('空 slug 不產生項目（避免裸 /activities）', () => {
    const result = mapActivitiesToSitemapEntries(
      [{ slug: '', region: '高雄市', regionSlug: 'kaohsiung', status: 'published' }],
      { baseUrl: BASE_URL, now: NOW }
    );
    assert.equal(result.length, 0);
  });

  it('undefined slug 不產生項目', () => {
    const result = mapActivitiesToSitemapEntries(
      [{ region: '高雄市', regionSlug: 'kaohsiung', status: 'published' }],
      { baseUrl: BASE_URL, now: NOW }
    );
    assert.equal(result.length, 0);
  });
});

describe('#829 — mapActivitiesToSitemapEntries: 絕不輸出私有路由', () => {
  const PRIVATE_PATTERNS = ['/admin', '/guide/', '/api', '/booking', '/checkout', '/orders', '/me'];

  it('每筆 url 都以 ${baseUrl}/activities/ 開頭', () => {
    const activities = [
      { slug: 'a1', region: '高雄市', regionSlug: 'kaohsiung', status: 'published' },
      { slug: 'a2', region: '台北市', regionSlug: 'taipei', status: 'published' },
    ];
    const result = mapActivitiesToSitemapEntries(activities, { baseUrl: BASE_URL, now: NOW });
    for (const entry of result) {
      assert.ok(
        entry.url.startsWith(`${BASE_URL}/activities/`),
        `url 應以 /activities/ 開頭: ${entry.url}`
      );
    }
  });

  it('不含任何私有路由片段', () => {
    const activities = [
      { slug: 'a1', region: '高雄市', regionSlug: 'kaohsiung', status: 'published' },
    ];
    const result = mapActivitiesToSitemapEntries(activities, { baseUrl: BASE_URL, now: NOW });
    for (const entry of result) {
      for (const pattern of PRIVATE_PATTERNS) {
        assert.ok(
          !entry.url.includes(pattern),
          `url 不應含 ${pattern}: ${entry.url}`
        );
      }
    }
  });
});

describe('#829 — mapActivitiesToSitemapEntries: 不外洩 preview 網址', () => {
  it('使用傳入的 baseUrl，而非硬編碼的 preview host', () => {
    const PROD_URL = 'https://tour-platform-nine.vercel.app';
    const result = mapActivitiesToSitemapEntries(
      [{ slug: 'cave', region: '高雄市', regionSlug: 'kaohsiung', status: 'published' }],
      { baseUrl: PROD_URL, now: NOW }
    );
    assert.ok(result[0].url.startsWith(PROD_URL));
    assert.ok(!result[0].url.includes('vercel.app/vercel.app'));
  });
});

describe('#829 — mapActivitiesToSitemapEntries: 去重', () => {
  it('重複的 slug/region 輸入只產生唯一 URL', () => {
    const dup = { slug: 'chaishan', region: '高雄市', regionSlug: 'kaohsiung', status: 'published' };
    const result = mapActivitiesToSitemapEntries([dup, dup], { baseUrl: BASE_URL, now: NOW });
    assert.equal(result.length, 1);
  });
});

// ---------------------------------------------------------------------------
// 2. getActivitySitemapEntries — async wrapper tests
// ---------------------------------------------------------------------------

describe('#829 — getActivitySitemapEntries: fail-open', () => {
  it('DB 拋錯時回傳 []', async () => {
    const result = await getActivitySitemapEntries({
      baseUrl: BASE_URL,
      now: NOW,
      loadActivities: () => { throw new Error('db down'); },
    });
    assert.deepEqual(result, []);
  });

  it('DB 回傳 rejected promise 時也回傳 []', async () => {
    const result = await getActivitySitemapEntries({
      baseUrl: BASE_URL,
      now: NOW,
      loadActivities: () => Promise.reject(new Error('connection refused')),
    });
    assert.deepEqual(result, []);
  });
});

describe('#829 — getActivitySitemapEntries: 可注入 loadActivities 替身', () => {
  it('使用注入的假資料產生正確項目', async () => {
    const mockActivities = [
      { slug: 'mock-tour', region: '台南市', regionSlug: 'tainan', status: 'published' },
    ];
    const result = await getActivitySitemapEntries({
      baseUrl: BASE_URL,
      now: NOW,
      loadActivities: async () => mockActivities,
    });
    assert.equal(result.length, 1);
    assert.equal(result[0].url, `${BASE_URL}/activities/tainan/mock-tour`);
  });
});

describe('#829 — 真實 fixtures 資料煙霧測試', () => {
  it('真實 fixtures 經 mapper 後回傳 ≥1 筆', async () => {
    const result = await getActivitySitemapEntries({
      baseUrl: BASE_URL,
      now: NOW,
      loadActivities: async () => publishedFixtures,
    });
    assert.ok(result.length >= 1, `應有至少 1 筆活動，實際: ${result.length}`);
  });

  it('已知 fixture slug kaohsiung-chaishan-cave-experience 有出現', async () => {
    const result = await getActivitySitemapEntries({
      baseUrl: BASE_URL,
      now: NOW,
      loadActivities: async () => publishedFixtures,
    });
    const urls = result.map((e) => e.url);
    assert.ok(
      urls.some((u) => u.includes('kaohsiung-chaishan-cave-experience')),
      `應包含 kaohsiung-chaishan-cave-experience，實際 urls: ${urls.join(', ')}`
    );
  });

  it('預設 loader（listPublishedActivitiesDb）路徑回傳陣列且不丟錯', async () => {
    const result = await getActivitySitemapEntries({ baseUrl: BASE_URL, now: NOW });
    assert.ok(Array.isArray(result));
  });
});

// ---------------------------------------------------------------------------
// 3. sitemap.ts source-string checks（比照 issue626 風格）
// ---------------------------------------------------------------------------

describe('#829 — sitemap.ts 接線驗證', () => {
  it('sitemap.ts import 了 getActivitySitemapEntries', () => {
    const src = readFile('sitemap.ts');
    assert.ok(
      src.includes('getActivitySitemapEntries'),
      'sitemap.ts 應 import getActivitySitemapEntries'
    );
  });

  it('sitemap.ts 的 default export 是 async function', () => {
    const src = readFile('sitemap.ts');
    assert.ok(
      src.includes('async function sitemap') || src.includes('export default async'),
      'sitemap.ts default export 應為 async'
    );
  });

  it('sitemap.ts 設定了 revalidate', () => {
    const src = readFile('sitemap.ts');
    assert.ok(src.includes('revalidate'), 'sitemap.ts 應設定 revalidate');
  });
});
