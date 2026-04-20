# Docs Audit Summary — 2026-04-20

## 掃描範圍
- `docs/` 全目錄
- repo 內主要 `README*.md`（排除 `node_modules`）

## 核心結論

### 1. 根 README 過期且過長
舊版根 README 停在 2026-04-07，內容混合：
- phase 歷史
- 本週計畫
- 功能清單
- roadmap
- 文件索引
- 部署資訊

問題：
- 容易過期
- 不易快速掌握當前主線
- 會把歷史決策誤認成當前執行狀態

已處理：
- 改為「當前狀態 + 今日收斂結果 + 核心索引 + 維護原則」的精簡版

### 2. docs/ 目前有新舊並存
目前 docs 同時存在：
- 早期規劃 / 背景 / roadmap
- 中期 tech timeline 與 sprint log
- 現在主線的 implementation / operations / qa / security 文件

問題：
- 若沒有明確導航，容易誤把舊 roadmap 當最新主線

已處理：
- `docs/README.md` 已補主線導覽與分層

### 3. 真正的當前主線文件已經轉移
目前最值得看的不是早期 phase 規劃，而是：
- `docs/implementation/*`
- `docs/operations/*`
- `docs/qa/*`
- `docs/security/*`
- `docs/04-tech/04-tech-architecture/08~10*`

### 4. 若干區塊仍需後續整理
高機率下一輪要整理：
- `docs/04-tech/03-dev-timeline/`
- `docs/01-strategy/01-project-plan/`
- `docs/05-business/06-payment-plan/`
- `docs/05-business/07-operations-plan/`

## 建議後續動作
1. 逐步把 `04-tech/03-dev-timeline/` 從流水帳變成索引化
2. 對空殼文件補上狀態標記（draft / stale / pending）
3. 對當前 open issue（如 #96 / #105 / #117 / #128）補對應文件索引
4. `apps/web/README.md` 之後也應更新為與 root README 一致的當前狀態版本

## 本輪已更新文件
- `README.md`
- `docs/README.md`
- `docs/04-tech/03-dev-timeline/docs-audit-summary-2026-04-20.md`
