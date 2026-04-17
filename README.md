# np-servicerequest.org

This repo is based on the local `vitesse-nuxt` monorepo template, which itself was adapted from [antfu/vitesse-nuxt](https://github.com/antfu/vitesse-nuxt).

## Structure

- `front-end`: Nuxt 4 app derived from the Vitesse Nuxt base
- `back-end`: separate Express API package
- root `package.json`: npm workspace entrypoint
- root `tsconfig.base.json`: shared TypeScript settings
- root `Dockerfile` and `netlify.toml`: deploy helpers for the static front-end build

## Scripts

From the repo root:

```bash
npm install
npm run dev
npm run server
```

Useful root commands:

- `npm run build`: generate the front-end and compile the back-end
- `npm run typecheck`: run front-end and back-end typechecks
- `npm run lint`: lint both workspaces

## Front-End

The Nuxt app lives in `front-end` and keeps the template app structure:

- `front-end/app`
- `front-end/public`
- `front-end/nuxt.config.ts`

The demo page-view widget now calls the separate back-end API instead of relying on an inline Nuxt server route.

Set `NUXT_PUBLIC_API_BASE_URL` when the front-end should target a non-default API host.

## Back-End

The API lives in `back-end` and exposes:

- `GET /api/health`
- `GET /api/pageview`

Default port: `3006`

## Git Remotes

`antfu/vitesse-nuxt` is configured as the `upstream` remote so this repo can still track the original template lineage.
