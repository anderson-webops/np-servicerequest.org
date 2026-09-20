#!/usr/bin/env bash
# Package already validated, compiled exact source away from the production host.
set -euo pipefail
root=$(cd -- "$(dirname -- "$0")/.." && pwd)
cd -- "$root"
test "$(uname -s)" = Linux
test "$(uname -m)" = aarch64
test "$(node --version)" = v24.18.1
test "$(npm --version)" = 12.0.2
test -z "$(git status --porcelain)"
commit=$(git rev-parse HEAD)
output=$(realpath "${1:?Pass an empty output directory under .ai-work/runs}")
case "$output/" in "$root/.ai-work/runs/"*) ;; *) echo 'Output must be owned repository scratch' >&2; exit 1;; esac
test -z "$(find "$output" -mindepth 1 -maxdepth 1 -print -quit)"
stage="$output/stage"
mkdir -p "$stage/back-end" "$stage/front-end/.output"
export SOURCE_REVISION="$commit"
export SOURCE_DATE_EPOCH
SOURCE_DATE_EPOCH=$(git show -s --format=%ct HEAD)
export NP_RELEASE_VERSION
NP_RELEASE_VERSION=$(node -p 'require("./package.json").version')
node scripts/write-release-metadata.mjs
cp package.json package-lock.json .np-servicerequest-release-prepared.json "$stage/"
cp back-end/package.json "$stage/back-end/"
cp front-end/package.json "$stage/front-end/"
cp -R front-end/.output/public "$stage/front-end/.output/"
python3 -B - "$root" "$stage" <<'PY'
import json
from pathlib import Path
import shutil
import sys

source = Path(sys.argv[1])
stage = Path(sys.argv[2])
contract = json.loads((source / "deploy/runtime-artifact.json").read_text())
for name in contract["required"]:
    if not name.startswith("back-end/dist/"):
        continue
    origin = source / name
    if not origin.is_file():
        raise SystemExit(f"Missing compiled runtime module: {name}")
    destination = stage / name
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(origin, destination)
PY
npm ci --prefix "$stage" --workspace back-end --omit=dev --include=optional --ignore-scripts --no-fund --no-audit
npm audit --prefix "$stage" --workspace back-end --omit=dev --audit-level=low
npm audit signatures --prefix "$stage"
npm ls --prefix "$stage" --workspace back-end --omit=dev --all > "$output/dependency-tree.txt"
# This reviewed JS-only runtime has no executable dependency bins. The verifier
# rejects any other symlinks; it never follows links into a source checkout.
rm -f -- "$stage/node_modules/back-end" "$stage/node_modules/front-end"
if [[ -d "$stage/node_modules/.bin" ]]; then
  find "$stage/node_modules/.bin" -depth -delete
fi
archive="$output/np-servicerequest-org-v$NP_RELEASE_VERSION-${commit:0:12}-linux-arm64.tar.gz"
python3 -B scripts/runtime-artifact.py pack "$stage" --archive "$archive" --commit "$commit" > "$output/pack.json"
sha=$(sha256sum "$archive" | cut -d ' ' -f 1)
printf '%s  %s\n' "$sha" "$(basename "$archive")" > "$output/SHA256SUMS"
cp "$stage/runtime-manifest.json" "$output/runtime-manifest.json"
mkdir "$output/unpacked"
python3 -B scripts/runtime-artifact.py unpack "$output/unpacked" --archive "$archive" --sha256 "$sha" --commit "$commit"
bash scripts/test-unpacked-artifact.sh "$output/unpacked"
cp -R "$output/unpacked" "$output/copied"
python3 -B scripts/runtime-artifact.py verify "$output/copied" --archive "$archive" --sha256 "$sha" --commit "$commit"
bash scripts/test-unpacked-artifact.sh "$output/copied"
rm -- "$output/copied/back-end/dist/data.js"
if python3 -B scripts/runtime-artifact.py verify "$output/copied" --archive "$archive" --sha256 "$sha" --commit "$commit"; then
  echo 'Missing runtime module was incorrectly accepted' >&2
  exit 1
fi
bash scripts/test-unpacked-artifact.sh "$output/copied" missing-module
python3 -B - "$output" <<'PY'
import datetime
import hashlib
import json
from pathlib import Path
import sys
output = Path(sys.argv[1])
receipt = json.loads((output / "pack.json").read_text())
receipt["acceptedAt"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
receipt["bytes"] = (output / receipt["archive"]).stat().st_size
receipt["checks"] = ["production-only locked install", "full and production backend audits", "registry signatures", "manifest and required paths", "isolated unpacked runtime", "readiness failure and recovery", "GET and HEAD minimal probes", "repeated-signal drain", "restart", "post-copier verification", "missing-module rejection"]
receipt["harnessSha256"] = {
    name: hashlib.sha256(Path(name).read_bytes()).hexdigest()
    for name in ["deploy/runtime-artifact.json", "scripts/runtime-artifact.py", "scripts/package-runtime.sh", "scripts/test-unpacked-artifact.sh", "scripts/backend-runtime-smoke.mjs", "scripts/post-deploy-smoke.mjs", "scripts/artifact-acceptance/runtime.mjs", "scripts/write-release-metadata.mjs", "deploy/systemd/install-service.sh", "deploy/systemd/promote-release.sh", "deploy/systemd/trusted-paths.py", "scripts/test-promotion-recovery.py", "scripts/test-promotion-recovery.sh", "scripts/test-bootstrap-in-vm.py"]
}
(output / "acceptance.json").write_text(json.dumps(receipt, indent=2) + "\n")
PY
echo "Exact unpacked production artifact accepted: $archive"
