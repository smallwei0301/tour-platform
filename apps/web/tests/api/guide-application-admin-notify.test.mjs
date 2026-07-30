/**
 * 嚮導申請 → 管理者通知（email ＋ Telegram）＋ 申請內容欄位清單。
 *
 * 背景：owner 反映「有人申請卻沒收到信、也不知道他填了什麼」。修法是新增
 * src/lib/guide-application/ 領域模組，三個介面（通知信／TG／後台詳情頁）
 * 共用同一份欄位清單。
 *
 * 本測試鎖住的契約：
 *   1. 欄位清單一律回傳**完整**欄位（沒填的標 filled=false），不做空值過濾 ——
 *      這是需求核心「要知道他沒填什麼」。
 *   2. bio 的佔位文案等同未填（不得讓審核者以為申請者真的寫了東西）。
 *   3. 通知信寄給 allowlist 全員、內含所有欄位與未填清單、對內容做 HTML escape。
 *   4. 通知一律 best-effort：任一管道 throw 都不得往外冒（否則申請者會看到
 *      「申請失敗」，但申請其實已經存進 DB）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import * as email from '../../src/lib/email.ts';
import {
  buildGuideApplicationFields,
  listUnfilledLabels,
  formatGuideApplicationPlainText,
  BIO_UNFILLED_PLACEHOLDER,
  UNFILLED_LABEL,
} from '../../src/lib/guide-application/summary.ts';
import { sendGuideApplicationNotification } from '../../src/lib/guide-application/admin-email.ts';
import { buildGuideApplicationTelegramText } from '../../src/lib/guide-application/telegram-text.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = join(__dirname, '..', '..');

const FULL = {
  id: 'app-1234-5678',
  fullName: '柴山阿賢',
  phone: '0912-345-678',
  email: 'a-xian@example.com',
  city: '高雄市',
  bio: '十年柴山生態導覽經驗。\n推薦祕境／特色體驗：龍谷大峽谷\nLINE ID：a-xian',
  specialties: ['山徑', '文化'],
  languages: ['中文', '英文'],
  regions: ['高雄市', '屏東縣'],
  certifications: ['急救證照'],
  paymentMethods: ['bank', 'linepay'],
  profilePhotoUrl: 'https://cdn.example.com/a.jpg',
  heroImageUrl: 'https://cdn.example.com/hero.jpg',
  galleryUrls: ['https://cdn.example.com/g1.jpg', 'https://cdn.example.com/g2.jpg'],
  status: 'pending',
  createdAt: '2026-07-30T02:00:00.000Z',
};

/** 只填必填四欄（照片與補充說明全空）＝單頁流程的最小送出情境。 */
const MINIMAL = {
  id: 'app-min',
  fullName: '無照片測試',
  phone: '0933-444-555',
  email: 'min@example.com',
  city: '花蓮縣',
  bio: BIO_UNFILLED_PLACEHOLDER,
  status: 'pending',
};

function capture() {
  const sent = [];
  email.__setEmailClientForTest({
    emails: { send: async (msg) => { sent.push(msg); return { data: { id: 'msg_x' } }; } },
  });
  return sent;
}

async function withAllowlist(value, fn) {
  const saved = process.env.ADMIN_EMAIL_ALLOWLIST;
  if (value === undefined) delete process.env.ADMIN_EMAIL_ALLOWLIST;
  else process.env.ADMIN_EMAIL_ALLOWLIST = value;
  try {
    return await fn();
  } finally {
    if (saved === undefined) delete process.env.ADMIN_EMAIL_ALLOWLIST;
    else process.env.ADMIN_EMAIL_ALLOWLIST = saved;
    email.__setEmailClientForTest(null);
  }
}

// ---------- 1. 欄位清單 ----------

test('buildGuideApplicationFields：完整申請 → 每一欄都 filled，且欄位數固定', () => {
  const fields = buildGuideApplicationFields(FULL);
  assert.equal(fields.length, 13, '欄位清單長度是契約，變動需同步三個介面');
  assert.deepEqual(fields.filter((f) => !f.filled), [], '完整申請不該有未填欄位');
  const byLabel = Object.fromEntries(fields.map((f) => [f.label, f.value]));
  assert.equal(byLabel['姓名'], '柴山阿賢');
  assert.equal(byLabel['熟悉的地區／區域'], '高雄市、屏東縣');
  // 收款方式必須是顯示用 label，不是 DB 的 id。
  assert.equal(byLabel['希望的收款方式'], '銀行轉帳、LINE Pay');
  assert.equal(byLabel['活動照'], '已上傳 2 張');
  assert.equal(byLabel['個人照'], '已上傳');
});

test('buildGuideApplicationFields：最小送出 → 未填欄位一律列出並標 filled=false', () => {
  const fields = buildGuideApplicationFields(MINIMAL);
  assert.equal(fields.length, 13, '沒填的欄位不得被過濾掉（審核者要看到缺什麼）');

  const unfilled = listUnfilledLabels(MINIMAL);
  // 必填四欄有填；其餘九欄應全部落在未填清單。
  assert.equal(unfilled.length, 9);
  for (const label of ['熟悉的地區／區域', '可帶語言', '自述證照', '個人照', '個人封面', '活動照']) {
    assert.ok(unfilled.includes(label), `${label} 應被列為未填`);
  }
  for (const label of ['姓名', '聯絡電話', '電子信箱', '居住縣市']) {
    assert.ok(!unfilled.includes(label), `${label} 是必填，不該出現在未填清單`);
  }
});

test('bio 佔位文案等同未填（不得顯示成申請者真的寫了東西）', () => {
  const fields = buildGuideApplicationFields(MINIMAL);
  const bioField = fields.find((f) => f.label.startsWith('補充說明'));
  assert.ok(bioField);
  assert.equal(bioField.filled, false);
  assert.equal(bioField.value, UNFILLED_LABEL);
  assert.ok(bioField.multiline, '補充說明是多行內容，需要 pre-wrap 呈現');
});

test('formatGuideApplicationPlainText：一行一欄，含未填欄位', () => {
  const text = formatGuideApplicationPlainText(MINIMAL);
  assert.match(text, /姓名：無照片測試/);
  assert.match(text, /可帶語言：未填寫/);
  assert.equal(text.split('\n').length, 13);
});

// ---------- 2. 管理者通知信 ----------

test('通知信寄給 allowlist 全員，主旨帶申請人，內文含所有欄位與未填清單', async () => {
  await withAllowlist('ops1@x.com, ops2@x.com', async () => {
    const sent = capture();
    const results = await sendGuideApplicationNotification(MINIMAL);

    assert.equal(sent.length, 2);
    assert.deepEqual(sent.map((m) => m.to), ['ops1@x.com', 'ops2@x.com']);
    assert.match(sent[0].subject, /嚮導申請/);
    assert.match(sent[0].subject, /無照片測試/);

    const html = sent[0].html;
    // 所有欄位標籤都要在信裡（審核者不必登入後台就看得完整）。
    for (const label of ['姓名', '聯絡電話', '電子信箱', '居住縣市', '熟悉的地區／區域', '可帶語言', '個人照', '活動照']) {
      assert.ok(html.includes(label), `信件需列出欄位「${label}」`);
    }
    assert.match(html, /未填寫欄位（9）/, '需摘要未填欄位數');
    assert.match(html, /有人申請成為嚮導/);
    assert.equal(results.filter((r) => r.ok).length, 2);
  });
});

test('通知信：全部填齊時顯示「所有欄位都已填寫」而非未填警告', async () => {
  await withAllowlist('ops@x.com', async () => {
    const sent = capture();
    await sendGuideApplicationNotification(FULL);
    assert.match(sent[0].html, /所有欄位都已填寫/);
    assert.ok(!sent[0].html.includes('未填寫欄位'), '沒有未填欄位時不該顯示警告區塊');
  });
});

test('通知信對申請內容做 HTML escape（申請表是公開端點，防注入）', async () => {
  await withAllowlist('ops@x.com', async () => {
    const sent = capture();
    await sendGuideApplicationNotification({
      ...MINIMAL,
      fullName: '<script>alert(1)</script>',
      bio: '<img src=x onerror=alert(2)>',
    });
    const html = sent[0].html;
    assert.ok(!html.includes('<script>'), '不得原樣輸出 script 標籤');
    assert.ok(!html.includes('<img src=x'), '不得原樣輸出 img 標籤');
    assert.match(html, /&lt;script&gt;/);
  });
});

test('通知信：無 allowlist 時回空陣列且完全不寄信', async () => {
  await withAllowlist(undefined, async () => {
    const sent = capture();
    const results = await sendGuideApplicationNotification(FULL);
    assert.deepEqual(results, []);
    assert.equal(sent.length, 0);
  });
});

// ---------- 3. Telegram 訊息 ----------

test('Telegram 訊息含所有欄位、未填摘要與申請編號短碼', () => {
  const text = buildGuideApplicationTelegramText(MINIMAL);
  assert.match(text, /有人申請成為嚮導/);
  assert.match(text, /姓名：無照片測試/);
  assert.match(text, /可帶語言：未填寫/);
  assert.match(text, /⚠️ 未填寫（9）/);
  assert.match(text, /申請編號：app-min/);
  assert.match(text, /嚮導管理/, '需指路到後台審核');
});

test('Telegram 訊息：全部填齊時顯示已填寫，長 id 截短', () => {
  const text = buildGuideApplicationTelegramText(FULL);
  assert.match(text, /✅ 所有欄位都已填寫/);
  // UUID 太長會撐爆訊息，只取前 8 碼。
  assert.match(text, /申請編號：app-1234$/m);
});

// ---------- 4. best-effort 契約 ----------

test('通知 fan-out 為 best-effort：任一管道 throw 都不得往外冒', async () => {
  const notifySrc = readFileSync(join(APP_ROOT, 'src/lib/guide-application/notify.ts'), 'utf8');
  // 兩腿各自 try/catch，且用 allSettled（不會因一腿 reject 而整體 reject）。
  assert.match(notifySrc, /Promise\.allSettled/, '兩管道需並行且互不拖累');
  assert.equal((notifySrc.match(/catch\s*\{/g) || []).length, 2, '每一腿都要各自吞掉錯誤');

  // 行為驗證：把 email client 換成必定 throw 的實作，notify 仍須 resolve。
  await withAllowlist('ops@x.com', async () => {
    email.__setEmailClientForTest({
      emails: { send: async () => { throw new Error('resend down'); } },
    });
    const { notifyAdminOfGuideApplication } = await import('../../src/lib/guide-application/notify.ts');
    await notifyAdminOfGuideApplication(FULL); // 不得 throw
  });
});

test('申請 POST route 在建檔成功後才通知，且 await（serverless 凍結前送出）', () => {
  const route = readFileSync(join(APP_ROOT, 'app/api/guide-applications/route.ts'), 'utf8');
  assert.match(route, /notifyAdminOfGuideApplication/, 'POST 需觸發管理者通知');
  // 順序契約：先 createGuideApplicationDb 拿到 created，再通知。
  const createdIdx = route.indexOf('await createGuideApplicationDb');
  const notifyIdx = route.indexOf('await notifyAdminOfGuideApplication');
  assert.ok(createdIdx > -1 && notifyIdx > createdIdx, '必須建檔成功後才通知');
  assert.match(route, /await notifyAdminOfGuideApplication\(created\)/, '需 await 且帶建檔結果');
});
