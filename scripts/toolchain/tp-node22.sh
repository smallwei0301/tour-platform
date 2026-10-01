#!/usr/bin/env bash
# Canonical command entry point for formal Tour Platform test evidence.
set -euo pipefail

readonly TOOLCHAIN_ROOT="${TP_NODE22_ROOT:-/root/.hermes/toolchains/node/22.23.1}"
readonly EXPECTED_VERSION='v22.23.1'

fail() {
  echo "tp-node22 preflight failed: $*" >&2
  exit 1
}

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

node_bin="$canonical_root/bin/node"
npm_bin="$canonical_root/bin/npm"
npx_bin="$canonical_root/bin/npx"
for binary in "$node_bin" "$npm_bin" "$npx_bin"; do
  resolved=$(realpath -e "$binary") || fail "missing binary: $binary"
  [[ "$resolved" == "$canonical_root/"* && -x "$binary" ]] || fail "binary escapes the canonical toolchain or is not executable: $binary"
done

PATH="$canonical_root/bin:$PATH"
export PATH
[[ "$($node_bin --version)" == "$EXPECTED_VERSION" ]] || fail "expected $EXPECTED_VERSION"
"$npm_bin" --version >/dev/null || fail 'npm is not executable'
"$npx_bin" --version >/dev/null || fail 'npx is not executable'
[[ "$($node_bin -p 'process.execPath')" == "$node_bin" ]] || fail 'node process.execPath is not canonical'

case "${1:-}" in
  --check)
    [[ $# -eq 1 ]] || fail '--check accepts no command'
    ;;
  --)
    shift
    [[ $# -ge 1 ]] || fail 'missing command after --'
    case "$1" in
      node)
        exec "$@"
        ;;
      npm)
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
