import assert from 'node:assert/strict'
import { mkdtemp, rename, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { env } from 'node:process'
import { test } from 'node:test'

import {
  BoardAuthorizationError,
  BoardValidationError,
  claimBoardItemManagement,
  createBoardInteraction,
  createBoardItemFromSubmission,
  deleteBoardInteraction,
  getPublicBoardItem,
  listBoardItems,
  warmBoardPublicReadIndex,
} from './board.js'

test('concurrent board mutations preserve every reply and consume management links once', async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'np-sr-board-concurrency-'))
  const originalDataRoot = env.SUBMISSIONS_DATA_DIR
  env.SUBMISSIONS_DATA_DIR = dataRoot

  try {
    const created = await createBoardItemFromSubmission({
      fields: {
        contact_method: 'email',
        contact_value: 'concurrency-owner@example.com',
        details: 'A test post for concurrent reply handling.',
        location: 'Atlanta, GA',
        name: 'Concurrency Owner',
        notification_preference: 'none',
        project_type: 'Concurrency test',
        timing: 'Today',
      },
      kind: 'service-request',
      submissionId: 'concurrency-test-submission',
      viewer: null,
    })

    await Promise.all(
      Array.from({ length: 41 }, async (_, index) =>
        createBoardInteraction({
          contact: '',
          contactMethod: 'email',
          contactNote: '',
          contactValue: `reply-${index}@example.com`,
          itemId: created.item.id,
          message: `Concurrent reply ${index}`,
          name: `Reply Author ${index}`,
          viewer: null,
        })),
    )

    await warmBoardPublicReadIndex()
    const item = await getPublicBoardItem(created.item.id)
    assert.equal(item.interactionCount, 41)
    assert.equal(item.interactions.length, 20)
    assert.equal(item.interactionPage?.hasMore, true)
    assert.ok(item.interactionPage?.nextCursor)

    const secondPage = await getPublicBoardItem(created.item.id, item.interactionPage.nextCursor)
    assert.equal(secondPage.interactions.length, 20)
    assert.equal(secondPage.interactionPage?.hasMore, true)
    assert.ok(secondPage.interactionPage?.nextCursor)

    const thirdPage = await getPublicBoardItem(created.item.id, secondPage.interactionPage.nextCursor)
    assert.equal(thirdPage.interactions.length, 1)
    assert.equal(thirdPage.interactionPage?.hasMore, false)
    assert.equal(thirdPage.interactionPage?.nextCursor, null)
    assert.equal(new Set([...item.interactions, ...secondPage.interactions, ...thirdPage.interactions].map(interaction => interaction.id)).size, 41)
    await assert.rejects(getPublicBoardItem(created.item.id, 'invalid!'), BoardValidationError)

    const itemDirectory = join(dataRoot, '_board', 'items')
    const unavailableDirectory = `${itemDirectory}-unavailable`
    await rename(itemDirectory, unavailableDirectory)

    try {
      const listing = await listBoardItems()
      assert.equal(listing.items.find(boardItem => boardItem.id === created.item.id)?.interactionCount, 41)
      assert.deepEqual(listing.items.find(boardItem => boardItem.id === created.item.id)?.interactions, [])
    }
    finally {
      await rename(unavailableDirectory, itemDirectory)
    }

    const latest = await createBoardInteraction({
      contact: '',
      contactMethod: 'email',
      contactNote: '',
      contactValue: 'latest-reply@example.com',
      itemId: created.item.id,
      message: 'Reply after index warmup',
      name: 'Latest Reply',
      viewer: null,
    })
    assert.equal((await listBoardItems()).items.find(boardItem => boardItem.id === created.item.id)?.interactionCount, 42)

    await deleteBoardInteraction({
      interactionId: latest.interaction.id,
      itemId: created.item.id,
      viewer: {
        createdAt: new Date().toISOString(),
        displayName: 'Review Admin',
        email: 'review-admin@example.com',
        id: '00000000-0000-4000-8000-000000000001',
        isAdmin: true,
      },
    })
    assert.equal((await listBoardItems()).items.find(boardItem => boardItem.id === created.item.id)?.interactionCount, 41)
    assert.ok(!(await getPublicBoardItem(created.item.id)).interactions.some(interaction => interaction.id === latest.interaction.id))

    const claims = await Promise.allSettled([
      claimBoardItemManagement({
        itemId: created.item.id,
        managementToken: created.managementToken,
      }),
      claimBoardItemManagement({
        itemId: created.item.id,
        managementToken: created.managementToken,
      }),
    ])
    assert.equal(claims.filter(result => result.status === 'fulfilled').length, 1)
    const rejection = claims.find(result => result.status === 'rejected')
    assert.ok(rejection && rejection.reason instanceof BoardAuthorizationError)
  }
  finally {
    if (originalDataRoot == null)
      delete env.SUBMISSIONS_DATA_DIR
    else
      env.SUBMISSIONS_DATA_DIR = originalDataRoot

    await rm(dataRoot, { force: true, recursive: true })
  }
})
