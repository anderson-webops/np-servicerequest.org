import type { Server } from 'node:http'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
