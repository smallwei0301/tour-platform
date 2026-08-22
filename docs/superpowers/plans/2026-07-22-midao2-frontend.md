# midao2 前端（M4–M6）Implementation Plan（Plan 2）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成 midao2 導遊後台六個畫面（照使用者截圖）＋公開接案頁 `/g/[slug]`＋登入動線切換＋E2E，全部串接 Plan 1 已落地的 13 支 API。

**Architecture:** 全部頁面在 `app/(non-locale)/midao2/**`（'use client'，行動優先：**任何螢幕都以置中 max-width 480px 直欄＋固定底部五格 tab bar 呈現**，不做桌機雙導覽）；公開頁 `app/(non-locale)/g/[slug]`（RSC 直呼領域檔＋client 需求表單）。middleware **不涵蓋**這些路徑（matcher 是白名單且 middleware.ts 凍結）→ 後台頁面 auth 靠「layout 探針打 summary API，401 導 `/guide/login?next=...`」；API 層 auth/CSRF 已在 Plan 1 route 內自足。

**Tech Stack:** Next.js 15 App Router、React 19、inline styles（無 Tailwind/UI lib）、`csrf-client.ts`、`client-image-compress.ts`、`qrcode.react`、Playwright（mock via `page.route`）。

**Spec:** `docs/superpowers/specs/2026-07-22-midao2-guide-backend-design.md`；已知決議與限制：`docs/operations/worklogs/issue-midao2.md`（**行事曆 API 用 `hasPending`/`hasConfirmed` 布林；weekday 慣例 0=Sun…6=Sat**）。

## Global Constraints

- 分支 `claude/superpowers-midao-backend-x90czx` 續作；**不 merge、不開 PR**（使用者部署測試後才進生產）。
- commit 前必跑 `.claude/hooks/run-checks.sh <本任務 test 檔…>`；`git add` 與 `git commit` 分開兩次 Bash 呼叫；yarn.lock 不入列。
- 凍結區零接觸：**不改 `apps/web/middleware.ts`**、不動受保護 e2e、不動既有 migrations。`guide/login/page.tsx` 與 `guide/layout.tsx` **不在凍結清單**，T10 可改。
- midao v2 API envelope：`{success:true, data}` / `{success:false, error:{code,message}}`——前端一律讀 `json.success`／`json.data`。legacy `/api/guide/profile` 是 `{ok:true, data}`。
- mutation 一律 `csrfHeaders()`（`src/lib/csrf-client.ts`）；layout 掛載時先 GET `/api/guide/auth/csrf` 預熱。
- **配色（照截圖，非既有 guide 紫）**：`ACCENT '#2563eb'`、`ACCENT_SOFT '#eff6ff'`、`BG '#f6f4ef'`、`CARD '#ffffff'`、`TEXT '#111827'`、`MUTED '#6b7280'`、`BORDER '#e5e7eb'`、`GREEN '#15803d'`、`GREEN_SOFT '#dcfce7'`、`ORANGE '#ea580c'`、`ORANGE_SOFT '#fff7ed'`、`RED '#dc2626'`。統一收在 `ui.tsx` 的 `C` 常數。
- **狀態章文案/色**（全站一致，收在 `ui.tsx` `STATUS_META`）：`new`=新需求(藍底白字)、`pending_reply`=待回覆(橘soft)、`replied`=已回覆/確認中(綠soft)、`closed_won`=已成交(深綠底白字)、`closed_done`=已完成(灰)。
- 文案繁中；旅客可見文案遵守 `BRAND_BOOK.md`（具體動詞、禁療癒/絕美/夢幻、驚嘆號≤1）。
- 互動元素一律加 `data-testid`（本計畫各任務已指定），E2E 靠它選取。
- **樣式緯度（deliberate）**：各頁任務給出「完整邏輯碼（state/effects/handlers/API 綁定/testid）＋逐區塊視覺描述」；純視覺數值（間距/字級/圓角）由實作者以 `ui.tsx` 原語與任務內描述完成，**不得增減功能元素**。
- 頁面檔案不得超過 ~400 行；可抽子元件到同目錄（如 `RequestCard.tsx`），但不建共用巨獸。

---

### Task 1: 純函式工具——複製文案模板＋月曆格 helper（TDD）

**Files:**
- Create: `apps/web/src/lib/midao-copy-templates.mjs`
- Create: `apps/web/src/lib/midao-calendar-grid.mjs`
- Test: `apps/web/tests/unit/midao-copy-templates.test.mjs`
- Test: `apps/web/tests/unit/midao-calendar-grid.test.mjs`

**Interfaces（Produces；T3/T5/T6 依賴）:**
- `buildRequestSummaryText(request): string` — 複製需求摘要（含編號/稱呼/服務/日期(備用)/人數(註記)/語言/接送/特殊需求/自訂問答/聯絡方式）。
- `buildLineReplyText(request, guideName): string` — LINE 回覆範本（繁中、具體、無禁用詞、≤1 驚嘆號）。
- `periodLabel(period): string` — `morning→'上午'`、`afternoon→'下午'`、`evening→'晚上'`、其他→''。
- `buildMonthGrid(days): Array<Array<day|null>>` — 把 calendar API 的 `days`（date 升冪、當月全日）折成**週一為首欄**的週列陣列（首/尾週補 null）。weekday 資料慣例 0=Sun：欄位置 = `(jsDay+6)%7`。

- [ ] **Step 1: 寫失敗測試**

```js
// apps/web/tests/unit/midao-copy-templates.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRequestSummaryText, buildLineReplyText, periodLabel } from '../../src/lib/midao-copy-templates.mjs';

const REQ = {
  requestNo: 'R20260815001', travelerName: '王小姐', travelerLineId: 'wang123', travelerEmail: null,
  activityTitle: '柴山私人秘境導覽', preferredDate: '2026-08-15', backupDate: '2026-08-16',
  preferredPeriod: 'morning', participantsCount: 4, participantsNote: '含 1 位 8 歲兒童',
  language: '中文', needPickup: false, specialNote: '其中一位旅客膝蓋曾受傷',
  answers: [{ questionId: 'q1', label: '是否需要接送', answer: '不需要' }],
};

test('periodLabel 對映', () => {
  assert.equal(periodLabel('morning'), '上午');
  assert.equal(periodLabel('afternoon'), '下午');
  assert.equal(periodLabel('evening'), '晚上');
  assert.equal(periodLabel(null), '');
});

test('需求摘要：含關鍵欄位、備用日期、註記與聯絡方式', () => {
  const t = buildRequestSummaryText(REQ);
  for (const s of ['R20260815001', '王小姐', '柴山私人秘境導覽', '2026-08-15', '備用 2026-08-16',
    '4 位', '含 1 位 8 歲兒童', '中文', '不需要接送', '膝蓋曾受傷', '是否需要接送：不需要', 'LINE ID：wang123']) {
    assert.ok(t.includes(s), `缺少片段：${s}\n---\n${t}`);
  }
});

test('需求摘要：缺省欄位不輸出空行', () => {
  const t = buildRequestSummaryText({ ...REQ, backupDate: null, specialNote: null, answers: [], travelerLineId: null, travelerEmail: 'a@b.c' });
  assert.ok(!t.includes('備用'));
  assert.ok(!t.includes('特殊需求'));
  assert.ok(t.includes('Email：a@b.c'));
});

test('LINE 回覆：含稱呼/導遊名/服務/日期，無禁用詞、驚嘆號至多 1', () => {
  const t = buildLineReplyText(REQ, 'Andy');
  for (const s of ['王小姐', 'Andy', '柴山私人秘境導覽', '2026-08-15', '4 位']) assert.ok(t.includes(s), s);
  for (const banned of ['療癒', '絕美', '夢幻', '網美', '打卡', '敬請']) assert.ok(!t.includes(banned), banned);
  assert.ok((t.match(/[！!]/g) ?? []).length <= 1);
});
```

```js
// apps/web/tests/unit/midao-calendar-grid.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMonthGrid } from '../../src/lib/midao-calendar-grid.mjs';

function fakeMonth(prefix, n) {
  return Array.from({ length: n }, (_, i) => ({ date: `${prefix}-${String(i + 1).padStart(2, '0')}` }));
}

test('2026-08：8/1 是週六 → 首週前五格 null，共 6 週', () => {
  const grid = buildMonthGrid(fakeMonth('2026-08', 31));
  assert.equal(grid.length, 6);
  assert.deepEqual(grid[0].slice(0, 5), [null, null, null, null, null]);
  assert.equal(grid[0][5].date, '2026-08-01'); // 週六欄（Monday-first index 5）
  assert.equal(grid[0][6].date, '2026-08-02'); // 週日
  assert.equal(grid[5].filter(Boolean).length, 1); // 8/31 週一獨佔末週
  assert.equal(grid[5][0].date, '2026-08-31');
});

test('每週恰 7 格且日期連續不重複', () => {
  const grid = buildMonthGrid(fakeMonth('2026-09', 30));
  assert.ok(grid.every((w) => w.length === 7));
  const dates = grid.flat().filter(Boolean).map((d) => d.date);
  assert.equal(new Set(dates).size, 30);
});
```

- [ ] **Step 2: 跑測試確認失敗**（module not found）

Run: `node --test apps/web/tests/unit/midao-copy-templates.test.mjs apps/web/tests/unit/midao-calendar-grid.test.mjs`

- [ ] **Step 3: 實作**

```js
// apps/web/src/lib/midao-copy-templates.mjs
// @ts-check
/** midao2 剪貼簿文案組字（純函式；文案遵守 BRAND_BOOK：具體、克制、驚嘆號≤1）。 */

const PERIODS = { morning: '上午', afternoon: '下午', evening: '晚上' };
/** @param {string|null|undefined} p */
export function periodLabel(p) { return PERIODS[/** @type {'morning'} */ (p)] ?? ''; }

/** @param {any} r */
export function buildRequestSummaryText(r) {
  const lines = [`【需求摘要】#${r.requestNo}`, `稱呼：${r.travelerName}`];
  if (r.activityTitle) lines.push(`服務：${r.activityTitle}`);
  let dateLine = `日期：${r.preferredDate}`;
  if (r.backupDate) dateLine += `（備用 ${r.backupDate}）`;
  if (r.preferredPeriod) dateLine += `・${periodLabel(r.preferredPeriod)}`;
  lines.push(dateLine);
  let pax = `人數：${r.participantsCount} 位`;
  if (r.participantsNote) pax += `・${r.participantsNote}`;
  lines.push(pax);
  if (r.language) lines.push(`語言：${r.language}`);
  lines.push(`接送：${r.needPickup ? '需要' : '不需要接送'}`);
  if (r.specialNote) lines.push(`特殊需求：${r.specialNote}`);
  for (const a of r.answers ?? []) {
    if (a?.label) lines.push(`${a.label}：${a.answer ?? ''}`);
  }
  if (r.travelerLineId) lines.push(`LINE ID：${r.travelerLineId}`);
  if (r.travelerEmail) lines.push(`Email：${r.travelerEmail}`);
  return lines.join('\n');
}

/** @param {any} r @param {string} guideName */
export function buildLineReplyText(r, guideName) {
  const date = r.preferredPeriod ? `${r.preferredDate} ${periodLabel(r.preferredPeriod)}` : r.preferredDate;
  const service = r.activityTitle ? `「${r.activityTitle}」` : '行程';
  return [
    `${r.travelerName} 您好，我是導遊 ${guideName}。`,
    `已收到您的需求（#${r.requestNo}）：${service}，${date}，${r.participantsCount} 位。`,
    r.specialNote ? `您提到「${r.specialNote}」，我會先確認路線安排再回覆您。` : null,
    `我確認檔期後儘快回覆，有任何問題直接在這裡說。`,
  ].filter(Boolean).join('\n');
}
```

```js
// apps/web/src/lib/midao-calendar-grid.mjs
// @ts-check
/**
 * 把 calendar API 的當月 days（date 升冪）折成週一為首欄的週列。
 * 資料層 weekday 慣例＝JS getUTCDay()（0=Sun…6=Sat）；UI 欄序＝一…日 → col=(jsDay+6)%7。
 * @param {Array<{date:string}>} days
 * @returns {Array<Array<any|null>>}
 */
export function buildMonthGrid(days) {
  if (!days?.length) return [];
  const firstCol = (new Date(`${days[0].date}T00:00:00Z`).getUTCDay() + 6) % 7;
  const cells = [...Array(firstCol).fill(null), ...days];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
```

- [ ] **Step 4: 跑測試綠燈**（6 tests PASS）
- [ ] **Step 5: 證據＋commit**

```bash
.claude/hooks/run-checks.sh apps/web/tests/unit/midao-copy-templates.test.mjs apps/web/tests/unit/midao-calendar-grid.test.mjs
git add apps/web/src/lib/midao-copy-templates.mjs apps/web/src/lib/midao-calendar-grid.mjs apps/web/tests/unit/midao-copy-templates.test.mjs apps/web/tests/unit/midao-calendar-grid.test.mjs
```
```bash
git commit -m "feat(midao2): 複製文案模板與月曆格純函式（前端 Plan 2 T1）"
```

---

### Task 2: midao2 layout＋共用 UI 原語

**Files:**
- Create: `apps/web/app/(non-locale)/midao2/layout.tsx`
- Create: `apps/web/app/(non-locale)/midao2/ui.tsx`
- Test: `apps/web/tests/api/midao2-layout-contract.test.mjs`

**Interfaces（Produces；T3–T8 全依賴）:**
- `ui.tsx` exports：
  - `C`（配色常數物件，鍵：ACCENT/ACCENT_SOFT/BG/CARD/TEXT/MUTED/BORDER/GREEN/GREEN_SOFT/ORANGE/ORANGE_SOFT/RED，值照 Global Constraints）
  - `STATUS_META: Record<status, {label, bg, fg}>`（照 Global Constraints 的章色）
  - `Card({children, style?, onClick?, 'data-testid'?})` — 白底圓角 16、border、padding 16
  - `Badge({status})` — 讀 STATUS_META 的膠囊章
  - `Btn({kind: 'primary'|'secondary'|'ghost', children, onClick?, disabled?, 'data-testid'?, type?})` — primary=ACCENT 底白字圓角 12 全寬 h48；secondary=白底 ACCENT 框字；ghost=無框 MUTED
  - `Field({label, children})` — 表單列（label 14px MUTED＋控件）
  - `Spinner()`／`EmptyState({text})`／`ErrorState({text, onRetry})`
  - `copyToClipboard(text): Promise<boolean>`（`navigator.clipboard.writeText` try/catch）
  - `apiGet(path): Promise<any>`／`apiSend(path, method, body): Promise<any>` — fetch 包裝：回 `json.data`；`!json.success` 時 throw `Error(json.error?.message)`＋`err.code = json.error?.code`；401 時 `window.location.assign('/guide/login?next=' + encodeURIComponent(location.pathname))` 後 throw。apiSend 用 `csrfHeaders({'content-type':'application/json'})`。
- `layout.tsx` 行為：
  - `'use client'`；掛載時 `fetch('/api/guide/auth/csrf', {cache:'no-store'})` 預熱 CSRF。
  - **auth 探針**：掛載時 `fetch('/api/v2/guide/midao/summary')`，`res.status===401` → `window.location.assign('/guide/login?next=/midao2')`（middleware 不管這裡，只能頁面層擋）。探針結果存 context？——不，保持簡單：探針只管導轉；各頁自抓資料。
  - 外框：`minHeight:'100dvh', background:C.BG`；內容置中 `maxWidth:480, margin:'0 auto', padding:'16px 16px calc(84px + env(safe-area-inset-bottom))'`。
  - **固定底部五格 tab bar**（任何寬度都顯示）：`position:fixed; bottom:0; left:50%; transform:translateX(-50%); width:100%; maxWidth:480; background:#fff; borderTop:1px solid C.BORDER; display:flex; height:60; paddingBottom:'env(safe-area-inset-bottom)'`。五項（`usePathname()` 判 active，active=ACCENT 其餘 MUTED）：
    `[{href:'/midao2',label:'首頁',icon:'🏠'},{href:'/midao2/requests',label:'需求',icon:'📋'},{href:'/midao2/calendar',label:'行事曆',icon:'📅'},{href:'/midao2/services',label:'服務',icon:'🧭'},{href:'/midao2/me',label:'我的頁面',icon:'👤'}]`，active 判定：`href==='/midao2' ? pathname==='/midao2' : pathname.startsWith(href)`。每個 tab `data-testid={'midao2-tab-' + label}`。

- [ ] **Step 1: 寫 layout.tsx 與 ui.tsx**（完整實作上述行為；style 細節照 Global Constraints 配色）
- [ ] **Step 2: contract 測試**

```js
// apps/web/tests/api/midao2-layout-contract.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const read = (p) => readFile(path.join(ROOT, p), 'utf8');

test('midao2 layout：CSRF 預熱＋401 導 login＋五格 tab', async () => {
  const src = await read('app/(non-locale)/midao2/layout.tsx');
  assert.match(src, /'use client'/);
  assert.match(src, /\/api\/guide\/auth\/csrf/);
  assert.match(src, /\/api\/v2\/guide\/midao\/summary/);
  assert.match(src, /\/guide\/login\?next=\/midao2/);
  assert.match(src, /env\(safe-area-inset-bottom\)/);
  for (const label of ['首頁', '需求', '行事曆', '服務', '我的頁面']) assert.match(src, new RegExp(label));
});

test('midao2 ui：envelope 處理＋401 導轉＋STATUS_META 五態', async () => {
  const src = await read('app/(non-locale)/midao2/ui.tsx');
  assert.match(src, /json\.success/);
  assert.match(src, /csrfHeaders\(/);
  assert.match(src, /401/);
  for (const s of ['new', 'pending_reply', 'replied', 'closed_won', 'closed_done']) {
    assert.match(src, new RegExp(`['"]${s}['"]`));
  }
  assert.match(src, /新需求/); assert.match(src, /待回覆/); assert.match(src, /已回覆/);
  assert.match(src, /已成交/); assert.match(src, /已完成/);
});
```

- [ ] **Step 3: 跑測試綠燈＋typecheck**

`node --test apps/web/tests/api/midao2-layout-contract.test.mjs`；`npx tsc --noEmit -p apps/web 2>&1 | grep -E "midao2" || echo clean`

- [ ] **Step 4: 證據＋commit**

```bash
.claude/hooks/run-checks.sh apps/web/tests/api/midao2-layout-contract.test.mjs
git add apps/web/app/\(non-locale\)/midao2 apps/web/tests/api/midao2-layout-contract.test.mjs
```
```bash
git commit -m "feat(midao2): 後台 layout（auth 探針/底部五格 tab）與共用 UI 原語"
```

---

### Task 3: 首頁 `/midao2`

**Files:**
- Create: `apps/web/app/(non-locale)/midao2/page.tsx`
- Test: `apps/web/tests/api/midao2-pages-contract.test.mjs`（本任務建檔，T4–T8 陸續追加 test）

**Interfaces:**
- Consumes：`apiGet('/api/v2/guide/midao/summary')` → `{guideName, counts:{newRequests,pendingReply}, topRequest, recentRequests[]}`；T1 `buildLineReplyText`；ui 原語。

**完整邏輯（'use client'）：**
- state：`data`（summary）、`loading`、`error`、`copied`（boolean，複製回饋 2 秒）。
- `useEffect` 載入 summary；失敗 → ErrorState（onRetry 重載）。
- 問候語依台北時刻（`new Date().getHours()`）：5–11 早安／11–18 午安／其餘 晚安：`{問候}，{guideName}`（h1 級 28px 粗體；上方 12px ACCENT 小字「今日接案」）。
- **兩張統計卡**（並排各半，`Card` 內大數字＋label）：`counts.newRequests` 筆新需求（ACCENT_SOFT 底、📄 icon、點擊 `router.push('/midao2/requests?status=new')`，testid `midao2-stat-new`）；`counts.pendingReply` 筆待回覆（ORANGE_SOFT 底、💬、`?status=pending_reply`，testid `midao2-stat-pending`）。
- **「需要你處理」區**（有 `topRequest` 才渲染；標題 18px 粗體）：Card 內 Badge(status)＋稱呼 20px 粗體＋activityTitle＋一行 `📅 {preferredDate}・👤 {participantsCount} 人・🌐 {language}`＋`{相對時間(createdAt)} 收到`（相對時間 helper：<60 分鐘顯示 N 分鐘前，<24h 顯示 N 小時前，否則日期）。兩顆按鈕：`Btn primary`「查看需求」→ `/midao2/requests/{id}`（testid `midao2-top-view`）；`Btn secondary`「複製回覆」→ `copyToClipboard(buildLineReplyText(topRequest, data.guideName))`，成功後鈕文案短暫變「已複製 ✓」（testid `midao2-top-copy`）。
- **「最近進度」區**：Card 內 list（`recentRequests`，每列 👤＋travelerName＋右側 Badge＋chevron，點列 → 詳情頁；testid `midao2-recent-{index}`）；空陣列顯示 EmptyState「目前沒有進行中的需求」。
- **「分享接案頁」CTA**：ORANGE_SOFT 底 Card，📤＋「分享接案頁／讓旅客直接送出需求」＋chevron → `/midao2/me`（testid `midao2-share-cta`）。

- [ ] **Step 1: 實作 page.tsx**（照上述完整邏輯；區塊順序照截圖：問候→統計→需要你處理→最近進度→分享 CTA）
- [ ] **Step 2: contract 測試（建檔）**

```js
// apps/web/tests/api/midao2-pages-contract.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const read = (p) => readFile(path.join(ROOT, p), 'utf8');

test('midao2 首頁：summary 串接＋統計卡導轉＋複製回覆', async () => {
  const src = await read('app/(non-locale)/midao2/page.tsx');
  assert.match(src, /\/api\/v2\/guide\/midao\/summary/);
  assert.match(src, /status=new/);
  assert.match(src, /status=pending_reply/);
  assert.match(src, /buildLineReplyText/);
  assert.match(src, /midao2-top-view/);
  assert.match(src, /midao2-share-cta/);
});
```

- [ ] **Step 3: 綠燈＋typecheck** → **Step 4: 證據＋commit**

```bash
.claude/hooks/run-checks.sh apps/web/tests/api/midao2-pages-contract.test.mjs apps/web/tests/unit/midao-copy-templates.test.mjs
git add apps/web/app/\(non-locale\)/midao2/page.tsx apps/web/tests/api/midao2-pages-contract.test.mjs
```
```bash
git commit -m "feat(midao2): 首頁（統計卡/需要你處理/最近進度/分享 CTA）"
```

---

### Task 4: 需求列表 `/midao2/requests`

**Files:**
- Create: `apps/web/app/(non-locale)/midao2/requests/page.tsx`
- Modify: `apps/web/tests/api/midao2-pages-contract.test.mjs`（追加 1 test）

**Interfaces:**
- Consumes：`apiGet('/api/v2/guide/midao/requests?status=&sort=')` → `{items[], tabCounts:{new,pendingReply,replied,closed}}`。

**完整邏輯（'use client'，`useSearchParams` 讀 `?status=`，Suspense 包裹）：**
- state：`items`、`tabCounts`、`status`（初值取 URL param，預設 'all'）、`sort`（'unreplied_first'|'newest'，預設前者）、loading/error。
- 分頁 tab 列（水平捲動）：全部／新需求 {tabCounts.new}／待回覆 {tabCounts.pendingReply}／已回覆 {tabCounts.replied}／已完成 {tabCounts.closed}（數字 >0 才顯示；active tab＝ACCENT 字＋2px 底線；點擊 setStatus＋`router.replace('/midao2/requests?status='+s)`＋重抓；testid `midao2-reqtab-{status}`）。**tab 值對映 query**：全部=all、新需求=new、待回覆=pending_reply、已回覆=replied、已完成=closed。
- 排序下拉（右上）：「未回覆優先」/「最新優先」→ sort 值 unreplied_first/newest，變更即重抓（testid `midao2-req-sort`）。
- 需求卡（每筆 Card，點卡 → `/midao2/requests/{id}`，testid `midao2-req-card-{requestNo}`）：travelerName 18px 粗體＋Badge(status)；activityTitle；`{preferredDate} ・ {participantsCount} 人 ・ {language}` MUTED 14px；右側 chevron。
- 空狀態：該分頁無資料 → EmptyState「這個分類目前沒有需求」。

- [ ] **Step 1: 實作** → **Step 2: 追加 contract 測試**

```js
test('midao2 需求列表：tab 對映＋排序＋卡片導轉', async () => {
  const src = await read('app/(non-locale)/midao2/requests/page.tsx');
  assert.match(src, /\/api\/v2\/guide\/midao\/requests\?status=/);
  for (const s of ['all', 'new', 'pending_reply', 'replied', 'closed']) assert.match(src, new RegExp(`['"]${s}['"]`));
  assert.match(src, /unreplied_first/);
  assert.match(src, /tabCounts/);
  assert.match(src, /midao2-req-sort/);
});
```

- [ ] **Step 3: 綠燈＋typecheck** → **Step 4: 證據＋commit**

```bash
.claude/hooks/run-checks.sh apps/web/tests/api/midao2-pages-contract.test.mjs
git add apps/web/app/\(non-locale\)/midao2/requests/page.tsx apps/web/tests/api/midao2-pages-contract.test.mjs
```
```bash
git commit -m "feat(midao2): 需求列表（狀態分頁/排序/需求卡）"
```

---

### Task 5: 需求詳情 `/midao2/requests/[id]`

**Files:**
- Create: `apps/web/app/(non-locale)/midao2/requests/[id]/page.tsx`
- Modify: `apps/web/tests/api/midao2-pages-contract.test.mjs`（追加 1 test）

**Interfaces:**
- Consumes：`apiGet('/api/v2/guide/midao/requests/{id}')`、`apiSend(..., 'PATCH', {status})`、T1 `buildRequestSummaryText`/`buildLineReplyText`/`periodLabel`。**guideName 來源**：另打一次 summary？不——`buildLineReplyText` 的 guideName 從 `document.cookie` 的 `guide_name` 讀（非 HttpOnly，登入時已種；`decodeURIComponent`，讀不到 fallback '導遊'）。

**完整邏輯（'use client'，`useParams()` 取 id）：**
- 載入後**自動轉待回覆**：`request.status==='new'` → 立即 `apiSend(PATCH {status:'pending_reply'})`，成功後以回傳更新本地 state（失敗靜默，不擋閱讀）。
- 頂列：`←` 返回（`router.back()`）＋標題「需求詳情」置中。
- 抬頭：Badge(status)＋`#{requestNo}` MUTED mono；travelerName 26px 粗體；右側兩圓 icon 鈕：LINE（有 travelerLineId 才顯示：綠圓 `LINE`，點擊 `window.open('https://line.me/R/ti/p/~'+travelerLineId)`＋同時 `copyToClipboard(travelerLineId)`，testid `midao2-detail-line`）；Email（有 travelerEmail 才顯示：藍框 ✉，`mailto:`，testid `midao2-detail-mail`）。
- **行程需求 Card**（📅 行程需求 標題）：列出 服務/日期（含備用＋periodLabel）/人數（含 participantsNote）/語言/接送（需要・不需要）；有 `startTime` 則日期列加 `{startTime}–{endTime}`。**自訂問答**（answers 非空）：接在同 Card 下方，每題 `label：answer`。
- **特殊需求提示框**（specialNote 非空才渲染）：ORANGE_SOFT 底圓角 Card、♿ icon＋specialNote 文字。
- `Btn secondary`「📄 複製需求摘要」→ `copyToClipboard(buildRequestSummaryText(request))`（成功短暫顯示「已複製 ✓」，testid `midao2-detail-copy-summary`）。
- **更新進度**（標題 18px）三顆 radio 膠囊（水平）：確認中=`replied`／已成交=`closed_won`／結束案件=`closed_done`；目前值高亮（selected=ACCENT_SOFT 底 ACCENT 框 ✓）；點擊 → PATCH，成功更新 state；失敗（409 INVALID_TRANSITION 等）顯示紅字錯誤列。testid `midao2-status-{value}`。
- 底部主 CTA `Btn primary`「📄 複製 LINE 回覆」→ copy `buildLineReplyText(request, guideName)`；**若當前 status==='pending_reply' 複製成功後自動 PATCH {status:'replied'}**（截圖行為：複製回覆＝進入確認中），並更新 radio。testid `midao2-detail-copy-reply`。

- [ ] **Step 1: 實作** → **Step 2: 追加 contract 測試**

```js
test('midao2 需求詳情：自動轉待回覆＋radio 三態＋複製回覆帶轉確認中', async () => {
  const src = await read('app/(non-locale)/midao2/requests/[id]/page.tsx');
  assert.match(src, /pending_reply/);
  assert.match(src, /buildRequestSummaryText/);
  assert.match(src, /buildLineReplyText/);
  assert.match(src, /line\.me\/R\/ti\/p\/~/);
  for (const v of ['replied', 'closed_won', 'closed_done']) assert.match(src, new RegExp(`midao2-status-${v}`));
  assert.match(src, /midao2-detail-copy-reply/);
});
```

- [ ] **Step 3: 綠燈＋typecheck** → **Step 4: 證據＋commit**

```bash
.claude/hooks/run-checks.sh apps/web/tests/api/midao2-pages-contract.test.mjs apps/web/tests/unit/midao-copy-templates.test.mjs
git add apps/web/app/\(non-locale\)/midao2/requests apps/web/tests/api/midao2-pages-contract.test.mjs
```
```bash
git commit -m "feat(midao2): 需求詳情（聯絡/摘要/進度 radio/LINE 回覆複製）"
```

---

### Task 6: 行事曆 `/midao2/calendar`

**Files:**
- Create: `apps/web/app/(non-locale)/midao2/calendar/page.tsx`
- Create: `apps/web/app/(non-locale)/midao2/calendar/WeeklyDefaultsModal.tsx`
- Modify: `apps/web/tests/api/midao2-pages-contract.test.mjs`（追加 1 test）

**Interfaces:**
- Consumes：`apiGet('/api/v2/guide/midao/calendar?month=YYYY-MM')` → `{month, days:[{date, availability:{morning,afternoon,evening,custom[]}, hasPending, hasConfirmed, items[]}]}`；`apiGet/apiSend('/api/v2/guide/midao/availability/defaults')`（`{weekdays:[{weekday 0=Sun,…}]}`）；`apiSend('/api/v2/guide/midao/availability/days/{date}', 'PUT', patch)`；T1 `buildMonthGrid`/`periodLabel`；`ResponsiveModal`（`src/components/admin/responsive`）。

**完整邏輯（'use client'）：**
- state：`month`（'YYYY-MM'，初值當月）、`days`、`selectedDate`（初值今天若在當月，否則該月 1 號）、loading/error、`showDefaults`（modal 開關）、`saving`。
- 頂列：標題「行事曆」＋右上 `Btn secondary` 小尺寸「⏱ 設定可用時間」→ `setShowDefaults(true)`（testid `midao2-cal-defaults-btn`）。
- 月導覽：`‹`／`{Y 年 M 月}`／`›`＋「今天」快捷（切月重抓；testid `midao2-cal-prev/next/today`）。
- 圖例列：🟠 待確認、🟢 已確認、▬（ACCENT_SOFT）可接案。
- **月格**（`buildMonthGrid(days)`；表頭 一二三四五六日；週日欄日期數字紅色）：每格顯示日期數字＋（優先序）`hasPending`→ 橘點＋「待確認」6px 小字；else `hasConfirmed`→ 綠點＋「已確認」；else 任一 availability 開放→ ACCENT_SOFT 短橫條。selectedDate 格 ACCENT 框。點格 setSelectedDate。testid `midao2-cal-day-{date}`。
- **當日明細區**（selectedDate）：標題 `M 月 D 日・星期X`；該日 `items` 每筆一列（Badge(status)＋travelerName＋title＋`{timeRange}・{participantsCount} 人`；type==='midao_request' 點列 → 詳情頁；type==='booking' 顯示灰章「站內訂單」不可點）。無 items 不渲染列表。
- **當日可用時間**：說明小字「點選時段即可開放或關閉」；三格開關（上午/下午/晚上；開=ACCENT_SOFT 底 ✓、關=灰底 ✕）：點擊 → 樂觀更新＋`PUT days/{date}` body `{[period]: nextBool}`，失敗回滾＋錯誤列。testid `midao2-cal-period-{period}`。**custom 列**：`availability.custom` 每筆顯示 `{start}–{end}`＋刪除 ✕（PUT `{custom: 剩餘清單}`）；「＋ 自訂時段」開 inline 兩個 `<input type="time">`＋確認（PUT `{custom:[...現有, {start,end,isOpen:true}]}`；start≥end 前端擋）。testid `midao2-cal-custom-add`。
- **WeeklyDefaultsModal**（`ResponsiveModal` open=showDefaults）：載入 defaults；7 列（**顯示順序 一→日**：`displayOrder=[1,2,3,4,5,6,0]` 對映 weekday 值——**資料 weekday 0=Sun**）×三格 checkbox；「儲存」→ `PUT defaults {weekdays: 全 7 筆}` → 關 modal＋重抓 calendar。testid `midao2-defaults-save`、每格 `midao2-default-{weekday}-{period}`。

- [ ] **Step 1: 實作兩檔** → **Step 2: 追加 contract 測試**

```js
test('midao2 行事曆：月格/點色/三格開關/週預設 modal', async () => {
  const src = await read('app/(non-locale)/midao2/calendar/page.tsx');
  assert.match(src, /\/api\/v2\/guide\/midao\/calendar\?month=/);
  assert.match(src, /buildMonthGrid/);
  assert.match(src, /hasPending/); assert.match(src, /hasConfirmed/);
  assert.match(src, /availability\/days\//);
  assert.match(src, /midao2-cal-period-/);
  const modal = await read('app/(non-locale)/midao2/calendar/WeeklyDefaultsModal.tsx');
  assert.match(modal, /availability\/defaults/);
  assert.match(modal, /\[1, 2, 3, 4, 5, 6, 0\]/); // 一→日顯示序對映 weekday 0=Sun
  assert.match(modal, /ResponsiveModal/);
});
```

- [ ] **Step 3: 綠燈＋typecheck** → **Step 4: 證據＋commit**

```bash
.claude/hooks/run-checks.sh apps/web/tests/api/midao2-pages-contract.test.mjs apps/web/tests/unit/midao-calendar-grid.test.mjs
git add apps/web/app/\(non-locale\)/midao2/calendar apps/web/tests/api/midao2-pages-contract.test.mjs
```
```bash
git commit -m "feat(midao2): 行事曆（月格點色/當日明細/時段開關/週預設）"
```

---

### Task 7: 服務列表＋三步精靈＋編輯

**Files:**
- Create: `apps/web/app/(non-locale)/midao2/services/page.tsx`
- Create: `apps/web/app/(non-locale)/midao2/services/ServiceForm.tsx`（精靈/編輯共用）
- Create: `apps/web/app/(non-locale)/midao2/services/new/page.tsx`
- Create: `apps/web/app/(non-locale)/midao2/services/[id]/edit/page.tsx`
- Modify: `apps/web/tests/api/midao2-pages-contract.test.mjs`（追加 2 tests）

**Interfaces:**
- Consumes：`apiGet('/api/v2/guide/midao/services')`；`apiSend(POST services)`／`apiSend(PATCH services/{activityId})`；封面上傳＝`compressImage(file, 'gallery')`（`src/lib/client-image-compress.ts`，1200×800）→ FormData `file` → `fetch('/api/guide/activities/{activityId}/upload-image', {method:'POST', headers: csrfHeaders(), body: fd})`（legacy envelope `{ok,data}`——**實作時先 Read 該 route 確認回傳 url 欄位名**，照實對接並記入報告）；「發佈到祕島」＝`fetch('/api/guide/activities/{activityId}/submit', {method:'POST', headers: csrfHeaders({'content-type':'application/json'}), body:'{}'})`。

**完整邏輯：**

`services/page.tsx`：
- tab 已上架/草稿（依 `showcasePublished` 分組；tab testid `midao2-svc-tab-published/draft`）＋右上 `Btn primary` 小「＋ 新增服務」→ `/midao2/services/new`（testid `midao2-svc-new`）。
- 計數「{n} 項服務」；服務卡：左封面圖 96×96 圓角（無圖示灰底 🏞）；右：●已上架（綠）/●草稿（灰）狀態行＋`mainSiteStatus==='published'` 時附加灰小字「祕島已上架」；title 18px 粗體；`約 {durationMinutes/60 取整或 .5} 小時 ・ {minParticipants}-{maxParticipants} 人`；`NT${priceTwd.toLocaleString()} 起`（GREEN 20px 粗體）；deal_mode 小字（instant_booking=可直接預約/confirm_first=先確認日期與需求/line_inquiry=直接使用 LINE 詢問）；右上 ✏️ → `/midao2/services/{activityId}/edit`（testid `midao2-svc-edit-{activityId}`）。

`ServiceForm.tsx`（props：`initial?`（編輯帶入）、`onSubmit(values, publish)`、`submitting`、`mode:'create'|'edit'`）——**三步精靈**：
- 步驟指示列：① 基本資料 ─ ② 需求問題 ─ ③ 預覽發布（當前步 ACCENT 圓、已過步 ✓）。
- **步驟①**欄位（state 一個 `form` 物件）：服務模板下拉（選項寫死：`[{key:'hiking',label:'登山導覽',preset:{durationMinutes:300,minParticipants:2,maxParticipants:6}},{key:'citywalk',label:'城市文化導覽',preset:{durationMinutes:180,minParticipants:2,maxParticipants:8}},{key:'daytour',label:'包車一日遊',preset:{durationMinutes:480,minParticipants:1,maxParticipants:4}}]`，選擇僅 preset 預填可覆改，mode='edit' 隱藏）；服務名稱 input；一句話介紹 textarea（`maxLength 60`＋`{len}/60` 計數）；封面照片（虛線框上傳區：未有圖顯示 🏞＋「新增封面照片」，選檔後預覽；**create 模式僅暫存 File，送出後上傳**；edit 模式立即上傳＋PATCH coverImageUrl）；服務時間下拉（1.5/2/3/4/5/6/8 小時→分鐘）；適合人數兩個 number（min/max）；服務區域下拉（高雄/台南/屏東/台北/台中/花蓮/台東/南投/宜蘭）；導覽語言複選膠囊（中文/English/日本語/한국어）；參考價格 number＋單位提示「每人 NT$」；**成交方式三選 radio**（ORANGE_SOFT 底區塊）：可直接預約/先確認日期與需求（預設）/直接使用 LINE 詢問。`Btn primary`「下一步：設定需求問題」（必填驗證：名稱/時間/人數/價格；testid `midao2-form-next1`）。
- **步驟②**：預設題建議（首次 create 預帶兩題：`[{label:'是否需要接送', type:'yes_no', required:true},{label:'有想特別造訪的地點嗎', type:'text', required:false}]`，可刪）；題目列表（每題：label input、型別下拉 text=簡答/yes_no=是否/single_choice=單選/multi_choice=複選、choice 型顯示 options 逗號分隔 input、必填 checkbox、刪除 ✕）；「＋ 新增問題」（上限 10）；上一步/下一步。testid `midao2-form-addq`、`midao2-form-next2`。
- **步驟③ 預覽發布**：以旅客視角卡片預覽（封面/名稱/tagline/時長人數/價格/成交方式文案）；兩顆按鈕：`Btn secondary`「儲存草稿」→ `onSubmit(values, false)`；`Btn primary`「發布到接案頁」→ `onSubmit(values, true)`。testid `midao2-form-save-draft`、`midao2-form-publish`。

`new/page.tsx`：包 ServiceForm mode='create'；onSubmit：POST services（`{...values, publish}`）→ 若有暫存封面 File → compressImage→upload→`PATCH {coverImageUrl}` → `router.push('/midao2/services')`。錯誤顯示 API message。

`[id]/edit/page.tsx`：載入 services 列表找該 activityId（或直接用列表資料 sessionStorage？——**直接重抓 services 列表過濾**，簡單可靠）；ServiceForm mode='edit' initial=service；onSubmit → PATCH。另加兩區：**接案頁上/下架**switch（PATCH `{midaoStatus:'published'|'draft'}`，testid `midao2-edit-toggle`）；**發佈到祕島**區塊（`mainSiteStatus==='draft'` 顯示 `Btn secondary`「🏝 發佈到祕島（送管理員審核）」→ 既有 submit API，成功顯示「已送審」；'published' 顯示綠字「祕島市集已上架」；testid `midao2-edit-submit-review`）。

- [ ] **Step 1: 實作四檔** → **Step 2: 追加 contract 測試**

```js
test('midao2 服務列表＋精靈：三步/成交方式/上傳與送審串接', async () => {
  const list = await read('app/(non-locale)/midao2/services/page.tsx');
  assert.match(list, /\/api\/v2\/guide\/midao\/services/);
  assert.match(list, /showcasePublished/);
  const form = await read('app/(non-locale)/midao2/services/ServiceForm.tsx');
  for (const m of ['instant_booking', 'confirm_first', 'line_inquiry']) assert.match(form, new RegExp(m));
  assert.match(form, /maxLength=\{?60\}?/);
  assert.match(form, /midao2-form-publish/);
});

test('midao2 服務編輯：上下架 toggle＋發佈到祕島', async () => {
  const edit = await read('app/(non-locale)/midao2/services/[id]/edit/page.tsx');
  assert.match(edit, /midaoStatus/);
  assert.match(edit, /\/api\/guide\/activities\/.*submit|submit.*activities/s);
  assert.match(edit, /midao2-edit-toggle/);
  const create = await read('app/(non-locale)/midao2/services/new/page.tsx');
  assert.match(create, /compressImage|upload-image/);
});
```

- [ ] **Step 3: 綠燈＋typecheck** → **Step 4: 證據＋commit**

```bash
.claude/hooks/run-checks.sh apps/web/tests/api/midao2-pages-contract.test.mjs
git add apps/web/app/\(non-locale\)/midao2/services apps/web/tests/api/midao2-pages-contract.test.mjs
```
```bash
git commit -m "feat(midao2): 服務列表/三步精靈/編輯（上下架+發佈到祕島）"
```

---

### Task 8: 我的頁面 `/midao2/me`＋experience_years v2 小 API

**Files:**
- Create: `apps/web/app/api/v2/guide/midao/profile-extras/route.ts`
- Modify: `apps/web/src/lib/db-midao-showcase.mjs`（加一個小函式）
- Create: `apps/web/app/(non-locale)/midao2/me/page.tsx`
- Modify: `apps/web/tests/unit/db-midao-showcase.test.mjs`（追加 1 test）
- Modify: `apps/web/tests/api/midao2-pages-contract.test.mjs`（追加 1 test）

**Interfaces:**
- 新 domain fn（Produces）：`updateGuideExperienceYearsDb(guideId, years): Promise<{ok:true, experienceYears:number}|{ok:false, code:'INVALID_YEARS', message:string}>`——years 需 0–60 整數；in-memory 分支寫 `_memGuides` 中該 id 的 `experience_years`（找不到仍回 ok，僅 Supabase 路徑實寫 `guide_profiles`）。
- 新 route：`PATCH /api/v2/guide/midao/profile-extras`（CSRF＋session；body `{experienceYears}`；成功 `jsonOk({experienceYears})`）。
- `/midao2/me` Consumes：legacy `GET /api/guide/profile`（`{ok,data}`：`slug, display_name, headline, bio, languages, regions/region, profile_photo_url, hero_image_url`）；公開 API `GET /api/v2/public/midao/guides/{slug}`（預覽狀態判定）；`QRCodeSVG`（qrcode.react）。

**`me/page.tsx` 完整邏輯（'use client'）：**
- 載入 legacy profile → `slug`＋名片資料。`publicUrl = location.origin + '/g/' + slug`。
- 頂列：「我的接案頁」標題＋右上 `Btn secondary` 小「公開頁預覽」→ `window.open('/g/'+slug)`（testid `midao2-me-preview-top`）。
- **名片 hero Card**：左 profile_photo_url 圓角方圖（無圖灰底 👤）；右 display_name 24px 粗體＋headline＋bio 第一行 MUTED；語言膠囊列（藍框 chips）。
- **資訊 Card 兩列**：📍 服務區域 → regions.join('・')；🗺 導覽經驗 → `{experienceYears} 年`＋✏️（點開 inline number input 0–60＋儲存 → PATCH profile-extras，testid `midao2-me-exp-edit`）。
- **精選服務**：打公開 API；有資料 → 每個 service 一張大圖卡（coverImageUrl 背景＋左下白字 title）；404（未達公開條件）→ ORANGE_SOFT 提示卡「接案頁尚未公開：需要至少一個已上架服務」＋`Btn secondary`「去上架服務」→ `/midao2/services`。
- **分享區**：`Btn primary`「🔗 分享接案頁」→ `navigator.share?.({url: publicUrl}) ?? copyToClipboard(publicUrl)`（testid `midao2-me-share`）；三顆並排 `Btn secondary` 小：「👁 預覽接案頁」（window.open）/「🔗 複製網址」（copy＋已複製回饋，testid `midao2-me-copy-url`）/「⬇ 下載 QR Code」——`QRCodeSVG value={publicUrl} size={168}` 渲染於隱藏容器，下載＝序列化 SVG → Blob → `<a download="midao-qr.svg">`。testid `midao2-me-qr`。
- **帳號區**（分隔線下）：列連結「↩ 切回傳統後台」→ `/guide/dashboard`（testid `midao2-me-classic`）；「登出」紅字 → `DELETE /api/guide/auth/session`（csrfHeaders）→ `/guide/login`（testid `midao2-me-logout`）。

- [ ] **Step 1: domain fn＋測試（TDD）**

```js
// 追加至 apps/web/tests/unit/db-midao-showcase.test.mjs
test('updateGuideExperienceYearsDb：範圍驗證與寫入', async () => {
  const r1 = await updateGuideExperienceYearsDb(G, 5);
  assert.equal(r1.ok, true); assert.equal(r1.experienceYears, 5);
  const r2 = await updateGuideExperienceYearsDb(G, -1);
  assert.equal(r2.ok, false); assert.equal(r2.code, 'INVALID_YEARS');
  const r3 = await updateGuideExperienceYearsDb(G, 61);
  assert.equal(r3.ok, false);
  const r4 = await updateGuideExperienceYearsDb(G, 3.7); // 非整數
  assert.equal(r4.ok, false);
});
```
（import 列表同步加 `updateGuideExperienceYearsDb`。）

實作（`db-midao-showcase.mjs` 末尾追加）：
```js
/**
 * 我的頁面：更新導覽經驗年資（guide_profiles.experience_years，0–60 整數）。
 * @param {string} guideId @param {any} years
 */
export async function updateGuideExperienceYearsDb(guideId, years) {
  const n = Number(years);
  if (!Number.isInteger(n) || n < 0 || n > 60) {
    return { ok: false, code: 'INVALID_YEARS', message: '導覽經驗需為 0–60 的整數年' };
  }
  if (!hasSupabaseEnv()) {
    const g = _memGuides.find((x) => x.id === guideId);
    if (g) g.experience_years = n;
    return { ok: true, experienceYears: n };
  }
  const supabase = await getSupabase();
  const { error } = await supabase.from('guide_profiles')
    .update({ experience_years: n }).eq('id', guideId);
  if (error) throw new Error(error.message);
  return { ok: true, experienceYears: n };
}
```

- [ ] **Step 2: route＋me/page.tsx 實作**（route 樣板照 Task 7/8 的 midao guide routes：CSRF→session→parse→domain→jsonOk/jsonError＋handleRouteError，route tag `'v2/guide/midao/profile-extras'`）
- [ ] **Step 3: 追加 pages contract 測試**

```js
test('midao2 我的頁面：profile/公開預覽/QR/登出＋profile-extras route', async () => {
  const me = await read('app/(non-locale)/midao2/me/page.tsx');
  assert.match(me, /\/api\/guide\/profile/);
  assert.match(me, /QRCodeSVG/);
  assert.match(me, /\/api\/v2\/guide\/midao\/profile-extras/);
  assert.match(me, /midao2-me-classic/);
  assert.match(me, /midao2-me-logout/);
  const route = await read('app/api/v2/guide/midao/profile-extras/route.ts');
  assert.match(route, /validateCsrf/);
  assert.match(route, /updateGuideExperienceYearsDb/);
});
```

- [ ] **Step 4: 綠燈＋typecheck** → **Step 5: 證據＋commit**

```bash
.claude/hooks/run-checks.sh apps/web/tests/unit/db-midao-showcase.test.mjs apps/web/tests/api/midao2-pages-contract.test.mjs
git add apps/web/app/\(non-locale\)/midao2/me apps/web/app/api/v2/guide/midao/profile-extras apps/web/src/lib/db-midao-showcase.mjs apps/web/tests/unit/db-midao-showcase.test.mjs apps/web/tests/api/midao2-pages-contract.test.mjs
```
```bash
git commit -m "feat(midao2): 我的頁面（名片/QR/分享/年資編輯）＋profile-extras API"
```

---

### Task 9: 公開接案頁 `/g/[slug]`＋需求表單

**Files:**
- Create: `apps/web/app/(non-locale)/g/[slug]/page.tsx`（RSC）
- Create: `apps/web/app/(non-locale)/g/[slug]/RequestForm.tsx`（'use client'）
- Modify: `apps/web/tests/api/midao2-pages-contract.test.mjs`（追加 1 test）

**Interfaces:**
- `page.tsx`（**server component**）：`import { getPublicMidaoPageDb } from '../../../../src/lib/db-midao-showcase.mjs'`（RSC 直呼領域檔＝Next 慣用；公開唯讀）。`export async function generateMetadata({params})` → title `{displayName}｜Midao 接案頁`、description=headline。查無 → `notFound()`。
- `RequestForm.tsx` Consumes（走 API，不直呼 db）：`GET /api/v2/public/midao/guides/{slug}/availability?month=`；`POST /api/v2/public/midao/guides/{slug}/requests`（**公開端無 CSRF**——plain fetch，body 含 honeypot `website:''`）。**送出欄位名**：`{activityId, travelerName, travelerLineId, travelerEmail, preferredDate, backupDate, preferredPeriod, participantsCount, participantsNote, language, needPickup, specialNote, answers:[{questionId,label,answer}], website}`；成功回 `data.requestNo`。

**`page.tsx` 版面（旅客視角，文案遵 BRAND_BOOK：具體動詞、無禁用詞）：**
- hero：heroUrl（無則 photoUrl）背景卡＋左圓頭像；displayName 28px 粗體＋headline＋bio 一行；languages 藍框 chips。
- 資訊列：📍 服務區域 regions.join('・')；🗺 導覽經驗 {experienceYears} 年（null 不顯示該列）。
- 「精選服務」：每個 service 卡（封面大圖＋title＋`約 X 小時・{min}-{max} 人`＋`NT$… 起`＋deal_mode 文案小字）＋`選擇此服務` 按鈕 → 捲動至表單並選定（testid `g-svc-{activityId}`）。
- `<RequestForm guide={...} services={...} slug={slug} />`。

**`RequestForm.tsx` 完整邏輯：**
- state：`step`（'form'|'done'）、`form`（selectedActivityId、travelerName、lineId、email、preferredDate、backupDate、preferredPeriod、participantsCount(預設 2)、participantsNote、language(預設 中文)、needPickup(false)、specialNote、answersMap）、`availability`（month→days cache）、`submitting`、`error`、`requestNo`。
- 服務選擇（下拉或由上方卡片帶入）；選定後渲染該 service 的 `questions`（text→input、yes_no→兩顆膠囊、single_choice→radio 膠囊、multi_choice→checkbox 膠囊；required 標 `*`）。
- **日期選擇**：`<input type="date">`＋旁邊時段膠囊（上午/下午/晚上）——選日期後打 availability API 過濾該日 `openPeriods`，只亮可選時段（全關顯示「這天已滿，選其他日期或填備用日期」提示，仍可送出——v1 不鎖檔）；備用日期 optional。deal_mode==='line_inquiry' 的服務：表單頂顯示一行說明「這個服務由導遊透過 LINE 與你確認細節，留下 LINE ID 導遊會主動加你」。
- 聯絡方式：LINE ID input＋Email input，**至少填一**（前端驗證＋後端 CONTACT_REQUIRED 映射錯誤列）。
- 特殊需求 textarea（maxLength 500）。
- 隱藏 honeypot：`<input name="website" style={{display:'none'}} tabIndex={-1} autoComplete="off" />`。
- 送出 `Btn primary`「送出需求」（submitting 轉圈；testid `g-submit`）→ 成功 `setStep('done')`：**成功畫面**：✓ 大圖示＋「需求已送出」＋`編號 #{requestNo}`＋說明「導遊會透過你留下的 LINE 或 Email 與你聯繫，通常一天內回覆」＋`Btn secondary`「再送一筆」重置表單。testid `g-done`。
- 錯誤：後端 code 映射繁中訊息（RATE_LIMITED→稍後再試；INVALID_ACTIVITY→重選服務；其餘顯 API message），**不清空表單**。

- [ ] **Step 1: 實作兩檔** → **Step 2: 追加 contract 測試**

```js
test('公開接案頁：RSC 直呼領域檔＋表單 honeypot/聯絡驗證/成功畫面', async () => {
  const page = await read('app/(non-locale)/g/[slug]/page.tsx');
  assert.match(page, /getPublicMidaoPageDb/);
  assert.match(page, /generateMetadata/);
  assert.match(page, /notFound\(\)/);
  const form = await read('app/(non-locale)/g/[slug]/RequestForm.tsx');
  assert.match(form, /website/);
  assert.match(form, /openPeriods/);
  assert.match(form, /requestNo/);
  assert.match(form, /g-submit/);
  assert.doesNotMatch(form, /csrfHeaders/); // 公開端無 CSRF
});
```

- [ ] **Step 3: 綠燈＋typecheck** → **Step 4: 證據＋commit**

```bash
.claude/hooks/run-checks.sh apps/web/tests/api/midao2-pages-contract.test.mjs apps/web/tests/unit/db-midao-showcase.test.mjs
git add apps/web/app/\(non-locale\)/g apps/web/tests/api/midao2-pages-contract.test.mjs
```
```bash
git commit -m "feat(midao2): 公開接案頁 /g/[slug]（RSC）＋旅客需求表單"
```

---

### Task 10: 登入動線切換＋舊後台互連

**Files:**
- Modify: `apps/web/app/(non-locale)/guide/login/page.tsx`（兩處小改）
- Modify: `apps/web/app/(non-locale)/guide/layout.tsx`（NAV_ITEMS 加一項）
- Modify: `apps/web/tests/api/midao2-pages-contract.test.mjs`（追加 1 test）

**變更內容（精準最小 diff）：**
1. `login/page.tsx` 的 `sanitizeGuideNext`：允許清單加 `/midao2`——條件從「僅 `/guide` 開頭」擴為 `p === '/midao2' || p.startsWith('/midao2/') || p === '/guide' || p.startsWith('/guide/')`（保持其餘防護不變）。
2. 同檔 fallback 預設值：`'/guide/dashboard'` → `'/midao2'`（**首次 invite 登入仍導 `/guide/profile` 不動**）。
3. `guide/layout.tsx` `NAV_ITEMS` 陣列**末尾**加：`{ href: '/midao2', label: 'midao2 後台', icon: '✨' }`（純新增一項，不動其他；桌面 nav/手機選單自動帶出）。

- [ ] **Step 1: 三處修改**（Edit 精準替換；改前先 Read 兩檔確認現行字面）
- [ ] **Step 2: 追加 contract 測試**

```js
test('登入動線：next 白名單含 /midao2、預設導 /midao2、舊後台互連', async () => {
  const login = await read('app/(non-locale)/guide/login/page.tsx');
  assert.match(login, /\/midao2/);
  assert.match(login, /startsWith\('\/midao2\/'\)/);
  const layout = await read('app/(non-locale)/guide/layout.tsx');
  assert.match(layout, /midao2 後台/);
});
```

- [ ] **Step 3: 綠燈＋typecheck**＋**手動煙測**：`grep` 確認 login 檔中 `/guide/profile`（首次登入）分支未被改動。
- [ ] **Step 4: 證據＋commit**

```bash
.claude/hooks/run-checks.sh apps/web/tests/api/midao2-pages-contract.test.mjs
git add apps/web/app/\(non-locale\)/guide/login/page.tsx apps/web/app/\(non-locale\)/guide/layout.tsx apps/web/tests/api/midao2-pages-contract.test.mjs
```
```bash
git commit -m "feat(midao2): 登入預設導向 midao2＋next 白名單＋舊後台互連入口"
```

---

### Task 11: E2E＋全面驗證＋worklog＋push

**Files:**
- Create: `apps/web/e2e/midao2-backend-flow.spec.ts`
- Create: `apps/web/e2e/midao2-public-request.spec.ts`
- Modify: `docs/operations/worklogs/issue-midao2.md`

**E2E 慣例**：用 `./helpers` 的 `test, expect, setGuideSession`；guide API 一律 `page.route` mock（middleware 只做 token 格式檢查，`setGuideSession` 的假 token 可過頁面守門——但 `/midao2` 不經 middleware，探針打的 summary API 也被 mock 即可）。**不動受保護 spec、不加進 smoke lane**（該清單另案）。

- [ ] **Step 1: 後台流程 spec**

```ts
// apps/web/e2e/midao2-backend-flow.spec.ts
// midao2 後台五頁走查（API 全 mock；驗證 UI 綁定與互動，不驗後端）
import { test, expect, setGuideSession } from './helpers';

const SUMMARY = {
  success: true,
  data: {
    guideName: 'Andy',
    counts: { newRequests: 2, pendingReply: 1 },
    topRequest: {
      id: 'req-1', requestNo: 'R20260815001', travelerName: '王小姐',
      activityTitle: '柴山私人秘境導覽', preferredDate: '2026-08-15', backupDate: '2026-08-16',
      preferredPeriod: 'morning', participantsCount: 4, participantsNote: '含 1 位 8 歲兒童',
      language: '中文', needPickup: false, specialNote: '膝蓋曾受傷',
      travelerLineId: 'wang123', travelerEmail: null, answers: [],
      status: 'new', createdAt: new Date().toISOString(),
    },
    recentRequests: [
      { id: 'req-2', travelerName: '陳先生', status: 'pending_reply', activityTitle: '高雄老城文化導覽' },
      { id: 'req-3', travelerName: 'John', status: 'closed_won', activityTitle: '私人包車一日遊' },
    ],
  },
};

test.beforeEach(async ({ page }) => {
  await setGuideSession(page, 'guide-e2e-1');
  await page.route('**/api/guide/auth/csrf', (r) => r.fulfill({ json: { ok: true } }));
  await page.route('**/api/v2/guide/midao/summary', (r) => r.fulfill({ json: SUMMARY }));
});

test('首頁：統計卡/需要你處理/底部導覽', async ({ page }) => {
  await page.goto('/midao2');
  await expect(page.getByText('Andy')).toBeVisible();
  await expect(page.getByTestId('midao2-stat-new')).toContainText('2');
  await expect(page.getByTestId('midao2-stat-pending')).toContainText('1');
  await expect(page.getByText('王小姐')).toBeVisible();
  await expect(page.getByTestId('midao2-tab-需求')).toBeVisible();
});

test('需求列表→詳情：自動轉待回覆＋radio 更新', async ({ page }) => {
  const detail = { ...SUMMARY.data.topRequest };
  await page.route('**/api/v2/guide/midao/requests*', (r) => r.fulfill({
    json: { success: true, data: { items: [detail], tabCounts: { new: 1, pendingReply: 0, replied: 0, closed: 0 } } },
  }));
  let patched: string[] = [];
  await page.route('**/api/v2/guide/midao/requests/req-1', async (r) => {
    if (r.request().method() === 'PATCH') {
      const body = r.request().postDataJSON();
      patched.push(body.status);
      detail.status = body.status;
      return r.fulfill({ json: { success: true, data: { request: { ...detail } } } });
    }
    return r.fulfill({ json: { success: true, data: { request: { ...detail } } } });
  });
  await page.goto('/midao2/requests');
  await page.getByTestId('midao2-req-card-R20260815001').click();
  await expect(page).toHaveURL(/\/midao2\/requests\/req-1/);
  await expect(page.getByText('#R20260815001')).toBeVisible();
  await expect.poll(() => patched).toContain('pending_reply'); // 開啟詳情自動轉
  await page.getByTestId('midao2-status-closed_won').click();
  await expect.poll(() => patched).toContain('closed_won');
});

test('行事曆：時段開關 PUT', async ({ page }) => {
  const days = Array.from({ length: 31 }, (_, i) => ({
    date: `2026-08-${String(i + 1).padStart(2, '0')}`,
    availability: { morning: false, afternoon: true, evening: true, custom: [] },
    hasPending: i === 14, hasConfirmed: i === 16, items: [],
  }));
  await page.route('**/api/v2/guide/midao/calendar*', (r) => r.fulfill({
    json: { success: true, data: { month: '2026-08', days } },
  }));
  let putBody: any = null;
  await page.route('**/api/v2/guide/midao/availability/days/*', (r) => {
    putBody = r.request().postDataJSON();
    return r.fulfill({ json: { success: true, data: { date: 'x', effective: { morning: true, afternoon: true, evening: true, custom: [] } } } });
  });
  await page.goto('/midao2/calendar');
  await page.getByTestId('midao2-cal-day-2026-08-15').click();
  await page.getByTestId('midao2-cal-period-morning').click();
  await expect.poll(() => putBody).toEqual({ morning: true });
});

test('服務列表與精靈第一步驗證', async ({ page }) => {
  await page.route('**/api/v2/guide/midao/services', (r) => r.fulfill({
    json: { success: true, data: { items: [{ activityId: 'act-1', title: '柴山私人秘境導覽', tagline: null, coverImageUrl: null, durationMinutes: 300, minParticipants: 2, maxParticipants: 6, region: '高雄', languages: ['中文'], priceTwd: 4800, dealMode: 'confirm_first', questions: [], showcasePublished: true, mainSiteStatus: 'draft', midaoSortOrder: null }] } },
  }));
  await page.goto('/midao2/services');
  await expect(page.getByText('柴山私人秘境導覽')).toBeVisible();
  await expect(page.getByText('NT$4,800')).toBeVisible();
  await page.getByTestId('midao2-svc-new').click();
  await expect(page).toHaveURL(/\/midao2\/services\/new/);
  await page.getByTestId('midao2-form-next1').click(); // 未填必填 → 停留步驟一並顯示錯誤
  await expect(page).toHaveURL(/\/midao2\/services\/new/);
});
```

- [ ] **Step 2: 公開頁 spec**

```ts
// apps/web/e2e/midao2-public-request.spec.ts
// 公開接案頁 /g/[slug]：RSC 直呼領域檔（無 Supabase env → in-memory 空 → 404 畫面），
// 表單流程以獨立 route mock 驗證（送單 API）。
import { test, expect } from './helpers';

test('不存在的 slug 顯示 404', async ({ page }) => {
  const res = await page.goto('/g/no-such-guide');
  expect(res?.status()).toBe(404);
});

// 表單互動驗證：由於 RSC 直呼領域檔且 e2e 無 DB seed 管道，
// 完整送單流程（表單渲染→送出→成功畫面）標記為部署環境驗收項（worklog AC），
// 此處僅驗證公開 API mock 下的送單 payload 形狀可由 RequestForm 產生——略過瀏覽器層，
// 不放假測試。詳見 worklog「部署驗收清單」。
```

**注意**：公開頁 e2e 受「RSC 直呼領域檔＋無 DB seed 管道」限制，只能驗 404 路徑；完整送單流程列入**部署驗收清單**（使用者部署測試時人工過）——寫入 worklog，不寫假測試。

- [ ] **Step 3: 跑 E2E**

```bash
npm run test:e2e -w @tour/web -- midao2-backend-flow.spec.ts midao2-public-request.spec.ts
```
Expected: 全 PASS（config 自動起 dev server port 3333）。失敗逐一修（selector/文案對齊實作）。

- [ ] **Step 4: 全面驗證**

```bash
.claude/hooks/run-checks.sh --typecheck \
  apps/web/tests/unit/midao-copy-templates.test.mjs \
  apps/web/tests/unit/midao-calendar-grid.test.mjs \
  apps/web/tests/unit/db-midao-showcase.test.mjs \
  apps/web/tests/api/midao2-layout-contract.test.mjs \
  apps/web/tests/api/midao2-pages-contract.test.mjs \
  apps/web/tests/api/v2-midao-guide-requests-contract.test.mjs \
  apps/web/tests/api/v2-midao-public-contract.test.mjs
node --test apps/web/tests/unit/db-mjs-size-guard.test.mjs apps/web/tests/api/issue1407-legacy-retirement-residue-guard.test.mjs
npm run lint 2>&1 | tail -5
```
全綠才續。

- [ ] **Step 5: worklog 更新**（`docs/operations/worklogs/issue-midao2.md`）：Plan 2 完成段（頁面清單/測試證據/commit 範圍）＋**部署驗收清單**（使用者部署後人工過）：①登入導 /midao2；②六畫面照截圖走查；③ `/g/[slug]` 真實送單→LINE 通知→後台出現；④精靈建服務＋封面上傳；⑤發佈到祕島送審出現在管理後台；⑥維護模式下 /g/[slug] 行為確認。
- [ ] **Step 6: commit＋push**

```bash
git add apps/web/e2e/midao2-backend-flow.spec.ts apps/web/e2e/midao2-public-request.spec.ts docs/operations/worklogs/issue-midao2.md
```
```bash
git commit -m "test(midao2): E2E 後台走查與公開頁 404＋worklog 部署驗收清單"
git push -u origin claude/superpowers-midao-backend-x90czx
```

---

## 完成定義（Plan 2）

- [ ] 後台六畫面＋公開接案頁全部存在且串接真 API 路徑（contract 測試鎖定）
- [ ] E2E：後台走查 5 tests＋公開 404 綠燈；unit/contract 全綠；typecheck/lint 乾淨；守門測試綠
- [ ] 登入預設導 `/midao2`，`?next=` 白名單含 /midao2，首次登入行為不變
- [ ] 凍結區零接觸（middleware.ts 未動）；yarn.lock 未 commit
- [ ] 分支已 push；**不 merge 不開 PR**；worklog 含部署驗收清單（使用者部署測試後才進生產）
