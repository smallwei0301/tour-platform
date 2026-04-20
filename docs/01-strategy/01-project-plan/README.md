# 01. 專案計劃 / 策略文件索引

> 最後更新：2026-04-20

本目錄保存的是策略、里程碑、風險、商業判斷與 CEO 視角計畫文件。

## 現在先看什麼

### 仍然有效的高價值文件
- `02-milestone-tracker.md` — 里程碑追蹤
- `03-risk-register.md` — 風險清單
- `12-legal-decision-memo.md` — 法規與經營邊界判斷
- `15-andy-lee-mvp-launch-checklist.md` — Go-Live 檢查框架
- `17-phase9-plus-roadmap-v2.md` — 後 Phase 9 roadmap 背景

### 需要用「當前 issue reality」解讀的文件
- `01-vision-mission.md`
- `07-ceo-decision-pack-v1.md`
- `14-operations-tracking-spec.md`
- `17-phase9-plus-roadmap-v2.md`

這些文件仍有參考價值，但不能直接等同於現在主線執行清單；當前實際主線請對照：
- open issue #96 / #105 / #117
- open PR #128
- `docs/implementation/*`
- `docs/operations/*`

## 與目前 reality 對齊後的主線判讀

### 已完成 / 已落地
- 前台 MVP / Admin / Guide Dashboard / 旅客 Auth / Email 通知
- 安全加固第一輪
- issue #56 / #57 / #103 / #104 / #119 收斂完成

### 目前進行中
- Booking V2 phased rollout（#96）
- Daily Go/No-Go automation（#105）
- CSRF Phase 2（#117）
- trusted client IP / rate limiting follow-up（PR #128）

### 應避免的誤讀
- 不要把早期 Phase 規劃文件當成最新工程 backlog
- 不要把 CEO 規劃文直接視為 Tracy 的執行任務單
- 現在真正的執行面，應優先看 implementation / operations / qa / security 文件
