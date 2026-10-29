import assert from 'node:assert/strict'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { env } from 'node:process'
import { test } from 'node:test'

import { isEmailAddress, normalizeStructuredContact } from './contact.js'
import { sendBoardItemManagementLinkEmail, sendBoardOwnerReplyNotificationEmail } from './notifications.js'

test('only one plain mailbox can be used as a board email contact', () => {
  for (const value of [
    'one@example.com,two@example.com',
    'one@example.com;two@example.com',
    'One <one@example.com>',
    'one@example.com\r\nBcc: two@example.com',
    'one@example.com@two.example',
  ]) {
    assert.equal(isEmailAddress(value), false)
    assert.equal(normalizeStructuredContact({ method: 'email', value }).invalidValue, true)
    assert.equal(normalizeStructuredContact({ method: 'email', legacyContact: value }).managementEmail, '')
  }

  assert.equal(isEmailAddress('one+tag@example.com'), true)
  assert.equal(normalizeStructuredContact({ method: 'email', value: 'one+tag@example.com' }).managementEmail, 'one+tag@example.com')
})

test('stored multi-recipient strings cannot trigger owner or management email', async () => {
  const captureDirectory = await mkdtemp(join(tmpdir(), 'np-board-mail-'))
  const previousCaptureDirectory = env.BOARD_EMAIL_CAPTURE_DIR
  const previousManagementSetting = env.ENABLE_BOARD_MANAGEMENT_EMAILS
  const previousReplySetting = env.ENABLE_BOARD_REPLY_NOTIFICATION_EMAILS

  env.BOARD_EMAIL_CAPTURE_DIR = captureDirectory
  env.ENABLE_BOARD_MANAGEMENT_EMAILS = 'true'
  env.ENABLE_BOARD_REPLY_NOTIFICATION_EMAILS = 'true'

  try {
    const reply = {
      authorName: 'Test Author',
      contact: 'Test Contact',
      createdAt: '2026-10-23T00:00:00.000Z',
      itemId: 'test-item',
      itemTitle: 'Test item',
      message: 'Test reply',
      recipientEmail: 'one@example.com,two@example.com',
    }
    const management = {
      itemId: 'test-item',
      managementToken: 'synthetic-token',
      recipientEmail: reply.recipientEmail,
      title: 'Test item',
    }

    await sendBoardOwnerReplyNotificationEmail(reply)
    await sendBoardItemManagementLinkEmail(management)
    assert.deepEqual(await readdir(captureDirectory), [])

    await sendBoardOwnerReplyNotificationEmail({ ...reply, recipientEmail: 'one+tag@example.com' })
    const files = await readdir(captureDirectory)
    assert.equal(files.length, 1)
    const captured = JSON.parse(await readFile(join(captureDirectory, files[0]), 'utf8')) as { to: string }
    assert.equal(captured.to, 'one+tag@example.com')
  }
  finally {
    if (previousCaptureDirectory === undefined)
      delete env.BOARD_EMAIL_CAPTURE_DIR
    else
      env.BOARD_EMAIL_CAPTURE_DIR = previousCaptureDirectory

    if (previousManagementSetting === undefined)
      delete env.ENABLE_BOARD_MANAGEMENT_EMAILS
    else
      env.ENABLE_BOARD_MANAGEMENT_EMAILS = previousManagementSetting

    if (previousReplySetting === undefined)
      delete env.ENABLE_BOARD_REPLY_NOTIFICATION_EMAILS
    else
      env.ENABLE_BOARD_REPLY_NOTIFICATION_EMAILS = previousReplySetting

    await rm(captureDirectory, { recursive: true, force: true })
  }
})
