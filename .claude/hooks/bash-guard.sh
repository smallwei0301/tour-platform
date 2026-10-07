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

# ── 1. force-push 一律禁止（含 git -C 變體與 +refspec 強推）───────────
if echo "$cmd" | grep -qE '\bgit\b[^|;&]*\bpush\b'; then
  if echo "$cmd" | grep -qE '\bgit\b[^|;&]*\bpush\b[^|;&]*(--force|[[:space:]]-f([[:space:]]|$))' \
     || echo "$cmd" | grep -qE '\bgit\b[^|;&]*\bpush\b[^|;&]*[[:space:]]\+[^[:space:]]*:'; then
    deny "禁止 force-push（含 --force-with-lease 與 +refspec 強推）。squash-merge 殘留請走 .cursor/harness/08_branch_hygiene.md 的 merge 回收流程（不需要 force-push）。"
  fi
fi

# 僅辨識單一無引號／無 shell 運算子的 git mv；不解析或執行任意 shell。
approved_new_test_rename() {
  local rename_re='^git mv -- (apps/web/tests/(api|unit)/[A-Za-z0-9_-]+[.]test[.]mjs) (apps/web/tests/(api|unit)/issue[1-9][0-9]*-[A-Za-z0-9_-]+[.]test[.]mjs)$'
  [[ "$cmd" =~ $rename_re ]] || return 1
  local source_path="${BASH_REMATCH[1]}" target_path="${BASH_REMATCH[3]}"
  [[ "${source_path%/*}" == "${target_path%/*}" ]] || return 1
  [[ ! "${source_path##*/}" =~ ^issue[0-9]+- ]] || return 1
  [[ "${target_path##*/}" =~ ^issue[1-9][0-9]*-(.+)$ ]] || return 1
  [[ "${BASH_REMATCH[1]}" == "${source_path##*/}" ]] || return 1
  local record="${root:-}/.claude/state/p0-override" modified_at age
  [[ -n "$root" && -f "$record" && ! -L "$record" ]] || return 1
  [[ "$(readlink -f -- "${record%/*}")" == "${record%/*}" ]] || return 1
  [[ -f "$root/$source_path" && ! -L "$root/$source_path" && ! -e "$root/$target_path" && ! -L "$root/$target_path" ]] || return 1
  [[ "$(readlink -f -- "$root/${source_path%/*}")" == "$root/${source_path%/*}" ]] || return 1
  modified_at=$(stat -c %Y "$record" 2>/dev/null) || return 1
  age=$(( $(date +%s) - modified_at ))
  (( age >= 0 && age <= 3600 )) || return 1
  # 原協議：一行一路徑，另保留 Owner 原話與時間；兩端皆須具名。
  grep -qxF -- "$source_path" "$record" || return 1
  grep -qxF -- "$target_path" "$record" || return 1
  grep -qE -- "P0-OVERRIDE: ${source_path//./[.]}([[:space:];]|$)" "$record" || return 1
  grep -qE -- "P0-OVERRIDE: ${target_path//./[.]}([[:space:];]|$)" "$record" || return 1
}

# ── 2. rm/mv 觸及受保護目錄（mv 搬走 = 變相刪除）─────────────────────
if echo "$cmd" | grep -qE '(^|[;&|[:space:]])(rm|mv)([[:space:]]|$)' \
   && echo "$cmd" | grep -qE '(supabase/migrations|apps/web/e2e|apps/web/tests|\.claude/(hooks|settings)|\.cursor/harness|CLAUDE\.md)'; then
  approved_new_test_rename || deny "禁止刪除/搬移受保護路徑。僅同目錄新測試加 issue 號的單一 git mv -- 命令，可在兩端具名、Owner 原話及60分鐘 P0-OVERRIDE 下分類放行；其餘 rm/mv 仍拒絕。"
fi

# ── 3. shell 寫入凍結路徑（sed -i / redirect / tee / mv,cp 目的地）────
# 檔名型目標加結尾邊界（避免誤擋 X.bak 這類備份檔）；目錄型目標維持前綴比對
FROZEN_RE='(supabase/migrations/2[0-9]|apps/web/app/api/(orders|payments)/|\.claude/hooks/|\.cursor/harness/0[0-9]|apps/web/e2e/(t[0-9]|funnel-|deeplink-|booking-flow-)|(apps/web/middleware\.ts|src/config/(security-env|startup-env)\.mjs|yarn\.lock|CLAUDE\.md|\.claude/settings(\.local)?\.json)([^.A-Za-z0-9_-]|$))'
if echo "$cmd" | grep -qE "(sed|perl)[[:space:]][^|;&]*-i[^|;&]*${FROZEN_RE}" \
   || echo "$cmd" | grep -qE ">>?[[:space:]]*[\"']?[^[:space:]\"']*${FROZEN_RE}" \
   || echo "$cmd" | grep -qE "tee[[:space:]](-a[[:space:]])?[\"']?[^|;&]*${FROZEN_RE}" \
   || echo "$cmd" | grep -qE "(mv|cp)[[:space:]][^|;&]+[[:space:]][\"']?[^[:space:]\"']*${FROZEN_RE}"; then
  deny "偵測到以 shell 寫入凍結路徑。凍結區只接受 P0-OVERRIDE 協議下的 Edit/Write（見 .cursor/harness/01_diagnostics.md §3–§4），不接受 shell 旁路。"
fi

# ── 4. git commit 證據 gate（含 git -C 變體）──────────────────────────
if echo "$cmd" | grep -qE '\bgit\b[^|;&]*\bcommit\b'; then
  # core.quotepath=false：非 ASCII 檔名（如中文 worklog）不被跳脫成 "\345..." 帶前導引號，
  # 否則 docs 豁免的 ^(docs/|.cursor/…) 錨點比對不到 → 純文件 commit 被誤擋（lessons 有記）
  staged=$(git -C "${root:-.}" -c core.quotepath=false diff --cached --name-only 2>/dev/null)

  if echo "$staged" | grep -qE '(^|/)yarn\.lock$'; then
    deny "yarn.lock 在 staged 區。先執行：git restore --staged yarn.lock && git checkout -- yarn.lock，再 commit。"
  fi

  # docs / harness 純文件 commit 豁免測試 gate（json 只豁免文件性目錄下的，package.json 等 code 相關 json 不豁免）
  if [[ -n "$staged" ]] && ! echo "$staged" | grep -qvE '^(docs/|\.cursor/|\.claude/|\.github/|\.gitignore$|.*\.(md|txt|bak)$)'; then
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
