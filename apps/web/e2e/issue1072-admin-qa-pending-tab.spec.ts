/**
 * Issue #1072 — Admin Q&A 「待審核」 tab 看不到旅客提問
 *
 * Frontend interaction coverage for the canonical pending status.
 *
 * Background:
 *   - DB CHECK constraint allows status IN ('pending_moderation','approved','rejected').
 *   - Traveler POST /api/qa writes 'pending_moderation' (enforced by RLS).
 *   - Old admin UI sent ?status=pending → API filter never matched → empty list.
 *
 * Strategy:
 *   - Use the existing `authedPage` admin fixture from e2e/helpers.ts.
 *   - Use page.route() to mock /api/admin/qa, so the test does not depend on
 *     a seeded Supabase or in-memory backing — only on the UI contract.
 *   - Capture the URL the UI requests to verify the canonical status string.
 */
import { test, expect } from './helpers';

type QAFixture = {
  id: string;
  activity_id: string;
  question: string;
  answer: string | null;
  status: 'pending_moderation' | 'approved' | 'rejected';
  created_at: string;
  user_id?: string;
};

const PENDING_FIXTURE: QAFixture = {
  id: 'qa-1072-pending',
  activity_id: 'act-1072',
  question: '請問這個行程是否會去到傳統市場？',
  answer: null,
  status: 'pending_moderation',
  created_at: '2026-06-01T08:00:00Z',
};

const APPROVED_FIXTURE: QAFixture = {
  id: 'qa-1072-approved',
  activity_id: 'act-1072',
  question: '已核准的問題範例',
  answer: '會去到永樂市場與大稻埕',
  status: 'approved',
  created_at: '2026-05-30T08:00:00Z',
};

/** Stub /api/admin/qa with status-aware fixture rows + capture the requested URLs. */
async function stubAdminQA(page: import('@playwright/test').Page) {
  const seenUrls: string[] = [];

  await page.route('**/api/admin/qa**', async (route) => {
    const reqUrl = route.request().url();
    seenUrls.push(reqUrl);
    const url = new URL(reqUrl);
    const status = url.searchParams.get('status') || '';

    // Apply alias semantics for `?status=pending` legacy bookmark.
    const effective = status === 'pending' ? 'pending_moderation' : status;

    let rows: QAFixture[];
    if (!effective) rows = [PENDING_FIXTURE, APPROVED_FIXTURE];
    else if (effective === 'pending_moderation') rows = [PENDING_FIXTURE];
    else if (effective === 'approved') rows = [APPROVED_FIXTURE];
    else rows = [];

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: rows }),
    });
  });

  return { seenUrls };
}

test('T1072.1 — 預設進入 /admin/qa 即帶 canonical status=pending_moderation', async ({
  authedPage: page,
}) => {
  const { seenUrls } = await stubAdminQA(page);
  await page.goto('/admin/qa');
  await page.waitForResponse(
    (r) => r.url().includes('/api/admin/qa') && r.status() === 200,
    { timeout: 30000 },
  );
  await page.waitForTimeout(500);

  // First request from the page must filter by the canonical value.
  const firstRequest = seenUrls.find((u) => u.includes('/api/admin/qa'));
  expect(firstRequest, 'admin page should have called /api/admin/qa').toBeTruthy();
  expect(firstRequest!).toContain('status=pending_moderation');
  expect(firstRequest!).not.toMatch(/status=pending(?!_)/);
});

test('T1072.2 — 待審清單顯示旅客提問與核准/拒絕按鈕', async ({
  authedPage: page,
}) => {
  await stubAdminQA(page);
  await page.goto('/admin/qa');
  await page.waitForResponse(
    (r) => r.url().includes('/api/admin/qa') && r.status() === 200,
    { timeout: 30000 },
  );

  await expect(page.locator('body')).toContainText(PENDING_FIXTURE.question);
  await expect(page.locator('body')).toContainText('待審核');

  const approveBtn = page.locator('button:has-text("核准")').first();
  const rejectBtn = page.locator('button:has-text("拒絕")').first();
  await expect(approveBtn).toBeVisible();
  await expect(rejectBtn).toBeVisible();
});

test('T1072.3 — 切到「已核准」分頁，URL 改帶 status=approved', async ({
  authedPage: page,
}) => {
  const { seenUrls } = await stubAdminQA(page);
  await page.goto('/admin/qa');
  await page.waitForResponse(
    (r) => r.url().includes('/api/admin/qa') && r.status() === 200,
    { timeout: 30000 },
  );

  const approvedTab = page.locator('button:has-text("已核准")').first();
  await approvedTab.click();
  await page.waitForResponse(
    (r) =>
      r.url().includes('/api/admin/qa') &&
      r.url().includes('status=approved') &&
      r.status() === 200,
    { timeout: 30000 },
  );

  const approvedRequest = seenUrls.find((u) => u.includes('status=approved'));
  expect(approvedRequest, 'tab switch should call API with status=approved').toBeTruthy();
  await expect(page.locator('body')).toContainText(APPROVED_FIXTURE.question);
});

test('T1072.4 — 舊書籤 /admin/qa?status=pending 仍能載入待審清單 (admin API alias)', async ({
  authedPage: page,
}) => {
  await stubAdminQA(page);
  await page.goto('/admin/qa?status=pending');
  await page.waitForResponse(
    (r) => r.url().includes('/api/admin/qa') && r.status() === 200,
    { timeout: 30000 },
  );

  // The stub treats ?status=pending as the canonical value, mirroring the
  // server-side normalizeAdminQAStatusFilter() behaviour. The pending row
  // must still surface for the legacy bookmark.
  await expect(page.locator('body')).toContainText(PENDING_FIXTURE.question);
});
