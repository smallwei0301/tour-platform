#!/bin/bash
# bash-guard.sh — PreToolUse hook（Bash）
# 1) 擋 shell 側旁路寫入凍結區  2) 擋 force-push / 危險 rm  3) git commit 測試證據 gate
# 對應 .cursor/harness/01_diagnostics.md 痛點 2、3。
# exit 0 = 放行；exit 2 = 攔截。

input=$(cat)
cmd=$(echo "$input" | jq -r '.tool_input.command // empty')
[[ -z "$cmd" ]] && exit 0
root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"

deny() { echo "⛔ HARNESS BLOCK [bash-guard]: $1" >&2; exit 2; }

# ── 1. force-push 一律禁止 ─────────────────────────────────────────────
if echo "$cmd" | grep -qE 'git[[:space:]]+push[^|;&]*(--force|[[:space:]]-f([[:space:]]|$))'; then
  deny "禁止 force-push（含 --force-with-lease）。squash-merge 殘留請走 .cursor/harness/08_branch_hygiene.md 的 merge 回收流程（不需要 force-push）。"
fi

# ── 2. rm 觸及受保護目錄 ──────────────────────────────────────────────
if echo "$cmd" | grep -qE '(^|[;&|[:space:]])rm([[:space:]]|$)' \
   && echo "$cmd" | grep -qE '(supabase/migrations|apps/web/e2e|apps/web/tests|\.claude/(hooks|settings)|\.cursor/harness|CLAUDE\.md)'; then
  deny "禁止刪除受保護路徑（migrations / e2e / tests / harness / CLAUDE.md）內的檔案。若確有必要，走 P0-OVERRIDE 協議＋用 git rm 走 PR 讓人審。"
fi

# ── 3. shell 寫入凍結路徑（sed -i / redirect / tee / mv,cp 目的地）────
# 檔名型目標加結尾邊界（避免誤擋 X.bak 這類備份檔）；目錄型目標維持前綴比對
FROZEN_RE='(supabase/migrations/2[0-9]|apps/web/app/api/(orders|payments)/|\.claude/hooks/|\.cursor/harness/0[0-9]|(apps/web/middleware\.ts|src/config/(security-env|startup-env)\.mjs|yarn\.lock|CLAUDE\.md|\.claude/settings\.json)([^.A-Za-z0-9_-]|$))'
if echo "$cmd" | grep -qE "(sed|perl)[[:space:]][^|;&]*-i[^|;&]*${FROZEN_RE}" \
   || echo "$cmd" | grep -qE ">>?[[:space:]]*[\"']?[^[:space:]\"']*${FROZEN_RE}" \
   || echo "$cmd" | grep -qE "tee[[:space:]](-a[[:space:]])?[\"']?[^|;&]*${FROZEN_RE}" \
   || echo "$cmd" | grep -qE "(mv|cp)[[:space:]][^|;&]+[[:space:]][\"']?[^[:space:]\"']*${FROZEN_RE}"; then
  deny "偵測到以 shell 寫入凍結路徑。凍結區只接受 P0-OVERRIDE 協議下的 Edit/Write（見 .cursor/harness/01_diagnostics.md §3–§4），不接受 shell 旁路。"
fi

# ── 4. git commit 證據 gate ───────────────────────────────────────────
if echo "$cmd" | grep -qE '(^|[;&|[:space:]])git[[:space:]]+commit'; then
  staged=$(git -C "${root:-.}" diff --cached --name-only 2>/dev/null)

  if echo "$staged" | grep -qE '(^|/)yarn\.lock$'; then
    deny "yarn.lock 在 staged 區。先執行：git restore --staged yarn.lock && git checkout -- yarn.lock，再 commit。"
  fi

  # docs / harness 純文件 commit 豁免測試 gate
  if [[ -n "$staged" ]] && ! echo "$staged" | grep -qvE '^(docs/|\.cursor/|\.claude/|\.github/|\.gitignore$|.*\.(md|txt|json|bak)$)'; then
    exit 0
  fi

  evidence="${root:-.}/.claude/state/last-checks.json"
  if [[ ! -f "$evidence" ]]; then
    deny "缺少測試證據。凡 commit 觸碰程式碼，必須先跑 .claude/hooks/run-checks.sh <targeted test 檔>（綠燈會寫入 .claude/state/last-checks.json）。宣稱『測試應該會過』不是證據。"
  fi
  ec=$(jq -r '.exit_code // "?"' "$evidence" 2>/dev/null)
  ts=$(jq -r '.epoch // 0' "$evidence" 2>/dev/null)
  age=$(( $(date +%s) - ${ts:-0} ))
  if [[ "$ec" != "0" ]]; then
    deny "最近一次 run-checks.sh 是紅燈（exit=$ec，指令：$(jq -r '.cmd // "?"' "$evidence" 2>/dev/null)）。修到綠燈再 commit；不得改弱測試來遷就實作（見 03_rubrics.md R1）。"
  fi
  if (( age > 1800 )); then
    deny "測試證據已過期（$((age/60)) 分鐘前）。程式碼在那之後可能又改過——重新跑 .claude/hooks/run-checks.sh 取得新鮮綠燈後再 commit。"
  fi
fi

exit 0
