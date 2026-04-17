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

The Nuxt app lives in `front-end` and currently uses Nuxt `srcDir` layout:

- `front-end/src`
- `front-end/public`
- `front-end/nuxt.config.ts`

The landing page now exposes:

- a live board with service, borrowing, and lending lanes
- public board replies that work with or without an account
- optional account registration/login for repeat participants
- on-demand contact reveal actions instead of embedding contact details directly in the page

The board and intake forms call the separate back-end API instead of relying on inline Nuxt routes or static form hosting.
The previous PWA/service-worker runtime is intentionally disabled right now so clients do not keep serving stale cached form logic across deploys.

Set `NUXT_PUBLIC_API_BASE_URL` when the front-end should target a non-default API host. This value should be the full API base, for example `https://np-servicerequest.org/api`.

## Back-End

The API lives in `back-end` and exposes:

- `GET /api/health`
- `GET /api/pageview`
- `GET /api/board/bootstrap`
- `GET /api/board/items`
- `POST /api/submissions/service-request`
- `POST /api/submissions/item-request`
- `POST /api/submissions/item-lending`
- `POST /api/board/items/:itemId/interactions`
- `POST /api/board/items/:itemId/contact`
- `POST /api/board/items/:itemId/interactions/:interactionId/contact`
- `POST /api/board/account/register`
- `POST /api/board/account/login`
- `POST /api/board/account/logout`

Default port: `3006`

Form submissions are written under `SUBMISSIONS_DATA_DIR` when it is set. When it is not set, the back-end falls back to an OS temp directory under `np-servicerequest/submissions`, which is suitable for local development but not durable production storage.
The live board, optional accounts, and session files are stored under a `_board` subdirectory beneath that same root.

### Email Notifications

The back-end includes an SMTP notification pipeline for new board items and replies, but it is intentionally off by default.

- `ENABLE_BOARD_EMAIL_NOTIFICATIONS=false` keeps notifications disabled
- `BOARD_NOTIFICATION_EMAIL_TO` defaults to `servicerequest@jacobdanderson.net`
- `BOARD_NOTIFICATION_EMAIL_FROM` overrides the sender address
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, and `SMTP_PASS` configure delivery when notifications are enabled

### Bot Protection

The board currently layers several bot-friction measures:

- hidden honeypot fields on every write action
- signed anti-bot challenge tokens with minimum/maximum age checks
- route-specific IP rate limits for submissions, replies, account actions, and contact reveals
- deliberate contact reveal endpoints so emails/phones are not embedded in the board markup

## Git Remotes

`antfu/vitesse-nuxt` is configured as the `upstream` remote so this repo can still track the original template lineage.
