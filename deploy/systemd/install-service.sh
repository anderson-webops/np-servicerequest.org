#!/usr/bin/env bash
set -euo pipefail

PATH=/usr/sbin:/usr/bin:/sbin:/bin
export PATH

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
unit_dest="${UNIT_DEST:-/etc/systemd/system/np-servicerequest.service}"
env_dest="${ENV_DEST:-/etc/np-servicerequest/service.env}"
dry_run=false
force_env=false

usage() {
	cat <<'USAGE'
Install the direct np-servicerequest.org service without starting it.

Usage: install-service.sh [--dry-run] [--force-env]

  --dry-run    Print commands without changing the host.
  --force-env  Replace the target env file with the fail-closed example.
USAGE
}

while [[ $# -gt 0 ]]; do
	case "$1" in
		--dry-run) dry_run=true ;;
		--force-env) force_env=true ;;
		-h|--help) usage; exit 0 ;;
		*) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
	esac
	shift
done

run() {
	if [[ "$dry_run" == true ]]; then
		printf ' %q' "$@"
		printf '\n'
		return 0
	fi
	"$@"
}

if [[ "$dry_run" == false ]]; then
	if [[ ! -x /usr/bin/node || "$(/usr/bin/node --version)" != "v24.18.1" ]]; then
		echo "The systemd runtime requires Node 24.18.1 at /usr/bin/node." >&2
		exit 1
	fi
	if ! id np-servicerequest >/dev/null 2>&1; then
		echo "Create the unprivileged np-servicerequest service account before installing the unit." >&2
		exit 1
	fi
fi

run install -D -m 0644 "$script_dir/np-servicerequest.service" "$unit_dest"
if [[ "$force_env" == true || ! -e "$env_dest" ]]; then
	run install -D -m 0600 "$script_dir/np-servicerequest.env.example" "$env_dest"
else
	echo "Keeping existing $env_dest. Use --force-env only when replacing it intentionally."
fi
run systemctl daemon-reload
echo "Review $env_dest, install the Nginx virtual server, then prepare and promote a release."
