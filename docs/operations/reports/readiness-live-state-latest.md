<!-- query_timestamp: 2026-07-03T00:43:32.140Z -->
<!-- freshness_rule: auto-refreshed every 6h via CI; stale threshold: 12h; never live truth — run `npm run readiness:snapshot` to refresh -->

# Readiness Live-State Snapshot

> This file is auto-generated. Run `npm run readiness:snapshot` to refresh.

**Query timestamp:** 2026-07-03T00:43:32.140Z  
**Commit SHA:** `4d1bc596e9f893a9d2bd80b70d377eec0cdea6bc`

---

## Open PRs (6)

| # | Title | Branch |
|---|-------|--------|
| #1576 | [fix(seo): &lt;html lang&gt; 隨 locale 正確輸出，en 頁不再誤標 zh-Hant (#1569)](https://github.com/smallwei0301/tour-platform/pull/1576) | `claude/repo-audit-optimization-m4s8os` |
| #1534 | [feat(guide): 導遊大頭照上傳支援自選裁切範圍與大小](https://github.com/smallwei0301/tour-platform/pull/1534) | `claude/guide-profile-photo-crop-2vbzrr` |
| #1469 | [導遊後台：新增 Dashboard 首頁與指標卡（免費/付費分級）](https://github.com/smallwei0301/tour-platform/pull/1469) | `codex/-dashboard` |
| #1438 | [Use next/font variables in globals, set CJK fonts to `display: optional`, and scope serif usage to LP/brand](https://github.com/smallwei0301/tour-platform/pull/1438) | `codex/improve-homepage-loading-speed` |
| #1415 | [feat(home): hero 改版為 boomerang 影片背景的 motion hero](https://github.com/smallwei0301/tour-platform/pull/1415) | `claude/hero-section-redesign-4v9z2a` |
| #1372 | [fix(settlement): 補正 payout_items.order_id UNIQUE 約束，修復 sweep upsert ON CONFLICT 500 (#1365)](https://github.com/smallwei0301/tour-platform/pull/1372) | `claude/post-merge-qa-verification-kgspK` |

## Open Issues (24 total)

### P0 (0)

_none_

### P1 (8)

| # | Title | Labels |
|---|-------|--------|
| #1566 | [[Traveler][P1] Email OTP（magic link）登入 — 補 Google OAuth 之外的入口（健檢 v2 P0-2）](https://github.com/smallwei0301/tour-platform/issues/1566) | type:optimization, priority:P1, agent:backlog, owner:ai-agent, traveler-booking, auth |
| #1565 | [[Traveler][P1] 電子憑證 QR code＋導遊掃碼核銷（健檢 v2 P0-1 主體）](https://github.com/smallwei0301/tour-platform/issues/1565) | type:optimization, priority:P1, agent:backlog, owner:ai-agent, traveler-booking |
| #1317 | [[Production Smoke] Owner-only acceptance verification gaps from recent close-gate sweep (#1306 / #1289 / #1290 OFF / #1286 UI / #1307 TZ)](https://github.com/smallwei0301/tour-platform/issues/1317) | priority:P1, type:qa, owner:human, production-smoke, post-merge |
| #714 | [[Ops] Run real alert drill before first payment](https://github.com/smallwei0301/tour-platform/issues/714) | triaged, type:investigation, priority:P1, agent:backlog, owner:mixed, status:blocked, infra, status:awaiting-implementation, launch:first-payment-blocker |
| #642 | [[需 Operator][Traveler Booking] Monitor V2 observation window and guard legacy fallback after launch](https://github.com/smallwei0301/tour-platform/issues/642) | type:investigation, priority:P1, qa, agent:backlog, owner:mixed, status:ready, traveler-booking, launch:post-first-payment |
| #605 | [[Launch Content] Strict Andy Lee listing content gate before public exposure](https://github.com/smallwei0301/tour-platform/issues/605) | triaged, type:investigation, priority:P1, qa, agent:backlog, owner:mixed, type:docs, docs, status:awaiting-implementation, launch:first-payment-blocker |
| #319 | [[Ops] Run customer support SOP first-case drill follow-through](https://github.com/smallwei0301/tour-platform/issues/319) | triaged, priority:P1, qa, agent:backlog, owner:mixed, status:ready, type:qa |
| #318 | [[Ops] Run Andy Lee first-guide onboarding demo and retrospective scope](https://github.com/smallwei0301/tour-platform/issues/318) | triaged, type:investigation, priority:P1, agent:backlog, owner:mixed, status:ready, admin-guides |

### P2 (14)

| # | Title | Labels |
|---|-------|--------|
| #1571 | [[TechDebt][P2] createOrder / paymentCallback / refund 三鏈路雙實作契約測試（健檢 v2 A4）](https://github.com/smallwei0301/tour-platform/issues/1571) | priority:P2, agent:backlog, owner:ai-agent, type:qa |
| #1570 | [[TechDebt][P2] db.mjs strangler 升級為硬規則 — 新函式禁入＋CI 鎖行數上限＋首批領域檔拆分（健檢 v2 A1）](https://github.com/smallwei0301/tour-platform/issues/1570) | type:optimization, priority:P2, agent:backlog, owner:ai-agent |
| #1569 | [[SEO][P2] `<html lang>` 隨 locale 正確輸出（en 頁目前仍是 zh-Hant）（健檢 v2 SEO-2）](https://github.com/smallwei0301/tour-platform/issues/1569) | type:optimization, priority:P2, agent:backlog, owner:ai-agent, traveler-booking |
| #1568 | [[Security][P2] CSP 從 Report-Only 轉 enforce — 收 report → nonce 化 → 移除 unsafe-inline/unsafe-eval（健檢 v2 S5）](https://github.com/smallwei0301/tour-platform/issues/1568) | priority:P2, security, agent:backlog, owner:ai-agent |
| #1567 | [[Security][P2] admin x-admin-token header 認證跳過 session-version/到期檢查 — 政策決策＋文件化（健檢 v2 S3）](https://github.com/smallwei0301/tour-platform/issues/1567) | priority:P2, security, owner:mixed, type:decision |
| #1526 | [[Decision][Auth] 評估加開 LINE Login 作為平台登入方式（與 LINE 通知綁定統一身分）](https://github.com/smallwei0301/tour-platform/issues/1526) | triaged, priority:P2, type:decision, auth, notifications |
| #1407 | [[Booking][P2] Legacy 退役階段三 — 刪除 legacy routes 與測試清點、flag 退場](https://github.com/smallwei0301/tour-platform/issues/1407) | priority:P2, agent:backlog, owner:ai-agent, status:blocked, traveler-booking, booking-v2 |
| #1388 | [[Growth][P2] 成長基礎 backlog 總綱 — i18n 英文版、站內訊息、會員回購（Phase 12 對齊）](https://github.com/smallwei0301/tour-platform/issues/1388) | type:optimization, priority:P2, agent:backlog, owner:mixed, traveler-booking |
| #1344 | [[Perf][P2] Mobile LCP regression on /activities — 10–12s vs 2s desktop](https://github.com/smallwei0301/tour-platform/issues/1344) | type:bug, priority:P2, owner:ai-agent, traveler-booking, performance |
| #926 | [[Ops] Add LINE/LIFF Messaging API rollout evidence gate after #920](https://github.com/smallwei0301/tour-platform/issues/926) | triaged, priority:P2, qa, agent:backlog, owner:mixed, status:blocked, type:qa, auth, notifications, infra |
| #797 | [[Compliance] Internal conservative incident reporting playbook for soft launch](https://github.com/smallwei0301/tour-platform/issues/797) | triaged, priority:P2, security, owner:ai-agent, infra, docs, status:awaiting-implementation |
| #724 | [[Ops] Execute Supabase live restore drill within 7 days after soft launch](https://github.com/smallwei0301/tour-platform/issues/724) | triaged, type:investigation, priority:P2, agent:backlog, owner:mixed, database, infra, status:awaiting-implementation, launch:post-first-payment |
| #685 | [[Monitoring] Add simple outside website monitor after soft launch](https://github.com/smallwei0301/tour-platform/issues/685) | triaged, type:optimization, priority:P2, qa, agent:backlog, owner:ai-agent, infra, status:awaiting-implementation, launch:post-first-payment |
| #320 | [[Launch] Public soft launch with restricted booking and Go/No-Go gate](https://github.com/smallwei0301/tour-platform/issues/320) | triaged, priority:P2, agent:queued, infra, status:awaiting-implementation, launch:first-payment-blocker |

### Human-Decision (0)

_none_

### Other (2)

| # | Title | Labels |
|---|-------|--------|
| #1474 | [QA：PR #1473 部分退款功能 — Staging 實測（ECPay 測試卡）](https://github.com/smallwei0301/tour-platform/issues/1474) | qa, refund |
| #1121 | [[Security] Rotate all credentials exposed in git history (service_role JWT × 7, sbp_ PAT × 5, admin token × 10, anon JWT × 4) — 正式上線前執行](https://github.com/smallwei0301/tour-platform/issues/1121) | type:bug, security, owner:mixed, status:needs-decision, launch:post-first-payment |

---

## Recent Merged PRs (last 10)

| # | Title | Merged |
|---|-------|--------|
| #1575 | [feat(booking): legacy 退役階段二 — 移除 flag fallback UI 與 legacy 入口（#1406）](https://github.com/smallwei0301/tour-platform/pull/1575) | 2026-07-03 |
| #1574 | [security(db): RLS 收斂殘留加固 — search_path 固定／SECURITY DEFINER EXECUTE 收斂／storage listing 移除 (#1564)](https://github.com/smallwei0301/tour-platform/pull/1574) | 2026-07-03 |
| #1573 | [docs(availability): #1321 選項 C — 可用性文案語意一致、字面不同（by-design）](https://github.com/smallwei0301/tour-platform/pull/1573) | 2026-07-02 |
| #1572 | [chore(ops): cron_run_log 90 天保留清理 + ledger 非日期前綴檔告警（複查後續）](https://github.com/smallwei0301/tour-platform/pull/1572) | 2026-07-02 |
| #1563 | [security(db): RLS 全面收斂 — 修 anon 公開 key 可讀寫全部 orders/users/PII 的 P0 外洩](https://github.com/smallwei0301/tour-platform/pull/1563) | 2026-07-02 |
| #1562 | [fix(booking): auto-complete-sweep 指名 FK 修 PGRST201 500 回歸（#1560 後續）](https://github.com/smallwei0301/tour-platform/pull/1562) | 2026-07-02 |
| #1561 | [feat(ops): migration apply ledger 與 release gate（#1293 選項 B）](https://github.com/smallwei0301/tour-platform/pull/1561) | 2026-07-02 |
| #1559 | [fix(drift): 缺表探測改 GET+limit(0)，修復 HEAD 探測永遠假陰性的盲區](https://github.com/smallwei0301/tour-platform/pull/1559) | 2026-07-02 |
| #1558 | [feat(activities): 列表「評價最高」排序＋無限捲動 (#1557)](https://github.com/smallwei0301/tour-platform/pull/1558) | 2026-07-02 |
| #1556 | [健檢 v2 立即批次：資安 timing-safe／CSRF／scrypt＋SEO hreflang＋依賴對齊＋訂單自動完成 sweep (#1554)](https://github.com/smallwei0301/tour-platform/pull/1556) | 2026-07-02 |

---

## Release Evidence Gates

The following evidence must be collected and reviewed before soft-launch sign-off:

| Gate | Evidence Required | Notes |
|------|------------------|-------|
| RLS/Grants Preflight | Run `.github/workflows/rls-grants-preflight.yml` via `workflow_dispatch`; download artifact `rls-preflight-<run-id>`; verify `overall_status: pass` | Required before soft-launch sign-off; workflow runs read-only catalog checks only |
