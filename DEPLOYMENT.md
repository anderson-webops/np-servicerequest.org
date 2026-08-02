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

1. Install Node `24.18.1` at `/usr/bin/node` and create an unprivileged
   `np-servicerequest` user and group.
2. Install the checked unit and fail-closed environment template:

   ```bash
   sudo deploy/systemd/install-service.sh
   ```

3. Replace the blank anti-bot and administrator secrets in
   `/etc/np-servicerequest/service.env`. Keep the file root-owned with mode
   `0600`.
4. Install `deploy/nginx/np-servicerequest.conf.example` as the host virtual
   server, add the host-managed certificate paths, and validate Nginx.
5. Ensure `/srv/np-servicerequest.org/releases` is writable by the deployment
   user. systemd creates `/var/lib/np-servicerequest` with mode `0700` for the
   service account.

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

Create a complete clean checkout beneath the release root as the unprivileged
deployment user, then run:

```bash
deploy/systemd/prepare-release.sh \
  /srv/np-servicerequest.org/releases/<release>
```

Preparation requires the exact Node/npm toolchain and runs clean dependency and
signature audits, dependency-graph and Linux native checks, lint, type checking,
all backend/repository tests, the build, accessibility checks, full Playwright
flows, a production-only install/audit, and the direct runtime smoke. It binds
the generated release metadata and preparation marker to the exact commit and
package version.

## Promote or roll back

Promote a prepared checkout as root:

```bash
sudo deploy/systemd/promote-release.sh \
  /srv/np-servicerequest.org/releases/<release>
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
