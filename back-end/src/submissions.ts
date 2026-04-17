import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { env } from 'node:process'

const defaultSubmissionsDirectory = resolve(tmpdir(), 'np-servicerequest', 'submissions')

export const submissionKinds = [
  'service-request',
  'item-request',
  'item-lending',
] as const

export type SubmissionKind = (typeof submissionKinds)[number]

interface SubmissionConfig {
  readonly requiredFields: readonly string[]
  readonly optionalFields?: readonly string[]
}

const submissionConfig: Record<SubmissionKind, SubmissionConfig> = {
  'service-request': {
    requiredFields: ['name', 'contact', 'project_type', 'location', 'timing', 'details'],
    optionalFields: ['bot-field'],
  },
  'item-request': {
    requiredFields: ['name', 'contact', 'item_needed', 'duration', 'pickup_plan', 'neighborhood', 'details'],
    optionalFields: ['needed_by', 'bot-field'],
  },
  'item-lending': {
    requiredFields: ['name', 'contact', 'item_available', 'neighborhood', 'availability', 'condition', 'guidelines'],
    optionalFields: ['bot-field'],
  },
}

export class SubmissionValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SubmissionValidationError'
  }
}

export interface SaveSubmissionInput {
  kind: SubmissionKind
  rawPayload: unknown
  ip?: string
  userAgent?: string
}

export interface SaveSubmissionResult {
  id: string
  accepted: boolean
  createdAt: string
}

interface StoredSubmission {
  id: string
  kind: SubmissionKind
  createdAt: string
  fields: Record<string, string>
  meta: {
    ip?: string
    userAgent?: string
  }
}

export function isSubmissionKind(value: string): value is SubmissionKind {
  return submissionKinds.includes(value as SubmissionKind)
}

function ensureRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SubmissionValidationError('Submission payload must be a JSON object.')
  }

  return value as Record<string, unknown>
}

function normalizeFieldValue(value: unknown): string {
  if (value == null) {
    return ''
  }

  if (typeof value !== 'string') {
    throw new SubmissionValidationError('Submission fields must be sent as strings.')
  }

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

  if (missingFieldNames.length > 0) {
    throw new SubmissionValidationError(`Missing required fields: ${missingFieldNames.join(', ')}`)
  }

  for (const [fieldName, value] of Object.entries(payload)) {
    if (value.length > 4000) {
      throw new SubmissionValidationError(`Field "${fieldName}" is too long.`)
    }
  }
}

function buildSubmissionDirectory(kind: SubmissionKind) {
  return resolve(env.SUBMISSIONS_DATA_DIR || defaultSubmissionsDirectory, kind)
}

function buildSubmissionFileName(createdAt: string, id: string) {
  return `${createdAt.replaceAll(':', '-').replaceAll('.', '-')}--${id}.json`
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
    }
  }

  validatePayload(input.kind, payload)

  const fields = Object.fromEntries(
    Object.entries(payload).filter(([fieldName, value]) => fieldName !== 'bot-field' && value.length > 0),
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
  }
}
