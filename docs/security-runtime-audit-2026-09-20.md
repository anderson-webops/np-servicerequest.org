# Security and runtime audit, 2026-09-20

## Scope

This review covered the Express authorization and session boundary, public write
controls, filesystem state, email delivery, service-directory normalization,
monitor probes, graceful shutdown, production resource bounds, dependency and
native-binding reproducibility, and the direct systemd release path. It did not
read production secrets, modify production state, change DNS, or deploy a release.

## Confirmed corrections

- Rate-limit key churn can no longer evict an active identity and reset its quota.
  The primary map remains bounded at 10,000 identities; excess identities share
  bounded, policy-specific fail-closed buckets. Invalid policies and key/window
  reuse fail explicitly.
- Every JSON state helper confines absolute paths beneath the configured data
  root, rejects separator and dot path segments, rejects symlinks and unsafe file
  types, and maintains `0700` directories and `0600` files.
- Test email capture is absolute-path-only and unavailable in production. SMTP
  transport and messages disable local-file and remote-URL content loading.
- Generated-script discovery no longer relies on an incomplete HTML-tag regular
  expression. Service-directory entity handling no longer performs a second
  decode through `&amp;` ordering.
- Liveness stays minimal during shutdown, readiness fails closed, new work gets a
  bounded `503` response, repeated signals are safe, and the server caps active
  connections at 256.
- The immutable `200.html` route fallback is loaded once during process startup
  and served from memory, so arbitrary unknown paths cannot trigger repeated
  filesystem reads. Missing fallback content now fails startup, and a regression
  test proves requests no longer depend on the release file after initialization.
- Production keeps the reviewed host contract: Node 24.18.1 from
  `/opt/node-24.18.1/bin`, loopback port 3016, direct systemd/Nginx operation,
  and durable single-writer state outside immutable releases.
- The sole root workspace lock now resolves all known audit findings. Explicit
  Linux native packages are present for glibc and musl on x64 and ARM64, and the
  verifier requires each binding version to match the parent package that loads
  it.
- Runtime packaging now inventories exact compiled modules, static assets,
  production dependencies, source identity, writable state, and hashes. The
  unpacked artifact must pass sterile runtime, readiness recovery, restart,
  post-copier, missing-module, and protected-promotion fault tests before release.

## Preserved security boundaries

Public registration still creates only member accounts. Promotion and demotion
remain UUID-selected, dry-run-first, role-epoch-checked, serialized, session-
revoking, and non-PII-audited. Admin browser access still exchanges the key for a
revocable secure cookie; cross-origin writes, hidden paths, public listeners,
ephemeral production state, and malformed release identity continue to fail
closed. No convenience fallback was added to dependency installation, promotion,
or rollback.

## Verification and limits

The source release gate requires a clean locked install, zero full and production
audit findings, registry signatures, dependency and native checks, lint, types,
unit and browser tests, production builds, accessibility checks, direct-runtime
smoke, Linux ARM64 artifact acceptance, and isolated promotion recovery tests.
Passing source checks proves release readiness only. Production activation and
live identity remain a separate, explicitly authorized operator action.
