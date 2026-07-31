import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { env } from 'node:process'
import { test } from 'node:test'

import {
  BoardAuthorizationError,
  claimBoardItemManagement,
  createBoardInteraction,
  createBoardItemFromSubmission,
  getPublicBoardItem,
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
      Array.from({ length: 20 }, async (_, index) =>
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

    const item = await getPublicBoardItem(created.item.id)
    assert.equal(item.interactionCount, 20)
    assert.equal(item.interactions.length, 20)
    assert.equal(new Set(item.interactions.map(interaction => interaction.id)).size, 20)

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
