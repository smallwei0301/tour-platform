#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$ROOT_DIR"

TS="$(date +%Y%m%d-%H%M%S)"
REPORT_DIR="reports/issue-314/${TS}"
mkdir -p "$REPORT_DIR"

# Tests use process.cwd() for path resolution — must run from apps/web
WEB_DIR="${ROOT_DIR}/apps/web"

# ---------------------------------------------------------------------------
# Phase 12 full regression composer
# Runs 7 critical paths (P1–P7) and reports results.
# Exits non-zero if any path fails.
# On full PASS: writes docs/qa/phase-12-regression-final.md
# ---------------------------------------------------------------------------

PASS=0
FAIL=0
FAIL_PATHS=()

run_path() {
  local path_num="$1"
  local label="$2"
  shift 2
  local suites=("$@")

  local log_file="${REPORT_DIR}/path-${path_num}.log"
  local suite_args=()
  for s in "${suites[@]}"; do
    suite_args+=("tests/api/${s}")
  done

  echo "[RUN] P${path_num} ${label}"

  # Run from apps/web so process.cwd() resolves correctly
  if (cd "${WEB_DIR}" && node --test "${suite_args[@]}") > "$log_file" 2>&1; then
    echo "[PASS] P${path_num} ${label}"
    PASS=$((PASS + 1))
  else
    echo "[FAIL] P${path_num} ${label} :: suite=${suites[*]} :: expected=PASS actual=FAIL :: see ${REPORT_DIR}/path-${path_num}.log"
    FAIL=$((FAIL + 1))
    FAIL_PATHS+=("P${path_num}")
  fi
}

# P1: Traveler booking
run_path 1 "traveler booking" \
  "v2-available-slots.test.mjs" \
  "v2-booking-draft-checkout.test.mjs" \
  "ecpay-callback.test.mjs" \
  "me-orders.test.mjs"

# P2: Admin POS create→paid→confirmed→print
run_path 2 "admin POS create→paid→confirmed→print" \
  "v2-admin-pos-line-regression.test.mjs" \
  "v2-admin-pos-manual-payment-regression.test.mjs"

# P3: Admin POS additional-payment (#296)
run_path 3 "admin POS additional-payment (#296)" \
  "v2-admin-pos-additional-payment-regression.test.mjs"

# P4: Admin POS order detail/timeline (#264)
run_path 4 "admin POS order detail/timeline (#264)" \
  "v2-admin-pos-detail-timeline-regression.test.mjs"

# P5: Refund flow
run_path 5 "refund flow" \
  "refund-requests.test.mjs" \
  "admin-refunds.test.mjs" \
  "ecpay-callback-mapping-contract.test.mjs"

# P6: LINE LIFF
run_path 6 "LINE LIFF" \
  "v2-line-liff-entry-contract.test.mjs" \
  "issue178-line-liff-callback-audit-contract.test.mjs"

# P7: Guide dashboard sync
run_path 7 "guide dashboard booking sync" \
  "admin-dashboard-summary.test.mjs" \
  "v2-guide-dashboard-booking-sync.test.mjs"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "=============================="
echo "Phase 12 Regression Summary"
echo "=============================="
echo "PASS paths: ${PASS}/7"
echo "FAIL paths: ${FAIL}/7"

if [[ ${FAIL} -gt 0 ]]; then
  echo "Failed: ${FAIL_PATHS[*]}"
  echo "[ERROR] Phase 12 regression FAILED — see ${REPORT_DIR} for logs"
  exit 1
fi

# ---------------------------------------------------------------------------
# Full PASS: write docs/qa/phase-12-regression-final.md
# ---------------------------------------------------------------------------
DOC_FILE="docs/qa/phase-12-regression-final.md"
mkdir -p "$(dirname "$DOC_FILE")"

{
  echo "# Phase 12 Regression Final Report"
  echo ""
  echo "- executed_at: $(date -Iseconds)"
  echo "- reports_dir: \`${REPORT_DIR}\`"
  echo ""
  echo "## 7 Critical Paths"
  echo ""
  echo "| Path | Label | Test Suite(s) | Result |"
  echo "|------|-------|---------------|--------|"
  echo "| P1 | traveler booking | v2-available-slots, v2-booking-draft-checkout, ecpay-callback, me-orders | PASS |"
  echo "| P2 | admin POS create→paid→confirmed→print | v2-admin-pos-line-regression, v2-admin-pos-manual-payment-regression | PASS |"
  echo "| P3 | admin POS additional-payment (#296) | v2-admin-pos-additional-payment-regression | PASS |"
  echo "| P4 | admin POS order detail/timeline (#264) | v2-admin-pos-detail-timeline-regression | PASS |"
  echo "| P5 | refund flow | refund-requests, admin-refunds, ecpay-callback-mapping-contract | PASS |"
  echo "| P6 | LINE LIFF | v2-line-liff-entry-contract, issue178-line-liff-callback-audit-contract | PASS |"
  echo "| P7 | guide dashboard booking sync | admin-dashboard-summary, v2-guide-dashboard-booking-sync | PASS |"
  echo ""
  echo "## Linked parents/children"
  echo ""
  echo "#176 #264 #296 #182 #190 #178"
} > "$DOC_FILE"

echo "[DONE] docs/qa/phase-12-regression-final.md written"
echo "[DONE] Phase 12 full regression PASSED (${REPORT_DIR})"
