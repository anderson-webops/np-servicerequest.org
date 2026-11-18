#!/usr/bin/env bash
set -euo pipefail
root=$(cd -- "$(dirname -- "$0")/.." && pwd)
output=$(realpath "${1:?Pass the current artifact qualification directory}")
case "$output/" in "$root/.ai-work/runs/"*) ;; *) echo 'Retained runtime evidence must remain in owning repository scratch.' >&2; exit 1;; esac
test "$(id -u)" -ne 0
test "$(uname -s)" = Linux
test "$(uname -m)" = aarch64
test "$(node --version)" = v26.13.1
commit=f451bc863b34d1e429c3454f7732e8a1305b9393
sha=e0ab310c949488528936ab3d0de291ff629934adc29aed5dfcacba14583ba4d8
archive_name=np-servicerequest-org-v1.3.9-f451bc863b34-linux-arm64.tar.gz
prior="$output/retained-v1.3.9"
mkdir -m 700 "$prior" "$prior/source" "$prior/runtime"
git -C "$root" archive "$commit" scripts/runtime-artifact.py deploy/runtime-artifact.json | tar -x -C "$prior/source"
printf '%s  %s\n' \
  1f09889e7cd33bd73b5eca804faf5450ef84faee780364567132253da9a4b2d6 "$prior/source/scripts/runtime-artifact.py" \
  6c11f0cb060f375187da69a956509d558842632edfae9ba3a628826d60803eff "$prior/source/deploy/runtime-artifact.json" | sha256sum --check
curl --fail --location --proto '=https' --proto-redir '=https' \
  --retry 2 --connect-timeout 15 --max-time 120 \
  "https://github.com/anderson-webops/np-servicerequest.org/releases/download/v1.3.9/$archive_name" \
  --output "$prior/$archive_name"
python3 -B "$prior/source/scripts/runtime-artifact.py" unpack "$prior/runtime" \
  --archive "$prior/$archive_name" --sha256 "$sha" --commit "$commit"
bash "$root/scripts/test-unpacked-artifact.sh" "$prior/runtime" retained-v1.3.9
python3 -B "$prior/source/scripts/runtime-artifact.py" verify "$prior/runtime" \
  --archive "$prior/$archive_name" --sha256 "$sha" --commit "$commit"
