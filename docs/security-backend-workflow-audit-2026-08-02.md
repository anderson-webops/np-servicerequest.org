# Security, identity, and system workflow audit — 2026-08-02

## Scope and outcome

This follow-up reviewed registration and login, user and administrator sessions,
account promotion and demotion, board ownership capabilities, moderation,
contact disclosure, data persistence, provider and SMTP boundaries, browser
policy, process exposure, deployment authority, rollback, dependencies, CI, and
public release identity.

The prior account, administrator-session, origin, storage, and board-ownership
remediations remain effective. This pass found and remediated seven additional
workflow or system discrepancies: promotion still selected accounts by an
unverified email address, existing sessions inherited later promotions, the
credential-upgrade path could overwrite a concurrent role transition, the
container masked a public-listener and temporary-storage fallback, the runtime
emitted `X-Frame-Options: SAMEORIGIN` despite the intended framing denial, and
the direct promotion gate rejected the application's safe style policy. Encoded
hidden-path requests also fell through to the public application shell instead
of failing closed.

## Access model

| Actor | Authorization | Promotion and revocation |
| --- | --- | --- |
| Anonymous visitor | Read public posts, create bounded posts/replies, reveal contact after anti-bot checks, report content | No privileged state |
| Member account | Anonymous capabilities plus account-backed ownership and deletion of its own content | Registration always creates `member` |
| Account administrator | Member capabilities plus board-item/reply moderation | Explicit UUID-selected operator transition only |
| Administrator-key session | Dedicated review console and submission moderation | Key exchange creates an eight-hour revocable server session |
| Deployment operator | Prepare and atomically promote a validated release | External host/source-control role only |

The account-admin and administrator-key paths are deliberately separate. Full
operator offboarding must demote the account and remove or rotate any separately
held administrator key.

## Findings remediated

### High — promotion selected an account by unverified email

Public accounts do not verify ownership of their claimed email. Selecting a
promotion target by email could therefore elevate an account pre-registered by
someone else using the intended operator's address.

The role command now requires the account UUID supplied by the signed-in
intended owner through an out-of-band trusted channel. Its dry run displays the
UUID, display name, creation time, claimed email, and current role. Applying a
change requires the UUID a second time and the previously reviewed current role
and role epoch, so stale, repeated, or mistyped transitions fail closed. The
account page exposes the UUID for this purpose.

### High — existing sessions inherited a later promotion

Sessions formerly read the current role from the account on every request. That
made demotion immediate, but it also made every old or stolen session become an
administrator as soon as the account was promoted.

Accounts and sessions now carry a role epoch. Every actual role transition
increments the epoch and removes known session files. Any raced or otherwise
remaining old session fails the epoch comparison and is deleted on its next
request. The intended owner must authenticate again after promotion or demotion.

### High — credential upgrade could overwrite a concurrent role transition

The legacy-password upgrade rewrites the account record after successful login.
Without cross-process serialization, an upgrade and an operator role command
could both read the old record and the later writer could restore an obsolete
role or epoch.

Legacy credential upgrades and role changes now share an exclusive per-account
filesystem lock. Each path rereads the account while holding the lock; login
revalidates the credential against that latest record, while role apply requires
both the reviewed role and epoch. Concurrent apply attempts therefore produce
one transition and one fail-closed stale review, and a raced demotion remains
authoritative through credential upgrade.

### High — container path masked unsafe direct-host defaults

The server listened on all interfaces when no host was specified and production
could silently place user data beneath the operating-system temporary
directory. The container happened to supply a private data mount and isolation,
but those source defaults were unsafe for the requested direct deployment.

Production now requires an absolute non-temporary data directory, a generated
static artifact, exact HTTPS request origins, a bounded anti-bot secret, and at
least one bounded administrator key. The listener defaults to loopback and
rejects public addresses unless an explicit escape hatch is set; the checked
systemd unit fixes that escape hatch off. It also fixes one trusted Nginx hop,
the current artifact path, and `/var/lib/np-servicerequest/data` so environment
overrides cannot weaken those boundaries.

### Medium — deployment readiness did not include durable storage

Liveness reported source identity but did not prove the data directory was
available. `/api/readyz` now checks the private directory and reports its status
with the same version and revision as health and static release metadata.
Promotion requires all three identities plus readiness before it can succeed.

### Medium — framing header was weaker than the documented policy

Helmet's default `X-Frame-Options` value was `SAMEORIGIN`. The runtime now
explicitly emits `DENY`, matching `frame-ancestors 'none'` and the release smoke
contract.

### Medium — the promotion CSP gate could never accept the generated site

The first direct promotion script rejected `unsafe-inline` anywhere in the CSP,
while the generated application intentionally permits inline styles and forbids
inline scripts. Every otherwise healthy candidate would exhaust all retries and
roll back.

The gate now scopes both its hash requirement and its `unsafe-inline` denial to
the `script-src` directive. A repository test rejects the former over-broad
condition so the deployment hang cannot silently return.

### Low — encoded hidden paths reached the public application shell

Literal paths such as `/.env` returned `404`, but percent-encoded equivalents
could bypass the pre-static check and receive the generic public application
shell. Express did not serve the hidden file, so no secret was exposed, but the
route behavior was inconsistent and needlessly permissive.

The static boundary now checks the decoded path and fails closed on malformed
encoding. The direct runtime smoke covers literal and encoded `.env` and `.git`
paths and verifies that no secret marker is returned.

### Deployment and rollback simplification

The production Dockerfile, container CI, GHCR publication workflow, Docker
Dependabot entry, and container-only Nginx snippet were removed. The direct
contract uses:

- an unprivileged, capability-free, systemd-confined Node process;
- a root-owned environment file with fail-closed blank secrets;
- persistent state outside release checkouts;
- a canonical dual-stack host Nginx reverse proxy;
- full clean release preparation followed by a production-only install; and
- an atomic `current` symlink with API readiness, source identity, generated
  CSP, real API 404, IPv4, and IPv6 gates and automatic rollback.

## Controls confirmed

- Registration cannot self-promote and password storage uses bounded async
  scrypt with timing-safe comparison and a role-safe serialized legacy-hash
  upgrade.
- Login failures are generic, nonexistent accounts perform a dummy derivation,
  and login/register routes have per-client and per-account rate limits.
- User cookies are `HttpOnly`, `Secure` in production, `SameSite=Strict`, and
  bounded by idle and absolute expirations.
- Browser administrator keys are exchanged once for opaque server-side
  sessions; raw key headers are accepted only for origin-less operator clients.
- Unsafe browser requests require an exact allowed origin and reject cross-site
  Fetch Metadata. Credentialed CORS never reflects an attacker origin.
- Anonymous delete and recovery capabilities are random, hashed at rest, and
  the emailed recovery token is fragment-based and one-time.
- Board mutation queues preserve concurrent updates in the intentional
  single-process storage model.
- Raw IP addresses and user-agent strings are not retained; rate-limit
  identifiers are hashed.
- Provider responses, listing counts, URLs, coordinates, timeouts, and response
  sizes remain bounded; SMTP requires certificate validation and TLS 1.2 or
  newer.

## Intentional residual boundaries

- Accounts are pseudonymous and email ownership is not verified.
- Contact details and password/session records remain private file-backed data
  requiring backups, restrictive permissions, and a defined retention policy.
- Exactly one process may write a data directory. Horizontal scaling requires
  migration to a transactional shared datastore.
- Role and moderation audit files are privacy-limited but are not an external
  tamper-evident log.
- Basin is not used; configured SMTP, Idealist, the dedicated analytics host,
  and the central analytics host are the intentional external processors.
- Source release and public-host promotion are separate completion states.

## Validation evidence

The final source tree passed the following release evidence:

- Node `24.18.1` and npm `12.0.2` clean install: 1,049 packages added and
  1,053 audited with zero vulnerabilities.
- Full and production-only npm audits: zero vulnerabilities. Registry integrity:
  1,048 verified package signatures and 383 verified attestations.
- Dependency graph: no npm problems. The lockfile contains 26 explicit Linux
  native entries; clean Linux ARM64 glibc and musl simulations each installed
  and resolved all seven expected native packages.
- Lint and front/back-end type checking passed. Seven repository/deployment
  tests and 18 backend tests passed, including concurrent role apply,
  credential-upgrade/demotion serialization, session epoch revocation, origin
  policy, moderation, ownership, durable runtime configuration, and concurrent
  board mutation.
- Production build passed. Twenty light/dark accessibility route checks and all
  three Playwright account, anonymous-management, and administrator workflows
  passed.
- Production-only install: 110 packages added and 113 audited with zero
  vulnerabilities. The direct runtime smoke passed readiness and exact identity,
  CSP and framing, CORS and cross-site-write rejection, administrator session
  creation/revocation, real API `404`, and literal/encoded hidden-path checks.
- Gitleaks found no secret in 282 commits or in the final source delta. Trivy
  reported zero high/critical npm vulnerabilities and no secret or
  configuration finding. Shell syntax, workflow/dependency YAML parsing, and
  `git diff --check` passed.

Dependency currency review reported only platform-native packages intentionally
absent on macOS, Node 26 types held to the Node 24 LTS runtime, and Oxc/Oxfmt
native packages pinned to their active parent-package versions. No vulnerable or
compatible in-range update remains unapplied. The committed preparation script
replays every application and dependency gate and binds its marker to the exact
source revision before promotion.
