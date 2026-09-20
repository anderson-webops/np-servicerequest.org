# Direct production deployment

## Runtime contract

Production is one unprivileged Node process behind host Nginx. The process
serves both the generated Nuxt files and the same-origin API from the active
release at `/srv/np-servicerequest.org/current`. Persistent board, account,
session, moderation, and provider-cache data lives outside releases at
`/var/lib/np-servicerequest/data`.

There is no production Docker image or Compose path. Netlify remains a static
preview and cannot operate the durable API.

## One-time host setup

1. Install the isolated Node `24.18.1` runtime at
   `/opt/node-24.18.1/bin/node`. Do not replace the host-wide `/usr/bin/node`.
2. From a separately reviewed, root-owned copy of the release helpers, install
   the protected helper, checked unit, and initial fail-closed environment
   template:

   ```bash
   sudo deploy/systemd/install-service.sh
   ```

3. Replace the blank anti-bot and administrator secrets in
   `/etc/np-servicerequest/service.env`. Keep the file root-owned with mode
   `0600`.
4. Install `deploy/nginx/np-servicerequest.conf.example` as the host virtual
   server, add the host-managed certificate paths, and validate Nginx.
5. Preserve the installer's root-owned `releases` directory and unprivileged
   `builds` directory. systemd creates `/var/lib/np-servicerequest` with mode
   `0700` for the service account.

The unit fixes the listener, proxy trust, active static path, and data path so
environment-file changes cannot make Node public or move durable data into a
release checkout.

## Migrating existing data

Before replacing a container deployment, stop its single writer and make a
recoverable backup of the exact mounted data directory. Copy that directory's
contents into `/var/lib/np-servicerequest/data`, preserve private permissions,
and assign ownership to `np-servicerequest:np-servicerequest`. Do not run the
old and new services against the same files simultaneously.

Run the network-metadata sanitizer first as a dry run and apply it only after
review and backup. No source release automatically rewrites production data.

## Prepare a release

Create a complete clean checkout beneath `/srv/np-servicerequest.org/builds` as
the unprivileged build user. The exact release tag must be annotated and must
peel to fetched `origin/main`. Then run:

```bash
deploy/systemd/prepare-release.sh \
  /srv/np-servicerequest.org/builds/<release>
```

Preparation requires the exact Node/npm toolchain and runs clean dependency and
signature audits, dependency-graph and Linux native checks, lint, type checking,
all backend/repository tests, the build, accessibility checks, full Playwright
flows, promotion fault tests, a production-only install/audit, direct runtime
smoke, and exact Linux ARM64 artifact packaging. It binds release metadata and
the preparation marker to the exact commit and package version. Review the
archive, SHA-256, manifest, and acceptance receipt before privileged staging.

## Promote or roll back

Unpack the reviewed archive into a new immutable release directory with the
protected verifier. Promote that staged tree as root using the independently
reviewed archive path, digest, and source commit:

```bash
sudo deploy/systemd/promote-release.sh \
  /srv/np-servicerequest.org/releases/<release> \
  /reviewed/np-servicerequest-org-v<version>-<commit>-linux-arm64.tar.gz \
  <published-sha256> \
  <full-source-commit>
```

Promotion atomically switches the `current` symlink, validates and restarts the
systemd service, validates and reloads Nginx, then requires:

- writable durable-data readiness;
- API health and static metadata matching the candidate release;
- exact release identity over local IPv4 and IPv6 TLS;
- generated hash-based CSP without executable inline-script permission; and
- real `404` behavior for an unknown API route on both address families.

Any failure restores the previous symlink, restarts it, and re-verifies the old
release. The data directory is never switched or rolled back by this process.

## Public verification

After promotion, run the live smoke with the intended identity and inspect both
address families:

```bash
EXPECTED_VERSION=<version> \
EXPECTED_REVISION=<full-commit> \
npm run verify:production

curl -4 --fail https://np-servicerequest.org/release.json
curl -6 --fail https://np-servicerequest.org/release.json
```

An annotated source tag or passing source release is not evidence that the
public host has been promoted. Report rollout as pending until the public
identity and workflow checks match.
