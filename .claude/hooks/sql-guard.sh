#!/bin/bash
# sql-guard.sh — PreToolUse hook（mcp__Supabase__execute_sql）
# 生產資料庫唯讀哨兵：只放行查詢，任何寫入/DDL 一律攔截。
# 對應 .cursor/harness/01_diagnostics.md 痛點 1。本專案 Supabase MCP 直連正式生產。

input=$(cat)
q=$(echo "$input" | jq -r '.tool_input.query // empty')
[[ -z "$q" ]] && exit 0

qn=$(echo "$q" | tr '[:upper:]' '[:lower:]')

if echo "$qn" | grep -qE '\b(insert|update|delete|merge|upsert|drop|alter|truncate|grant|revoke|create|reindex|vacuum|analyze|cluster|copy|call|set[[:space:]]+role|security[[:space:]]+definer)\b|refresh[[:space:]]+materialized|comment[[:space:]]+on|do[[:space:]]*\$'; then
  {
    echo "⛔ HARNESS BLOCK [sql-guard]: execute_sql 在本專案僅限唯讀查證（SELECT / EXPLAIN / SHOW）。"
    echo "偵測到寫入/DDL 關鍵字。生產 schema 或資料變更的唯一合法路徑："
    echo "  1. 在 supabase/migrations/ 新增時間戳 migration 檔（file-guard 會驗命名）。"
    echo "  2. 開 PR → CI 綠燈 → 由使用者依 docs/operations/migration-apply-ledger-sop.md 人工套用。"
    echo "若這是含寫入關鍵字字樣的純查詢（例如字串常值撞關鍵字），請改寫查詢避開，或請使用者放行。"
    echo "背景：本環境直連正式生產專案（.cursor/harness/01_diagnostics.md 痛點 1；#1563 RLS 事故前科）。"
  } >&2
  exit 2
fi
exit 0
