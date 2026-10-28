# Guarded deepmerge

Based on the MIT-licensed npm `deepmerge@4.3.1` distribution. The original
`dist/cjs.js` SHA-256 is
`2e5160f84a1141bd927264afe4d15766f1e6cf07daef182b37ff53fea121de7d`.

Both source and target key enumeration omit `__proto__` before reading values
or assigning destination properties. This closes returned-object prototype
poisoning for null-prototype targets, null placeholders, and own prototype keys
([GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4)).
There is no patched upstream release as of 2026-10-28; downgrading to 4.1.1
would remove later prototype protections. Keep the existing CommonJS/default
import, merge options, arrays, symbols, and TypeScript declarations.

The root override routes every consumer to this fork. Regression tests are in
`scripts/deepmerge-security.test.mjs`. Replace this fork only after an upstream
release passes those tests and the full dependency and build gates.
