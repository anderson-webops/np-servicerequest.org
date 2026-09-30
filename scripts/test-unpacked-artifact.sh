#!/usr/bin/env bash
set -euo pipefail
artifact=$(realpath "${1:?Pass exact unpacked artifact}")
case_name=${2:-complete}
[[ "$case_name" == complete || "$case_name" == missing-module ]]
script_dir=$(cd -- "$(dirname -- "$0")" && pwd)
node=$(realpath "$(command -v node)")
test "$(id -u)" -ne 0
test "$(uname -s)" = Linux
test "$(uname -m)" = aarch64
test "$(node --version)" = v24.18.1
if [[ "$case_name" == complete ]]; then
  python3 -B "$script_dir/runtime-artifact.py" verify "$artifact"
fi
bwrap_command=(/usr/bin/bwrap)
sandbox_artifact="$artifact"
harness_dir="$script_dir"
if [[ "${NP_TEST_PRIVILEGED_BWRAP:-}" == 1 ]]; then
  bwrap_command=(sudo -n /usr/bin/bwrap)
  test -z "$(find "$artifact" -type l -print -quit)"
  temporary_source="$(mktemp -d /tmp/np-artifact-test.XXXXXXXX)"
  trap 'find "$temporary_source" -depth -delete' EXIT
  cp -R "$artifact" "$temporary_source/app"
  mkdir "$temporary_source/harness"
  cp "$script_dir/artifact-acceptance/runtime.mjs" "$script_dir/backend-runtime-smoke.mjs" "$script_dir/post-deploy-smoke.mjs" "$temporary_source/harness/"
  chmod 0755 "$temporary_source"
  chmod -R a+rX "$temporary_source/app" "$temporary_source/harness"
  diff -qr "$artifact" "$temporary_source/app" >/dev/null
  for harness_name in runtime.mjs backend-runtime-smoke.mjs post-deploy-smoke.mjs; do
    if [[ "$harness_name" == runtime.mjs ]]; then
      cmp "$script_dir/artifact-acceptance/$harness_name" "$temporary_source/harness/$harness_name"
    else
      cmp "$script_dir/$harness_name" "$temporary_source/harness/$harness_name"
    fi
  done
  sandbox_artifact="$temporary_source/app"
  harness_dir="$temporary_source/harness"
  if [[ "$case_name" == complete ]]; then
    python3 -B "$script_dir/runtime-artifact.py" verify "$sandbox_artifact"
  fi
fi
timeout -k 5 90 "${bwrap_command[@]}" --unshare-all --die-with-parent --new-session \
  --ro-bind /usr /usr --symlink usr/bin /bin --symlink usr/lib /lib \
  --ro-bind "$node" /runtime/node --proc /proc --dev /dev --tmpfs /tmp \
  --ro-bind "$sandbox_artifact" /app \
  --ro-bind "$harness_dir/runtime.mjs" /harness/runtime.mjs \
  --ro-bind "$harness_dir/backend-runtime-smoke.mjs" /harness/backend-runtime-smoke.mjs \
  --ro-bind "$harness_dir/post-deploy-smoke.mjs" /harness/post-deploy-smoke.mjs \
  --clearenv --setenv PATH /runtime:/usr/bin:/bin --setenv HOME /tmp \
  --chdir /app /runtime/node /harness/runtime.mjs "$case_name"
if [[ "$case_name" == complete ]]; then
  python3 -B "$script_dir/runtime-artifact.py" verify "$artifact"
fi
