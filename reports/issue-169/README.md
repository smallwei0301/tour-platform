# Issue #169 Evidence Directory

每次執行 `npm run regression:issue-169` 會建立：

- `<timestamp>/precheck-postcheck-sql-output.txt`
- `<timestamp>/write-path-contract-tests.txt`
- `<timestamp>/summary.md`

建議在 PR / issue comment 附上 `summary.md`，並保留兩份 raw output 供稽核與 on-call 追查。
