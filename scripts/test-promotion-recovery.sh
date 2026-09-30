#!/usr/bin/env bash
set -euo pipefail
root=$(cd -- "$(dirname -- "$0")/.." && pwd)
node=$(realpath "$(command -v node)")
test "$(uname -s)" = Linux
test "$(id -u)" -ne 0
test "$(node --version)" = v24.18.1
bwrap_command=(/usr/bin/bwrap)
if [[ "${PROMOTION_TEST_PRIVILEGED_BWRAP:-}" == 1 ]]; then
  bwrap_command=(sudo -n /usr/bin/bwrap)
fi
timeout -k 5 120 "${bwrap_command[@]}" --unshare-all --die-with-parent --new-session --uid 0 --gid 0 \
  --ro-bind /usr /usr --symlink usr/bin /bin --symlink usr/lib /lib \
  --tmpfs /usr/local --ro-bind "$node" /runtime/node --proc /proc --dev /dev --tmpfs /tmp \
  --ro-bind "$root/deploy" /source/deploy --ro-bind "$root/scripts" /source/scripts \
  --clearenv --setenv PATH /runtime:/usr/bin:/bin --setenv HOME /tmp \
  --chdir /tmp /usr/bin/python3 -B /source/scripts/test-promotion-recovery.py "${1:-all}"
