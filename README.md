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
- a separate `/admin` review page that uses an admin key instead of a board account login
- on-demand contact reveal actions instead of embedding contact details directly in the page

The board and intake forms call the separate back-end API instead of relying on inline Nuxt routes or static form hosting.
The previous PWA/service-worker runtime is intentionally disabled right now so clients do not keep serving stale cached form logic across deploys.
The live board and admin review filters now stay in the URL query string so refresh, back/forward navigation, and shared links preserve the current view. The optional account page also supports `?tab=login`.
Each public board post also has a dedicated static-safe detail page at `/post?id=<boardItemId>`, so individual requests can be shared even under static hosting.
New posts and replies now collect structured contact details instead of one free-text field, so contributors can explicitly choose email or phone and optionally add a short contact note.

Set `NUXT_PUBLIC_API_BASE_URL` when the front-end should target a non-default API host. This value should be the full API base, for example `https://np-servicerequest.org/api`.

## Back-End

The API lives in `back-end` and exposes:

- `GET /api/health`
- `GET /api/pageview`
- `GET /api/board/bootstrap`
- `GET /api/board/items`
- `GET /api/board/items/:itemId`
- `POST /api/submissions/service-request`
- `POST /api/submissions/item-request`
- `POST /api/submissions/item-lending`
- `POST /api/board/items/:itemId/claim-management`
- `POST /api/board/items/:itemId/interactions`
- `POST /api/board/items/:itemId/contact`
- `POST /api/board/items/:itemId/resolution`
- `POST /api/board/items/:itemId/interactions/:interactionId/contact`
- `DELETE /api/board/items/:itemId`
- `DELETE /api/board/items/:itemId/interactions/:interactionId`
- `POST /api/board/account/register`
- `POST /api/board/account/login`
- `POST /api/board/account/logout`
- `GET /api/admin/submissions`
- `POST /api/admin/submissions/:kind/:id/review`

Listing endpoints now support server-side filtering and pagination:

- `GET /api/board/items?kind=all|service-request|item-request|item-lending&page=1&pageSize=12`
- `GET /api/admin/submissions?review=all|pending|approved|needs-follow-up|rejected&kind=all|service-request|item-request|item-lending&submissionsPage=1&submissionsPageSize=20&activityCategory=all|posts|replies|moderation|deletions&activityPage=1&activityPageSize=40`

Default port: `3006`

Form submissions are written under `SUBMISSIONS_DATA_DIR` when it is set. When it is not set, the back-end falls back to an OS temp directory under `np-servicerequest/submissions`, which is suitable for local development but not durable production storage.
The live board, optional accounts, and session files are stored under a `_board` subdirectory beneath that same root.

Submission and reply payloads accept either the legacy `contact` field or the newer structured contact fields:

- `contact_method=email|phone`
- `contact_value=<email-or-phone>`
- `contact_note=<optional extra instruction>`

The server still accepts legacy `contact` input for backward compatibility, but new UI flows use the structured fields by default.

### Email Notifications And Management Links

The back-end includes an SMTP notification pipeline for new board items and replies, but it is intentionally off by default.
Anonymous posters who use an email address can also receive a management link that restores delete access from another browser.
Those emails now point to the dedicated post detail page, where owners can recover delete access and manage the post in place.

- `ENABLE_BOARD_EMAIL_NOTIFICATIONS=false` keeps notifications disabled
- `ENABLE_BOARD_MANAGEMENT_EMAILS=true` keeps owner management-link emails enabled when SMTP is configured
- `BOARD_NOTIFICATION_EMAIL_TO` defaults to `servicerequest@jacobdanderson.net`
- `BOARD_NOTIFICATION_EMAIL_FROM` overrides the sender address
- `BOARD_PUBLIC_WEB_URL` sets the site URL used in emailed management links and defaults to `https://np-servicerequest.org`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, and `SMTP_PASS` configure delivery when notifications are enabled

### Admin Moderation

Signed-in board accounts whose email addresses appear in `BOARD_ADMIN_EMAILS` are treated as admins.
Admins can delete any board post and any board reply directly from the live board.

### Board Resolution States

Public board visibility and board completion are now separate states.
Visible posts can stay on the public board while being marked `open` or `resolved`.
Resolved posts remain shareable and readable, but new public replies are blocked until the owner or an admin reopens them.

### Admin Review API

The dedicated admin review UI at `/admin` does not use the normal board account session flow.
It sends an admin key in the `x-admin-key` header to the review API and stores that key only in browser `sessionStorage`.
Rejected submissions are now soft-hidden from the public board instead of being destructively removed, and the admin UI exposes an activity log for posts, replies, moderation actions, and deletions so review history stays auditable.

The back-end accepts the admin key from the first configured value found in:

- `BOARD_ADMIN_KEY`
- `BOARD_ADMIN_KEYS` (comma-separated)
- `ADMIN_API_KEY`
- `NP_SERVICE_REQUEST_ADMIN_KEY`
- `SERVICEREQUEST_ADMIN_KEY`

### Bot Protection

The board currently layers several bot-friction measures:

- hidden honeypot fields on every write action
- signed anti-bot challenge tokens with minimum/maximum age checks
- route-specific IP rate limits for submissions, replies, account actions, and contact reveals
- deliberate contact reveal endpoints so emails/phones are not embedded in the board markup

## Git Remotes

`antfu/vitesse-nuxt` is configured as the `upstream` remote so this repo can still track the original template lineage.
