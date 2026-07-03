#!/bin/bash
# run-checks.sh — 測試證據鏈工具（不是 hook，是模型主動呼叫的 runner）
# 用法：
#   .claude/hooks/run-checks.sh apps/web/tests/api/issueNNNN-*.test.mjs   # targeted（日常）
#   .claude/hooks/run-checks.sh --typecheck apps/web/tests/api/foo.test.mjs
#   .claude/hooks/run-checks.sh --all                                     # 整套 npm test（開 PR 前）
# 成功/失敗都會把證據寫入 .claude/state/last-checks.json；
# bash-guard.sh 的 commit gate 只認 30 分鐘內、exit_code=0 的證據。
set -o pipefail
root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
[[ -z "$root" ]] && { echo "找不到 repo root" >&2; exit 1; }
mkdir -p "$root/.claude/state"
outfile="$root/.claude/state/last-checks.json"
logfile="$root/.claude/state/last-checks.log"

do_type=0
run_all=0
args=()
for a in "$@"; do
  case "$a" in
    --typecheck) do_type=1 ;;
    --all) run_all=1 ;;
    *) args+=("$a") ;;
  esac
done

if (( run_all == 0 )) && (( ${#args[@]} == 0 )); then
  echo "用法：run-checks.sh [--typecheck] <test 檔…>  或  run-checks.sh --all" >&2
  exit 1
fi

status=0
cmd_desc=""
: > "$logfile"

if (( run_all )); then
  cmd_desc="npm test"
  (cd "$root" && npm test) 2>&1 | tee -a "$logfile" || status=$?
else
  # 展開 glob（呼叫方若用引號包住 pattern，這裡補展開）
  expanded=()
  for a in "${args[@]}"; do
    while IFS= read -r f; do [[ -n "$f" ]] && expanded+=("$f"); done < <(cd "$root" && compgen -G "$a" || echo "$a")
  done
  cmd_desc="node --test ${expanded[*]}"
  (cd "$root" && node --test "${expanded[@]}") 2>&1 | tee -a "$logfile" || status=$?
fi

if (( do_type )) && (( status == 0 )); then
  cmd_desc="$cmd_desc && npm run typecheck"
  (cd "$root" && npm run typecheck) 2>&1 | tee -a "$logfile" || status=$?
fi

# 摘要：頭尾各 15 行（偽造證據需連輸出都編，墊高造假成本；verifier 仍須重跑）
summary=$(  { head -n 15 "$logfile"; echo "…"; tail -n 15 "$logfile"; } | jq -Rs . )

jq -n \
  --arg cmd "$cmd_desc" \
  --argjson exit_code "$status" \
  --argjson epoch "$(date +%s)" \
  --arg when "$(TZ=Asia/Taipei date '+%Y-%m-%d %H:%M:%S %Z')" \
  --argjson summary "$summary" \
  '{cmd:$cmd, exit_code:$exit_code, epoch:$epoch, when:$when, output_head_tail:$summary}' > "$outfile"

if (( status == 0 )); then
  echo "✅ 綠燈證據已寫入 $outfile（30 分鐘內可 commit）"
else
  echo "❌ 紅燈（exit=$status）。證據已記錄；commit gate 會擋。完整輸出：$logfile" >&2
fi
exit $status
