import type { APIRequestContext } from '@playwright/test'
import { readdir, readFile } from 'node:fs/promises'

import { join } from 'node:path'
import { expect, test } from '@playwright/test'

const apiBaseUrl = 'http://127.0.0.1:3006/api'
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
