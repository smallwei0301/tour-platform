/**
 * 嚮導申請單頁化守門（招募海報改版）。
 *
 * 鎖三件事：
 *   1. 只有一個流程：不得再出現多步驟 state machine（step 指示、上一步／下一步）。
 *   2. 照片全部選填：送出鈕不得被任何照片欄位 gating。
 *   3. 海報文案與補充欄位落地：新欄位組進既有 bio（不新增 DB 欄位），
 *      故管理者後台維持原本的讀取流程即可看到全部資訊。
 *
 * 用語：本頁使用者可見文字一律「嚮導」，不得殘留「導遊」（識別碼／欄位名不受此限）。
 */
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(__dirname, '../..');
const read = (rel) => readFileSync(resolve(APP_ROOT, rel), 'utf8');

const page = read('app/(non-locale)/guide/apply/page.tsx');
const layout = read('app/(non-locale)/guide/apply/layout.tsx');

describe('guide/apply 單頁流程', () => {
  test('不得再有多步驟流程（step 指示／上一步／下一步）', () => {
    assert.doesNotMatch(page, /useState\(1\)/, '不得再有 step 數字 state');
    assert.doesNotMatch(page, /setStep\(/, '不得再有 setStep 切步驟');
    assert.doesNotMatch(page, /lp-apply-steps/, '不得再渲染步驟指示列');
    assert.doesNotMatch(page, /下一步|上一步|返回修改/, '不得再有跨步驟導覽按鈕');
    // 送出成功仍需獨立畫面（done），但那是送出結果，不是流程步驟。
    assert.match(page, /const \[done, setDone\] = useState\(false\)/, '送出後以 done 旗標切成功畫面');
  });

  test('照片全部選填：送出鈕不得被照片 gating', () => {
    assert.doesNotMatch(page, /!profilePhotoUrl/, '不得以個人照未上傳擋住送出');
    // 送出 gating 只看必填文字欄位與上傳中狀態。
    assert.match(
      page,
      /requiredMissing\s*=\s*!fullName\.trim\(\)\s*\|\|\s*!phone\.trim\(\)\s*\|\|\s*!email\.trim\(\)\s*\|\|\s*!city\.trim\(\)\s*;/,
      '必填＝聯絡得上人的四欄（姓名／電話／Email／居住縣市）',
    );
    for (const label of ['個人照（選填）', '個人封面（選填）', '活動照（選填']) {
      assert.ok(page.includes(label), `照片欄位需標示選填：${label}`);
    }
  });

  test('API 端不得再把個人照片當必填', () => {
    const route = read('app/api/guide-applications/route.ts');
    assert.doesNotMatch(route, /profilePhotoUrl is required/);
  });

  test('海報文案上架（招募標頭／金句／加入祕島你可以／揪團尾句）', () => {
    for (const copy of [
      '在地嚮導招募中！',
      '你熟悉一個地方，知道一般旅客找不到的風景、故事、美食或文化嗎？',
      '你的在地故事，就是旅人的祕境指南。',
      '請填寫以下資訊',
      '加入祕島，你可以',
      '建立自己的嚮導個人頁',
      '分享自己的在地特色行程',
      '接觸更多喜歡深度旅行的旅客',
      '用自己的專長創造收入',
    ]) {
      assert.ok(page.includes(copy), `海報文案需出現：${copy}`);
    }
    assert.match(page, /也歡迎幫忙分享或標記他/, '需保留海報的揪團尾句');
  });

  test('其他想分享的內容為選填，且全空時 bio 有佔位文案（DB 硬要求非空）', () => {
    assert.ok(page.includes('其他想分享的內容（選填）'), '補充說明需標示選填');
    // textarea 不得再帶 required；bio 組裝需有 fallback，否則後端會擋掉「什麼都沒填」。
    assert.doesNotMatch(page, /id="apply-bio"[^>]*required/, 'apply-bio 不得再是必填');
    // fallback 文案取自共用模組（勿在頁面硬編字面值，後台／通知信要同源）。
    assert.match(page, /\|\|\s*BIO_UNFILLED_PLACEHOLDER/, 'bio 需有非空 fallback');
    assert.match(
      page,
      /import \{ BIO_UNFILLED_PLACEHOLDER \} from '[^']*guide-application\/summary'/,
      'fallback 文案需自 guide-application/summary 匯入',
    );
  });

  test('四大優點以 inline SVG 圖示呈現（比照海報）', () => {
    for (const fn of ['PerkIconProfile', 'PerkIconRoute', 'PerkIconPeople', 'PerkIconIncome']) {
      assert.match(page, new RegExp(`function ${fn}\\(`), `需有圖示元件 ${fn}`);
      assert.match(page, new RegExp(`<${fn} />`), `四格需掛上 ${fn}`);
    }
    const svgCount = (page.match(/<svg viewBox="0 0 32 32"/g) || []).length;
    assert.equal(svgCount, 4, '四個優點各需一個 inline SVG');
    // 圖示為裝飾性，必須對輔助技術隱藏（旁邊已有文字標題）。
    assert.equal((page.match(/aria-hidden="true" focusable="false"/g) || []).length, 4, 'SVG 需 aria-hidden');
    // 顏色統一由 CSS 控制，元件內不得硬編 stroke/fill。
    assert.doesNotMatch(page, /<svg[^>]*\sstroke=/, 'SVG 不得硬編 stroke（交給 CSS）');
  });

  test('海報補充欄位組進既有 bio（不新增 DB 欄位）', () => {
    for (const marker of [
      '推薦祕境／特色體驗：',
      '帶團或導覽經驗：',
      '其他想帶的旅程類型：',
      'LINE ID：',
      '方便聯絡時間：',
    ]) {
      assert.ok(page.includes(marker), `bio 需帶標籤化補充欄位：${marker}`);
    }
    // 送出 payload 仍是既有契約欄位，後台流程零改動。
    for (const field of ['fullName', 'phone', 'email', 'city', 'bio', 'specialties', 'languages', 'regions', 'payments']) {
      assert.match(page, new RegExp(`\\b${field},`), `payload 需維持既有欄位 ${field}`);
    }
  });

  test('招募頁不放分潤數字（owner 2026-07-30 指示移除，勿長回來）', () => {
    for (const copy of ['實拿 85%', '抽成 15%', '平台吸收', '後台一站式']) {
      assert.ok(!page.includes(copy), `招募頁不應出現分潤文案「${copy}」`);
    }
    assert.doesNotMatch(page, /payoutFacts/, '分潤三格資料結構應已移除');
  });

  test('JSON-LD 絕對網址走 SITE_URL，不得硬編網域（綁自訂網域後才不會指向舊站）', () => {
    assert.match(
      page,
      /import \{ SITE_URL \} from '[^']*seo\/site-metadata'/,
      '需自 site-metadata 取得站台網址',
    );
    assert.match(page, /item: SITE_URL/, 'breadcrumb 首頁需用 SITE_URL');
    assert.match(page, /`\$\{SITE_URL\}\/guide\/apply`/, 'breadcrumb 本頁需用 SITE_URL');
    assert.doesNotMatch(page, /https:\/\/tour-platform-nine\.vercel\.app/, '不得硬編網域字面值');
  });

  test('用語：頁面與 metadata 一律「嚮導」', () => {
    for (const [name, src] of [['page', page], ['layout', layout]]) {
      assert.doesNotMatch(src, /導遊/, `${name} 不得殘留「導遊」字眼`);
      assert.match(src, /嚮導/, `${name} 需使用「嚮導」`);
    }
  });
});
