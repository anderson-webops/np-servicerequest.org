import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const paths = {
  ci: new URL('../.github/workflows/ci.yml', import.meta.url),
  dependabot: new URL('../.github/dependabot.yml', import.meta.url),
  nginx: new URL('../deploy/nginx/np-servicerequest.conf.example', import.meta.url),
  prepare: new URL('../deploy/systemd/prepare-release.sh', import.meta.url),
  promote: new URL('../deploy/systemd/promote-release.sh', import.meta.url),
  release: new URL('../.github/workflows/release-source.yml', import.meta.url),
  service: new URL('../deploy/systemd/np-servicerequest.service', import.meta.url),
}

test('production is a confined direct Node service without Docker', async () => {
  assert.equal(existsSync(new URL('../Dockerfile', import.meta.url)), false)
  assert.equal(existsSync(new URL('../.dockerignore', import.meta.url)), false)
  assert.equal(existsSync(new URL('../.github/workflows/release-container.yml', import.meta.url)), false)

  const [ci, dependabot, release, service] = await Promise.all([
    readFile(paths.ci, 'utf8'),
    readFile(paths.dependabot, 'utf8'),
    readFile(paths.release, 'utf8'),
    readFile(paths.service, 'utf8'),
  ])

  assert.doesNotMatch(ci, /docker|container:/i)
  assert.doesNotMatch(dependabot, /package-ecosystem:\s*docker/u)
  assert.doesNotMatch(release, /docker|ghcr\.io/i)
  assert.match(service, /User=np-servicerequest/u)
  assert.match(service, /HOST=127\.0\.0\.1/u)
  assert.match(service, /ALLOW_PUBLIC_LISTENER=false/u)
  assert.match(service, /SUBMISSIONS_DATA_DIR=\/var\/lib\/np-servicerequest\/data/u)
  assert.match(service, /StateDirectory=np-servicerequest/u)
  assert.match(service, /ProtectSystem=strict/u)
  assert.match(service, /NoNewPrivileges=true/u)
  assert.match(service, /CapabilityBoundingSet=\n/u)
})

test('direct promotion is atomic, dual-stack, identity-bound, and reversible', async () => {
  const [nginx, prepare, promote] = await Promise.all([
    readFile(paths.nginx, 'utf8'),
    readFile(paths.prepare, 'utf8'),
    readFile(paths.promote, 'utf8'),
  ])

  assert.match(nginx, /listen 443 ssl http2;/u)
  assert.match(nginx, /listen \[::\]:443 ssl http2;/u)
  assert.match(nginx, /proxy_pass http:\/\/np_servicerequest_origin;/u)
  assert.match(nginx, /proxy_set_header X-Forwarded-For \$remote_addr;/u)
  assert.doesNotMatch(nginx, /\$http_x_forwarded_for/u)
  assert.doesNotMatch(nginx, /add_header (?:Content-Security-Policy|X-Frame-Options)/u)

  for (const gate of [
    'audit:signatures',
    'verify:dependency-graph',
    'verify:native-lock',
    'verify:platform-install',
    'test:e2e',
    'smoke:backend-runtime',
  ]) {
    assert.match(prepare, new RegExp(gate.replace(':', '\\:')))
  }
  assert.match(prepare, /npm ci --omit=dev --include=optional --ignore-scripts/u)
  assert.match(promote, /\.np-servicerequest-release-prepared\.json/u)
  assert.match(promote, /SITE_RESOLVE_IPV4/u)
  assert.match(promote, /SITE_RESOLVE_IPV6/u)
  assert.match(promote, /mv -Tf/u)
  assert.equal(prepare.includes('if [[ "$candidate" == "$release_root_real" ]]'), true)
  assert.equal(promote.includes('case "$previous_target/" in'), true)
  assert.match(promote, /restoring the previous release/i)
  assert.match(promote, /api\/readyz/u)
  assert.match(promote, /script-src\[\^;\]\*sha256-/u)
  assert.match(promote, /script-src\[\^;\]\*unsafe-inline/u)
  assert.doesNotMatch(promote, /Content-Security-Policy:\.\*unsafe-inline/u)
})
