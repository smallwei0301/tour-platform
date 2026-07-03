#!/bin/bash
# file-guard.sh — PreToolUse hook（Edit|Write）
# 凍結路徑守衛：對應 .cursor/harness/01_diagnostics.md 痛點 2 與 §3 凍結清單。
# exit 0 = 放行；exit 2 = 攔截（stderr 會回饋給模型）。

input=$(cat)
tool=$(echo "$input" | jq -r '.tool_name // empty')
fp=$(echo "$input" | jq -r '.tool_input.file_path // empty')
[[ -z "$fp" ]] && exit 0

root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
if [[ -z "$root" ]]; then
  # fail-closed：定位不到 repo root 時凍結守衛無法判斷，寧可全擋
  echo "⛔ HARNESS BLOCK [file-guard]: 無法定位 repo root（CLAUDE_PROJECT_DIR 未設且不在 git repo 內），凍結守衛失效風險，一律攔截。請回到 repo 目錄操作。" >&2
  exit 2
fi
rel="${fp#"$root"/}"

override_ok() {
  local f="$root/.claude/state/p0-override"
  [[ -f "$f" ]] || return 1
  local age=$(( $(date +%s) - $(stat -c %Y "$f" 2>/dev/null || echo 0) ))
  (( age <= 3600 )) || return 1
  grep -qF -- "$1" "$f"
}

block() {
  {
    echo "⛔ HARNESS BLOCK [file-guard]: '$rel' 屬於凍結區 — $1"
    echo "此路徑僅允許 P0 修復且需使用者明確授權（P0-OVERRIDE 協議）："
    echo "  1. 停下來，向使用者說明要改哪個檔、為何是 P0、diff 預估多大。"
    echo "  2. 等使用者在對話中回覆含「P0-OVERRIDE: <路徑>」的授權。"
    echo "  3. 把路徑＋使用者原話＋時間寫入 .claude/state/p0-override（60 分鐘有效），再重試本次編輯。"
    echo "詳見 .cursor/harness/01_diagnostics.md §3–§4。不得自行解鎖。"
  } >&2
  exit 2
}

case "$rel" in
  supabase/migrations/*)
    if [[ "$tool" == "Edit" || -f "$fp" ]]; then
      override_ok "$rel" || block "migration 一律只增不改（改既有 migration 會造成 prod/repo drift）。正確做法：新增一個時間戳 migration 檔。"
    fi
    base=$(basename "$fp")
    if [[ ! -f "$fp" && ! "$base" =~ ^20[0-9]{6,12}[0-9_-].*\.sql$ ]]; then
      echo "⛔ HARNESS BLOCK [file-guard]: 新 migration 必須用時間戳命名（例：20260702120000_slug.sql），見 supabase/migrations/README.md。" >&2
      exit 2
    fi
    ;;
  apps/web/app/api/orders/*|apps/web/app/api/payments/*)
    override_ok "$rel" || block "legacy booking 凍結（#1386），只修 P0。新功能一律落在 apps/web/app/api/v2/**。"
    ;;
  apps/web/app/api/activities/*/availability/*)
    override_ok "$rel" || block "legacy availability 路徑凍結（#1386）。V2 availability 在 src/lib/availability-v2/。"
    ;;
  apps/web/e2e/t[0-9]*|apps/web/e2e/funnel-*|apps/web/e2e/deeplink-*|apps/web/e2e/booking-flow-*)
    override_ok "$rel" || block "受保護 E2E spec，不得刪改（CLAUDE.md 測試政策）。新行為請新增 e2e/issueNNNN-*.spec.ts。"
    ;;
  apps/web/middleware.ts|apps/web/src/config/security-env.mjs|apps/web/src/config/startup-env.mjs)
    override_ok "$rel" || block "auth 前門／秘密守衛，屬安全關鍵檔。"
    ;;
  yarn.lock|*/yarn.lock)
    echo "⛔ HARNESS BLOCK [file-guard]: yarn.lock 不得改動（npm install 副作用檔，改動一律 git checkout -- yarn.lock 丟棄）。此檔無 override。" >&2
    exit 2
    ;;
  CLAUDE.md|.claude/settings.json|.claude/settings.local.json|.claude/hooks/*)
    override_ok "$rel" || block "harness 治理檔，模型不得自改（.cursor/harness/05_maintenance.md）。需要調整請在 issue 留言向使用者提案。"
    ;;
  .cursor/harness/*)
    case "$rel" in
      .cursor/harness/lessons.md) ;; # 唯一可自由追加的 harness 檔
      *) override_ok "$rel" || block "harness 制度檔，更新需使用者同意（.cursor/harness/05_maintenance.md）。踩坑教訓請寫 lessons.md。" ;;
    esac
    ;;
esac
exit 0
