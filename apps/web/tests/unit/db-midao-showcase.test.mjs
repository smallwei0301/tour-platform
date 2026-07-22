import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MIDAO_DEAL_MODES, isShowcaseVisible, normalizeServiceInput,
  listMidaoServicesDb, createMidaoServiceDb, updateMidaoServiceDb, getPublicMidaoPageDb,
  updateGuideExperienceYearsDb, getGuideExperienceYearsDb,
  __resetMemMidaoShowcase, __seedMemMidaoGuide, __seedMemMidaoActivities,
} from '../../src/lib/db-midao-showcase.mjs';

const G = 'guide-1';
function guideProfile(over = {}) {
  return {
    id: G, slug: 'andy-lee', display_name: 'Andy Lee', headline: '高雄在地導覽',
    bio: '自然與文化探索', languages: ['中文', 'English'], regions: ['高雄', '台南'],
    experience_years: 5, profile_photo_url: 'p.jpg', hero_image_url: 'h.jpg',
    verification_status: 'approved', ...over,
  };
}
function serviceInput(over = {}) {
  return {
    title: '柴山私人秘境導覽', tagline: '半日祕境路線', durationMinutes: 300,
    minParticipants: 2, maxParticipants: 6, region: '高雄', languages: ['中文'],
    priceTwd: 4800, dealMode: 'confirm_first',
    questions: [{ id: 'q1', label: '是否需要接送', type: 'yes_no', options: [], required: true }],
    ...over,
  };
}

test.beforeEach(() => __resetMemMidaoShowcase());

test('isShowcaseVisible：雙軌矩陣全組合', () => {
  // midao_status 明確值優先
  assert.equal(isShowcaseVisible({ midaoStatus: 'published', status: 'draft' }), true);
  assert.equal(isShowcaseVisible({ midaoStatus: 'draft', status: 'published' }), false);
  // NULL＝跟隨主站
  assert.equal(isShowcaseVisible({ midaoStatus: null, status: 'published' }), true);
  assert.equal(isShowcaseVisible({ midaoStatus: null, status: 'draft' }), false);
  assert.equal(isShowcaseVisible({ midaoStatus: null, status: 'archived' }), false);
});

test('normalizeServiceInput：必填與範圍', () => {
  assert.equal(normalizeServiceInput(serviceInput()).ok, true);
  assert.equal(normalizeServiceInput(serviceInput({ title: '' })).code, 'INVALID_TITLE');
  assert.equal(normalizeServiceInput(serviceInput({ tagline: 'x'.repeat(61) })).code, 'TAGLINE_TOO_LONG');
  assert.equal(normalizeServiceInput(serviceInput({ dealMode: 'bogus' })).code, 'INVALID_DEAL_MODE');
  assert.equal(normalizeServiceInput(serviceInput({ priceTwd: -1 })).code, 'INVALID_PRICE');
  assert.equal(normalizeServiceInput(serviceInput({ minParticipants: 5, maxParticipants: 2 })).code, 'INVALID_PARTICIPANTS');
  // partial：只驗有給的欄
  assert.equal(normalizeServiceInput({ tagline: '新的一句話' }, true).ok, true);
});

test('精靈建立＋列表＋上下架', async () => {
  const norm = normalizeServiceInput(serviceInput());
  const created = await createMidaoServiceDb(G, norm.value, { publish: true });
  assert.equal(created.showcasePublished, true);
  assert.equal(created.mainSiteStatus, 'draft'); // 主站不受影響
  assert.match(created.activityId, /.+/);

  const items = await listMidaoServicesDb(G);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, '柴山私人秘境導覽');

  // 下架接案頁
  const updated = await updateMidaoServiceDb(G, created.activityId, { midaoStatus: 'draft' });
  assert.equal(updated.ok, true);
  assert.equal(updated.service.showcasePublished, false);
  // 越權：其他 guide 更新不到
  const foreign = await updateMidaoServiceDb('guide-2', created.activityId, { midaoStatus: 'published' });
  assert.equal(foreign.ok, false);
  assert.equal(foreign.code, 'NOT_FOUND');
});

test('公開接案頁：approved＋≥1 可見服務才回資料', async () => {
  __seedMemMidaoGuide(guideProfile());
  // 尚無可見服務 → null
  assert.equal(await getPublicMidaoPageDb('andy-lee'), null);
  const norm = normalizeServiceInput(serviceInput());
  await createMidaoServiceDb(G, norm.value, { publish: true });
  const page = await getPublicMidaoPageDb('andy-lee');
  assert.equal(page.guideId, G);
  assert.equal(page.guide.displayName, 'Andy Lee');
  assert.equal(page.guide.experienceYears, 5);
  assert.equal(page.services.length, 1);
  assert.equal(page.services[0].dealMode, 'confirm_first');
  // 未 approved → null
  __resetMemMidaoShowcase();
  __seedMemMidaoGuide(guideProfile({ verification_status: 'pending' }));
  __seedMemMidaoActivities([{ id: 'a1', guide_id: G, title: 'x', slug: 'x', status: 'published',
    midao_status: null, midao_deal_mode: 'confirm_first', midao_questions: [], languages: [], price_twd: 100 }]);
  assert.equal(await getPublicMidaoPageDb('andy-lee'), null);
  // 不存在的 slug → null
  assert.equal(await getPublicMidaoPageDb('nope'), null);
});

test('updateMidaoServiceDb：partial 只改 minParticipants 不影響 maxParticipants', async () => {
  const norm = normalizeServiceInput(serviceInput());
  const created = await createMidaoServiceDb(G, norm.value, { publish: true });
  const updated = await updateMidaoServiceDb(G, created.activityId, { minParticipants: 3 });
  assert.equal(updated.ok, true);
  assert.equal(updated.service.minParticipants, 3);
  assert.equal(updated.service.maxParticipants, 6); // 不得被回填成預設 10
});

test('normalizeServiceInput：INVALID_MIDAO_STATUS 直接覆蓋', () => {
  const r = normalizeServiceInput({ midaoStatus: 'bogus' }, true);
  assert.equal(r.ok, false);
  assert.equal(r.code, 'INVALID_MIDAO_STATUS');
});

test('updateMidaoServiceDb：單欄 patch 不得造成 min>max（比對既有列）', async () => {
  const norm = normalizeServiceInput(serviceInput());
  const created = await createMidaoServiceDb(G, norm.value, { publish: true });
  const bad = await updateMidaoServiceDb(G, created.activityId, { minParticipants: 50 });
  assert.equal(bad.ok, false);
  assert.equal(bad.code, 'INVALID_PARTICIPANTS');
  const still = await listMidaoServicesDb(G);
  assert.equal(still[0].minParticipants, 2); // 未被寫入
});

test('updateGuideExperienceYearsDb：範圍驗證與寫入', async () => {
  __seedMemMidaoGuide(guideProfile());
  const r1 = await updateGuideExperienceYearsDb(G, 5);
  assert.equal(r1.ok, true); assert.equal(r1.experienceYears, 5);
  const r2 = await updateGuideExperienceYearsDb(G, -1);
  assert.equal(r2.ok, false); assert.equal(r2.code, 'INVALID_YEARS');
  const r3 = await updateGuideExperienceYearsDb(G, 61);
  assert.equal(r3.ok, false);
  const r4 = await updateGuideExperienceYearsDb(G, 3.7); // 非整數
  assert.equal(r4.ok, false);
});

test('getGuideExperienceYearsDb：讀值與缺值', async () => {
  __resetMemMidaoShowcase();
  __seedMemMidaoGuide({ id: G, slug: 'andy-lee', verification_status: 'approved', experience_years: 7 });
  assert.equal(await getGuideExperienceYearsDb(G), 7);
  assert.equal(await getGuideExperienceYearsDb('guide-nope'), null);
});
