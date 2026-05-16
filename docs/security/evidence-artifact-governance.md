# Evidence Artifact Governance Policy

> **Issue:** #531
> **Effective date:** 2026-05-17
> **Owner:** Wei (primary) / QA executor (limited authority)
> **Review cycle:** Every 90 days or after a P0 security incident

This document defines classification, redaction, storage, and escalation rules for all QA and CI evidence artifacts produced while operating tour-platform (Midao 祕島).

---

## 1. Evidence Artifact 分級

| 等級 | 說明 | 可進 repo? | 存放位置 | 保留期限 |
|------|------|-----------|---------|---------|
| **Public (遮蔽摘要)** | 已遮蔽所有 PII/secrets 的結果摘要 | ✅ 是 | `/docs/` 或 `/qa/` | 永久（直到相關 issue 關閉後 30 天）|
| **Restricted (受控)** | 截圖、log、未遮蔽 QA 結果 | ❌ 否 | `/root/.openclaw/workspace/` 或受控儲存 | 90 天，soft-launch review 後決定是否封存 |
| **Sensitive (不得保存)** | 完整 session cookie、真實 credentials、個資 | ❌ 絕對不 | 禁止持久化 | 使用後立即清除 |

**Decision rule:** When in doubt, apply the higher (more restrictive) classification.

---

## 2. Redaction Checklist

Before any artifact may be promoted to **Public** or committed to the repository, every item below must be confirmed as redacted (replaced with `[REDACTED]` or `***`):

- [ ] Email 地址（完整地址）
- [ ] 訂單 ID 後半段（例如保留前 8 字元，其餘遮蔽）
- [ ] ECPay TradeNo / MerchantTradeNo（保留欄位名稱，遮蔽數值）
- [ ] Resend message ID / delivery ID
- [ ] Cookie 值（所有 `sb-*`, `tp_csrf`, `_ga` 等）
- [ ] Session storage 值
- [ ] API token / Bearer token
- [ ] 旅客姓名、電話、身份證字號
- [ ] 信用卡資訊（無論全部或部分）
- [ ] Production database connection string
- [ ] Supabase service role key

**Automation note:** Automated redaction scripts live in `scripts/`. Manual review is still required before any artifact moves to Public.

---

## 3. StorageState / Browser Session Artifact 管理

| 項目 | 說明 |
|------|------|
| **Owner** | Wei（主要）/ QA 執行者（有限授權） |
| **允許用途** | Rita 或 QA bot 對 `tour-platform-nine.vercel.app` 的 authenticated 功能測試 |
| **保存期限** | 30 天，或 QA 任務完成後 7 天（以較早者為準） |
| **存放位置** | Workspace 本地（不得進 repo） |

### 撤銷 / 重產條件

- Token 過期（Supabase auth token 通常有效 1 小時，storageState 需重產）
- 疑似被多方使用或外洩
- QA 任務完成且不再需要

### 事故處置 — storageState 誤貼至公開 repo

1. 立即通知 Wei（依 #529 P0 流程）
2. 使用 Supabase Admin 撤銷對應 session
3. 要求 Wei 重新登入以產生新 session
4. 清除 repo 歷史（`git filter-branch` 或 BFG Repo Cleaner）
5. 確認清除後，記錄事故至 incident log

---

## 4. Production QA Screenshot / Log 管理

### 命名規範

```
[YYYY-MM-DD]-[issue]-[feature]-[result].[ext]
[YYYY-MM-DD]-[issue]-[feature]-[result]-redacted.[ext]
```

範例：`2026-05-17-531-evidence-governance-pass-redacted.json`

### 存放與保留

| 版本 | 存放位置 | 保留期限 |
|------|---------|---------|
| 原版（含 PII） | `/root/.openclaw/workspace/`（受控） | 90 天 |
| 遮蔽版 | `/root/.openclaw/workspace/` 或 `/docs/qa/evidence/`（若 Public 等級） | 永久（直到 issue 關閉後 30 天） |

### 存取角色

- Wei + 工程師（不公開給第三方）

### Sign-off 後流程

1. 將遮蔽摘要移至 `/docs/qa/evidence/` 或貼至 GitHub issue comment
2. 原版依 90 天保留期限到期後刪除
3. 更新 evidence index（見第 5 節）

---

## 5. Evidence Pack 引用規則（對齊 #504）

### Evidence index 可引用

- 遮蔽摘要的 GitHub issue comment URL 或 `docs/` 路徑
- 受控位置的存放路徑（僅路徑，不貼內容）
- 結果狀態：`PASS` / `FAIL` / `PARTIAL` + 審核者 + 日期

### Evidence index 不得包含

- 真實 session cookie / token
- 未遮蔽的訂單 ID 或金流 identifier
- 截圖中的個資（姓名、電話、Email、信用卡末 4 碼）

---

## 6. Dry-run 範例（Sample Redaction Validation）

以下為模擬資料，非真實交易記錄。

### 原始 artifact（不得進 repo）

```json
{
  "orderId": "4c72343c-9ac5-49d9-827c-456dc6bc3137",
  "email": "traveler@example.com",
  "payment": {
    "tradeNo": "ECPay123456",
    "amount": 3000
  }
}
```

### 遮蔽後（Public 等級，可進 repo）

```json
{
  "orderId": "4c72343c-[REDACTED]",
  "email": "[REDACTED]",
  "payment": {
    "tradeNo": "ECPay[REDACTED]",
    "amount": 3000
  }
}
```

### Storage decision

| 欄位 | 可進 Public? | 理由 |
|------|------------|------|
| `amount` | ✅ 是 | 非識別資訊 |
| `orderId`（前 8 字元） | ✅ 是（遮蔽後） | 保留類型資訊，後段遮蔽 |
| `email` | ❌ 完全遮蔽 | 直接個資 |
| `tradeNo` | ❌ 完全遮蔽 | 金流識別碼 |

---

## 7. 外洩升級路徑

若疑似 secrets 或個資外洩至公開 repo 或 chat：

1. **立即通知 Wei** → #529 P0 incident response 流程
2. **撤銷**受影響的 token / session（Supabase Admin + ECPay 端）
3. **清除 git 歷史**（`git filter-branch` 或 BFG Repo Cleaner）
4. **評估通報義務** — 視外洩範圍決定是否通報：
   - 旅客（個資外洩）
   - ECPay（金流識別碼外洩）
   - Supabase（service role key 外洩）
5. **事後檢討** — 記錄根因並更新此政策（如有必要）

---

## Related Documents

| 文件 | 說明 |
|------|------|
| `docs/security/issue-56-secret-rotation-checklist.md` | P0 exposed secrets rotation checklist |
| `docs/security/issue-119-incident-closure-plan.md` | Incident closure plan template |
| `docs/security/issue-119-history-rewrite-runbook.md` | Git history rewrite runbook |
| `docs/security/issue-119-closure-comment-template.md` | Closure comment template |

---

*This policy is governed by issue #531. For amendments, open a PR targeting `main` and tag Wei for review.*
