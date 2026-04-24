# Issue #164 Results Template

> Updated: 2026-04-24  
> Purpose: 將真實 schema 對齊版 precheck（`scripts/sql/fk_precheck_164.sql`）的輸出整理成可直接貼回 GitHub issue comment 或 docs 的格式。

## Template

```md
## #164 Precheck Result

### Environment
- Target: <staging|production|other>
- Executed at: <timestamp>
- SQL path: `scripts/sql/fk_precheck_164.sql`

### bookings.order_id -> orders.id
- total_rows: <value>
- null_or_blank: <value>
- invalid_format: <value>
- orphan_count: <value>

### orders.booking_id -> bookings.id
- total_rows: <value>
- null_or_blank: <value>
- invalid_format: <value>
- orphan_count: <value>
- note: orders.booking_id 允許 NULL；若 null_or_blank > 0，先視為觀測事實，僅在有 orphan / invalid_format 時列為資料品質異常

### payments.order_id -> orders.id
- total_rows: <value>
- null_or_blank: <value>
- invalid_format: <value>
- orphan_count: <value>
- sample orphan rows: <summary or none>

### Interpretation
- blocker for rollout: <yes/no>
- main risk: <orphan|invalid_format|schema drift|none>
- next action: <keep-observing | repair orphan rows | schema alignment follow-up>

### Evidence
- output file: <path if saved>
- operator: <name>
```

## Usage

1. 先執行：
   - `scripts/integrity/run_fk_precheck_164.sh`
2. 收集 `summary.txt` 與 CSV artifacts
3. 把數字與樣本摘要填進本模板
4. 回貼到 #164 issue comment
5. 若 `payments.order_id` orphan_count > 0，再新增修復草稿
