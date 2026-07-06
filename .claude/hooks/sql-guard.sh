#!/bin/bash
# sql-guard.sh — PreToolUse hook（mcp__Supabase__execute_sql｜mcp__Supabase__apply_migration）
# 模式（2026-07-06 owner 拍板「讀寫全自動，改為事後審計」）：
#   - execute_sql：讀＋寫全部自動放行、免確認；每句寫入/DDL 逐句寫入 sql-audit.log 供事後稽核。
#   - 硬地板（任何情況都擋，非正常查改資料範圍）：災難級語句（drop database/schema、alter system）
#     ＋危險系統函式（pg_terminate_backend、pg_read_file…）。這是攻擊/管理面向，不在授權範圍。
#   - apply_migration（schema 變更）：仍需 SQL-OVERRIDE 授權——schema 走 migration 檔紀律、罕見、風險高。
# 協議全文：.cursor/harness/01_diagnostics.md §4b。對應痛點 1。本專案 Supabase MCP 直連正式生產。
# ⚠️ 誠實揭露（01 §5）：本模式下生產 DB 寫入「無事前人工閘」，只剩硬地板＋事後審計；agent 執行寫入後
#    必須立刻回報實際影響（見 §4b「事後檢查」義務）。最終的牆是 MCP server 端唯讀設定，由使用者掌握。

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

audit() {
  [[ -n "$root" ]] || return 0
  mkdir -p "$root/.claude/state"
  printf '[%s] %s :: %.400s\n' "$(TZ=Asia/Taipei date '+%Y-%m-%d %H:%M:%S')" "$tool" "$(echo "$q" | tr '\n' ' ')" >> "$AUDIT_LOG"
}

# 正規化：小寫、壓空白
qn=$(echo "$q" | tr '[:upper:]' '[:lower:]' | tr -s '[:space:]' ' ' | sed 's/^ //')

# ── 硬地板（execute_sql 與 apply_migration 都適用，永遠擋）────────────────
if echo "$qn" | grep -qE '\b(drop[[:space:]]+database|drop[[:space:]]+schema|alter[[:space:]]+system)\b'; then
  echo "⛔ HARNESS BLOCK [sql-guard]: 災難級語句（drop database/schema、alter system）任何情況都不放行。請使用者親自在 Supabase Dashboard 執行。" >&2
  exit 2
fi
if echo "$qn" | grep -qE '\b(pg_terminate_backend|pg_cancel_backend|pg_reload_conf|pg_rotate_logfile|lo_import|lo_export|dblink|pg_read_file|pg_read_binary_file|pg_write_file|pg_ls_dir|pg_write_server_files|copy[[:space:]]+.*[[:space:]]+(from|to)[[:space:]]+program)\b'; then
  echo "⛔ HARNESS BLOCK [sql-guard]: 危險系統函式（pg_terminate/pg_read_file/COPY…PROGRAM 等）不在「查改資料」授權範圍，一律擋。確有需要請使用者親自於 Dashboard 執行。" >&2
  exit 2
fi

# ── apply_migration：schema 變更仍需 SQL-OVERRIDE 授權 ───────────────────
if [[ "$tool" == "mcp__Supabase__apply_migration" ]]; then
  if override_ok; then
    audit
    exit 0
  fi
  {
    echo "⛔ HARNESS BLOCK [sql-guard]: apply_migration（schema 變更）仍需 SQL-OVERRIDE 授權，不在「讀寫全自動」範圍。"
    echo "schema 變更走 migration 檔紀律：新增時間戳檔 → PR → CI 綠燈 → 授權套用 → 補 ledger。"
    echo "若要套用：向使用者列出 migration 內容，取得含「SQL-OVERRIDE」的授權，寫入 .claude/state/sql-override（30 分鐘）後重試。"
    echo "協議見 .cursor/harness/01_diagnostics.md §4b。"
  } >&2
  exit 2
fi

# ── execute_sql：讀＋寫全部自動放行；寫入/DDL 逐句審計 ────────────────────
# 判斷是否為寫入/DDL（供審計；讀取不記，避免雜訊）。先剝除唯讀語境誤傷來源。
qs=$(echo "$qn" \
  | sed -E 's/^explain( \([^)]*\))?(( )(analyze|verbose))*/explain/' \
  | sed -E 's/for (no key )?(update|share)( of [a-z_, ]+)?( nowait| skip locked)?//g')
if echo "$qs" | grep -qE '\b(insert|update|delete|merge|upsert|drop|alter|truncate|grant|revoke|create|reindex|vacuum|cluster|copy|call|do|set role|reset role|refresh materialized|comment on)\b'; then
  audit   # 寫入/DDL：記審計後放行
fi
exit 0
