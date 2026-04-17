import { env } from 'node:process'

let hasWarnedAboutEmailConfig = false

function parseBooleanFlag(value: string | undefined) {
  return value === '1' || value === 'true' || value === 'yes' || value === 'on'
}

function getEmailSettings() {
  return {
    enabled: parseBooleanFlag(env.ENABLE_BOARD_EMAIL_NOTIFICATIONS),
    from: env.BOARD_NOTIFICATION_EMAIL_FROM || env.SMTP_USER || 'no-reply@np-servicerequest.local',
    host: env.SMTP_HOST,
    pass: env.SMTP_PASS,
    port: Number(env.SMTP_PORT || 587),
    secure: parseBooleanFlag(env.SMTP_SECURE),
    to: env.BOARD_NOTIFICATION_EMAIL_TO || 'servicerequest@jacobdanderson.net',
    user: env.SMTP_USER,
  }
}

async function deliverMessage(subject: string, text: string) {
  const settings = getEmailSettings()

  if (!settings.enabled)
    return

  if (!settings.host || !settings.user || !settings.pass) {
    if (!hasWarnedAboutEmailConfig) {
      console.warn('Board email notifications are enabled, but SMTP credentials are incomplete.')
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
    subject,
    text,
    to: settings.to,
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
    '',
    'Summary:',
    input.summary,
    '',
    'Details:',
    contextBlock || '(none)',
  ].join('\n')

  await deliverMessage(`[Board] ${input.kindLabel}: ${input.title}`, body)
}

export async function sendBoardInteractionNotificationEmail(input: {
  authorName: string
  contact: string
  createdAt: string
  itemId: string
  itemTitle: string
  message: string
}) {
  const body = [
    'A new board interaction was posted.',
    '',
    `Item: ${input.itemTitle}`,
    `Board ID: ${input.itemId}`,
    `Author: ${input.authorName}`,
    `Contact: ${input.contact}`,
    `Created: ${input.createdAt}`,
    '',
    'Message:',
    input.message,
  ].join('\n')

  await deliverMessage(`[Board Reply] ${input.itemTitle}`, body)
}
