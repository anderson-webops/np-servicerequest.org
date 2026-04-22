import type { Server } from 'node:http'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { env } from 'node:process'
import { after, before, test } from 'node:test'

const adminKey = 'test-admin-key'
let baseUrl = ''
let dataDirectory = ''
let server: Server | null = null

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchJson(path: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers || {}),
    },
  })

  return {
    body: await response.json() as Record<string, unknown>,
    response,
  }
}

async function getAgedAntiBotChallenge() {
  const { body, response } = await fetchJson('/api/board/bootstrap', {
    method: 'GET',
  })

  assert.equal(response.status, 200)
  assert.ok(body.antiBot)

  await sleep(1250)
  return body.antiBot as { issuedAt: number, token: string }
}

before(async () => {
  dataDirectory = await mkdtemp(join(tmpdir(), 'np-sr-admin-review-'))
  env.SUBMISSIONS_DATA_DIR = dataDirectory
  env.BOARD_ADMIN_KEY = adminKey

  const { createApp } = await import('./app.js')
  server = createServer(createApp())

  await new Promise<void>((resolve, reject) => {
    server?.listen(0, '127.0.0.1', (error?: Error) => {
      if (error) {
        reject(error)
        return
      }

      resolve()
    })
  })

  const address = server.address()

  if (!address || typeof address === 'string')
    throw new Error('Failed to start test server.')

  baseUrl = `http://127.0.0.1:${address.port}`
})

after(async () => {
  delete env.SUBMISSIONS_DATA_DIR
  delete env.BOARD_ADMIN_KEY

  if (server) {
    await new Promise<void>((resolve, reject) => {
      server?.close((error?: Error) => {
        if (error) {
          reject(error)
          return
        }

        resolve()
      })
    })
  }

  if (dataDirectory)
    await rm(dataDirectory, { force: true, recursive: true })
})

test('rejected submissions disappear from the public board while remaining in admin review and activity logs', async () => {
  const antiBot = await getAgedAntiBotChallenge()

  const { body: createdSubmission, response: createResponse } = await fetchJson('/api/submissions/item-request', {
    body: JSON.stringify({
      challengeIssuedAt: String(antiBot.issuedAt),
      challengeToken: antiBot.token,
      contact: 'poster@example.com',
      details: 'Need a ladder for a gutter repair this weekend.',
      duration: 'Two days',
      item_needed: 'Extension ladder',
      name: 'Morgan Poster',
      neighborhood: 'Downtown',
      pickup_plan: 'Can pick up after work',
    }),
    method: 'POST',
  })

  assert.equal(createResponse.status, 201)
  assert.equal(createdSubmission.accepted, true)
  assert.ok(createdSubmission.boardItem)

  const createdBoardItem = createdSubmission.boardItem as { id: string }
  const createdSubmissionId = String(createdSubmission.id)

  const { body: initialBoard, response: initialBoardResponse } = await fetchJson('/api/board/items', {
    method: 'GET',
  })

  assert.equal(initialBoardResponse.status, 200)
  assert.equal((initialBoard.items as Array<{ id: string }>).length, 1)
  assert.equal((initialBoard.items as Array<{ id: string }>)[0]?.id, createdBoardItem.id)

  const { body: rejectedReview, response: rejectResponse } = await fetchJson(`/api/admin/submissions/item-request/${createdSubmissionId}/review`, {
    body: JSON.stringify({
      notes: 'Rejected during admin review.',
      status: 'rejected',
    }),
    headers: {
      'x-admin-key': adminKey,
    },
    method: 'POST',
  })

  assert.equal(rejectResponse.status, 200)
  const rejectedSubmission = rejectedReview.submission as {
    board?: { publicState?: string }
    review?: { status?: string }
  } | undefined

  assert.equal(rejectedSubmission?.review?.status, 'rejected')
  assert.equal(rejectedSubmission?.board?.publicState, 'hidden_by_admin')

  const { body: hiddenBoard, response: hiddenBoardResponse } = await fetchJson('/api/board/items', {
    method: 'GET',
  })

  assert.equal(hiddenBoardResponse.status, 200)
  assert.equal((hiddenBoard.items as Array<unknown>).length, 0)

  const { body: hiddenContactBody, response: hiddenContactResponse } = await fetchJson(`/api/board/items/${createdBoardItem.id}/contact`, {
    body: JSON.stringify({
      challengeIssuedAt: String(antiBot.issuedAt),
      challengeToken: antiBot.token,
    }),
    method: 'POST',
  })

  assert.equal(hiddenContactResponse.status, 404)
  assert.equal(hiddenContactBody.message, 'That board item is no longer available on the public board.')

  const { body: hiddenReplyBody, response: hiddenReplyResponse } = await fetchJson(`/api/board/items/${createdBoardItem.id}/interactions`, {
    body: JSON.stringify({
      challengeIssuedAt: String(antiBot.issuedAt),
      challengeToken: antiBot.token,
      contact: 'reply@example.com',
      message: 'I can help with that ladder.',
      name: 'Helpful Neighbor',
    }),
    method: 'POST',
  })

  assert.equal(hiddenReplyResponse.status, 404)
  assert.equal(hiddenReplyBody.message, 'That board item is no longer available on the public board.')

  const { body: adminListing, response: adminListingResponse } = await fetchJson('/api/admin/submissions', {
    headers: {
      'x-admin-key': adminKey,
    },
    method: 'GET',
  })

  assert.equal(adminListingResponse.status, 200)
  assert.ok((adminListing.submissions as Array<{ id: string, review: { status: string }, board: { publicState: string } }>).some(submission =>
    submission.id === createdSubmissionId
    && submission.review.status === 'rejected'
    && submission.board.publicState === 'hidden_by_admin',
  ))
  assert.ok((adminListing.activity as Array<{ action: string, itemId?: string }>).some(entry =>
    entry.action === 'board_item_hidden_by_admin'
    && entry.itemId === createdBoardItem.id,
  ))

  const { body: restoredReview, response: restoreResponse } = await fetchJson(`/api/admin/submissions/item-request/${createdSubmissionId}/review`, {
    body: JSON.stringify({
      notes: '',
      status: 'pending',
    }),
    headers: {
      'x-admin-key': adminKey,
    },
    method: 'POST',
  })

  assert.equal(restoreResponse.status, 200)
  const restoredSubmission = restoredReview.submission as {
    board?: { publicState?: string }
    review?: { status?: string }
  } | undefined

  assert.equal(restoredSubmission?.review?.status, 'pending')
  assert.equal(restoredSubmission?.board?.publicState, 'visible')

  const { body: restoredBoard, response: restoredBoardResponse } = await fetchJson('/api/board/items', {
    method: 'GET',
  })

  assert.equal(restoredBoardResponse.status, 200)
  assert.equal((restoredBoard.items as Array<{ id: string }>).length, 1)
  assert.equal((restoredBoard.items as Array<{ id: string }>)[0]?.id, createdBoardItem.id)
})

test('board and admin listings support server-side pagination and filters', async () => {
  const antiBot = await getAgedAntiBotChallenge()
  const createdBoardItemIds: string[] = []

  for (const [index, projectType] of ['Cleanup Alpha', 'Cleanup Beta', 'Cleanup Gamma'].entries()) {
    const { body: createdSubmission, response: createResponse } = await fetchJson('/api/submissions/service-request', {
      body: JSON.stringify({
        challengeIssuedAt: String(antiBot.issuedAt),
        challengeToken: antiBot.token,
        contact: `service-${index}@example.com`,
        details: `Need help with ${projectType.toLowerCase()}.`,
        location: 'West side',
        name: `Service Poster ${index + 1}`,
        project_type: projectType,
        timing: 'This weekend',
      }),
      method: 'POST',
    })

    assert.equal(createResponse.status, 201)
    assert.equal(createdSubmission.accepted, true)
    assert.ok(createdSubmission.boardItem)
    createdBoardItemIds.push((createdSubmission.boardItem as { id: string }).id)
  }

  const { body: firstBoardPage, response: firstBoardPageResponse } = await fetchJson('/api/board/items?kind=service-request&page=1&pageSize=2', {
    method: 'GET',
  })

  assert.equal(firstBoardPageResponse.status, 200)
  assert.equal((firstBoardPage.pagination as { page: number }).page, 1)
  assert.equal((firstBoardPage.pagination as { pageSize: number }).pageSize, 2)
  assert.equal((firstBoardPage.pagination as { totalItems: number }).totalItems, 3)
  assert.equal((firstBoardPage.items as Array<{ id: string }>).length, 2)
  assert.equal((firstBoardPage.items as Array<{ id: string }>)[0]?.id, createdBoardItemIds[2])
  assert.equal((firstBoardPage.items as Array<{ id: string }>)[1]?.id, createdBoardItemIds[1])
  assert.equal((firstBoardPage.counts as Record<string, number>)['service-request'], 3)

  const { body: secondBoardPage, response: secondBoardPageResponse } = await fetchJson('/api/board/items?kind=service-request&page=2&pageSize=2', {
    method: 'GET',
  })

  assert.equal(secondBoardPageResponse.status, 200)
  assert.equal((secondBoardPage.pagination as { page: number }).page, 2)
  assert.equal((secondBoardPage.items as Array<{ id: string }>).length, 1)
  assert.equal((secondBoardPage.items as Array<{ id: string }>)[0]?.id, createdBoardItemIds[0])

  const { body: searchedBoard, response: searchedBoardResponse } = await fetchJson('/api/board/items?kind=service-request&query=gamma&sort=oldest', {
    method: 'GET',
  })

  assert.equal(searchedBoardResponse.status, 200)
  assert.equal((searchedBoard.pagination as { totalItems: number }).totalItems, 1)
  assert.equal((searchedBoard.items as Array<{ id: string }>).length, 1)
  assert.equal((searchedBoard.items as Array<{ id: string }>)[0]?.id, createdBoardItemIds[2])
  assert.equal((searchedBoard.counts as Record<string, number>)['service-request'], 1)

  const { body: oldestBoard, response: oldestBoardResponse } = await fetchJson('/api/board/items?kind=service-request&sort=oldest&page=1&pageSize=2', {
    method: 'GET',
  })

  assert.equal(oldestBoardResponse.status, 200)
  assert.equal((oldestBoard.items as Array<{ id: string }>)[0]?.id, createdBoardItemIds[0])
  assert.equal((oldestBoard.items as Array<{ id: string }>)[1]?.id, createdBoardItemIds[1])

  const { body: adminListing, response: adminListingResponse } = await fetchJson('/api/admin/submissions?review=pending&kind=service-request&submissionsPage=1&submissionsPageSize=2&activityCategory=posts&activityPage=1&activityPageSize=2', {
    headers: {
      'x-admin-key': adminKey,
    },
    method: 'GET',
  })

  assert.equal(adminListingResponse.status, 200)
  assert.equal((adminListing.submissionsPagination as { totalItems: number }).totalItems, 3)
  assert.equal((adminListing.submissions as Array<{ id: string, kind: string, review: { status: string } }>).length, 2)
  assert.ok((adminListing.submissions as Array<{ kind: string, review: { status: string } }>).every(submission =>
    submission.kind === 'service-request' && submission.review.status === 'pending',
  ))
  assert.equal((adminListing.kindCounts as Record<string, number>)['service-request'], 3)
  assert.ok((adminListing.activity as Array<{ category: string }>).length <= 2)
  assert.ok((adminListing.activity as Array<{ category: string }>).every(entry => entry.category === 'posts'))
  assert.ok(((adminListing.activityCounts as Record<string, number>).posts || 0) >= 3)
})

test('public reports are stored for admins while leaving the reported post visible until moderation decides otherwise', async () => {
  const antiBot = await getAgedAntiBotChallenge()

  const { body: createdSubmission, response: createResponse } = await fetchJson('/api/submissions/item-request', {
    body: JSON.stringify({
      challengeIssuedAt: String(antiBot.issuedAt),
      challengeToken: antiBot.token,
      contact_method: 'email',
      contact_value: 'report-target@example.com',
      details: 'Need a wheelbarrow for two days.',
      duration: 'Two days',
      item_needed: 'Wheelbarrow',
      name: 'Report Target',
      neighborhood: 'East side',
      pickup_plan: 'Can pick it up',
    }),
    method: 'POST',
  })

  assert.equal(createResponse.status, 201)
  const createdBoardItem = createdSubmission.boardItem as { id: string, title: string }

  const { body: replyResponse, response: replyCreateResponse } = await fetchJson(`/api/board/items/${createdBoardItem.id}/interactions`, {
    body: JSON.stringify({
      challengeIssuedAt: String(antiBot.issuedAt),
      challengeToken: antiBot.token,
      contact_method: 'email',
      contact_value: 'reply@example.com',
      message: 'I might be able to help next week.',
      name: 'Questionable Reply',
    }),
    method: 'POST',
  })

  assert.equal(replyCreateResponse.status, 201)
  const createdReply = replyResponse.interaction as { id: string }

  const { body: itemReport, response: itemReportResponse } = await fetchJson(`/api/board/items/${createdBoardItem.id}/report`, {
    body: JSON.stringify({
      challengeIssuedAt: String(antiBot.issuedAt),
      challengeToken: antiBot.token,
      details: 'This looks like spam.',
      reason: 'spam',
    }),
    method: 'POST',
  })

  assert.equal(itemReportResponse.status, 201)
  assert.equal(typeof itemReport.reportId, 'string')

  const { body: replyReport, response: replyReportResponse } = await fetchJson(`/api/board/items/${createdBoardItem.id}/interactions/${createdReply.id}/report`, {
    body: JSON.stringify({
      challengeIssuedAt: String(antiBot.issuedAt),
      challengeToken: antiBot.token,
      details: 'This reply reads unsafe.',
      reason: 'unsafe',
    }),
    method: 'POST',
  })

  assert.equal(replyReportResponse.status, 201)
  assert.equal(typeof replyReport.reportId, 'string')

  const { body: boardAfterReports, response: boardAfterReportsResponse } = await fetchJson(`/api/board/items?query=${encodeURIComponent(createdBoardItem.title)}`, {
    method: 'GET',
  })

  assert.equal(boardAfterReportsResponse.status, 200)
  assert.ok((boardAfterReports.items as Array<{ id: string }>).some(item => item.id === createdBoardItem.id))

  const { body: adminListing, response: adminListingResponse } = await fetchJson('/api/admin/submissions?activityCategory=reports&activityPage=1&activityPageSize=10', {
    headers: {
      'x-admin-key': adminKey,
    },
    method: 'GET',
  })

  assert.equal(adminListingResponse.status, 200)
  assert.ok(((adminListing.activityCounts as Record<string, number>).reports || 0) >= 2)
  assert.ok((adminListing.activity as Array<{ action: string, itemId?: string, interactionId?: string }>).some(entry =>
    entry.action === 'board_item_reported'
    && entry.itemId === createdBoardItem.id,
  ))
  assert.ok((adminListing.activity as Array<{ action: string, interactionId?: string }>).some(entry =>
    entry.action === 'board_interaction_reported'
    && entry.interactionId === createdReply.id,
  ))
})

test('public item detail pages can load a visible post and owners can move posts through fulfilled, closed, and open states without deleting them', async () => {
  const antiBot = await getAgedAntiBotChallenge()

  const { body: createdSubmission, response: createResponse } = await fetchJson('/api/submissions/item-lending', {
    body: JSON.stringify({
      availability: 'Most weekdays after 5 PM',
      challengeIssuedAt: String(antiBot.issuedAt),
      challengeToken: antiBot.token,
      condition: 'Clean and fully working',
      contact: 'lender@example.com',
      guidelines: 'Please return it within three days.',
      item_available: 'Folding ladder',
      name: 'Jordan Lender',
      neighborhood: 'North side',
    }),
    method: 'POST',
  })

  assert.equal(createResponse.status, 201)
  assert.equal(createdSubmission.accepted, true)
  const createdBoardItem = createdSubmission.boardItem as { id: string, resolutionStatus: string }
  const deleteToken = String(createdSubmission.deleteToken)

  assert.equal(createdBoardItem.resolutionStatus, 'open')

  const { body: detailBeforeResolve, response: detailBeforeResolveResponse } = await fetchJson(`/api/board/items/${createdBoardItem.id}`, {
    method: 'GET',
  })

  assert.equal(detailBeforeResolveResponse.status, 200)
  assert.equal((detailBeforeResolve.item as { id: string, resolutionStatus: string }).id, createdBoardItem.id)
  assert.equal((detailBeforeResolve.item as { resolutionStatus: string }).resolutionStatus, 'open')

  const { body: fulfilledItem, response: fulfillResponse } = await fetchJson(`/api/board/items/${createdBoardItem.id}/resolution`, {
    body: JSON.stringify({
      challengeIssuedAt: String(antiBot.issuedAt),
      challengeToken: antiBot.token,
      deleteToken,
      status: 'fulfilled',
    }),
    method: 'POST',
  })

  assert.equal(fulfillResponse.status, 200)
  assert.equal((fulfilledItem.item as { resolutionStatus: string }).resolutionStatus, 'fulfilled')

  const { body: boardAfterResolve, response: boardAfterResolveResponse } = await fetchJson('/api/board/items', {
    method: 'GET',
  })

  assert.equal(boardAfterResolveResponse.status, 200)
  assert.ok((boardAfterResolve.items as Array<{ id: string, resolutionStatus: string }>).some(item =>
    item.id === createdBoardItem.id && item.resolutionStatus === 'fulfilled',
  ))

  const { body: detailAfterResolve, response: detailAfterResolveResponse } = await fetchJson(`/api/board/items/${createdBoardItem.id}`, {
    method: 'GET',
  })

  assert.equal(detailAfterResolveResponse.status, 200)
  assert.equal((detailAfterResolve.item as { resolutionStatus: string }).resolutionStatus, 'fulfilled')

  const { body: blockedReply, response: blockedReplyResponse } = await fetchJson(`/api/board/items/${createdBoardItem.id}/interactions`, {
    body: JSON.stringify({
      challengeIssuedAt: String(antiBot.issuedAt),
      challengeToken: antiBot.token,
      contact: 'neighbor@example.com',
      message: 'I can come by tomorrow.',
      name: 'Helpful Neighbor',
    }),
    method: 'POST',
  })

  assert.equal(blockedReplyResponse.status, 400)
  assert.equal(blockedReply.message, 'That board item is already closed to new public replies. Reopen it before posting a new response.')

  const { body: reopenedItem, response: reopenResponse } = await fetchJson(`/api/board/items/${createdBoardItem.id}/resolution`, {
    body: JSON.stringify({
      challengeIssuedAt: String(antiBot.issuedAt),
      challengeToken: antiBot.token,
      deleteToken,
      status: 'open',
    }),
    method: 'POST',
  })

  assert.equal(reopenResponse.status, 200)
  assert.equal((reopenedItem.item as { resolutionStatus: string }).resolutionStatus, 'open')

  const { body: successfulReply, response: successfulReplyResponse } = await fetchJson(`/api/board/items/${createdBoardItem.id}/interactions`, {
    body: JSON.stringify({
      challengeIssuedAt: String(antiBot.issuedAt),
      challengeToken: antiBot.token,
      contact: 'neighbor@example.com',
      message: 'I can come by tomorrow.',
      name: 'Helpful Neighbor',
    }),
    method: 'POST',
  })

  assert.equal(successfulReplyResponse.status, 201)
  assert.equal((successfulReply.interaction as { message: string }).message, 'I can come by tomorrow.')

  const { body: closedItem, response: closeResponse } = await fetchJson(`/api/board/items/${createdBoardItem.id}/resolution`, {
    body: JSON.stringify({
      challengeIssuedAt: String(antiBot.issuedAt),
      challengeToken: antiBot.token,
      deleteToken,
      status: 'closed',
    }),
    method: 'POST',
  })

  assert.equal(closeResponse.status, 200)
  assert.equal((closedItem.item as { resolutionStatus: string }).resolutionStatus, 'closed')
})

test('nearby board sorting prefers matched locations and stores per-post reply notification preferences', async () => {
  const antiBot = await getAgedAntiBotChallenge()

  const { body: atlantaSubmission, response: atlantaResponse } = await fetchJson('/api/submissions/service-request', {
    body: JSON.stringify({
      challengeIssuedAt: String(antiBot.issuedAt),
      challengeToken: antiBot.token,
      contact_method: 'email',
      contact_value: 'atlanta-owner@example.com',
      details: 'Need help carrying boxes into a condo.',
      location: 'Atlanta, GA',
      name: 'Atlanta Owner',
      notification_preference: 'email',
      project_type: 'Moving help',
      timing: 'This weekend',
    }),
    method: 'POST',
  })

  assert.equal(atlantaResponse.status, 201)
  const atlantaBoardItem = atlantaSubmission.boardItem as { id: string }

  const { response: gwinnettResponse } = await fetchJson('/api/submissions/service-request', {
    body: JSON.stringify({
      challengeIssuedAt: String(antiBot.issuedAt),
      challengeToken: antiBot.token,
      contact_method: 'email',
      contact_value: 'gwinnett-owner@example.com',
      details: 'Need help trimming brush.',
      location: 'Lawrenceville, GA',
      name: 'Gwinnett Owner',
      notification_preference: 'none',
      project_type: 'Cleanup',
      timing: 'Next week',
    }),
    method: 'POST',
  })

  assert.equal(gwinnettResponse.status, 201)

  const { body: nearbyBoard, response: nearbyBoardResponse } = await fetchJson('/api/board/items?sort=nearby&lat=33.749&lng=-84.388', {
    method: 'GET',
  })

  assert.equal(nearbyBoardResponse.status, 200)
  assert.equal((nearbyBoard.items as Array<{ id: string }>)[0]?.id, atlantaBoardItem.id)
  assert.ok(typeof (nearbyBoard.items as Array<{ distanceMiles: number | null }>)[0]?.distanceMiles === 'number')

  const storedItemPath = resolve(dataDirectory, '_board', 'items', `${atlantaBoardItem.id}.json`)
  const storedItem = JSON.parse(await readFile(storedItemPath, 'utf8')) as {
    geo?: { label?: string }
    notificationEmail?: string
    notificationPreference?: string
  }

  assert.equal(storedItem.notificationPreference, 'email')
  assert.equal(storedItem.notificationEmail, 'atlanta-owner@example.com')
  assert.equal(storedItem.geo?.label, 'Atlanta, GA')
})

test('structured contact fields work for new posts and replies while reveal endpoints keep returning readable contact text', async () => {
  const antiBot = await getAgedAntiBotChallenge()

  const { body: createdSubmission, response: createResponse } = await fetchJson('/api/submissions/service-request', {
    body: JSON.stringify({
      challengeIssuedAt: String(antiBot.issuedAt),
      challengeToken: antiBot.token,
      contact_method: 'phone',
      contact_note: 'Text first in the evenings',
      contact_value: '(555) 321-9876',
      details: 'Need help moving a bookshelf upstairs.',
      location: 'Maple block',
      name: 'Taylor Poster',
      project_type: 'Moving help',
      timing: 'This Friday night',
    }),
    method: 'POST',
  })

  assert.equal(createResponse.status, 201)
  assert.equal(createdSubmission.accepted, true)
  const createdBoardItem = createdSubmission.boardItem as { id: string }

  const { body: revealedItemContact, response: revealedItemContactResponse } = await fetchJson(`/api/board/items/${createdBoardItem.id}/contact`, {
    body: JSON.stringify({
      challengeIssuedAt: String(antiBot.issuedAt),
      challengeToken: antiBot.token,
    }),
    method: 'POST',
  })

  assert.equal(revealedItemContactResponse.status, 200)
  assert.equal(revealedItemContact.contact, 'Phone: (555) 321-9876 (Text first in the evenings)')

  const { body: createdReply, response: createdReplyResponse } = await fetchJson(`/api/board/items/${createdBoardItem.id}/interactions`, {
    body: JSON.stringify({
      challengeIssuedAt: String(antiBot.issuedAt),
      challengeToken: antiBot.token,
      contact_method: 'email',
      contact_note: 'Subject line should mention bookshelf help',
      contact_value: 'neighbor@example.com',
      message: 'I can help carry it after 6 PM.',
      name: 'Helpful Neighbor',
    }),
    method: 'POST',
  })

  assert.equal(createdReplyResponse.status, 201)
  const createdInteraction = createdReply.interaction as { id: string }

  const { body: revealedReplyContact, response: revealedReplyContactResponse } = await fetchJson(`/api/board/items/${createdBoardItem.id}/interactions/${createdInteraction.id}/contact`, {
    body: JSON.stringify({
      challengeIssuedAt: String(antiBot.issuedAt),
      challengeToken: antiBot.token,
    }),
    method: 'POST',
  })

  assert.equal(revealedReplyContactResponse.status, 200)
  assert.equal(revealedReplyContact.contact, 'Email: neighbor@example.com (Subject line should mention bookshelf help)')
})
