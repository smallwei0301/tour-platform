# issue1616 — env 集中第一批：SUPABASE service env 走 config getter
> 最後更新：2026-07-05 08:27（Asia/Taipei）｜負責 session：claude-fable-5／2026-07-05

## 目標
SUPABASE_URL／SUPABASE_SERVICE_ROLE_KEY 全站（凍結區白名單除外）不再直讀 process.env。

## AC 清單
- [x] src/config/supabase-service-env.mjs：getSupabaseUrl／getSupabaseServiceRoleKey（raw 值、零行為差異）
- [x] 92 檔直讀全數改走 getter；凍結區 app/api/payments/** 白名單
- [x] grep guard：tests/unit/issue1616-service-role-env-guard（config／凍結區外直讀即紅燈）
- [x] PROCESS_ENV_FILE_CEILING 159→98；全套 npm test 0 fail

## 已完成（附證據）
- 07-05 全部完成（commit 26be4a9｜run-checks 10 檔綠＋typecheck｜全套 0 fail）
- ~25 個 source-contract 測試斷言同步為 getter 等價寫法

## 下一步
- 第二批：其他 env var 群（LINE／Telegram／ECPay secrets → security-env 旁路模組；
  一般設定 → env.ts getter），每批下修 PROCESS_ENV_FILE_CEILING
- NEXT_PUBLIC_* 維持字面 inline（build-time 替換），已在健檢報告註明白名單原因

## 絕不重做（Do-NOT-redo）
- **不要對 tests/ 做無差別 process.env 字面替換**——大量測試以
  `process.env.X = 'mock'` 設定測試環境，批次替換會把賦值改成非法呼叫（已踩過，
  git checkout 還原＋逐檔精準修）；只改「斷言源碼含 env 字面」的 source-contract
- issue1616-service-role-env-guard 的 DIRECT_READ_RE 必須保留 process.env 字面（guard 本體）
- getter 刻意不驗證不 throw——與原直讀等價；啟動驗證屬 startup-env（凍結）範疇
