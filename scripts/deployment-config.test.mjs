import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const paths = {
  ci: new URL('../.github/workflows/ci.yml', import.meta.url),
  dependabot: new URL('../.github/dependabot.yml', import.meta.url),
  deployment: new URL('../DEPLOYMENT.md', import.meta.url),
  install: new URL('../deploy/systemd/install-service.sh', import.meta.url),
  nginx: new URL('../deploy/nginx/np-servicerequest.conf.example', import.meta.url),
  packageRuntime: new URL('./package-runtime.sh', import.meta.url),
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
  assert.ok(release.indexOf('npx --no-install playwright install --with-deps chromium') < release.indexOf('npm run test:e2e'))
  assert.match(service, /User=np-servicerequest/u)
  assert.match(service, /HOST=127\.0\.0\.1/u)
  assert.match(service, /PORT=3016/u)
  assert.match(service, /\/opt\/node-26\.13\.0\/bin\/node/u)
  assert.match(service, /ALLOW_PUBLIC_LISTENER=false/u)
  assert.match(service, /SUBMISSIONS_DATA_DIR=\/var\/lib\/np-servicerequest\/data/u)
  assert.match(service, /StateDirectory=np-servicerequest/u)
  assert.match(service, /ProtectSystem=strict/u)
  assert.match(service, /NoNewPrivileges=true/u)
  assert.match(service, /CapabilityBoundingSet=\n/u)
})

test('direct promotion is atomic, dual-stack, identity-bound, and reversible', async () => {
  const [nginx, packageRuntime, prepare, promote] = await Promise.all([
    readFile(paths.nginx, 'utf8'),
    readFile(paths.packageRuntime, 'utf8'),
    readFile(paths.prepare, 'utf8'),
    readFile(paths.promote, 'utf8'),
  ])

  assert.match(nginx, /listen 443 ssl http2;/u)
  assert.match(nginx, /listen \[::\]:443 ssl http2;/u)
  assert.match(nginx, /proxy_pass http:\/\/np_servicerequest_origin;/u)
  assert.match(nginx, /server 127\.0\.0\.1:3016;/u)
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
  assert.match(prepare, /test:promotion/u)
  assert.match(prepare, /package:runtime/u)
  assert.match(prepare, /origin\/main/u)
  assert.match(prepare, /--unset-all http\.https:\/\/github\.com\/\.extraheader/u)
  assert.match(packageRuntime, /cp front-end\/\.output\/public\/release\.json "\$stage\/\.np-servicerequest-release-prepared\.json"/u)
  assert.match(packageRuntime, /npm ci --prefix "\$stage" --workspace back-end --omit=dev --omit=optional --ignore-scripts/u)
  assert.doesNotMatch(packageRuntime, /--include=optional/u)
  assert.ok(packageRuntime.indexOf('npm ci --prefix "$stage"') < packageRuntime.indexOf('cp front-end/package.json "$stage/front-end/"'))
  assert.match(promote, /\.np-servicerequest-release-prepared\.json/u)
  assert.match(promote, /NP_RESOLVE_IPV4/u)
  assert.match(promote, /NP_RESOLVE_IPV6/u)
  assert.match(promote, /mv -Tf/u)
  assert.match(promote, /flock -n/u)
  assert.match(promote, /runtime-artifact\.py/u)
  assert.equal(prepare.includes('if [[ "$candidate" == "$release_root_real" ]]'), true)
  assert.equal(promote.includes('case "$previous_target/" in'), true)
  assert.match(promote, /restoring the previous (?:direct )?release/i)
  assert.match(promote, /\/readyz/u)
  assert.match(promote, /script-src\[\^;\]\*sha256-/u)
  assert.match(promote, /script-src\[\^;\]\*unsafe-inline/u)
  assert.doesNotMatch(promote, /Content-Security-Policy:\.\*unsafe-inline/u)
})

test('privileged deployment commands select protected helpers outside build checkouts', async () => {
  const [deployment, install] = await Promise.all([
    readFile(paths.deployment, 'utf8'),
    readFile(paths.install, 'utf8'),
  ])

  assert.match(deployment, /sudo \/<reviewed-root-owned-source>\/deploy\/systemd\/install-service\.sh/u)
  assert.match(deployment, /sudo \/usr\/local\/libexec\/np-servicerequest-release\/<installed-helper-version>\/deploy\/systemd\/promote-release\.sh/u)
  assert.doesNotMatch(deployment, /sudo (?:\.\/)?deploy\/systemd\/(?:install-service|promote-release)\.sh/u)
  assert.match(install, /helper_parent=\/usr\/local\/libexec\/np-servicerequest-release/u)
  assert.match(install, /install -o root -g root -m 0755 "\$script_dir\/promote-release\.sh" "\$script_dir\/trusted-paths\.py" "\$helper_root\/deploy\/systemd\/"/u)
})

test('source release requires an exact ARM64 artifact before publication', async () => {
  const [ci, release] = await Promise.all([
    readFile(paths.ci, 'utf8'),
    readFile(paths.release, 'utf8'),
  ])

  assert.match(ci, /npm run test:promotion/u)
  assert.match(ci, /npm run package:runtime/u)
  assert.match(release, /package-arm64:[\s\S]*runs-on: ubuntu-24\.04-arm/u)
  assert.match(release, /publish:[\s\S]*needs: \[validate, package-arm64\]/u)
  assert.match(release, /npm run package:runtime/u)
  assert.match(release, /sha256sum --check SHA256SUMS/u)
  assert.match(release, /runtime-artifact\.py unpack/u)
  assert.match(release, /gh release create/u)
  assert.doesNotMatch(release, /--clobber|--force/u)
})

test('each install selects the independently locked build profile instead of changing global npm', async () => {
  const [ci, release, prepare, manifest] = await Promise.all([
    readFile(paths.ci, 'utf8'),
    readFile(paths.release, 'utf8'),
    readFile(paths.prepare, 'utf8'),
    readFile(new URL('../package.json', import.meta.url), 'utf8').then(JSON.parse),
  ])
  assert.equal(ci.match(/bin="\$\(node scripts\/build-toolchain\.mjs --print-bin\)"/gu)?.length, 4)
  assert.equal(release.match(/bin="\$\(node scripts\/build-toolchain\.mjs --print-bin\)"/gu)?.length, 2)
  for (const source of [ci, release]) {
    assert.match(source, /GITHUB_PATH/u)
    assert.match(source, /scripts\/check-build-toolchain\.mjs/u)
    assert.doesNotMatch(source, /npm install --global/u)
  }
  assert.ok(prepare.indexOf('node scripts/build-toolchain.mjs --print-bin') < prepare.indexOf('npm ci --include=dev'))
  assert.match(prepare, /Build-tool caches must remain outside the prepared runtime/u)
  assert.match(manifest.scripts.audit, /^npm run audit:toolchain &&/u)
  assert.match(manifest.scripts['audit:production'], /^npm run audit:toolchain -- --omit=dev &&/u)
  assert.match(manifest.scripts.test, /test:build-toolchain/u)
  assert.match(manifest.scripts.test, /test:toolchain-package/u)
})

test('publication independently binds the profile and complete NP-specific acceptance harness', async () => {
  const [release, packageRuntime, contract] = await Promise.all([
    readFile(paths.release, 'utf8'),
    readFile(paths.packageRuntime, 'utf8'),
    readFile(new URL('../deploy/runtime-artifact.json', import.meta.url), 'utf8').then(JSON.parse),
  ])
  assert.equal(contract.runtime.npmBuildProfile, 'webops-locked-npm-v1')
  assert.match(contract.runtime.npmBuildLockSha256, /^[a-f0-9]{64}$/u)
  assert.match(contract.runtime.npmBuildPayloadSha256, /^[a-f0-9]{64}$/u)
  assert.match(release, /acceptance\['buildToolchain'\] != expected_toolchain/u)
  assert.match(release, /set\(acceptance\['harnessSha256'\]\) != expected_harness/u)
  for (const filename of [
    'scripts/backend-runtime-smoke.mjs',
    'scripts/post-deploy-smoke.mjs',
    'scripts/build-toolchain-state.mjs',
    'scripts/build-toolchain-cache.mjs',
    'build-toolchain/PAYLOAD.json',
  ]) {
    assert.ok(release.includes(filename))
    assert.ok(packageRuntime.includes(filename))
  }
  assert.doesNotMatch(packageRuntime, /scripts\/direct-runtime-smoke\.mjs/u)
  assert.match(packageRuntime, /BUILD_TOOLCHAIN_RECEIPT/u)
})

test('privileged test namespaces copy the exact Node executable without exposing its private build profile', async () => {
  for (const [filename, directory] of [
    ['test-promotion-recovery.sh', 'source_root'],
    ['test-unpacked-artifact.sh', 'temporary_source'],
  ]) {
    const source = await readFile(new URL(filename, import.meta.url), 'utf8')
    assert.ok(source.includes(`cp "$node" "$${directory}/node"`))
    assert.ok(source.includes(`chmod 0755 "$${directory}/node"`))
    assert.ok(source.includes(`cmp -- "$node" "$${directory}/node"`))
    assert.ok(source.includes(`node="$${directory}/node"`))
    assert.match(source, /--ro-bind "\$node" \/runtime\/node/u)
    assert.doesNotMatch(source, /chmod[^\n]*"\$node"/u)
    assert.doesNotMatch(source, /--ro-bind[^\n]*(?:node_modules\/npm|_site-toolchains)/u)
  }
})
