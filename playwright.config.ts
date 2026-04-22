import { env } from 'node:process'
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:3333',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'ROOT_DIR=$(pwd) && rm -rf "$ROOT_DIR/.tmp/e2e" && mkdir -p "$ROOT_DIR/.tmp/e2e/data" "$ROOT_DIR/.tmp/e2e/email-capture" && PORT=3006 SUBMISSIONS_DATA_DIR="$ROOT_DIR/.tmp/e2e/data" BOARD_ADMIN_KEY=playwright-admin-key BOARD_EMAIL_CAPTURE_DIR="$ROOT_DIR/.tmp/e2e/email-capture" ENABLE_BOARD_EMAIL_NOTIFICATIONS=false ENABLE_BOARD_MANAGEMENT_EMAILS=true ENABLE_BOARD_REPLY_NOTIFICATION_EMAILS=true BOARD_PUBLIC_WEB_URL=http://127.0.0.1:3333 npm run -w back-end server:once',
      reuseExistingServer: !env.CI,
      timeout: 120_000,
      url: 'http://127.0.0.1:3006/api/health',
    },
    {
      command: 'PORT=3333 node ./scripts/serve-static.mjs ./front-end/.output/public 3333',
      reuseExistingServer: !env.CI,
      timeout: 120_000,
      url: 'http://127.0.0.1:3333/',
    },
  ],
})
