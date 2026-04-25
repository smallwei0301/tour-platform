# Issue #210 Evidence Directory

執行 `npm run regression:issue-210:booking-cancel` 後，會建立：

- `<timestamp>/booking-cancel-verification-sql-output.txt`
- `<timestamp>/booking-cancel-contract-tests.txt`
- `<timestamp>/summary.md`

建議在 PR / issue comment 附上 `summary.md`，並保留兩份 raw output 供稽核與 on-call 追查。
