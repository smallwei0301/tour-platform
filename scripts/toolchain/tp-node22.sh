#!/bin/bash -p
# Canonical command entry point for formal Tour Platform test evidence.
set -euo pipefail

readonly TOOLCHAIN_ROOT="${TP_NODE22_ROOT:-/root/.hermes/toolchains/node/22.23.1}"
readonly EXPECTED_VERSION='v22.23.1'

fail() {
  echo "tp-node22 preflight failed: $*" >&2
  exit 1
}

# New E2E lane does not let caller environment affect even runtime self-checks.
gate_env=()
if [[ "${1:-}" == '--preflight-e2e' ]] || [[ "${3:-}" == 'run' && "${4:-}" == 'test:e2e' ]]; then
  PATH=/usr/bin:/bin
  export PATH
  gate_env=(/usr/bin/env -i PATH=/usr/bin:/bin)
fi

canonical_root=$(realpath -e "$TOOLCHAIN_ROOT") || fail 'toolchain root is missing or unresolved'
[[ "$canonical_root" == "$TOOLCHAIN_ROOT" ]] || fail 'toolchain root must be canonical'

# Workspace runtimes must match the complete, SHA-256-verified official archive.
if [[ -n "${TP_NODE22_ROOT:-}" ]]; then
  files_digest=$(cd "$canonical_root" && find . -type f -print0 | LC_ALL=C sort -z | xargs -0 sha256sum | sha256sum)
  [[ "$files_digest" == '131970ec4f7c58ab6fbfa9b2e736ccf49f712cb848573899748fb1aedd24fde0  -' ]] || fail 'official artifact file digest mismatch'
  links_digest=$(cd "$canonical_root" && find . -type l -printf '%p -> %l\n' | LC_ALL=C sort | sha256sum)
  [[ "$links_digest" == '6136804478f49c729e9d04a8dd120c1504d0ecf8a75a80341f0981dd88917efc  -' ]] || fail 'official artifact symlink digest mismatch'
  while IFS= read -r -d '' link; do
    resolved=$(realpath -e "$link") || fail 'unresolved artifact symlink'
    [[ "$resolved" == "$canonical_root/"* ]] || fail 'artifact symlink escapes toolchain'
  done < <(find "$canonical_root" -type l -print0)
fi

if (( ${#gate_env[@]} )); then gate_env=(/usr/bin/env -i PATH="$canonical_root/bin:/usr/bin:/bin"); fi

node_bin="$canonical_root/bin/node"
npm_bin="$canonical_root/bin/npm"
npx_bin="$canonical_root/bin/npx"
for binary in "$node_bin" "$npm_bin" "$npx_bin"; do
  resolved=$(realpath -e "$binary") || fail "missing binary: $binary"
  [[ "$resolved" == "$canonical_root/"* && -x "$binary" ]] || fail "binary escapes the canonical toolchain or is not executable: $binary"
done

PATH="$canonical_root/bin:$PATH"
export PATH
[[ "$("${gate_env[@]}" "$node_bin" --version)" == "$EXPECTED_VERSION" ]] || fail "expected $EXPECTED_VERSION"
"${gate_env[@]}" "$npm_bin" --version >/dev/null || fail 'npm is not executable'
"${gate_env[@]}" "$npx_bin" --version >/dev/null || fail 'npx is not executable'
[[ "$("${gate_env[@]}" "$node_bin" -p 'process.execPath')" == "$node_bin" ]] || fail 'node process.execPath is not canonical'

validate_e2e() {
  [[ $# -eq 7 && "$1" == npm && "$2" == run && "$3" == test:e2e &&
    "$4" == -w && "$5" == @tour/web && "$6" == -- &&
    "$7" == e2e/issue1882-upcoming-schedules.spec.ts ]] || fail 'unsupported E2E command'
  repo_root=$(realpath -e "$(dirname "${BASH_SOURCE[0]}")/../..") || fail 'missing repository'
  [[ "$(pwd -P)" == "$repo_root" ]] || fail 'E2E requires repository root cwd'
  e2e_dir="$repo_root/apps/web/e2e"
  [[ "$(realpath -e "$e2e_dir")" == "$e2e_dir" ]] || fail 'noncanonical E2E directory'
  for reviewed in apps/web/e2e/issue1882-upcoming-schedules.spec.ts apps/web/playwright.config.ts package.json apps/web/package.json; do
    lexical="$repo_root/$reviewed"
    [[ -f "$lexical" && "$(realpath -e "$lexical")" == "$lexical" ]] || fail 'missing or noncanonical reviewed file'
  done
  [[ "$(sha256sum "$e2e_dir/issue1882-upcoming-schedules.spec.ts" | cut -d ' ' -f 1)" == 973f5c390e1b566cb66f1eb9243379b0e5dfa953a1a739fb31d1dc94d43832de ]] || fail 'reviewed spec digest mismatch'
  [[ "$(sha256sum "$repo_root/apps/web/playwright.config.ts" | cut -d ' ' -f 1)" == 5ed491b3fb5575672a98ac4e20d9cc235a8883e9f1c11cc33bc03157b3e9eba5 ]] || fail 'reviewed config digest mismatch'
  for directory in "$repo_root" "$repo_root/apps" "$repo_root/apps/web"; do
    [[ ! -e "$directory/.npmrc" && ! -L "$directory/.npmrc" ]] || fail 'repository npmrc forbidden'
  done
  /usr/bin/env -i PATH="$canonical_root/bin:/usr/bin:/bin" "$node_bin" --input-type=module - "$repo_root" <<'JS' || fail 'E2E package contract rejected'
import { readFileSync } from 'node:fs';
const root = JSON.parse(readFileSync(`${process.argv[2]}/package.json`, 'utf8'));
const app = JSON.parse(readFileSync(`${process.argv[2]}/apps/web/package.json`, 'utf8'));
if (root.name !== 'tour-platform' || JSON.stringify(root.workspaces) !== '["apps/*"]' ||
    app.name !== '@tour/web' || app.scripts?.['test:e2e'] !== 'playwright test' ||
    [root, app].some(p => Object.keys(p.scripts || {}).some(k => /^(?:(?:pre|post)test:e2e|pre|post)$/.test(k)))) process.exit(1);
JS
  [[ -x /usr/bin/chromium && "$(realpath -e /usr/bin/chromium)" == /usr/bin/chromium ]] || fail 'canonical local Chromium required'
}

prepare_e2e_environment() {
  cache=$(mktemp -d /tmp/tp-node22-e2e.XXXXXXXX) || fail 'cannot create owned npm cache'
  trap 'rm -rf -- "$cache"' EXIT
  user_config="$cache/user.npmrc"
  global_config="$cache/global.npmrc"
  : > "$user_config"
  : > "$global_config"
  [[ "$user_config" != "$global_config" && -f "$user_config" && -f "$global_config" &&
    ! -s "$user_config" && ! -s "$global_config" &&
    "$(realpath -e "$user_config")" == "$user_config" &&
    "$(realpath -e "$global_config")" == "$global_config" ]] || fail 'distinct owned empty npm configs required'
  # Shared fixed child environment: no caller secrets, npm config, NODE_OPTIONS or custom shell.
  e2e_env=(/usr/bin/env -i PATH="$canonical_root/bin:/usr/bin:/bin"
    PLAYWRIGHT_NO_WEBSERVER=1 PW_EXECUTABLE_PATH=/usr/bin/chromium
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 NEXT_TELEMETRY_DISABLED=1
    npm_config_offline=true npm_config_audit=false npm_config_fund=false
    npm_config_update_notifier=false npm_config_yes=false npm_config_ignore_scripts=true
    npm_config_userconfig="$user_config" npm_config_globalconfig="$global_config"
    npm_config_cache="$cache" npm_config_script_shell=/bin/sh)
  # Exercise actual npm startup/config parsing with the very same env used for E2E.
  "${e2e_env[@]}" "$npm_bin" --version >/dev/null || fail 'sanitized E2E npm startup rejected'
}

preflight_e2e=0
if [[ "${1:-}" == '--preflight-e2e' ]]; then
  preflight_e2e=1
  shift
  [[ "${1:-}" == -- ]] || fail 'preflight E2E requires -- and exact command'
fi

case "${1:-}" in
  --check)
    [[ $# -eq 1 ]] || fail '--check accepts no command'
    ;;
  --)
    shift
    [[ $# -ge 1 ]] || fail 'missing command after --'
    if (( preflight_e2e )); then validate_e2e "$@"; fi
    case "$1" in
      node)
        exec "$@"
        ;;
      npm)
        if (( preflight_e2e )) || [[ "${3:-}" == test:e2e ]]; then
          validate_e2e "$@"
          prepare_e2e_environment
          if (( preflight_e2e )); then
            echo 'tp-node22 E2E preflight passed (no E2E execution; sanitized environment; distinct empty npm configs; npm startup verified)'
            exit 0
          fi
          "${e2e_env[@]}" "$npm_bin" "${@:2}"
          exit $?
        fi
        if [[ $# -eq 2 && ( "$2" == '--version' || "$2" == 'test' ) ]] ||
          [[ $# -eq 3 && "$2" == 'run' && "$3" == 'typecheck' ]]; then
          exec "$@"
        fi
        fail 'unsupported npm/npx command'
        ;;
      npx)
        [[ $# -eq 2 && "$2" == '--version' ]] || fail 'unsupported npm/npx command'
        exec "$@"
        ;;
      *) fail "unsupported command: $1" ;;
    esac
    ;;
  *)
    fail 'usage: tp-node22.sh --check | -- <node|npm|npx command...>'
    ;;
esac
