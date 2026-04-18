import type { BoardActivityEntry } from './activity.js'
import type { SubmissionBoardState } from './board.js'
import type { SubmissionKind } from './submissions.js'

import { Buffer } from 'node:buffer'
import { timingSafeEqual } from 'node:crypto'
import { readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { env } from 'node:process'

import { listBoardActivity, recordBoardActivity } from './activity.js'
import { describeBoardItemStatus, getBoardStateForSubmission, syncBoardItemVisibilityFromSubmissionReview } from './board.js'
import { readJsonFile, resolveDataPath, writeJsonFile } from './data.js'
import { isSubmissionKind, submissionKinds } from './submissions.js'

export const adminReviewStatuses = [
  'pending',
  'approved',
  'needs-follow-up',
  'rejected',
] as const

export type AdminReviewStatus = (typeof adminReviewStatuses)[number]

interface StoredSubmissionRecord {
  board?: {
    itemId?: string
  }
  createdAt: string
  fields: Record<string, string>
  id: string
  kind: SubmissionKind
  meta?: {
    ip?: string
    userAgent?: string
  }
  review?: {
    notes?: string
    reviewedAt: string
    status: Exclude<AdminReviewStatus, 'pending'>
  }
}

export interface AdminFieldEntry {
  label: string
  value: string
}

export interface AdminBoardState {
  itemId: string | null
  matchedBy: SubmissionBoardState['matchedBy']
  publicState: SubmissionBoardState['publicState']
  publicStateLabel: string
  visibilityNote: string
}

export interface AdminSubmissionRecord {
  board: AdminBoardState
  createdAt: string
  fieldEntries: AdminFieldEntry[]
  fields: Record<string, string>
  id: string
  kind: SubmissionKind
  kindLabel: string
  meta: {
    ip?: string
    userAgent?: string
  }
  review: {
    notes: string
    reviewedAt: string | null
    status: AdminReviewStatus
  }
  summary: string
  title: string
}

export interface AdminSubmissionCounts {
  approved: number
  needsFollowUp: number
  pending: number
  rejected: number
  total: number
}

export class AdminAuthorizationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AdminAuthorizationError'
  }
}

export class AdminConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AdminConfigurationError'
  }
}

export class AdminSubmissionValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AdminSubmissionValidationError'
  }
}

export class AdminSubmissionNotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AdminSubmissionNotFoundError'
  }
}

const submissionKindLabels: Record<SubmissionKind, string> = {
  'service-request': 'Service project',
  'item-request': 'Borrow request',
  'item-lending': 'Lending offer',
}

const submissionFieldLabels: Record<SubmissionKind, Array<[string, string]>> = {
  'service-request': [
    ['name', 'Name'],
    ['contact', 'Contact'],
    ['project_type', 'Project type'],
    ['location', 'Location or neighborhood'],
    ['timing', 'Timing'],
    ['details', 'Project details'],
  ],
  'item-request': [
    ['name', 'Name'],
    ['contact', 'Contact'],
    ['item_needed', 'Item needed'],
    ['needed_by', 'Need it by'],
    ['duration', 'Duration'],
    ['pickup_plan', 'Pickup plan'],
    ['neighborhood', 'Neighborhood'],
    ['details', 'Details'],
  ],
  'item-lending': [
    ['name', 'Name'],
    ['contact', 'Contact'],
    ['item_available', 'Item available'],
    ['neighborhood', 'Neighborhood'],
    ['availability', 'Availability'],
    ['condition', 'Condition or notes'],
    ['guidelines', 'Borrowing guidelines'],
  ],
}

function getConfiguredAdminKeys() {
  return [
    env.BOARD_ADMIN_KEY,
    env.BOARD_ADMIN_KEYS,
    env.ADMIN_API_KEY,
    env.NP_SERVICE_REQUEST_ADMIN_KEY,
    env.SERVICEREQUEST_ADMIN_KEY,
  ]
    .flatMap(value => (value || '').split(','))
    .map(value => value.trim())
    .filter(Boolean)
}

function isValidAdminReviewStatus(value: string): value is AdminReviewStatus {
  return adminReviewStatuses.includes(value as AdminReviewStatus)
}

function isMatchingAdminKey(candidate: string, configured: string) {
  if (candidate.length !== configured.length)
    return false

  return timingSafeEqual(Buffer.from(candidate), Buffer.from(configured))
}

function buildFieldEntries(kind: SubmissionKind, fields: Record<string, string>) {
  const knownFields = submissionFieldLabels[kind]
  const knownFieldNames = new Set(knownFields.map(([fieldName]) => fieldName))

  const orderedEntries = knownFields
    .map(([fieldName, label]) => {
      const value = fields[fieldName]

      if (!value)
        return null

      return {
        label,
        value,
      }
    })
    .filter((entry): entry is AdminFieldEntry => entry != null)

  const extraEntries = Object.entries(fields)
    .filter(([fieldName, value]) => !knownFieldNames.has(fieldName) && value)
    .map(([fieldName, value]) => ({
      label: fieldName.replaceAll('_', ' '),
      value,
    }))

  return [...orderedEntries, ...extraEntries]
}

function buildSubmissionTitle(kind: SubmissionKind, fields: Record<string, string>) {
  if (kind === 'service-request')
    return fields.project_type ? `${fields.project_type} request` : 'Service project request'

  if (kind === 'item-request')
    return fields.item_needed ? `Borrow: ${fields.item_needed}` : 'Borrow request'

  return fields.item_available ? `Lend: ${fields.item_available}` : 'Lending offer'
}

function buildSubmissionSummary(kind: SubmissionKind, fields: Record<string, string>) {
  if (kind === 'service-request')
    return fields.details || [fields.location, fields.timing].filter(Boolean).join(' · ')

  if (kind === 'item-request')
    return fields.details || [fields.duration, fields.neighborhood].filter(Boolean).join(' · ')

  return fields.guidelines || [fields.availability, fields.neighborhood].filter(Boolean).join(' · ')
}

function buildAdminBoardState(boardState: SubmissionBoardState): AdminBoardState {
  let visibilityNote = 'No linked public board item was found.'

  if (boardState.publicState === 'visible')
    visibilityNote = 'Visible on the public board.'
  else if (boardState.publicState === 'hidden_by_admin')
    visibilityNote = 'Hidden from the public board but preserved for admin review and audit.'
  else if (boardState.publicState === 'deleted_by_owner')
    visibilityNote = 'Removed from the public board by the owner while keeping the internal record.'
  else if (boardState.publicState === 'deleted_by_admin')
    visibilityNote = 'Removed from the public board by an admin delete action while keeping the internal record.'

  return {
    itemId: boardState.itemId,
    matchedBy: boardState.matchedBy,
    publicState: boardState.publicState,
    publicStateLabel: describeBoardItemStatus(boardState.publicState),
    visibilityNote,
  }
}

async function normalizeSubmissionRecord(submission: StoredSubmissionRecord, resolvedBoardState?: SubmissionBoardState): Promise<AdminSubmissionRecord> {
  const reviewStatus = submission.review?.status || 'pending'
  const boardState = resolvedBoardState || await getBoardStateForSubmission({
    fields: submission.fields,
    kind: submission.kind,
    linkedItemId: submission.board?.itemId,
    submissionId: submission.id,
  })

  return {
    board: buildAdminBoardState(boardState),
    createdAt: submission.createdAt,
    fieldEntries: buildFieldEntries(submission.kind, submission.fields),
    fields: submission.fields,
    id: submission.id,
    kind: submission.kind,
    kindLabel: submissionKindLabels[submission.kind],
    meta: submission.meta || {},
    review: {
      notes: submission.review?.notes || '',
      reviewedAt: submission.review?.reviewedAt || null,
      status: reviewStatus,
    },
    summary: buildSubmissionSummary(submission.kind, submission.fields),
    title: buildSubmissionTitle(submission.kind, submission.fields),
  }
}

function buildEmptyCounts(): AdminSubmissionCounts {
  return {
    approved: 0,
    needsFollowUp: 0,
    pending: 0,
    rejected: 0,
    total: 0,
  }
}

function summarizeSubmissionCounts(submissions: AdminSubmissionRecord[]) {
  const counts = buildEmptyCounts()

  for (const submission of submissions) {
    counts.total += 1

    if (submission.review.status === 'approved')
      counts.approved += 1
    else if (submission.review.status === 'needs-follow-up')
      counts.needsFollowUp += 1
    else if (submission.review.status === 'rejected')
      counts.rejected += 1
    else
      counts.pending += 1
  }

  return counts
}

async function listKindSubmissions(kind: SubmissionKind) {
  const directory = resolveDataPath(kind)

  try {
    const entries = await readdir(directory, { withFileTypes: true })
    const fileNames = entries
      .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
      .map(entry => entry.name)

    const submissions = await Promise.all(
      fileNames.map(async (fileName) => {
        const record = await readJsonFile<StoredSubmissionRecord>(resolve(directory, fileName))
        return record
      }),
    )

    const normalizedSubmissions = await Promise.all(
      submissions
        .filter((record): record is StoredSubmissionRecord => Boolean(record && isSubmissionKind(record.kind)))
        .map(submission => normalizeSubmissionRecord(submission)),
    )

    return normalizedSubmissions
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return []

    throw error
  }
}

async function findStoredSubmission(kind: SubmissionKind, id: string) {
  const directory = resolveDataPath(kind)

  try {
    const entries = await readdir(directory, { withFileTypes: true })

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json'))
        continue

      const filePath = resolve(directory, entry.name)
      const record = await readJsonFile<StoredSubmissionRecord>(filePath)

      if (record?.id === id && isSubmissionKind(record.kind))
        return { filePath, record }
    }

    return null
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return null

    throw error
  }
}

function buildReviewLogDetail(status: AdminReviewStatus, boardState: SubmissionBoardState) {
  if (status === 'rejected') {
    return boardState.publicState === 'hidden_by_admin'
      ? 'Marked rejected and hidden from the public board.'
      : 'Marked rejected. No linked public board item was hidden.'
  }

  if (status === 'pending') {
    return boardState.publicState === 'visible'
      ? 'Reset to pending. Any admin-only hidden state was restored to the public board.'
      : 'Reset to pending.'
  }

  if (status === 'approved')
    return 'Marked approved.'

  return 'Marked as needing follow-up.'
}

export function assertValidAdminKey(rawAdminKey: string) {
  const configuredAdminKeys = getConfiguredAdminKeys()

  if (!configuredAdminKeys.length)
    throw new AdminConfigurationError('Admin review is not configured on this server.')

  const normalizedAdminKey = rawAdminKey.trim()

  if (!normalizedAdminKey)
    throw new AdminAuthorizationError('Enter a valid admin key to continue.')

  if (!configuredAdminKeys.some(configuredAdminKey => isMatchingAdminKey(normalizedAdminKey, configuredAdminKey)))
    throw new AdminAuthorizationError('That admin key was not accepted.')
}

export async function listAdminSubmissions() {
  const submissions = (
    await Promise.all(submissionKinds.map(kind => listKindSubmissions(kind)))
  )
    .flat()
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))

  return {
    activity: await listBoardActivity(),
    counts: summarizeSubmissionCounts(submissions),
    submissions,
  }
}

export async function reviewAdminSubmission(input: {
  id: string
  kind: SubmissionKind
  notes: string
  status: string
}) {
  if (!isValidAdminReviewStatus(input.status))
    throw new AdminSubmissionValidationError('Choose a valid review status.')

  const notes = input.notes.trim()

  if (notes.length > 4000)
    throw new AdminSubmissionValidationError('Review notes are too long.')

  const storedSubmission = await findStoredSubmission(input.kind, input.id)

  if (!storedSubmission)
    throw new AdminSubmissionNotFoundError('That submission could not be found.')

  const reviewedAt = new Date().toISOString()
  const nextRecord: StoredSubmissionRecord = {
    ...storedSubmission.record,
  }

  if (input.status === 'pending') {
    delete nextRecord.review
  }
  else {
    nextRecord.review = {
      notes,
      reviewedAt,
      status: input.status,
    }
  }

  const boardState = await syncBoardItemVisibilityFromSubmissionReview({
    actorLabel: 'Admin key',
    fields: nextRecord.fields,
    kind: input.kind,
    linkedItemId: nextRecord.board?.itemId,
    reviewStatus: input.status,
    submissionId: input.id,
  })

  if (boardState.itemId) {
    nextRecord.board = {
      ...nextRecord.board,
      itemId: boardState.itemId,
    }
  }

  await writeJsonFile(storedSubmission.filePath, nextRecord)
  await recordBoardActivity({
    action: 'submission_reviewed',
    actor: { kind: 'admin', label: 'Admin key' },
    category: 'moderation',
    createdAt: reviewedAt,
    detail: buildReviewLogDetail(input.status, boardState),
    itemId: boardState.itemId || undefined,
    kind: input.kind,
    submissionId: input.id,
    title: buildSubmissionTitle(input.kind, nextRecord.fields),
    visibilityState: boardState.publicState,
  })

  return normalizeSubmissionRecord(nextRecord, boardState)
}

export type { BoardActivityEntry }
