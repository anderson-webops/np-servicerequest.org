# Security policy

## Supported release

Only the current release on `main` is supported. Report suspected security
issues privately to the repository owner instead of opening a public issue.
Do not include real passwords, administrator keys, contact details, or copied
production data in an issue or pull request.

## Identity and authorization

Public registration always creates a `member` account. Email addresses are
user-supplied and are not proof of identity. The signed-in account page exposes
the account UUID that an intended owner can provide to an operator through a
separate trusted channel.

Preview a promotion without changing data:

```bash
npm run roles:account -- \
  --data-dir /var/lib/np-servicerequest/data \
  --account-id <confirmed-account-uuid> \
  --role admin
```

After reviewing the displayed UUID, name, creation time, claimed email, and
current role, apply the exact transition:

```bash
npm run roles:account -- \
  --data-dir /var/lib/np-servicerequest/data \
  --account-id <confirmed-account-uuid> \
  --role admin \
  --apply \
  --confirm-account-id <confirmed-account-uuid> \
  --from-role member \
  --from-role-version <dry-run-role-epoch>
```

Use `--role member --from-role admin` with the displayed epoch to demote. The
role and credential upgrade paths share an exclusive per-account mutation lock,
and apply requires both the reviewed role and epoch. Applied role changes
increment the account role epoch, revoke its existing sessions, and write an
audit record containing the account UUID but no email address or email hash.
The intended owner must sign in again after a role change. Run this command as
the `np-servicerequest` service account or another operator that has
deliberately been granted access to the private data directory.
If a killed process leaves an account lock behind, first verify that no login or
role command is active; only then remove the exact UUID-named lock directory
beneath `_board/account-locks`.

The moderation console uses a separate administrator key. The browser exchanges
that key once for an eight-hour, server-side session held in an `HttpOnly`,
`Secure`, `SameSite=Strict` cookie. The key must not be placed in browser
storage, URLs, source code, or logs. Configure a unique random key from 32
through 512 characters in production. Key rotation invalidates sessions created
from a different configured key set. Removing account-admin status does not
revoke a separately held administrator key; rotate or remove that key as part
of full operator offboarding.

## Production data

Production refuses to start without an absolute durable data path. The checked
systemd unit fixes it to `/var/lib/np-servicerequest/data`, owned privately by
the unprivileged service account. Run exactly one application writer against a
given directory. The file-backed store is not a distributed database and must
not be shared by multiple replicas.

Before the first direct-host deployment, back up the existing data and inspect
the legacy network-metadata sanitizer in dry-run mode:

```bash
npm run sanitize:network-metadata -- --data-dir /var/lib/np-servicerequest/data
npm run sanitize:network-metadata -- --data-dir /var/lib/np-servicerequest/data --apply
```

The application no longer stores raw client IP addresses or user-agent strings
in submission records. Backups still contain contact details, password hashes,
sessions, moderation records, and management capabilities and require the same
private handling as the live directory.

## Deployment requirements

- Use Node `24.18.1` and npm `12.0.2` and install from the committed root
  lockfile with optional dependencies enabled.
- Run the dependency, signature, native-platform, lint, type, test, build,
  accessibility, browser, and direct-runtime gates before promotion.
- Do not reintroduce a production Docker path. Use the checked systemd unit,
  host Nginx configuration, atomic release symlink, and automatic rollback.
- Keep the Node listener on `127.0.0.1:3006`; the checked unit fixes the public
  listener escape hatch off and trusts exactly one host-local Nginx hop.
- Configure exact credential-free HTTPS origins, an anti-bot secret from 32
  through 512 characters, and at least one administrator key from 32 through
  512 characters. Production fails closed when these are missing or malformed.
- Preserve the generated hash-based content-security policy. Do not add
  `script-src 'unsafe-inline'` or replace CSP at the outer Nginx edge.
- Treat Netlify output as a static preview only; it has no durable API or data
  directory.
- Require `/api/readyz`, `/api/health`, and `/release.json` to report the same
  version and full source revision over both IPv4 and IPv6 after promotion.

Do not manually patch packages or copy native modules onto a production host.
Every dependency fix must be represented in the manifests and committed
lockfile. Source release completion and live promotion remain separate states.
