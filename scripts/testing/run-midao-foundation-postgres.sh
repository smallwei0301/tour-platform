#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

NODE_BIN="${NODE22_BIN:-$(command -v node)}"
if [[ ! -x "$NODE_BIN" ]]; then
  printf 'Node executable is unavailable\n' >&2
  exit 1
fi

if (($# == 0)); then
  set -- \
    apps/web/tests/integration/midao-foundation-schema-postgres.test.mjs \
    apps/web/tests/integration/midao-mode-switch-postgres.test.mjs \
    apps/web/tests/integration/midao-mode-switch-concurrency-postgres.test.mjs
fi

exec "$NODE_BIN" scripts/testing/with-midao-local-supabase.mjs "$@"
