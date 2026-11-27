#!/usr/bin/env bash
set -euo pipefail
umask 022

version=26.13.1
test "$(cat .node-version)" = "$version"
test "${NODE_VERSION:-$version}" = "$version"

case "$(uname -m)" in
  x86_64)
    architecture=x64
    digest=5c063e46bab0fbc1c17cc445d7ff129cbdcd0471be6ed83b6ab864f8143bc864
    ;;
  aarch64)
    architecture=arm64
    digest=89e1853138db51e8b82d3e98ba9c0d3f2956a28e5e55ea1b7e12d25aae92d5dd
    ;;
  *) exit 1 ;;
esac

stage="$(mktemp -d "$RUNNER_TEMP/np-node.XXXXXX")"
distribution="node-v$version-linux-$architecture"
archive="$stage/$distribution.tar.xz"
curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' \
  --retry 3 --max-time 90 --output "$archive" "https://nodejs.org/dist/v$version/$distribution.tar.xz"
printf '%s  %s\n' "$digest" "$archive" | sha256sum --check --strict
tar -xJf "$archive" -C "$stage" --no-same-owner --no-same-permissions
test "$("$stage/$distribution/bin/node" --version)" = "v$version"
printf '%s\n' "$stage/$distribution/bin" >> "$GITHUB_PATH"
