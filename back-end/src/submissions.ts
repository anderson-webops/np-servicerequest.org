import { randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { env } from 'node:process'

import { normalizeStructuredContact } from './contact.js'

const defaultSubmissionsDirectory = resolve(tmpdir(), 'np-servicerequest', 'submissions')

export const submissionKinds = [
  'service-request',
  'item-request',
  'item-lending',
] as const

export type SubmissionKind = (typeof submissionKinds)[number]

interface SubmissionConfig {
  readonly optionalFields?: readonly string[]
  readonly requiredFields: readonly string[]
}

const submissionConfig: Record<SubmissionKind, SubmissionConfig> = {
  'service-request': {
    requiredFields: ['name', 'project_type', 'location', 'timing', 'details'],
    optionalFields: ['contact', 'contact_method', 'contact_note', 'contact_value', 'notification_email', 'notification_preference', 'challengeIssuedAt', 'challengeToken', 'bot-field'],
  },
  'item-request': {
    requiredFields: ['name', 'item_needed', 'duration', 'pickup_plan', 'neighborhood', 'details'],
    optionalFields: ['contact', 'contact_method', 'contact_note', 'contact_value', 'needed_by', 'notification_email', 'notification_preference', 'challengeIssuedAt', 'challengeToken', 'bot-field'],
  },
  'item-lending': {
    requiredFields: ['name', 'item_available', 'neighborhood', 'availability', 'condition', 'guidelines'],
    optionalFields: ['contact', 'contact_method', 'contact_note', 'contact_value', 'notification_email', 'notification_preference', 'challengeIssuedAt', 'challengeToken', 'bot-field'],
  },
}

export class SubmissionValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SubmissionValidationError'
  }
}

export class AccountValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AccountValidationError'
  }
}

export interface SaveSubmissionInput {
  ip?: string
  kind: SubmissionKind
  rawPayload: unknown
  userAgent?: string
}

export interface SaveSubmissionResult {
  accepted: boolean
  createdAt: string
  fields: Record<string, string>
  id: string
}

interface StoredSubmission {
  board?: {
    itemId?: string
  }
  createdAt: string
  fields: Record<string, string>
  id: string
  kind: SubmissionKind
  meta: {
    ip?: string
    userAgent?: string
  }
}

export function isSubmissionKind(value: string): value is SubmissionKind {
  return submissionKinds.includes(value as SubmissionKind)
}

function ensureRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new SubmissionValidationError('Submission payload must be a JSON object.')

  return value as Record<string, unknown>
}

function normalizeFieldValue(value: unknown): string {
  if (value == null)
    return ''

  if (typeof value !== 'string')
    throw new SubmissionValidationError('Submission fields must be sent as strings.')

  return value.trim()
}

function sanitizePayload(kind: SubmissionKind, rawPayload: unknown) {
  const config = submissionConfig[kind]
  const payload = ensureRecord(rawPayload)
  const allowedFieldNames = [...config.requiredFields, ...(config.optionalFields ?? [])]

  return Object.fromEntries(
    allowedFieldNames.map(fieldName => [fieldName, normalizeFieldValue(payload[fieldName])]),
  )
}

function validatePayload(kind: SubmissionKind, payload: Record<string, string>) {
  const config = submissionConfig[kind]
  const missingFieldNames = config.requiredFields.filter(fieldName => !payload[fieldName])

  if (missingFieldNames.length > 0)
    throw new SubmissionValidationError(`Missing required fields: ${missingFieldNames.join(', ')}`)

  const contact = normalizeStructuredContact({
    legacyContact: payload.contact,
    method: payload.contact_method,
    note: payload.contact_note,
    value: payload.contact_value,
  })

  if (!contact.value)
    throw new SubmissionValidationError('A contact method is required.')

  if (contact.invalidMethod)
    throw new SubmissionValidationError('Choose a valid contact method.')

  if (contact.invalidValue) {
    throw new SubmissionValidationError(
      contact.method === 'email'
        ? 'Enter a valid email address.'
        : 'Enter a valid phone number.',
    )
  }

  const notificationPreference = payload.notification_preference.trim()
  const notificationEmail = payload.notification_email.trim()

  if (notificationPreference && !['none', 'email'].includes(notificationPreference))
    throw new SubmissionValidationError('Choose a valid notification preference.')

  if (notificationPreference === 'email') {
    const emailToValidate = notificationEmail || contact.managementEmail

    if (!emailToValidate)
      throw new SubmissionValidationError('Enter an email address for reply notifications.')

    if (!emailToValidate.includes('@') || /\s/.test(emailToValidate))
      throw new SubmissionValidationError('Enter a valid email address for reply notifications.')
  }

  for (const [fieldName, value] of Object.entries(payload)) {
    if (value.length > 4000)
      throw new SubmissionValidationError(`Field "${fieldName}" is too long.`)

    if ((value.match(/https?:\/\/|www\./gi)?.length || 0) > 2)
      throw new SubmissionValidationError(`Field "${fieldName}" contains too many links.`)
  }
}

function buildSubmissionDirectory(kind: SubmissionKind) {
  return resolve(env.SUBMISSIONS_DATA_DIR || defaultSubmissionsDirectory, kind)
}

function buildSubmissionFileName(createdAt: string, id: string) {
  return `${createdAt.replaceAll(':', '-').replaceAll('.', '-')}--${id}.json`
}

async function findStoredSubmissionFile(kind: SubmissionKind, submissionId: string) {
  const submissionDirectory = buildSubmissionDirectory(kind)
  await mkdir(submissionDirectory, { recursive: true })
  const fileNames = await readdir(submissionDirectory)

  for (const fileName of fileNames) {
    if (!fileName.endsWith('.json'))
      continue

    const filePath = resolve(submissionDirectory, fileName)
    const storedSubmission = JSON.parse(await readFile(filePath, 'utf8')) as StoredSubmission

    if (storedSubmission.id === submissionId)
      return { filePath, submission: storedSubmission }
  }

  return null
}

export async function saveSubmission(input: SaveSubmissionInput): Promise<SaveSubmissionResult> {
  const payload = sanitizePayload(input.kind, input.rawPayload)
  const createdAt = new Date().toISOString()
  const id = randomUUID()

  if (payload['bot-field']) {
    return {
      id,
      accepted: false,
      createdAt,
      fields: {},
    }
  }

  validatePayload(input.kind, payload)

  const fields = Object.fromEntries(
    Object.entries(payload).filter(
      ([fieldName, value]) =>
        !['bot-field', 'challengeIssuedAt', 'challengeToken'].includes(fieldName) && value.length > 0,
    ),
  )

  const submission: StoredSubmission = {
    id,
    kind: input.kind,
    createdAt,
    fields,
    meta: {
      ip: input.ip,
      userAgent: input.userAgent,
    },
  }

  const submissionDirectory = buildSubmissionDirectory(input.kind)

  await mkdir(submissionDirectory, { recursive: true })
  await writeFile(
    resolve(submissionDirectory, buildSubmissionFileName(createdAt, id)),
    `${JSON.stringify(submission, null, 2)}\n`,
    'utf8',
  )

  return {
    id,
    accepted: true,
    createdAt,
    fields,
  }
}

export async function attachBoardItemToSubmission(input: {
  itemId: string
  kind: SubmissionKind
  submissionId: string
}) {
  const storedSubmission = await findStoredSubmissionFile(input.kind, input.submissionId)

  if (!storedSubmission)
    return false

  await writeFile(
    storedSubmission.filePath,
    `${JSON.stringify({
      ...storedSubmission.submission,
      board: {
        ...storedSubmission.submission.board,
        itemId: input.itemId,
      },
    }, null, 2)}\n`,
    'utf8',
  )

  return true
}
