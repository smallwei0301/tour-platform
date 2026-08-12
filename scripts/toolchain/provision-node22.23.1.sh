#!/usr/bin/env bash
# Operator-only: rebuild the approved Node 22.23.1 artifact atomically.
set -euo pipefail

readonly VERSION='22.23.1'
readonly ARCHIVE="node-v${VERSION}-linux-x64.tar.xz"
readonly URL="https://nodejs.org/dist/v${VERSION}/${ARCHIVE}"
readonly EXPECTED_SHA256='9749e988f437343b7fa832c69ded82a312e41a03116d766797ac14f6f9eee578'
readonly TOOLCHAIN_ROOT='/root/.hermes/toolchains/node/22.23.1'
readonly TOOLCHAIN_PARENT='/root/.hermes/toolchains/node'

fail() {
  echo "node22 provision failed: $*" >&2
  exit 1
}

[[ "${1:-}" == '--operator-approved' && $# -eq 1 ]] || {
  echo "usage: $0 --operator-approved" >&2
  exit 2
}

mkdir -p "$TOOLCHAIN_PARENT"
[[ "$(realpath -e "$TOOLCHAIN_PARENT")" == "$TOOLCHAIN_PARENT" ]] || fail 'toolchain parent is not canonical'

stage=$(mktemp -d "$TOOLCHAIN_PARENT/.node-v${VERSION}.staging.XXXXXX")
backup=''
backup_moved=0
installed=0
cleanup() {
  local status=$?
  local failed=''
  if (( status != 0 && installed == 1 )); then
    failed="${TOOLCHAIN_ROOT}.failed.$(date -u +%Y%m%dT%H%M%SZ)"
    mv "$TOOLCHAIN_ROOT" "$failed" || true
  fi
  if (( status != 0 && backup_moved == 1 )) && [[ ! -e "$TOOLCHAIN_ROOT" && -e "$backup" ]]; then
    mv "$backup" "$TOOLCHAIN_ROOT" || true
    if [[ -n "$failed" ]]; then
      echo "restored previous toolchain; failed artifact retained at $failed" >&2
    else
      echo 'restored previous toolchain after replacement failure' >&2
    fi
  fi
  rm -rf "$stage"
  exit "$status"
}
trap cleanup EXIT

archive_path="$stage/$ARCHIVE"
curl --fail --location --proto '=https' --tlsv1.2 --output "$archive_path" "$URL"
printf '%s  %s\n' "$EXPECTED_SHA256" "$archive_path" | sha256sum --check --status || fail 'SHA-256 mismatch'
tar -xJf "$archive_path" -C "$stage"
prepared="$stage/node-v${VERSION}-linux-x64"

for required in bin/node bin/npm bin/npx lib/node_modules/npm; do
  [[ -e "$prepared/$required" ]] || fail "archive is missing $required"
done
for executable in bin/node bin/npm bin/npx; do
  [[ -x "$prepared/$executable" ]] || fail "archive executable is missing $executable"
done

[[ -e "$TOOLCHAIN_ROOT" ]] || fail "expected existing toolchain root is missing: $TOOLCHAIN_ROOT"
backup="${TOOLCHAIN_ROOT}.backup.$(date -u +%Y%m%dT%H%M%SZ)"
mv "$TOOLCHAIN_ROOT" "$backup"
backup_moved=1
mv "$prepared" "$TOOLCHAIN_ROOT"
installed=1

canonical_root=$(realpath -e "$TOOLCHAIN_ROOT") || fail 'installed root is not resolvable'
[[ "$canonical_root" == "$TOOLCHAIN_ROOT" ]] || fail 'installed root is not canonical'
PATH="$canonical_root/bin:$PATH"
[[ "$($canonical_root/bin/node --version)" == "v$VERSION" ]] || fail 'node version self-check failed'
"$canonical_root/bin/npm" --version >/dev/null || fail 'npm self-check failed'
"$canonical_root/bin/npx" --version >/dev/null || fail 'npx self-check failed'
[[ "$($canonical_root/bin/node -p 'process.execPath')" == "$canonical_root/bin/node" ]] || fail 'node execPath self-check failed'

installed=0
backup_moved=0
echo "Node $VERSION provisioned at $TOOLCHAIN_ROOT"
echo "previous artifact retained at $backup"
