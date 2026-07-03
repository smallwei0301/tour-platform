#!/usr/bin/env bash
# ISR production smoke（#1585）— 在已 build 的 .next 上啟動 next start，
# 實測 ISR 路由的 on-demand 靜態生成不會 500。
#
# 為什麼需要這支：dev server 對所有頁面走 dynamic 渲染，Playwright/dev 測不到
# 「ISR 靜態生成中誤用 dynamic API（headers()/cookies()）→ DYNAMIC_SERVER_USAGE
# → 整條路由 500」這類故障（#1585 production 事故：root layout 的 getLocale()
# 讓導遊詳情/導遊商店/活動詳情全部 500）。只有 production build + next start
# 能重現，故 CI 在 build 之後跑本 script。
#
# 前置：apps/web/.next 已存在（CI 的 Web build step）。不設 Supabase env →
# 走 in-memory fixtures（andy-lee / dadadaocheng-walk 皆為 fixture 資料）。
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WEB_DIR="$ROOT_DIR/apps/web"
PORT="${ISR_SMOKE_PORT:-4123}"
BASE="http://127.0.0.1:$PORT"
LOG="$(mktemp)"

if [[ ! -f "$WEB_DIR/.next/BUILD_ID" ]]; then
  echo "❌ isr-smoke: 找不到 $WEB_DIR/.next/BUILD_ID — 請先跑 npm run build -w @tour/web"
  exit 1
fi

# production 模式的 security-env guard 需要非預設強密鑰；CI 已注入，本地補預設。
export GUIDE_SESSION_SECRET="${GUIDE_SESSION_SECRET:-isr-smoke-guide-secret-0123456789abcdef}"
export ADMIN_ACCESS_TOKEN="${ADMIN_ACCESS_TOKEN:-isr-smoke-admin-token-0123456789abcdef}"

cd "$WEB_DIR"
npx next start -p "$PORT" >"$LOG" 2>&1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT

for _ in $(seq 1 60); do
  if curl -sS -o /dev/null -m 2 "$BASE/" 2>/dev/null; then
    break
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "❌ isr-smoke: next start 啟動失敗"
    cat "$LOG"
    exit 1
  fi
  sleep 1
done

fail=0
check() {
  local path="$1" expected="$2" desc="$3"
  local code
  code=$(curl -sS -o /dev/null -w "%{http_code}" -m 15 "$BASE$path" || echo "000")
  if [[ "$code" == "$expected" ]]; then
    echo "[OK]   $path -> $code（$desc）"
  else
    echo "[FAIL] $path -> $code（預期 $expected：$desc）"
    fail=1
  fi
}

echo "== ISR smoke（#1585）：on-demand 靜態生成不得 500 =="
check "/guides/andy-lee/shop"                        200 "導遊商店頁（非 locale 的 on-demand ISR）"
check "/zh-Hant/guides/andy-lee"                     200 "導遊詳情頁（[locale] on-demand ISR）"
check "/zh-Hant/activities/taipei/dadadaocheng-walk" 200 "活動詳情頁（[locale] ISR）"

# 不存在的 slug：notFound() 要能正常執行、渲染 not-found 頁，而非 render 先炸成
# 500（#1585 事故時連 notFound() 都到不了）。註：本站 not-found 目前回 200 而非
# 404 是全站既有行為（#1585 前的 production 亦然），屬另一個 SEO 議題，這裡只鎖
# 「非 5xx ＋ 渲染出 not-found 內容」。
nf_body="$(mktemp)"
nf_code=$(curl -sS -o "$nf_body" -w "%{http_code}" -m 15 "$BASE/guides/not-exist-xyz/shop" || echo "000")
if [[ "$nf_code" =~ ^(200|404)$ ]] && grep -q "找不到這個頁面" "$nf_body"; then
  echo "[OK]   /guides/not-exist-xyz/shop -> $nf_code（渲染 not-found 頁，非 5xx）"
else
  echo "[FAIL] /guides/not-exist-xyz/shop -> $nf_code（預期 200/404 且含 not-found 內容）"
  fail=1
fi

if [[ "$fail" -ne 0 ]]; then
  echo "❌ ISR smoke failed — server log（tail）："
  tail -40 "$LOG"
  exit 1
fi

echo "✅ ISR smoke passed"
