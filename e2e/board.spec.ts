import type { APIRequestContext } from '@playwright/test'
import { readdir, readFile } from 'node:fs/promises'

import { join } from 'node:path'
import { expect, test } from '@playwright/test'

const apiBaseUrl = 'http://127.0.0.1:3333/api'
const emailCaptureDirectory = join(process.cwd(), '.tmp/e2e/email-capture')

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function waitForAntiBotWindow() {
  await sleep(1300)
}

async function getAgedAntiBotChallenge(request: APIRequestContext) {
  const response = await request.get(`${apiBaseUrl}/board/bootstrap`)
  expect(response.ok()).toBeTruthy()
  const body = await response.json() as { antiBot: { issuedAt: number, token: string } }
  await waitForAntiBotWindow()
  return body.antiBot
}

async function createSubmission(
  request: APIRequestContext,
  kind: 'service-request' | 'item-request' | 'item-lending',
  payload: Record<string, string>,
) {
  const antiBot = await getAgedAntiBotChallenge(request)
  const response = await request.post(`${apiBaseUrl}/submissions/${kind}`, {
    data: {
      ...payload,
      challengeIssuedAt: String(antiBot.issuedAt),
      challengeToken: antiBot.token,
    },
  })

  expect(response.ok()).toBeTruthy()
  return response.json() as Promise<Record<string, unknown>>
}

async function waitForCapturedEmail(options: {
  subjectPrefix: string
  to: string
}) {
  const timeoutAt = Date.now() + 15_000

  while (Date.now() < timeoutAt) {
    const fileNames = await readdir(emailCaptureDirectory).catch(() => [] as string[])

    for (const fileName of fileNames.sort().reverse()) {
      const fileContents = await readFile(join(emailCaptureDirectory, fileName), 'utf8')
      const parsed = JSON.parse(fileContents) as {
        subject?: string
        text?: string
        to?: string
      }

      if (parsed.to === options.to && parsed.subject?.startsWith(options.subjectPrefix))
        return parsed
    }

    await sleep(250)
  }

  throw new Error(`Timed out waiting for captured email to ${options.to}`)
}

function extractFirstUrl(text: string) {
  const match = text.match(/https?:\/\/\S+/)

  if (!match)
    throw new Error('Could not find a URL in the captured email.')

  return match[0]
}

test('browser location stays out of shareable board URLs and request URLs', async ({ context, page }) => {
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: 33.749, longitude: -84.388 })
  await page.goto('/')

  const nearbyRequestPromise = page.waitForRequest(request =>
    request.url().includes('/api/board/items')
    && (request.method() === 'POST' || new URL(request.url()).searchParams.has('lat')))
  await page.getByRole('button', { name: 'Use my location' }).click()
  const nearbyRequest = await nearbyRequestPromise
  expect(nearbyRequest.method()).toBe('POST')
  expect(new URL(nearbyRequest.url()).searchParams.has('lat')).toBe(false)
  expect(new URL(nearbyRequest.url()).searchParams.has('lng')).toBe(false)
  expect(JSON.parse(nearbyRequest.postData() || '{}')).toMatchObject({
    lat: '33.749',
    lng: '-84.388',
    sort: 'nearby',
  })
  await expect(page.getByText('Using your current browser location for nearby sorting.')).toBeVisible()
  expect(page.url()).not.toMatch(/[?&](?:lat|lng)=/)

  await page.getByRole('button', { name: 'Service projects' }).click()
  await expect(page).toHaveURL(/filter=service-request/)
  expect(page.url()).not.toMatch(/[?&](?:lat|lng)=/)
  await expect(page.getByText('Using your current browser location for nearby sorting.')).toBeVisible()

  await page.goBack()
  await expect(page.getByRole('button', { name: 'All posts' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('Using your current browser location for nearby sorting.')).toBeVisible()
  expect(page.url()).not.toMatch(/[?&](?:lat|lng)=/)

  await context.setGeolocation({ latitude: 34.001, longitude: -84.002 })
  const refreshedRequestPromise = page.waitForRequest(request =>
    request.url().includes('/api/board/items') && request.method() === 'POST')
  await page.getByRole('button', { name: 'Refresh location' }).click()
  const refreshedRequest = await refreshedRequestPromise
  expect(JSON.parse(refreshedRequest.postData() || '{}')).toMatchObject({
    lat: '34.001',
    lng: '-84.002',
    sort: 'nearby',
  })
  expect(page.url()).not.toMatch(/[?&](?:lat|lng)=/)

  await page.reload()
  await expect(page.getByRole('combobox', { name: 'Sort' })).toHaveValue('nearby')
  await expect(page.getByText('Using your current browser location for nearby sorting.')).toBeVisible()
  expect(page.url()).not.toMatch(/[?&](?:lat|lng)=/)

  const newestRequestPromise = page.waitForRequest(request =>
    request.url().includes('/api/board/items') && request.method() === 'POST')
  await page.getByRole('combobox', { name: 'Sort' }).selectOption('newest')
  const newestRequest = await newestRequestPromise
  expect(JSON.parse(newestRequest.postData() || '{}')).toMatchObject({
    lat: '34.001',
    lng: '-84.002',
    sort: 'newest',
  })
  await page.getByRole('combobox', { name: 'Sort' }).selectOption('nearby')
  await expect(page.getByRole('combobox', { name: 'Sort' })).toHaveValue('nearby')

  await page.getByRole('button', { name: 'Clear location' }).click()
  await expect(page.getByText('Using your current browser location for nearby sorting.')).toHaveCount(0)
  expect(page.url()).not.toMatch(/[?&](?:lat|lng)=/)
  await expect(page).not.toHaveURL(/sort=nearby/)

  await page.goBack()
  await expect(page.getByRole('combobox', { name: 'Sort' })).toHaveValue('recent-activity')
  await expect(page).not.toHaveURL(/sort=nearby/)
})

test('legacy coordinate links are scrubbed before page analytics and not reused', async ({ page }) => {
  const boardRequests: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/api/board/items'))
      boardRequests.push(request.url())
  })

  await page.goto('/?filter=service-request&lat=33.749&lat=34&lng=-84.388&sort=nearby#live-board')
  await expect(page.getByRole('combobox', { name: 'Sort' })).toHaveValue('recent-activity')
  expect(page.url()).not.toMatch(/[?&](?:lat|lng)=/)
  expect(page.url()).not.toContain('sort=nearby')
  expect(page.url()).toContain('filter=service-request')
  expect(page.url()).toContain('#live-board')
  expect(boardRequests.every(url => !/[?&](?:lat|lng)=/.test(url))).toBe(true)
})

test('denied geolocation leaves nearby sorting inactive and the URL clean', async ({ context, page }) => {
  await context.grantPermissions([])
  await page.goto('/')
  await page.getByRole('combobox', { name: 'Sort' }).selectOption('nearby')
  await expect(page.getByText('Could not read your current location. Nearby sorting needs browser location access.')).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Sort' })).toHaveValue('recent-activity')
  expect(page.url()).not.toMatch(/[?&](?:lat|lng|sort)=/)
})

test('service-search sends browser coordinates in a request body', async ({ context, page }) => {
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: 33.749, longitude: -84.388 })
  await page.goto('/service-search')

  const nearbyRequestPromise = page.waitForRequest(request =>
    request.url().includes('/api/service-directory/search')
    && (request.method() === 'POST' || new URL(request.url()).searchParams.has('lat')))
  await page.getByRole('button', { name: 'Use my current location' }).click()
  const nearbyRequest = await nearbyRequestPromise
  expect(nearbyRequest.method()).toBe('POST')
  expect(new URL(nearbyRequest.url()).searchParams.has('lat')).toBe(false)
  expect(new URL(nearbyRequest.url()).searchParams.has('lng')).toBe(false)
  expect(JSON.parse(nearbyRequest.postData() || '{}')).toMatchObject({
    lat: '33.749',
    lng: '-84.388',
  })
  expect(page.url()).not.toMatch(/[?&](?:lat|lng)=/)
})

test('member registration, logout, and login preserve a non-admin identity and strict session cookie', async ({ context, page }) => {
  const email = `member-flow-${Date.now()}@example.com`
  const password = 'member-flow-password'

  await page.goto('/account', { waitUntil: 'commit' })
  await waitForAntiBotWindow()
  await page.getByLabel('Display name').fill('Member Flow')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Create optional account' }).click()

  await expect(page.getByText('Account ready.')).toBeVisible()
  await expect(page.getByText('Member Flow')).toBeVisible()
  await expect(page.getByText('Admin tools active')).toHaveCount(0)

  const sessionCookie = (await context.cookies()).find(cookie =>
    cookie.name === 'np_sr_session')
  expect(sessionCookie?.httpOnly).toBeTruthy()
  expect(sessionCookie?.sameSite).toBe('Strict')

  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByText('Signed out.')).toBeVisible()
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await waitForAntiBotWindow()
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).last().click()

  await expect(page.getByText('Signed in.')).toBeVisible()
  await expect(page.getByText('Member Flow')).toBeVisible()
  await expect(page.getByText('Admin tools active')).toHaveCount(0)
})

test('anonymous posters can use the path-style detail route, reclaim management via email, reveal contact, receive replies, and delete the post', async ({ browser, page, request }) => {
  const ownerEmail = 'owner-flow@example.com'

  await page.goto('/service-request', { waitUntil: 'commit' })
  await waitForAntiBotWindow()

  await page.getByLabel('Your name').fill('Owner Flow')
  await page.getByLabel('Email address').fill(ownerEmail)
  await page.getByLabel('Project type').selectOption('Cleanup')
  await page.getByLabel('Location or neighborhood').fill('Atlanta, GA')
  await page.getByLabel('Timing').fill('This Saturday morning')
  await page.getByLabel('Project details').fill('Need help clearing brush from a small yard.')

  const submissionResponsePromise = page.waitForResponse(response =>
    response.url().includes('/api/submissions/service-request')
    && response.request().method() === 'POST',
  )

  await page.getByRole('button', { name: 'Post service request' }).click()

  const submissionResponse = await submissionResponsePromise
  const submissionBody = await submissionResponse.json() as {
    boardItem: { id: string }
  }
  const boardItemId = submissionBody.boardItem.id

  await expect(page.getByText('Posted. Your service project now appears on the live board.')).toBeVisible()

  const managementEmail = await waitForCapturedEmail({
    subjectPrefix: '[Board Manage]',
    to: ownerEmail,
  })
  const managementUrl = extractFirstUrl(managementEmail.text || '')

  const managementContext = await browser.newContext()
  const managementPage = await managementContext.newPage()
  await managementPage.goto(managementUrl, { waitUntil: 'commit' })
  await expect(managementPage.getByText('Management access for this post is now saved in this browser.')).toBeVisible()
  await expect(managementPage).toHaveURL(new RegExp(`/posts/${boardItemId}$`))

  await waitForAntiBotWindow()
  await managementPage.getByRole('button', { name: 'Reveal contact' }).click()
  await expect(managementPage.getByText(`Contact: Email: ${ownerEmail}`)).toBeVisible()

  const replyContext = await browser.newContext()
  const replyPage = await replyContext.newPage()
  await replyPage.goto(`/posts/${boardItemId}`, { waitUntil: 'commit' })
  await waitForAntiBotWindow()
  await replyPage.getByRole('button', { name: 'Offer help' }).click()
  await replyPage.getByLabel('Your name').fill('Helpful Neighbor')
  await replyPage.getByLabel('Email address').fill('neighbor-flow@example.com')
  await replyPage.getByLabel('Message').fill('I can help on Saturday after 10 AM.')

  const replyResponsePromise = replyPage.waitForResponse(response =>
    response.url().includes(`/api/board/items/${boardItemId}/interactions`)
    && response.request().method() === 'POST',
  )
  await replyPage.getByRole('button', { name: 'Post board response' }).click()
  await expect((await replyResponsePromise).ok()).toBeTruthy()
  await expect(replyPage.getByText('Your response is now on the board.')).toBeVisible()

  await managementPage.reload()
  await expect(managementPage.getByText('I can help on Saturday after 10 AM.')).toBeVisible()

  await waitForAntiBotWindow()
  await managementPage.getByRole('button', { name: 'Delete post' }).click()
  await managementPage.getByRole('button', { name: 'Click again to delete' }).click()
  await expect(managementPage).toHaveURL(/\/(#live-board)?$/)

  const deletedResponse = await request.get(`${apiBaseUrl}/board/items/${boardItemId}`)
  expect(deletedResponse.status()).toBe(404)

  await replyContext.close()
  await managementContext.close()
})

test('older board replies load without replacing newer replies', async ({ page }) => {
  const itemId = '00000000-0000-4000-8000-000000000001'
  const createdAt = '2026-01-01T12:00:00.000Z'
  const newestReplies = Array.from({ length: 20 }, (_, index) => ({
    author: { displayName: `Neighbor ${index + 1}`, hasAccount: false },
    createdAt,
    hasContact: false,
    id: `00000000-0000-4000-8000-${String(index + 2).padStart(12, '0')}`,
    message: `Recent response ${index + 1}`,
  }))
  const olderReply = {
    author: { displayName: 'Older Neighbor', hasAccount: false },
    createdAt,
    hasContact: false,
    id: '00000000-0000-4000-8000-000000000099',
    message: 'Older response',
  }

  await page.route(`**/api/board/items/${itemId}*`, route => route.fulfill({
    json: {
      item: {
        attributes: [],
        author: { displayName: 'Post Author', hasAccount: false },
        createdAt,
        distanceMiles: null,
        hasContact: false,
        id: itemId,
        interactionCount: 21,
        interactionPage: new URL(route.request().url()).searchParams.has('after')
          ? { hasMore: false, nextCursor: null }
          : { hasMore: true, nextCursor: 'older-page' },
        interactions: new URL(route.request().url()).searchParams.has('after')
          ? [olderReply]
          : newestReplies,
        kind: 'service-request',
        kindLabel: 'Service request',
        lastActivityAt: createdAt,
        resolutionStatus: 'open',
        status: 'visible',
        summary: 'A public board post.',
        summaryLabel: 'Details',
        title: 'Pagination fixture',
      },
    },
  }))

  await page.goto(`/posts/${itemId}`, { waitUntil: 'commit' })
  await expect(page.getByText('Recent response 1', { exact: true })).toBeVisible()
  await expect(page.getByText('Older response', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Load older responses' }).click()
  await expect(page.getByText('Older response', { exact: true })).toBeVisible()
  await expect(page.getByText('Recent response 1', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Load older responses' })).toHaveCount(0)
})

test('the separate admin page rejects a bad key, accepts the admin key, and hiding a submission removes it from the public board', async ({ page, request }) => {
  const title = `Borrow drill ${Date.now()}`
  const submission = await createSubmission(request, 'item-request', {
    contact_method: 'email',
    contact_value: 'admin-seed@example.com',
    details: 'Need a cordless drill for one day.',
    duration: 'One day',
    item_needed: title,
    name: 'Admin Seed',
    neighborhood: 'Atlanta, GA',
    pickup_plan: 'I can pick it up',
  })

  const boardItemId = (submission.boardItem as { id: string }).id

  await page.goto('/admin', { waitUntil: 'commit' })
  await expect(page.getByRole('heading', { name: 'Review board submissions.' })).toBeVisible()

  await page.getByLabel('Admin key').fill('wrong-key')
  await page.getByRole('button', { name: 'Sign in with admin key' }).click()
  await expect(page.getByText('That admin key was not accepted.')).toBeVisible()

  await page.getByLabel('Admin key').fill('playwright-admin-key')
  await page.getByRole('button', { name: 'Sign in with admin key' }).click()

  const submissionCard = page.locator('.admin-card').filter({ hasText: title }).first()
  await expect(submissionCard).toBeVisible()
  await expect(submissionCard).toContainText('Visible')
  await submissionCard.getByRole('button', { name: 'Reject + hide' }).click()
  await expect(submissionCard).toHaveCount(0)

  await page.getByRole('button', { name: /Rejected/ }).click()

  const rejectedCard = page.locator('.admin-card').filter({ hasText: title }).first()
  await expect(rejectedCard).toBeVisible()
  await expect(rejectedCard).toContainText('Hidden by admin')

  await page.goto(`/?q=${encodeURIComponent(title)}`, { waitUntil: 'commit' })
  await expect(page.getByText('No posts match this search yet.')).toBeVisible()

  const hiddenResponse = await request.get(`${apiBaseUrl}/board/items/${boardItemId}`)
  expect(hiddenResponse.status()).toBe(404)
})
