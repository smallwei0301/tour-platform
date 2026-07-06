#!/bin/bash
# sql-guard.sh — PreToolUse hook（mcp__Supabase__execute_sql｜mcp__Supabase__apply_migration）
# 生產資料庫「預設唯讀」哨兵：
#   - 無授權：只放行查詢，任何寫入/DDL/apply_migration 一律攔截。
#   - SQL-OVERRIDE 授權（使用者當輪明確下令）：放行寫入與 migration 套用，
#     仍擋災難級語句（drop database/schema、alter system），且逐句寫入審計檔。
# 協議全文：.cursor/harness/01_diagnostics.md §4b。對應痛點 1。本專案 Supabase MCP 直連正式生產。
# 已知極限（01 §5）：授權窗開啟期間為全寫入放行；經 SELECT 呼叫的任意 volatile function
# 無法用 regex 完全攔截——最終的牆是 MCP server 端唯讀設定與資料庫端權限，由使用者掌握。

input=$(cat)
tool=$(echo "$input" | jq -r '.tool_name // empty')
q=$(echo "$input" | jq -r '.tool_input.query // empty')
[[ -z "$q" ]] && exit 0

root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
OVERRIDE_FILE="$root/.claude/state/sql-override"
AUDIT_LOG="$root/.claude/state/sql-audit.log"

override_ok() {
  [[ -n "$root" && -f "$OVERRIDE_FILE" ]] || return 1
  local age=$(( $(date +%s) - $(stat -c %Y "$OVERRIDE_FILE" 2>/dev/null || echo 0) ))
  (( age <= 1800 ))   # 30 分鐘效期，過期重批
}

deny_readonly() {
  {
    echo "⛔ HARNESS BLOCK [sql-guard]: $1"
    echo "生產資料庫預設唯讀（SELECT / EXPLAIN / SHOW / 唯讀 WITH）。寫入/DDL 需 SQL-OVERRIDE 授權："
    echo "  1. 停下來，向使用者列出將執行的完整 SQL、目標表、預期影響（筆數/schema 變化）。"
    echo "  2. 等使用者在對話中回覆含「SQL-OVERRIDE」的明確授權。"
    echo "  3. 把授權原話＋時間＋目的寫入 .claude/state/sql-override（30 分鐘有效），再重試。"
    echo "  4. 執行完畢立刻刪除該檔（消耗式），並把執行結果與審計記入 worklog。"
    echo "協議見 .cursor/harness/01_diagnostics.md §4b。不得自行解鎖。schema 變更仍須先落 migration 檔"
    echo "（PR → CI 綠燈 → 授權套用 → 補 ledger，docs/operations/migration-apply-ledger-sop.md）。"
  } >&2
  exit 2
}

audit() {
  [[ -n "$root" ]] || return 0
  mkdir -p "$root/.claude/state"
  printf '[%s] %s :: %.400s\n' "$(TZ=Asia/Taipei date '+%Y-%m-%d %H:%M:%S')" "$tool" "$(echo "$q" | tr '\n' ' ')" >> "$AUDIT_LOG"
}

# 正規化：小寫、壓空白
qn=$(echo "$q" | tr '[:upper:]' '[:lower:]' | tr -s '[:space:]' ' ' | sed 's/^ //')

# ── 授權模式：放行寫入，僅擋災難級 ＋ 全程審計 ─────────────────────────
if override_ok; then
  if echo "$qn" | grep -qE '\b(drop[[:space:]]+database|drop[[:space:]]+schema|alter[[:space:]]+system)\b'; then
    echo "⛔ HARNESS BLOCK [sql-guard]: 災難級語句（drop database/schema、alter system）即使 SQL-OVERRIDE 也不放行。此類操作請使用者親自在 Supabase Dashboard 執行。" >&2
    exit 2
  fi
  audit
  exit 0
fi

# ── 唯讀模式（預設）───────────────────────────────────────────────────
# apply_migration 本質是 DDL，無授權一律擋
if [[ "$tool" == "mcp__Supabase__apply_migration" ]]; then
  deny_readonly "apply_migration 需 SQL-OVERRIDE 授權（migration 檔須已進 repo 並過 CI）。"
fi

# 1. 前綴白名單：只有查詢型語句准進場
if ! echo "$qn" | grep -qE '^(select|with|explain|show|table|values)\b'; then
  deny_readonly "語句開頭不是查詢型關鍵字（select/with/explain/show/table/values）。"
fi

# 2. 去除唯讀語境的誤傷來源，再掃寫入關鍵字：
#    - EXPLAIN 前綴（含 (analyze, buffers…) 選項與裸 analyze/verbose）
#    - SELECT 的鎖定子句 FOR UPDATE / FOR SHARE（唯讀交易中無效果，且常見於查證）
qs=$(echo "$qn" \
  | sed -E 's/^explain( \([^)]*\))?(( )(analyze|verbose))*/explain/' \
  | sed -E 's/for (no key )?(update|share)( of [a-z_, ]+)?( nowait| skip locked)?//g')

# 3. 寫入/DDL 關鍵字掃描（word boundary；updated_at/created_at 不會誤中）
if echo "$qs" | grep -qE '\b(insert|update|delete|merge|upsert|drop|alter|truncate|grant|revoke|create|reindex|vacuum|cluster|copy|call|do|set role|reset role|security definer|refresh materialized|comment on|listen|notify|prepare|execute|deallocate)\b'; then
  deny_readonly "偵測到寫入/DDL 關鍵字（若是字串常值撞關鍵字，請改寫查詢避開）。"
fi

# 4. 危險函式黑名單（可經 SELECT 觸發副作用的已知函式）
if echo "$qs" | grep -qE '\b(setval|nextval|pg_terminate_backend|pg_cancel_backend|pg_reload_conf|pg_rotate_logfile|lo_import|lo_export|dblink|pg_read_file|pg_read_binary_file|pg_write_file|pg_ls_dir|pg_sleep|set_config|pgp_sym_decrypt)\b'; then
  deny_readonly "偵測到具副作用/敏感的函式呼叫。"
fi

exit 0
