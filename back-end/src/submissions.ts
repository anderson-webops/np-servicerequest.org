import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { env } from 'node:process'

import { normalizeStructuredContact } from './contact.js'
import { ensurePrivateDirectory, removeFileIfExists, writeJsonFile } from './data.js'

const defaultSubmissionsDirectory = resolve(tmpdir(), 'np-servicerequest', 'submissions')
const submissionMutationQueues = new Map<string, Promise<void>>()

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
  boardItemId: string
  kind: SubmissionKind
  rawPayload: unknown
  submissionId: string
  validateFields: (fields: Record<string, string>) => void
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

export async function withSubmissionMutationLock<T>(submissionId: string, task: () => Promise<T>) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(submissionId))
    throw new SubmissionValidationError('The submission id is invalid.')

  const previousMutation = submissionMutationQueues.get(submissionId) || Promise.resolve()
  let releaseMutation = () => {}
  const currentMutation = new Promise<void>((resolveMutation) => {
    releaseMutation = resolveMutation
  })
  submissionMutationQueues.set(submissionId, currentMutation)

  await previousMutation

  try {
    return await task()
  }
  finally {
    releaseMutation()

    if (submissionMutationQueues.get(submissionId) === currentMutation)
      submissionMutationQueues.delete(submissionId)
  }
}

export async function saveSubmission(input: SaveSubmissionInput): Promise<SaveSubmissionResult> {
  const payload = sanitizePayload(input.kind, input.rawPayload)
  const createdAt = new Date().toISOString()
  const id = input.submissionId

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
  input.validateFields(fields)

  const submission: StoredSubmission = {
    board: { itemId: input.boardItemId },
    id,
    kind: input.kind,
    createdAt,
    fields,
  }

  const submissionDirectory = buildSubmissionDirectory(input.kind)

  await ensurePrivateDirectory(submissionDirectory)
  await writeJsonFile(
    resolve(submissionDirectory, buildSubmissionFileName(createdAt, id)),
    submission,
  )

  return {
    id,
    accepted: true,
    createdAt,
    fields,
  }
}

export async function removeSavedSubmission(input: {
  createdAt: string
  id: string
  kind: SubmissionKind
}) {
  await removeFileIfExists(
    resolve(buildSubmissionDirectory(input.kind), buildSubmissionFileName(input.createdAt, input.id)),
  )
}
