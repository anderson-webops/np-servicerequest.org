#!/usr/bin/env bash
set -euo pipefail

PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export PATH

release_root="${RELEASE_ROOT:-/srv/np-servicerequest.org/releases}"
current_link="${CURRENT_LINK:-/srv/np-servicerequest.org/current}"
service_name="${SERVICE_NAME:-np-servicerequest.service}"
api_health_url="${API_HEALTH_URL:-http://127.0.0.1:3006/api/health}"
api_ready_url="${API_READY_URL:-http://127.0.0.1:3006/api/readyz}"
site_origin="${SITE_ORIGIN:-https://np-servicerequest.org}"
site_resolve_ipv4="${SITE_RESOLVE_IPV4:-np-servicerequest.org:443:127.0.0.1}"
site_resolve_ipv6="${SITE_RESOLVE_IPV6:-np-servicerequest.org:443:[::1]}"

if [[ $# -ne 1 ]]; then
	echo "Usage: promote-release.sh /srv/np-servicerequest.org/releases/<prepared-release>" >&2
	exit 2
fi
if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
	echo "Run promotion with root privileges." >&2
	exit 1
fi

release_root_real="$(cd -- "$release_root" && pwd -P)"
candidate="$(cd -- "$1" && pwd -P)"
case "$candidate/" in
	"$release_root_real/"*) ;;
	*) echo "Candidate must resolve beneath $release_root_real: $candidate" >&2; exit 1 ;;
esac
if [[ "$candidate" == "$release_root_real" ]]; then
	echo "Candidate must be a prepared release beneath, not equal to, $release_root_real." >&2
	exit 1
fi

for required_file in \
	back-end/dist/server.js \
	front-end/.output/public/index.html \
	front-end/.output/public/release.json \
	.np-servicerequest-release-prepared.json; do
	if [[ ! -f "$candidate/$required_file" ]]; then
		echo "Prepared release is missing $required_file." >&2
		exit 1
	fi
done
if ! cmp -s "$candidate/front-end/.output/public/release.json" "$candidate/.np-servicerequest-release-prepared.json"; then
	echo "Prepared release metadata does not match the public release identity." >&2
	exit 1
fi
if [[ -e "$current_link" && ! -L "$current_link" ]]; then
	echo "Refusing to replace non-symlink deployment path: $current_link" >&2
	exit 1
fi

previous_target="$(readlink -f -- "$current_link" 2>/dev/null || true)"
if [[ -n "$previous_target" ]]; then
	case "$previous_target/" in
		"$release_root_real/"*) ;;
		*) echo "Existing deployment target is outside $release_root_real: $previous_target" >&2; exit 1 ;;
	esac
	if [[ "$previous_target" == "$release_root_real" ]]; then
		echo "Existing deployment target must be a release beneath $release_root_real." >&2
		exit 1
	fi
fi
next_link="${current_link}.next.$$"
response_api="$(mktemp)"
response_ipv4="$(mktemp)"
response_ipv6="$(mktemp)"
headers_ipv4="$(mktemp)"
headers_ipv6="$(mktemp)"
cleanup() {
	if [[ -L "$next_link" ]]; then unlink -- "$next_link"; fi
	rm -f -- "$response_api" "$response_ipv4" "$response_ipv6" "$headers_ipv4" "$headers_ipv6"
}
trap cleanup EXIT

activate_target() {
	local target="$1"
	ln -s -- "$target" "$next_link"
	mv -Tf -- "$next_link" "$current_link"
}

identity_matches() {
	local expected="$1"
	local actual="$2"
	/usr/bin/node -e '
const fs = require("node:fs")
const expected = JSON.parse(fs.readFileSync(process.argv[1], "utf8"))
const actual = JSON.parse(fs.readFileSync(process.argv[2], "utf8"))
if (expected.revision !== actual.revision || expected.version !== actual.version) process.exit(1)
' "$expected" "$actual"
}

wait_for_target() {
	local target="$1"
	local attempt
	local missing_ipv4
	local missing_ipv6
	for attempt in {1..30}; do
		if curl --noproxy '*' --fail --silent --show-error --max-time 5 "$api_ready_url" --output "$response_api" \
			&& grep -Eq '"status"[[:space:]]*:[[:space:]]*"ready"' "$response_api" \
			&& identity_matches "$target/front-end/.output/public/release.json" "$response_api" \
			&& curl --noproxy '*' --fail --silent --show-error --max-time 5 "$api_health_url" --output "$response_api" \
			&& identity_matches "$target/front-end/.output/public/release.json" "$response_api" \
			&& curl --noproxy '*' --ipv4 --fail --silent --show-error --max-time 5 \
				--resolve "$site_resolve_ipv4" "$site_origin/release.json" --output "$response_ipv4" \
			&& curl --noproxy '*' --ipv6 --fail --silent --show-error --max-time 5 \
				--resolve "$site_resolve_ipv6" "$site_origin/release.json" --output "$response_ipv6" \
			&& cmp -s "$target/front-end/.output/public/release.json" "$response_ipv4" \
			&& cmp -s "$target/front-end/.output/public/release.json" "$response_ipv6" \
			&& curl --noproxy '*' --ipv4 --fail --silent --show-error --max-time 5 \
				--resolve "$site_resolve_ipv4" --dump-header "$headers_ipv4" "$site_origin/" --output /dev/null \
			&& curl --noproxy '*' --ipv6 --fail --silent --show-error --max-time 5 \
				--resolve "$site_resolve_ipv6" --dump-header "$headers_ipv6" "$site_origin/" --output /dev/null \
			&& grep -Eiq '^Content-Security-Policy:.*script-src[^;]*sha256-' "$headers_ipv4" \
			&& grep -Eiq '^Content-Security-Policy:.*script-src[^;]*sha256-' "$headers_ipv6" \
			&& ! grep -Eiq '^Content-Security-Policy:.*script-src[^;]*unsafe-inline' "$headers_ipv4" \
			&& ! grep -Eiq '^Content-Security-Policy:.*script-src[^;]*unsafe-inline' "$headers_ipv6"; then
			missing_ipv4="$(curl --noproxy '*' --ipv4 --silent --show-error --max-time 5 \
				--resolve "$site_resolve_ipv4" --output /dev/null --write-out '%{http_code}' "$site_origin/api/not-public")"
			missing_ipv6="$(curl --noproxy '*' --ipv6 --silent --show-error --max-time 5 \
				--resolve "$site_resolve_ipv6" --output /dev/null --write-out '%{http_code}' "$site_origin/api/not-public")"
			if [[ "$missing_ipv4" == "404" && "$missing_ipv6" == "404" ]]; then
				return 0
			fi
		fi
		sleep 1
	done
	return 1
}

activate_target "$candidate"
if nginx -t && systemctl restart "$service_name" && systemctl reload nginx && wait_for_target "$candidate"; then
	echo "Promoted $candidate and verified storage readiness plus exact IPv4/IPv6 source identity."
	exit 0
fi

echo "Candidate health failed; restoring the previous release." >&2
if [[ -n "$previous_target" ]]; then
	activate_target "$previous_target"
	systemctl restart "$service_name"
	nginx -t && systemctl reload nginx
	if ! wait_for_target "$previous_target"; then
		echo "The previous release was restored but did not pass readiness and identity checks." >&2
	fi
else
	unlink -- "$current_link"
	systemctl stop "$service_name"
	nginx -t && systemctl reload nginx
fi
exit 1
