#!/bin/bash
# sql-guard.sh — PreToolUse hook（mcp__Supabase__execute_sql）
# 生產資料庫唯讀哨兵：只放行查詢，任何寫入/DDL 一律攔截。
# 對應 .cursor/harness/01_diagnostics.md 痛點 1。本專案 Supabase MCP 直連正式生產。
# 已知極限（01 §5）：經 SELECT 呼叫的任意 volatile function 無法用 regex 完全攔截，
# 真正的牆是資料庫端唯讀憑證（06_manifesto.md 第 1 件事）。

input=$(cat)
q=$(echo "$input" | jq -r '.tool_input.query // empty')
[[ -z "$q" ]] && exit 0

deny() {
  {
    echo "⛔ HARNESS BLOCK [sql-guard]: $1"
    echo "execute_sql 在本專案僅限唯讀查證（SELECT / EXPLAIN / SHOW / 唯讀 WITH）。"
    echo "生產 schema 或資料變更的唯一合法路徑：新增時間戳 migration 檔 → PR → CI → 人工套用"
    echo "（docs/operations/migration-apply-ledger-sop.md）。背景：#1563 RLS 事故前科。"
  } >&2
  exit 2
}

# 正規化：小寫、壓空白
qn=$(echo "$q" | tr '[:upper:]' '[:lower:]' | tr -s '[:space:]' ' ' | sed 's/^ //')

# 1. 前綴白名單：只有查詢型語句准進場
if ! echo "$qn" | grep -qE '^(select|with|explain|show|table|values)\b'; then
  deny "語句開頭不是查詢型關鍵字（select/with/explain/show/table/values）。"
fi

# 2. 去除唯讀語境的誤傷來源，再掃寫入關鍵字：
#    - EXPLAIN 前綴（含 (analyze, buffers…) 選項與裸 analyze/verbose）
#    - SELECT 的鎖定子句 FOR UPDATE / FOR SHARE（唯讀交易中無效果，且常見於查證）
qs=$(echo "$qn" \
  | sed -E 's/^explain( \([^)]*\))?(( )(analyze|verbose))*/explain/' \
  | sed -E 's/for (no key )?(update|share)( of [a-z_, ]+)?( nowait| skip locked)?//g')

# 3. 寫入/DDL 關鍵字掃描（word boundary；updated_at/created_at 不會誤中）
if echo "$qs" | grep -qE '\b(insert|update|delete|merge|upsert|drop|alter|truncate|grant|revoke|create|reindex|vacuum|cluster|copy|call|do|set role|reset role|security definer|refresh materialized|comment on|listen|notify|prepare|execute|deallocate)\b'; then
  deny "偵測到寫入/DDL 關鍵字（若是字串常值撞關鍵字，請改寫查詢避開）。"
fi

# 4. 危險函式黑名單（可經 SELECT 觸發副作用的已知函式）
if echo "$qs" | grep -qE '\b(setval|nextval|pg_terminate_backend|pg_cancel_backend|pg_reload_conf|pg_rotate_logfile|lo_import|lo_export|dblink|pg_read_file|pg_read_binary_file|pg_write_file|pg_ls_dir|pg_sleep|set_config|pgp_sym_decrypt)\b'; then
  deny "偵測到具副作用/敏感的函式呼叫。"
fi

exit 0
