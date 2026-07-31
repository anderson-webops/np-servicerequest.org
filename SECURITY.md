# Security policy

## Supported release

Only the current release on `main` is supported. Report suspected security
issues privately to the repository owner instead of opening a public issue.
Do not include real passwords, administrator keys, contact details, or copied
production data in an issue or pull request.

## Identity and authorization

Public registration creates a `member` account. An email address never grants
administrator rights by itself. Account promotion and demotion are explicit
operator actions:

```bash
npm run roles:account -- \
  --data-dir /absolute/path/to/data \
  --email person@example.com \
  --role admin
```

The command is a dry run unless `--apply` is supplied. Use `--role member` to
demote an account. Every applied change writes an audit record without placing
the raw email address in the audit log. Demotion takes effect on the next
authorized request.

The moderation console uses a separate administrator key. The browser exchanges
that key once for an eight-hour, server-side session held in an `HttpOnly`,
`Secure`, `SameSite=Strict` cookie. The key must not be placed in browser
storage, URLs, source code, or logs. Configure a unique random key of at least
32 characters in production. Key rotation invalidates sessions created from a
different configured key set.

## Production data

Set `SUBMISSIONS_DATA_DIR` to a persistent, private volume. Run exactly one
application writer against a given file-backed data directory. The current
storage design is not a distributed database and must not be shared by multiple
replicas.

Before first deployment of this release, inspect and then sanitize legacy
network metadata:

```bash
npm run sanitize:network-metadata -- --data-dir /absolute/path/to/data
npm run sanitize:network-metadata -- --data-dir /absolute/path/to/data --apply
```

Back up the data directory before any migration. The application no longer
stores raw client IP addresses or user-agent strings in submission records.

## Deployment requirements

- Keep the exact Node and npm versions declared by this repository.
- Install from the committed lockfile with optional dependencies enabled.
- Run the full dependency, lint, type, test, build, accessibility, browser, and
  container gates before release.
- Deploy the generated container as a non-root user with a read-only root
  filesystem and a writable private data volume.
- Keep TLS termination in front of the application and configure
  `BOARD_ALLOWED_ORIGINS` with exact HTTPS origins.
- Configure a unique `ANTI_BOT_SECRET` of at least 32 characters in production.
- Leave `TRUST_PROXY_HOPS` unset unless a trusted reverse proxy is always in
  front of the application; when one is present, configure the exact hop count.
- Serve the generated content-security policy. Executable inline scripts are
  authorized by build-specific hashes; `script-src 'unsafe-inline'` must not be
  added.
- Treat Netlify output as a static preview; it does not provide the durable API
  or data volume required by production.
- Verify `/api/health` and `/release.json` after promotion so the running
  version and full source revision match the intended release.

Do not manually patch packages or copy native modules onto a production host.
Any dependency fix must be represented in the manifest and committed lockfile.
