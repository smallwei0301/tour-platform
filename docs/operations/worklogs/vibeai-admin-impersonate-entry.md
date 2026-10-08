# vibeaico 後台代管入口（跨 repo：vibeaico-admin-rebuild #25）
> 最後更新：2026-09-10 Asia/Taipei｜負責 session：Claude Code / 2026-09-10
> 本 repo 尚無對應 issue；上游議題在 `smallwei0301/vibeaico-admin-rebuild#25`，
> 規格為該 repo 的 `docs/integration/21-PLATFORM-ADMIN-IMPERSONATION.md`。

## 目標
在 admin 導遊詳情頁加一顆連往 vibeaico 新後台代管頁的入口，讓平台管理者能代導遊查看／修改新後台資料。

## 採用方案（規格 §8 方案 A）
純超連結：不帶 token、不帶簽章、不帶任何身分，只把 `guide` id 傳過去；
權限判定完全在 vibeaico 端（它自己檢查登入者是不是平台管理者）。
→ 兩個專案之間**不新增任何共用密鑰**，tour-platform 這側沒有新的攻擊面。

## AC 清單
- [x] AC1 設定 `NEXT_PUBLIC_VIBEAI_ADMIN_URL` → 入口出現，href = `<base>/tenant/impersonate?guide=<id>`
- [x] AC2 未設定 → 入口完全不渲染（不是產生 `undefined/tenant/impersonate?...` 死連結）
- [x] AC3 沿用既有 `canImpersonate`（僅 `verification_status === 'approved'` 的正式導遊），不放寬條件
- [x] AC4 `target="_blank"` + `rel="noopener noreferrer"`
- [ ] AC5 正式站點擊後真的進得去 vibeaico 代管頁 —— **待 vibeaico `/tenant/impersonate` 上線後才能驗**

## 已完成（附證據）
- 2026-09-10 `NEXT_PUBLIC_VIBEAI_ADMIN_URL` 已由 owner 授權設於 Vercel 專案
  `tour-platform`（production/preview/development，type=plain，值為 vibeaico 正式站網址）。
  設定當下無任何程式碼引用它，因此**這步本身不改變任何正式站行為**。
- 2026-09-10 `apps/web/app/(non-locale)/admin/guides/[guideId]/page.tsx` 加入入口（+18 行）。
- 2026-09-10 env 讀取集中到 `apps/web/src/config/feature-flags.mjs` 的 `getVibeaiAdminBaseUrl()`。
  第一版直接在 page 讀 `process.env`，被 `architecture-ratchet-guard`「直讀 process.env 的檔案數不得增加」
  擋下（天花板 99）——這是本次唯一由我造成的紅燈，已修正，該 guard 現為 4/4 綠。
- 2026-09-10 `apps/web/tests/unit/vibeai-admin-base-url.test.mjs`：5/5 綠。
  含 fail-closed 案例（相對路徑、`javascript:`、`ftp://`、含空白）一律回空字串。
- 2026-09-10 `apps/web/e2e/vibeai-admin-impersonate-entry.spec.ts`：有設／沒設各跑一次（中間清 `.next`），
  兩案例皆綠，截圖已交付 owner。
- 2026-09-10 `npm test`（Node v22.22.2）：5815 tests / 5810 pass。
  剩 3 紅（`sendBookingApprovalRequested: 空收件人`、`sendPaymentDeadlineNotice: 空收件人`、
  `Live drift: doc 所列 active routing issue 不可是已 CLOSED 的`）**在 clean tree 上同樣紅**，
  已用 `git stash` 實測確認為既有問題，與本變更無關。

## 下一步
- vibeaico `/tenant/impersonate` 上線後，回來補 AC5 的正式站實測。
- 本 PR 在 AC5 可驗之前**不合併**，避免正式站出現一顆點下去 404 的按鈕。

## 絕不重做（Do-NOT-redo）
- 不要改成「tour-platform 這側簽一個 token 帶過去」：規格 §8 已比較過，方案 A 之所以雀屏中選就是因為免共用密鑰。
- 不要拿掉 `vibeaiAdminUrl &&` 這層 guard：它同時是「功能開關」與「死連結防呆」。
- 不要用 `handleEnterGuideBackend()`：那是 tour-platform 自己的代登入（會鑄 guide session cookie），
  與 vibeaico 無關，兩者是不同的東西。

## 環境限制（誠實記錄）
- 本 session 的 project root 是 vibeaico repo，tour-platform 的 `.claude/settings.json` **未被載入**，
  harness hooks（file-guard／bash-guard／sql-guard）全程未武裝。已改以人工比對凍結清單代替：
  本次唯一改動的程式碼路徑不在 `file-guard.sh` 的任何凍結 case 內。
- `.claude/hooks/run-checks.sh` 無法執行：它硬釘 `/root/.hermes/toolchains/node/22.23.1`，此容器沒有該路徑，
  且腳本無 override。改以直接 `npm test`（Node v22.22.2）＋ `npm run typecheck` 取證，
  **權威證據以 PR CI 為準**。
