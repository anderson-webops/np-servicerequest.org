# Security and backend workflow audit — 2026-07-29

> Follow-up, 2026-08-02: the application controls described below remain
> relevant, but the production-container path and email-selected role workflow
> have been retired. The current direct systemd/Nginx deployment, account-UUID
> role transition, role-epoch session invalidation, and validation evidence are
> recorded in `security-backend-workflow-audit-2026-08-02.md`. Container
> references below are retained only as dated evidence of the earlier release.

## Scope and method

This review covered registration, login, session lifecycle, public and
administrative authorization, account promotion and demotion, moderation,
management links, submissions, notifications, external service-directory
syncing, file storage, build and container boundaries, dependencies, and release
workflows. It included source review, regression tests, clean locked installs,
development and production dependency audits, type and lint checks, application
tests, generated-site and accessibility checks, browser workflows, local
production-runtime checks, and source secret/vulnerability scans.

This report records source readiness. Public deployment identity is verified
separately and is not implied by a passing source audit.

## Findings remediated

### Critical — account self-promotion from an unverified email address

Registration formerly made an account an administrator when the user-supplied
email matched `BOARD_ADMIN_EMAILS`. Registration now always creates a `member`.
Promotion and demotion require the explicit, dry-run-first operator command in
`back-end/scripts/manage-account-role.mjs`, and applied role changes create a
privacy-preserving audit record.

### High — arbitrary-origin credentialed API access

The live API reflected arbitrary origins while allowing credentials. CORS now
uses an exact allowlist, unsafe methods require an allowed origin, and
cross-site browser requests are rejected using both origin and Fetch Metadata.
Regression coverage confirms an attacker origin receives neither a credentialed
CORS grant nor permission to mutate state.

### High — administrator secret retained in browser storage

The moderation console formerly retained and replayed the raw administrator key
from `sessionStorage`. It now exchanges the key once for an opaque server-side
session. The browser receives only a short-lived `HttpOnly`, `Secure`,
`SameSite=Strict` cookie; logout revokes the backing session. Browser attempts
to authorize directly with `x-admin-key` are rejected, while deliberate
non-browser operator clients retain key-header compatibility.

### High — production image omitted the API

The previous container built the backend and then discarded it, leaving only a
static Nginx image. The production image now runs the compiled API and serves
the generated front end from the same non-root Node process. npm and development
dependencies are absent from runtime, the root filesystem can be read-only, and
only the private data volume needs write access.

### Medium — password and session hardening

New passwords require 12 characters. Password hashes use asynchronous scrypt
with explicit work factors and timing-safe comparison. Existing compatible
legacy hashes are upgraded after a successful login, and nonexistent accounts
perform a dummy derivation to reduce account-enumeration timing differences.
User sessions have seven-day absolute and twelve-hour idle limits. Production
cookies use the `__Host-` prefix and strict cookie attributes.

### Medium — sensitive network metadata retention

New records no longer store raw client IP addresses or user-agent strings.
Rate-limit identifiers are hashed. The dry-run-first
`sanitize:network-metadata` command removes legacy network metadata from a
selected data directory after an operator backup and review. Administrative
responses no longer expose the retired fields.

### Medium — file, path, and concurrent-write safety

All data paths are constrained to the configured root, identifiers used as path
components are validated, private directories and files receive restrictive
permissions, and shared JSON records use atomic replacement. In-process
registration locking closes the duplicate-account race. Per-board-item mutation
serialization prevents concurrent replies, state changes, and management-token
claims from overwriting one another; a one-time management capability can have
only one successful claimant. The file-backed store remains intentionally
single-process, as described below.

### Medium — reusable management capability in URLs

Management links now place the one-time capability in a URL fragment. A
pre-hydration scrubber removes it before analytics or deferred page code runs,
passes it briefly through session storage, and consumes it when ownership is
claimed. Claiming rotates away the original management token.

### Medium — unbounded external and in-memory work

Rate-limit buckets are pruned and capped. External provider fetches have
timeouts, minimum refresh intervals, validated identifiers, coordinate bounds,
defensive payload filtering, a two-megabyte streamed response limit, bounded
page and listing counts, and HTTPS-only credential-free result URLs. Foreground
requests wait no more than three seconds for a refresh; a safe refresh may
continue in the background.

### Medium — production same-origin API routing

The former browser tests compiled an absolute test API URL into the generated
site. That hid invalid relative-URL construction in the live board, service
search, and administrator review flows and left test output unsafe to reuse.
Query strings are now built without requiring an absolute base URL. Browser
tests run against the same-origin frontend/API topology and finish by rebuilding
normal release output.

### Medium — notification transport and leakage

SMTP requires modern TLS behavior and bounded timeouts. Message subjects are
sanitized, local capture files are private, and management capabilities are no
longer placed in query strings.

### Supply-chain and release controls

The repository pins Node, npm, container bases, and third-party workflow actions;
commits a clean npm lockfile with Linux ARM64 glibc and musl optional bindings;
checks dependency-tree integrity and package signatures; validates simulated
target-platform installs; and produces immutable multi-architecture images with
SBOM and provenance metadata. Runtime health and static release metadata expose
the intended version and full source revision for post-deployment verification.
The application and static-preview builds derive their content-security policy
from hashes of the generated executable inline scripts, without allowing
`script-src 'unsafe-inline'`. The associated analytics template and standard
forks now allow the `X-Umami-Hostname` header emitted by their tracker; their
public hosts must be promoted to that release before browser collection becomes
error-free.

## Intentional boundaries

- Accounts are pseudonymous; this service does not verify real-world identity or
  email ownership.
- Contact details are core board content and remain in the private data store
  until a separate retention policy is implemented.
- The JSON store supports one writer. Horizontal replicas require migration to a
  transactional shared database.
- Netlify can host the static preview only; it cannot replace the production API
  and durable volume.
- npm 12's own globally installed tool dependencies may report upstream
  advisories outside this project's dependency tree. Project full and
  production audits must remain clean, and npm is not shipped in the runtime
  image.
- Source release completion and public-host promotion are separate states.

## Required production transition

1. Back up the existing data directory.
2. Run the network-metadata sanitizer in dry-run mode, inspect the exact files,
   then apply it if the result is correct.
3. Configure exact allowed origins, a unique anti-bot secret of at least 32
   characters, administrator keys of at least 32 characters, and an exact
   trusted-proxy hop count only when the deployment topology requires it.
4. Deploy one container writer with a read-only root and the data directory as
   its only persistent writable volume. Include
   `deploy/nginx/np-servicerequest.location.conf` in the public TLS server and
   replace any separate static-root or `/api` locations. The outer edge must
   preserve the Node runtime's generated hash-based CSP and framing denial.
5. Confirm the version and revision from both `/api/health` and `/release.json`.
6. Exercise registration, login/logout, account demotion, administrator
   login/logout, moderation, management-link recovery, and notification
   delivery using non-production test records.
7. Confirm the dedicated and central analytics collection preflights allow
   `Content-Type`, `X-Umami-Cache`, and `X-Umami-Hostname`.
