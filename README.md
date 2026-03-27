# Tour Platform — 台灣在地導遊交易平台（MVP Planning Repo）

> **一句話定位：** 讓旅客可以直接預約真正在地的導遊與特色行程，讓導遊可以管理場次、接單、收款與營運。

---

## 目前專案狀態

這個 repo 目前不是正式產品程式碼庫，而是 **Tour Platform 的 MVP 規劃與執行文件中心**。

目前已完成：
- MVP 範圍定義
- 商業規則與使用者流程
- API / DB schema
- Tracy handoff 與 kickoff 文件
- CEO decision pack
- Admin 後台與營運追蹤需求
- Andy Lee（李衍錫） 第一位導遊的內容與上線清單

=> **結論：目前已具備進入 MVP 開發階段的規格基礎。**

---

## 現階段已拍板策略

### 1. Beachhead Market
**先打：高雄柴山探洞 / 戶外特色導覽**

原因：
- 題材記憶點高
- 容易與一般旅遊商品做出差異化
- 容易形成內容傳播與品牌辨識

### 2. 第一位導遊
**先只做 1 位導遊：Andy Lee（李衍錫）**

MVP 階段不追求導遊數量，而是先把單一導遊模型跑順：
- 導遊個人頁
- 活動頁
- 場次管理
- 訂單流程
- 退款與營運追蹤

### 3. 第一批旅客來源
**由 Andy Lee（李衍錫） 既有旅客預約需求導入**

這代表：
- MVP 初期先驗證真實 booking / payment / schedule / refund 流程
- 先不優先解決陌生流量冷啟動問題

### 4. 商業模式
- 平台抽成：**15%**
- 定價模式：**per person**
- 場次規則：導遊先開放日期與名額，付款成功後即時占位，滿額自動停售

### 5. 法規原則（MVP）
- 聚焦在地導覽 / 體驗
- 不碰住宿 / 交通打包
- 保險責任先由導遊負責
- 條款需清楚描述平台角色、退款規則與責任邊界

---

## 核心產品原則

Tour Platform MVP 不追求一次做成完整 OTA，而是先驗證這四件事：

1. 導遊是否願意上架與管理場次
2. 旅客是否願意為在地導遊行程付款
3. 平台是否能承接真實訂單與退款流程
4. 每一單是否有健康的單位經濟

---

## Repo 結構

```text
tour-platform/
├── 01-project-plan/        專案計劃、CEO decision pack、MVP 行動文件
├── 02-investor-deck/       募資與財務簡報文件
├── 03-dev-timeline/        Tracy kickoff、開發時程、頁面/API/DB 對照
├── 04-tech-architecture/   技術架構、API spec、DB schema、seed data spec
├── 05-marketing-plan/      行銷策略、內容規劃、SEO / growth 文件
├── 06-payment-plan/        金流與退款相關規劃
├── 07-operations-plan/     營運 SOP、客服、導遊 onboarding
├── 08-legal-compliance/    法規、條款、法律風險與待辦
├── 09-product-spec/        產品規格、流程、後台需求、UI/UX 文件
├── 10-research/            競品分析、市場研究、訪談模板
└── 11-frontend-spec/       前端元件規格
```

---

## 目前最重要的文件

### CEO / 方向判斷
- [`01-project-plan/13-ceo-decision-pack-one-page.md`](./01-project-plan/13-ceo-decision-pack-one-page.md)
- [`01-project-plan/07-ceo-decision-pack-v1.md`](./01-project-plan/07-ceo-decision-pack-v1.md)
- [`01-project-plan/10-beachhead-market-memo.md`](./01-project-plan/10-beachhead-market-memo.md)
- [`01-project-plan/11-mvp-unit-economics.md`](./01-project-plan/11-mvp-unit-economics.md)

### Tracy / 工程開發必讀
- [`01-project-plan/06-tracy-handoff-brief.md`](./01-project-plan/06-tracy-handoff-brief.md)
- [`09-product-spec/09-tracy-product-spec.md`](./09-product-spec/09-tracy-product-spec.md)
- [`03-dev-timeline/05-tracy-week1-kickoff.md`](./03-dev-timeline/05-tracy-week1-kickoff.md)
- [`03-dev-timeline/06-page-api-db-mapping.md`](./03-dev-timeline/06-page-api-db-mapping.md)
- [`04-tech-architecture/02-database-schema.md`](./04-tech-architecture/02-database-schema.md)
- [`04-tech-architecture/03-api-spec.md`](./04-tech-architecture/03-api-spec.md)
- [`04-tech-architecture/07-andy-lee-mvp-content.json`](./04-tech-architecture/07-andy-lee-mvp-content.json)

### 產品 / 營運必讀
- [`09-product-spec/06-mvp-business-rules.md`](./09-product-spec/06-mvp-business-rules.md)
- [`09-product-spec/07-mvp-user-flows.md`](./09-product-spec/07-mvp-user-flows.md)
- [`09-product-spec/05-admin-panel-spec.md`](./09-product-spec/05-admin-panel-spec.md)
- [`01-project-plan/14-operations-tracking-spec.md`](./01-project-plan/14-operations-tracking-spec.md)

### Andy Lee（李衍錫） 上線必讀
- [`01-project-plan/15-andy-wu-mvp-launch-checklist.md`](./01-project-plan/15-andy-wu-mvp-launch-checklist.md)
- [`01-project-plan/16-andy-wu-content-pack.md`](./01-project-plan/16-andy-wu-content-pack.md)

---

## 当前 MVP 成功定義

MVP 的成功，不是頁面做完，而是：
- Andy Lee（李衍錫） 可以成功上架第一個主打活動
- 旅客可以看到可預約日期並完成付款
- 付款後名額會即時更新
- Admin 可以在後台處理退款與營運追蹤
- 團隊能用真實訂單數據回頭修正營運與抽成模型

---

## 下一步重點

目前最重要的執行順序：

1. 補齊 Andy Lee（李衍錫） 真實素材
2. 完成導遊 / 活動 / 場次 / 訂單主流程開發
3. 完成 admin 後台營運追蹤模組
4. 導入 Andy Lee（李衍錫） 第一批真實預約
5. 追蹤單位經濟，據此調整營運策略

---

## 備註

- 專案名稱目前仍為暫名 `Tour Platform`
- 正式品牌名、品牌語氣與 landing page 主視覺仍待最終決策
- 本 repo 目前以 **MVP planning & execution docs** 為主，後續若正式拆出產品程式碼，可再調整結構
