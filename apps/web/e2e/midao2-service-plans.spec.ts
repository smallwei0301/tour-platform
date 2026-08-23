// apps/web/e2e/midao2-service-plans.spec.ts
// #1860 Stage 1B / F11：/midao2 多方案管理真實互動覆蓋（E1–E6）。
//
// 後端全部以 page.route stub（比照 midao2-backend-flow.spec.ts），
// 驗的是 UI 契約：讀取全部方案（含 inactive）、單方案新增／編輯／明確下架、
// 未觸碰方案逐欄不變、服務層 PATCH 永不攜帶 plans。
import { test, expect, setGuideSession } from './helpers';

// dev server 首次編譯路由較慢，放寬單一測試上限。
test.describe.configure({ timeout: 120_000 });

const ACTIVITY_ID = 'act-plan-1';

type PlanRow = {
  id: string;
  slug: string;
  name: string;
  bookingType: 'scheduled' | 'request' | 'instant';
  durationMinutes: number;
  priceType: 'per_person' | 'per_group';
  basePrice: number;
  minParticipants: number;
  maxParticipants: number;
  status: 'active' | 'inactive';
  updatedAt: string;
};

function seedPlans(): PlanRow[] {
  return [
    {
      id: 'plan-a', slug: 'plan-a-slug', name: '方案 A 半日私旅',
      bookingType: 'request', durationMinutes: 180, priceType: 'per_person',
      basePrice: 2800, minParticipants: 2, maxParticipants: 6,
      status: 'active', updatedAt: '2026-08-20T01:00:00.000Z',
    },
    {
      id: 'plan-b', slug: 'plan-b-slug', name: '方案 B 全日深度',
      bookingType: 'instant', durationMinutes: 480, priceType: 'per_person',
      basePrice: 5200, minParticipants: 1, maxParticipants: 4,
      status: 'active', updatedAt: '2026-08-20T02:00:00.000Z',
    },
    {
      id: 'plan-c', slug: 'plan-c-slug', name: '方案 C 舊包團',
      bookingType: 'scheduled', durationMinutes: 300, priceType: 'per_group',
      basePrice: 12000, minParticipants: 3, maxParticipants: 8,
      status: 'inactive', updatedAt: '2026-08-20T03:00:00.000Z',
    },
  ];
}

const SERVICE = {
  activityId: ACTIVITY_ID,
  title: '柴山私人秘境導覽',
  tagline: '在地嚮導帶路',
  coverImageUrl: null,
  durationMinutes: 300,
  minParticipants: 2,
  maxParticipants: 6,
  region: '高雄',
  languages: ['中文'],
  priceTwd: 2800,
  dealMode: 'confirm_first',
  questions: [],
  showcasePublished: true,
  mainSiteStatus: 'draft',
  midaoSortOrder: null,
};

type Recorder = {
  plans: PlanRow[];
  servicePatchBodies: any[];
  planWrites: { method: string; url: string; body: any }[];
  seq: number;
};

/** 建立方案 API 的 stub；回傳可供斷言的記錄器。 */
async function stubPlanApis(page: any): Promise<Recorder> {
  const rec: Recorder = { plans: seedPlans(), servicePatchBodies: [], planWrites: [], seq: 0 };

  await page.route('**/api/guide/auth/csrf', (r: any) => r.fulfill({ json: { ok: true } }));
  // midao2 layout 會抓 summary；未 stub 會 401 導向登入頁。
  await page.route('**/api/v2/guide/midao/summary', (r: any) => r.fulfill({
    json: {
      success: true,
      data: {
        guideName: 'Andy',
        counts: { newRequests: 0, pendingReply: 0 },
        topRequest: null,
        recentRequests: [],
      },
    },
  }));

  // 服務層列表／PATCH。PATCH body 全數記錄，用來證明永不攜帶 plans。
  await page.route('**/api/v2/guide/midao/services', (r: any) => r.fulfill({
    json: { success: true, data: { items: [SERVICE] } },
  }));
  await page.route(`**/api/v2/guide/midao/services/${ACTIVITY_ID}`, (r: any) => {
    if (r.request().method() === 'PATCH') {
      rec.servicePatchBodies.push(r.request().postDataJSON());
    }
    return r.fulfill({ json: { success: true, data: { service: SERVICE } } });
  });

  // 單方案 PATCH（編輯／下架）：只允許動到 URL 指定的那一個 planId。
  await page.route(`**/api/v2/guide/midao/services/${ACTIVITY_ID}/plans/*`, (r: any) => {
    const url = r.request().url();
    const planId = url.split('/plans/')[1].split('?')[0];
    const body = r.request().postDataJSON();
    rec.planWrites.push({ method: r.request().method(), url, body });
    const target = rec.plans.find((p) => p.id === planId);
    if (!target) return r.fulfill({ status: 404, json: { success: false, error: { code: 'NOT_FOUND', message: '找不到方案' } } });
    if (body?.deactivate === true) {
      target.status = 'inactive';
    } else {
      if (body?.name !== undefined) target.name = body.name;
      if (body?.basePrice !== undefined) target.basePrice = Number(body.basePrice);
      if (body?.durationMinutes !== undefined) target.durationMinutes = Number(body.durationMinutes);
      if (body?.priceType !== undefined) target.priceType = body.priceType;
      if (body?.bookingType !== undefined) target.bookingType = body.bookingType;
      if (body?.minParticipants !== undefined) target.minParticipants = Number(body.minParticipants);
      if (body?.maxParticipants !== undefined) target.maxParticipants = Number(body.maxParticipants);
    }
    target.updatedAt = `2026-08-21T0${++rec.seq}:00:00.000Z`;
    return r.fulfill({ json: { success: true, data: { plan: { ...target }, appliedToPublicSurface: true } } });
  });

  // 方案集合：GET 全部非 archived（含 inactive）／POST 新增一個。
  await page.route(`**/api/v2/guide/midao/services/${ACTIVITY_ID}/plans`, (r: any) => {
    if (r.request().method() === 'POST') {
      const body = r.request().postDataJSON();
      rec.planWrites.push({ method: 'POST', url: r.request().url(), body });
      const created: PlanRow = {
        id: `plan-new-${++rec.seq}`,
        slug: `plan-new-${rec.seq}-slug`,
        name: String(body.name),
        bookingType: body.bookingType,
        durationMinutes: Number(body.durationMinutes),
        priceType: body.priceType,
        basePrice: Number(body.basePrice),
        minParticipants: Number(body.minParticipants),
        maxParticipants: Number(body.maxParticipants),
        status: 'active',
        updatedAt: `2026-08-21T1${rec.seq}:00:00.000Z`,
      };
      rec.plans.push(created);
      return r.fulfill({ json: { success: true, data: { plan: created, appliedToPublicSurface: true } } });
    }
    return r.fulfill({ json: { success: true, data: { plans: rec.plans.map((p) => ({ ...p })) } } });
  });

  return rec;
}

/** 等待方案區塊完成首次載入（dev server 首次編譯可能較慢）。 */
async function waitForPlansLoaded(page: any) {
  await expect(page.getByTestId('midao2-plan-section')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('midao2-plan-loading')).toHaveCount(0, { timeout: 60_000 });
  await expect(page.getByTestId('midao2-plan-row-plan-a')).toBeVisible({ timeout: 60_000 });
}

/** 讀出畫面上某方案列目前顯示的全部欄位，用來做「未觸碰逐欄不變」比對。 */
async function readRow(page: any, planId: string) {
  const row = page.getByTestId(`midao2-plan-row-${planId}`);
  return {
    status: await row.getAttribute('data-plan-status'),
    name: (await page.getByTestId(`midao2-plan-name-${planId}`).textContent())?.trim(),
    meta: (await page.getByTestId(`midao2-plan-meta-${planId}`).textContent())?.replace(/\s+/g, ' ').trim(),
    price: (await page.getByTestId(`midao2-plan-price-${planId}`).textContent())?.trim(),
    slug: (await page.getByTestId(`midao2-plan-slug-${planId}`).textContent())?.trim(),
  };
}

test.beforeEach(async ({ page }) => {
  await setGuideSession(page, 'guide-e2e-1');
});

test('E1：編輯頁載入全部方案（含 inactive），C 標示已下架', async ({ page }) => {
  await stubPlanApis(page);
  await page.goto(`/midao2/services/${ACTIVITY_ID}/edit`);
  await waitForPlansLoaded(page);

  await expect(page.getByTestId('midao2-plan-list')).toBeVisible();
  await expect(page.getByTestId('midao2-plan-row-plan-a')).toBeVisible();
  await expect(page.getByTestId('midao2-plan-row-plan-b')).toBeVisible();
  await expect(page.getByTestId('midao2-plan-row-plan-c')).toBeVisible();
  await expect(page.locator('[data-testid^="midao2-plan-row-"]')).toHaveCount(3);

  // inactive 明確標示；active 不得誤標。
  await expect(page.getByTestId('midao2-plan-inactive-plan-c')).toHaveText('已下架');
  await expect(page.getByTestId('midao2-plan-inactive-plan-a')).toHaveCount(0);
  await expect(page.getByTestId('midao2-plan-inactive-plan-b')).toHaveCount(0);

  // 八欄保真：時長、人數區間、計價方式、預約方式、價格、slug 都可見。
  await expect(page.getByTestId('midao2-plan-meta-plan-a')).toContainText('2-6 人');
  await expect(page.getByTestId('midao2-plan-price-plan-a')).toContainText('2,800');
  await expect(page.getByTestId('midao2-plan-slug-plan-a')).toHaveText('plan-a-slug');
});

test('E2：編輯 A 只打一支單方案 API，B/C 逐欄不變', async ({ page }) => {
  const rec = await stubPlanApis(page);
  await page.goto(`/midao2/services/${ACTIVITY_ID}/edit`);
  await waitForPlansLoaded(page);

  const beforeB = await readRow(page, 'plan-b');
  const beforeC = await readRow(page, 'plan-c');

  await page.getByTestId('midao2-plan-edit-plan-a').click();
  await page.getByTestId('midao2-plan-field-price').fill('3300');
  await page.getByTestId('midao2-plan-save').click();

  await expect(page.getByTestId('midao2-plan-price-plan-a')).toContainText('3,300');

  // 恰好一次寫入，且目標是 plan-a 的單方案端點。
  expect(rec.planWrites).toHaveLength(1);
  expect(rec.planWrites[0].method).toBe('PATCH');
  expect(rec.planWrites[0].url).toContain(`/services/${ACTIVITY_ID}/plans/plan-a`);
  expect(rec.planWrites[0].body).not.toHaveProperty('plans');

  // 未觸碰方案逐欄不變。
  expect(await readRow(page, 'plan-b')).toEqual(beforeB);
  expect(await readRow(page, 'plan-c')).toEqual(beforeC);
});

test('E3：新增方案 D，清單變 4 列且 D 有非空 slug', async ({ page }) => {
  const rec = await stubPlanApis(page);
  await page.goto(`/midao2/services/${ACTIVITY_ID}/edit`);
  await waitForPlansLoaded(page);

  await page.getByTestId('midao2-plan-add').click();
  await page.getByTestId('midao2-plan-field-name').fill('方案 D 夜觀');
  await page.getByTestId('midao2-plan-field-duration').fill('120');
  await page.getByTestId('midao2-plan-field-price').fill('1500');
  await page.getByTestId('midao2-plan-field-min').fill('2');
  await page.getByTestId('midao2-plan-field-max').fill('5');
  await page.getByTestId('midao2-plan-save').click();

  await expect(page.locator('[data-testid^="midao2-plan-row-"]')).toHaveCount(4);
  const created = rec.plans[rec.plans.length - 1];
  await expect(page.getByTestId(`midao2-plan-name-${created.id}`)).toHaveText('方案 D 夜觀');
  await expect(page.getByTestId(`midao2-plan-slug-${created.id}`)).not.toHaveText('—');

  // 建立走集合端點，且 payload 不含 plans 陣列與前端 slug。
  expect(rec.planWrites).toHaveLength(1);
  expect(rec.planWrites[0].method).toBe('POST');
  expect(rec.planWrites[0].body).not.toHaveProperty('plans');
  expect(rec.planWrites[0].body).not.toHaveProperty('slug');
});

test('E4：明確下架 B 需確認警示，且只影響 B', async ({ page }) => {
  const rec = await stubPlanApis(page);
  await page.goto(`/midao2/services/${ACTIVITY_ID}/edit`);
  await waitForPlansLoaded(page);

  const beforeA = await readRow(page, 'plan-a');
  const beforeC = await readRow(page, 'plan-c');

  // 未確認前不得寫入。
  await page.getByTestId('midao2-plan-deactivate-plan-b').click();
  await expect(page.getByTestId('midao2-plan-deactivate-warning')).toHaveText(
    '只下架這一個方案，其他方案不受影響，已成立的訂單與歷史紀錄不受影響',
  );
  expect(rec.planWrites).toHaveLength(0);

  await page.getByTestId('midao2-plan-deactivate-confirm').click();
  await expect(page.getByTestId('midao2-plan-inactive-plan-b')).toHaveText('已下架');

  expect(rec.planWrites).toHaveLength(1);
  expect(rec.planWrites[0].url).toContain('/plans/plan-b');
  expect(rec.planWrites[0].body.deactivate).toBe(true);
  expect(rec.planWrites[0].body).not.toHaveProperty('plans');

  expect(await readRow(page, 'plan-a')).toEqual(beforeA);
  expect(await readRow(page, 'plan-c')).toEqual(beforeC);
});

test('E5：下架後重新整理，A active／C inactive／D active 皆維持原狀', async ({ page }) => {
  const rec = await stubPlanApis(page);
  await page.goto(`/midao2/services/${ACTIVITY_ID}/edit`);
  await waitForPlansLoaded(page);

  // 先新增 D，再下架 B。
  await page.getByTestId('midao2-plan-add').click();
  await page.getByTestId('midao2-plan-field-name').fill('方案 D 夜觀');
  await page.getByTestId('midao2-plan-field-duration').fill('120');
  await page.getByTestId('midao2-plan-field-price').fill('1500');
  await page.getByTestId('midao2-plan-save').click();
  const createdId = rec.plans[rec.plans.length - 1].id;
  await expect(page.getByTestId(`midao2-plan-row-${createdId}`)).toBeVisible();

  await page.getByTestId('midao2-plan-deactivate-plan-b').click();
  await page.getByTestId('midao2-plan-deactivate-confirm').click();
  await expect(page.getByTestId('midao2-plan-inactive-plan-b')).toHaveText('已下架');

  await page.reload();
  await waitForPlansLoaded(page);

  await expect(page.getByTestId('midao2-plan-row-plan-a')).toHaveAttribute('data-plan-status', 'active');
  await expect(page.getByTestId('midao2-plan-row-plan-b')).toHaveAttribute('data-plan-status', 'inactive');
  await expect(page.getByTestId('midao2-plan-row-plan-c')).toHaveAttribute('data-plan-status', 'inactive');
  await expect(page.getByTestId(`midao2-plan-row-${createdId}`)).toHaveAttribute('data-plan-status', 'active');
  await expect(page.locator('[data-testid^="midao2-plan-row-"]')).toHaveCount(4);
});

test('E6：服務層儲存變更，方案數／狀態不變且 PATCH 不攜帶 plans', async ({ page }) => {
  const rec = await stubPlanApis(page);
  await page.goto(`/midao2/services/${ACTIVITY_ID}/edit`);
  await waitForPlansLoaded(page);

  const beforeA = await readRow(page, 'plan-a');
  const beforeB = await readRow(page, 'plan-b');
  const beforeC = await readRow(page, 'plan-c');

  // 走精靈到第三步儲存服務層變更。
  await page.getByTestId('midao2-form-next1').click();
  await page.getByTestId('midao2-form-next2').click();
  await expect(page.getByTestId('midao2-form-save-notice')).toHaveText('儲存後會立即更新前台');
  await page.getByTestId('midao2-form-save-edit').click();

  await expect.poll(() => rec.servicePatchBodies.length).toBeGreaterThan(0);
  for (const body of rec.servicePatchBodies) {
    expect(body).not.toHaveProperty('plans');
    expect(body).not.toHaveProperty('planOptions');
  }
  // 服務層儲存不得產生任何方案寫入。
  expect(rec.planWrites).toHaveLength(0);
  expect(rec.plans).toHaveLength(3);
  expect(rec.plans.map((p) => p.status)).toEqual(['active', 'active', 'inactive']);

  // 回到編輯頁確認畫面上的方案逐欄不變。
  await page.goto(`/midao2/services/${ACTIVITY_ID}/edit`);
  await waitForPlansLoaded(page);
  expect(await readRow(page, 'plan-a')).toEqual(beforeA);
  expect(await readRow(page, 'plan-b')).toEqual(beforeB);
  expect(await readRow(page, 'plan-c')).toEqual(beforeC);
});
