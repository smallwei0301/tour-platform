#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
NODE_BIN="${NODE22_BIN:-$(command -v node)}"
if [[ ! -x "$NODE_BIN" ]]; then
  printf 'Node executable is unavailable\n' >&2
  exit 1
fi
if [[ "$("$NODE_BIN" --version)" != 'v22.23.1' ]]; then
  printf 'Node 22.23.1 is required\n' >&2
  exit 1
fi
MODE='--playwright'
LOG_NAME=''
if (($# == 0)); then
  set -- \
    apps/web/e2e/midao-navigation.spec.ts \
    apps/web/e2e/midao-auth-and-impersonation.spec.ts
elif (($# == 1)) && [[ "$1" == 'apps/web/e2e/midao-inquiry-conversion-chain.spec.ts' ]]; then
  MODE='--playwright-real-auth'
  LOG_NAME='midao-inquiry-conversion-chain.log'
elif (($# == 1)) && [[ "$1" == 'apps/web/tests/integration/midao-inquiry-conversion-api-chain.test.mjs' ]]; then
  MODE='--api-real-auth'
  LOG_NAME='midao-inquiry-conversion-api-chain.log'
fi
if [[ "$MODE" == '--playwright-real-auth' || "$MODE" == '--api-real-auth' ]]; then
  umask 077
  LOG_DIR="${MIDAO_E2E_LOG_DIR:-"$ROOT/.e2e-run-logs"}"
  mkdir -p "$LOG_DIR"
  set +e
  MIDAO_DB_HEALTH_TIMEOUT_SECONDS="${MIDAO_DB_HEALTH_TIMEOUT_SECONDS:-600}" \
    "$NODE_BIN" scripts/testing/with-midao-local-supabase.mjs "$MODE" "$@" 2>&1 | tee "$LOG_DIR/$LOG_NAME"
  pipeline_status=("${PIPESTATUS[@]}")
  set -e
  if ((pipeline_status[0] != 0)); then exit "${pipeline_status[0]}"; fi
  exit "${pipeline_status[1]}"
fi
exec "$NODE_BIN" scripts/testing/with-midao-local-supabase.mjs "$MODE" "$@"
