import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { env } from 'node:process'

let hasWarnedAboutEmailConfig = false

function parseBooleanFlag(value: string | undefined) {
  return value === '1' || value === 'true' || value === 'yes' || value === 'on'
}

function getEmailSettings() {
  return {
    from: env.BOARD_NOTIFICATION_EMAIL_FROM || env.SMTP_USER || 'no-reply@np-servicerequest.local',
    host: env.SMTP_HOST,
    managementEnabled: env.ENABLE_BOARD_MANAGEMENT_EMAILS == null ? true : parseBooleanFlag(env.ENABLE_BOARD_MANAGEMENT_EMAILS),
    pass: env.SMTP_PASS,
    publicWebUrl: env.BOARD_PUBLIC_WEB_URL || 'https://np-servicerequest.org',
    port: Number(env.SMTP_PORT || 587),
    notificationsEnabled: parseBooleanFlag(env.ENABLE_BOARD_EMAIL_NOTIFICATIONS),
    replyNotificationsEnabled: env.ENABLE_BOARD_REPLY_NOTIFICATION_EMAILS == null ? true : parseBooleanFlag(env.ENABLE_BOARD_REPLY_NOTIFICATION_EMAILS),
    secure: parseBooleanFlag(env.SMTP_SECURE),
    to: env.BOARD_NOTIFICATION_EMAIL_TO || 'servicerequest@jacobdanderson.net',
    user: env.SMTP_USER,
  }
}

function buildPublicBoardItemUrl(itemId: string) {
  const settings = getEmailSettings()
  const itemUrl = new URL(`/posts/${encodeURIComponent(itemId)}`, settings.publicWebUrl)
  return itemUrl
}

async function deliverMessage(input: { subject: string, text: string, to: string }) {
  const settings = getEmailSettings()
  const captureDirectory = env.BOARD_EMAIL_CAPTURE_DIR?.trim()

  if (captureDirectory) {
    const filePath = resolve(
      captureDirectory,
      `${new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')}-${Math.random().toString(16).slice(2)}.json`,
    )

    await mkdir(captureDirectory, { recursive: true })
    await writeFile(filePath, `${JSON.stringify({
      ...input,
      createdAt: new Date().toISOString(),
    }, null, 2)}\n`, 'utf8')
    return
  }

  if (!settings.host || !settings.user || !settings.pass) {
    if (!hasWarnedAboutEmailConfig) {
      console.warn('Board email delivery is enabled, but SMTP credentials are incomplete.')
      hasWarnedAboutEmailConfig = true
    }

    return
  }

  const nodemailer = await import('nodemailer')
  const transporter = nodemailer.createTransport({
    auth: {
      pass: settings.pass,
      user: settings.user,
    },
    host: settings.host,
    port: settings.port,
    secure: settings.secure || settings.port === 465,
  })

  await transporter.sendMail({
    from: settings.from,
    subject: input.subject,
    text: input.text,
    to: input.to,
  })
}

export async function sendBoardItemNotificationEmail(input: {
  authorName: string
  contact: string
  context: Array<{ label: string, value: string }>
  createdAt: string
  itemId: string
  kindLabel: string
  summary: string
  title: string
}) {
  const settings = getEmailSettings()

  if (!settings.notificationsEnabled)
    return

  const contextBlock = input.context.map(line => `${line.label}: ${line.value}`).join('\n')
  const body = [
    'A new board item was created.',
    '',
    `Kind: ${input.kindLabel}`,
    `Title: ${input.title}`,
    `Author: ${input.authorName}`,
    `Contact: ${input.contact}`,
    `Created: ${input.createdAt}`,
    `Board ID: ${input.itemId}`,
    `Public URL: ${buildPublicBoardItemUrl(input.itemId).toString()}`,
    '',
    'Summary:',
    input.summary,
    '',
    'Details:',
    contextBlock || '(none)',
  ].join('\n')

  await deliverMessage({
    subject: `[Board] ${input.kindLabel}: ${input.title}`,
    text: body,
    to: settings.to,
  })
}

export async function sendBoardInteractionNotificationEmail(input: {
  authorName: string
  contact: string
  createdAt: string
  itemId: string
  itemTitle: string
  message: string
}) {
  const settings = getEmailSettings()

  if (!settings.notificationsEnabled)
    return

  const body = [
    'A new board interaction was posted.',
    '',
    `Item: ${input.itemTitle}`,
    `Board ID: ${input.itemId}`,
    `Public URL: ${buildPublicBoardItemUrl(input.itemId).toString()}`,
    `Author: ${input.authorName}`,
    `Contact: ${input.contact}`,
    `Created: ${input.createdAt}`,
    '',
    'Message:',
    input.message,
  ].join('\n')

  await deliverMessage({
    subject: `[Board Reply] ${input.itemTitle}`,
    text: body,
    to: settings.to,
  })
}

export async function sendBoardOwnerReplyNotificationEmail(input: {
  authorName: string
  contact: string
  createdAt: string
  itemId: string
  itemTitle: string
  message: string
  recipientEmail: string
}) {
  const settings = getEmailSettings()

  if (!settings.replyNotificationsEnabled || !input.recipientEmail)
    return

  const body = [
    'Someone replied to your board post.',
    '',
    `Item: ${input.itemTitle}`,
    `Board ID: ${input.itemId}`,
    `Public URL: ${buildPublicBoardItemUrl(input.itemId).toString()}`,
    `Reply author: ${input.authorName}`,
    `Reply contact: ${input.contact}`,
    `Created: ${input.createdAt}`,
    '',
    'Message:',
    input.message,
  ].join('\n')

  await deliverMessage({
    subject: `[Board Reply For You] ${input.itemTitle}`,
    text: body,
    to: input.recipientEmail,
  })
}

export async function sendBoardItemManagementLinkEmail(input: {
  itemId: string
  managementToken: string
  recipientEmail: string
  title: string
}) {
  const settings = getEmailSettings()

  if (!settings.managementEnabled)
    return

  const manageUrl = new URL(`/posts/${encodeURIComponent(input.itemId)}`, settings.publicWebUrl)
  manageUrl.searchParams.set('manageItem', input.itemId)
  manageUrl.searchParams.set('manageToken', input.managementToken)

  const body = [
    'You posted a request on np-servicerequest.org.',
    '',
    `Title: ${input.title}`,
    `Board ID: ${input.itemId}`,
    '',
    'Use this link if you need to manage or delete the post later from another browser or device:',
    manageUrl.toString(),
    '',
    'If you did not create this post, you can ignore this email.',
  ].join('\n')

  await deliverMessage({
    subject: `[Board Manage] ${input.title}`,
    text: body,
    to: input.recipientEmail,
  })
}
