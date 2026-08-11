# Health Checks

Use the dynamic Node service's root probes for monitoring:

- `GET /healthz` returns `200 {"ok":true}`; `HEAD` returns `200` with no body.
- `GET /readyz` returns `200 {"ok":true}` when the durable single-writer data
  directory is available.
- Dependency failure returns `503 {"ok":false}`. `HEAD /readyz` performs the
  same check and returns the same status with no body.

The probes are unauthenticated, unthrottled, never redirect or set cookies, and
always send `Cache-Control: no-store`. They expose no secrets, data-directory
names, host details, release identity, process metrics, environment information,
or dependency diagnostics. Existing `/api/health`, `/api/readyz`, and
`/release.json` responses remain compatibility and release-verification
surfaces; new monitors should use the root probes.
