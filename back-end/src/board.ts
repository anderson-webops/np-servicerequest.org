import type { ViewerAccount } from './accounts.js'
import type { BoardContactMethod } from './contact.js'
import type { GeoPoint } from './places.js'

import type { SubmissionKind } from './submissions.js'
import { createHash, randomBytes, randomUUID } from 'node:crypto'

import { resolve } from 'node:path'
import { recordBoardActivity } from './activity.js'
import { isEmailAddress, normalizeStructuredContact } from './contact.js'
import { listJsonDirectory, readJsonFile, removePathIfExists, resolveDataPath, writeJsonFile } from './data.js'
import { getDistanceMiles, inferKnownPlaceFromText } from './places.js'
import { SubmissionValidationError } from './submissions.js'

export const boardItemStatuses = [
  'visible',
  'hidden_by_admin',
  'deleted_by_owner',
  'deleted_by_admin',
] as const

export type BoardItemStatus = (typeof boardItemStatuses)[number]

export const boardItemResolutionStatuses = [
  'open',
  'fulfilled',
  'closed',
] as const

export type BoardItemResolutionStatus = (typeof boardItemResolutionStatuses)[number]

export const boardItemSortOrders = [
  'recent-activity',
  'newest',
  'oldest',
  'nearby',
] as const

export type BoardItemSortOrder = (typeof boardItemSortOrders)[number]

export const boardReportReasons = [
  'spam',
  'scam',
  'unsafe',
  'harassment',
  'wrong-category',
  'other',
] as const

export type BoardReportReason = (typeof boardReportReasons)[number]

export const boardNotificationPreferences = [
  'none',
  'email',
] as const

export type BoardNotificationPreference = (typeof boardNotificationPreferences)[number]

export const boardInteractionStatuses = [
  'visible',
  'deleted_by_author',
  'deleted_by_admin',
] as const

type BoardInteractionStatus = (typeof boardInteractionStatuses)[number]

type SubmissionReviewStatus = 'pending' | 'approved' | 'needs-follow-up' | 'rejected'

interface BoardAuthor {
  accountId?: string
  displayName: string
  hasAccount: boolean
}

interface BoardAttribute {
  label: string
  value: string
}

interface SubmissionSource {
  id: string
  kind: SubmissionKind
}

interface StoredBoardGeo {
  coordinates: GeoPoint
  label: string
  matchedPlaceId: string
  sourceText: string
}

interface StoredBoardItem {
  attributes: BoardAttribute[]
  author: BoardAuthor
  contact: string
  contactMethod?: BoardContactMethod
  contactNote?: string
  contactValue?: string
  createdAt: string
  deleteTokenHash?: string
  geo?: StoredBoardGeo
  id: string
  interactionCount: number
  kind: SubmissionKind
  kindLabel: string
  lastActivityAt: string
  managementTokenHash?: string
  notificationEmail?: string
  notificationPreference: BoardNotificationPreference
  resolutionChangedAt?: string
  resolutionStatus: BoardItemResolutionStatus | string
  sourceSubmission?: SubmissionSource
  status: BoardItemStatus
  statusChangedAt?: string
  summary: string
  summaryLabel: string
  title: string
}

interface StoredBoardInteraction {
  author: BoardAuthor
  contact: string
  contactMethod?: BoardContactMethod
  contactNote?: string
  contactValue?: string
  createdAt: string
  hasContact: boolean
  id: string
  itemId: string
  message: string
  status: BoardInteractionStatus
  statusChangedAt?: string
}

export interface PublicBoardInteraction {
  author: BoardAuthor
  createdAt: string
  hasContact: boolean
  id: string
  message: string
  status: Extract<BoardInteractionStatus, 'visible'>
}

export interface PublicBoardItem {
  attributes: BoardAttribute[]
  author: BoardAuthor
  createdAt: string
  distanceMiles: number | null
  hasContact: boolean
  id: string
  interactionCount: number
  interactions: PublicBoardInteraction[]
  kind: SubmissionKind
  kindLabel: string
  lastActivityAt: string
  resolutionChangedAt?: string
  resolutionStatus: BoardItemResolutionStatus
  status: Extract<BoardItemStatus, 'visible'>
  summary: string
  summaryLabel: string
  title: string
}

export interface BoardItemCounts {
  'all': number
  'item-lending': number
  'item-request': number
  'service-request': number
}

export interface BoardActivitySummary {
  answered: number
  closed: number
  fulfilled: number
  needsFirstReply: number
  open: number
  total: number
}

export interface BoardItemsPage {
  hasNextPage: boolean
  hasPreviousPage: boolean
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
}

export interface BoardItemListResult {
  activitySummary: BoardActivitySummary
  counts: BoardItemCounts
  items: PublicBoardItem[]
  pagination: BoardItemsPage
}

export interface SubmissionBoardState {
  itemId: string | null
  matchedBy: 'linked_item' | 'source_submission' | 'fingerprint' | 'not_found'
  publicState: BoardItemStatus | 'not_created'
}

export class BoardNotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BoardNotFoundError'
  }
}

export class BoardAuthorizationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BoardAuthorizationError'
  }
}

export class BoardValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BoardValidationError'
  }
}

function getBoardItemDirectory() {
  return resolveDataPath('_board', 'items')
}

function getBoardInteractionDirectory() {
  return resolveDataPath('_board', 'interactions')
}

function getItemFilePath(itemId: string) {
  return resolve(getBoardItemDirectory(), `${itemId}.json`)
}

function getInteractionDirectory(itemId: string) {
  return resolve(getBoardInteractionDirectory(), itemId)
}

function getInteractionFilePath(itemId: string, interactionId: string) {
  return resolve(getInteractionDirectory(itemId), `${interactionId}.json`)
}

function cleanValue(value: string | undefined) {
  return value?.trim() || ''
}

function hashDeleteToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function createBoardDeleteToken() {
  return randomBytes(32).toString('hex')
}

function createBoardManagementToken() {
  return randomBytes(32).toString('hex')
}

function countUrlMentions(value: string) {
  return value.match(/https?:\/\/|www\./gi)?.length || 0
}

function validateHumanText(value: string, fieldName: string, maxLength = 2000) {
  if (!value)
    throw new SubmissionValidationError(`${fieldName} is required.`)

  if (value.length > maxLength)
    throw new SubmissionValidationError(`${fieldName} is too long.`)

  if (countUrlMentions(value) > 2)
    throw new SubmissionValidationError(`${fieldName} contains too many links.`)
}

function buildItemLabels(kind: SubmissionKind) {
  switch (kind) {
    case 'service-request':
      return {
        kindLabel: 'Service Project',
        summaryLabel: 'Project details',
      }
    case 'item-request':
      return {
        kindLabel: 'Item Request',
        summaryLabel: 'Request details',
      }
    case 'item-lending':
      return {
        kindLabel: 'Item Lending',
        summaryLabel: 'Lending notes',
      }
    default:
      return {
        kindLabel: 'Board Item',
        summaryLabel: 'Details',
      }
  }
}

function buildBoardAttributes(kind: SubmissionKind, fields: Record<string, string>) {
  switch (kind) {
    case 'service-request':
      return [
        { label: 'Where', value: cleanValue(fields.location) },
        { label: 'Timing', value: cleanValue(fields.timing) },
      ].filter(attribute => attribute.value)
    case 'item-request':
      return [
        { label: 'Neighborhood', value: cleanValue(fields.neighborhood) },
        { label: 'Needed for', value: cleanValue(fields.duration) },
        { label: 'Needed by', value: cleanValue(fields.needed_by) },
        { label: 'Pickup plan', value: cleanValue(fields.pickup_plan) },
      ].filter(attribute => attribute.value)
    case 'item-lending':
      return [
        { label: 'Neighborhood', value: cleanValue(fields.neighborhood) },
        { label: 'Availability', value: cleanValue(fields.availability) },
        { label: 'Condition', value: cleanValue(fields.condition) },
      ].filter(attribute => attribute.value)
    default:
      return []
  }
}

function buildItemTitle(kind: SubmissionKind, fields: Record<string, string>) {
  switch (kind) {
    case 'service-request':
      return cleanValue(fields.project_type)
    case 'item-request':
      return cleanValue(fields.item_needed)
    case 'item-lending':
      return cleanValue(fields.item_available)
    default:
      return 'Community request'
  }
}

function buildItemSummary(kind: SubmissionKind, fields: Record<string, string>) {
  switch (kind) {
    case 'service-request':
    case 'item-request':
      return cleanValue(fields.details)
    case 'item-lending':
      return cleanValue(fields.guidelines)
    default:
      return ''
  }
}

function getBoardLocationText(kind: SubmissionKind, fields: Record<string, string>) {
  switch (kind) {
    case 'service-request':
      return cleanValue(fields.location)
    case 'item-request':
    case 'item-lending':
      return cleanValue(fields.neighborhood)
    default:
      return ''
  }
}

function buildBoardGeo(kind: SubmissionKind, fields: Record<string, string>) {
  const locationText = getBoardLocationText(kind, fields)

  if (!locationText)
    return undefined

  const inferredPlace = inferKnownPlaceFromText(locationText)

  if (!inferredPlace)
    return undefined

  return {
    coordinates: inferredPlace.coordinates,
    label: inferredPlace.label,
    matchedPlaceId: inferredPlace.id,
    sourceText: inferredPlace.sourceText,
  } satisfies StoredBoardGeo
}

function normalizeNotificationPreference(value: string) {
  return boardNotificationPreferences.includes(value as BoardNotificationPreference)
    ? value as BoardNotificationPreference
    : 'none'
}

function buildBoardNotificationSettings(input: {
  contact: ReturnType<typeof normalizeStructuredContact>
  fields: Record<string, string>
}) {
  const preference = normalizeNotificationPreference(cleanValue(input.fields.notification_preference))

  if (preference === 'none') {
    return {
      notificationEmail: '',
      notificationPreference: 'none' as const,
    }
  }

  const notificationEmail = cleanValue(input.fields.notification_email) || input.contact.managementEmail

  if (!notificationEmail || !isEmailAddress(notificationEmail))
    throw new SubmissionValidationError('Enter a valid email address for reply notifications.')

  return {
    notificationEmail,
    notificationPreference: 'email' as const,
  }
}

function isBoardItemVisibleToPublic(item: StoredBoardItem) {
  return item.status === 'visible'
}

function isBoardInteractionVisibleToPublic(interaction: StoredBoardInteraction) {
  return interaction.status === 'visible'
}

function isBoardItemOpen(item: StoredBoardItem) {
  return item.resolutionStatus === 'open'
}

function createEmptyBoardItemCounts(): BoardItemCounts {
  return {
    'all': 0,
    'item-lending': 0,
    'item-request': 0,
    'service-request': 0,
  }
}

function createBoardActivitySummary(items: StoredBoardItem[]): BoardActivitySummary {
  return items.reduce<BoardActivitySummary>((summary, item) => {
    const resolutionStatus = normalizeBoardResolutionStatus(item.resolutionStatus)

    summary.total += 1

    if (resolutionStatus === 'open')
      summary.open += 1
    else if (resolutionStatus === 'fulfilled')
      summary.fulfilled += 1
    else if (resolutionStatus === 'closed')
      summary.closed += 1

    if (item.interactionCount > 0)
      summary.answered += 1
    else if (resolutionStatus === 'open')
      summary.needsFirstReply += 1

    return summary
  }, {
    answered: 0,
    closed: 0,
    fulfilled: 0,
    needsFirstReply: 0,
    open: 0,
    total: 0,
  })
}

function normalizeBoardSearchQuery(value: string | undefined) {
  return cleanValue(value).slice(0, 120)
}

function buildBoardItemSearchText(item: StoredBoardItem) {
  return [
    item.kindLabel,
    item.title,
    item.summary,
    item.author.displayName,
    ...item.attributes.flatMap(attribute => [attribute.label, attribute.value]),
  ]
    .join(' ')
    .toLowerCase()
}

function matchesBoardSearchQuery(item: StoredBoardItem, query: string) {
  if (!query)
    return true

  const searchText = buildBoardItemSearchText(item)
  const normalizedQuery = query.toLowerCase()

  return normalizedQuery
    .split(/\s+/)
    .filter(Boolean)
    .every(term => searchText.includes(term))
}

function getBoardItemDistanceMiles(item: StoredBoardItem, origin?: GeoPoint) {
  if (!origin || !item.geo)
    return null

  return getDistanceMiles(origin, item.geo.coordinates)
}

function normalizeBoardResolutionStatus(value: string) {
  if (boardItemResolutionStatuses.includes(value as BoardItemResolutionStatus))
    return value as BoardItemResolutionStatus

  return value === 'resolved' ? 'fulfilled' : 'open'
}

function sortBoardItems(items: StoredBoardItem[], options: {
  origin?: GeoPoint
  sort: BoardItemSortOrder
}) {
  return [...items].sort((left, right) => {
    if (options.sort === 'newest')
      return Date.parse(right.createdAt) - Date.parse(left.createdAt)

    if (options.sort === 'oldest')
      return Date.parse(left.createdAt) - Date.parse(right.createdAt)

    if (options.sort === 'nearby' && options.origin) {
      const leftDistance = getBoardItemDistanceMiles(left, options.origin)
      const rightDistance = getBoardItemDistanceMiles(right, options.origin)

      if (leftDistance != null && rightDistance != null) {
        if (leftDistance !== rightDistance)
          return leftDistance - rightDistance
      }
      else if (leftDistance != null) {
        return -1
      }
      else if (rightDistance != null) {
        return 1
      }
    }

    return Date.parse(right.lastActivityAt) - Date.parse(left.lastActivityAt)
  })
}

function formatBoardReportReason(reason: BoardReportReason) {
  switch (reason) {
    case 'spam':
      return 'spam'
    case 'scam':
      return 'a scam'
    case 'unsafe':
      return 'unsafe behavior'
    case 'harassment':
      return 'harassment'
    case 'wrong-category':
      return 'the wrong category'
    default:
      return 'another issue'
  }
}

function buildBoardReportDetail(reason: BoardReportReason, details: string, targetLabel: string) {
  const issueText = formatBoardReportReason(reason)

  if (details)
    return `Reported ${targetLabel} for ${issueText}. Note: ${details}`

  return `Reported ${targetLabel} for ${issueText}.`
}

function validateBoardReportPayload(input: { details: string, reason: string }) {
  if (!boardReportReasons.includes(input.reason as BoardReportReason))
    throw new BoardValidationError('Choose a valid report reason.')

  if (input.details.length > 1000)
    throw new BoardValidationError('Report details are too long.')

  if (input.details)
    validateHumanText(input.details, 'Report details', 1000)

  return {
    details: input.details,
    reason: input.reason as BoardReportReason,
  }
}

function assertPublicBoardItemAvailable(item: StoredBoardItem) {
  if (!isBoardItemVisibleToPublic(item))
    throw new BoardNotFoundError('That board item is no longer available on the public board.')
}

function assertPublicBoardItemOpenForReplies(item: StoredBoardItem) {
  if (!isBoardItemOpen(item))
    throw new BoardValidationError('That board item is already closed to new public replies. Reopen it before posting a new response.')
}

function assertPublicBoardInteractionAvailable(interaction: StoredBoardInteraction) {
  if (!isBoardInteractionVisibleToPublic(interaction))
    throw new BoardNotFoundError('That board response is no longer available on the public board.')
}

function buildSubmissionFingerprint(kind: SubmissionKind, fields: Record<string, string>) {
  const contact = normalizeStructuredContact({
    legacyContact: fields.contact,
    method: fields.contact_method,
    note: fields.contact_note,
    value: fields.contact_value,
  })

  return {
    authorName: cleanValue(fields.name),
    contact: contact.display,
    summary: buildItemSummary(kind, fields),
    title: buildItemTitle(kind, fields),
  }
}

function doesItemMatchSubmissionFingerprint(item: StoredBoardItem, kind: SubmissionKind, fields: Record<string, string>) {
  const fingerprint = buildSubmissionFingerprint(kind, fields)

  return item.kind === kind
    && item.author.displayName === fingerprint.authorName
    && item.contact === fingerprint.contact
    && item.title === fingerprint.title
    && item.summary === fingerprint.summary
}

export function describeBoardItemStatus(status: BoardItemStatus | 'not_created') {
  switch (status) {
    case 'visible':
      return 'Visible'
    case 'hidden_by_admin':
      return 'Hidden by admin'
    case 'deleted_by_owner':
      return 'Deleted by owner'
    case 'deleted_by_admin':
      return 'Deleted by admin'
    default:
      return 'No board item found'
  }
}

function toPublicInteraction(interaction: StoredBoardInteraction): PublicBoardInteraction {
  return {
    author: interaction.author,
    createdAt: interaction.createdAt,
    hasContact: interaction.hasContact,
    id: interaction.id,
    message: interaction.message,
    status: 'visible',
  }
}

function toPublicItem(item: StoredBoardItem, interactions: StoredBoardInteraction[], options?: {
  origin?: GeoPoint
}): PublicBoardItem {
  return {
    attributes: item.attributes,
    author: item.author,
    createdAt: item.createdAt,
    distanceMiles: getBoardItemDistanceMiles(item, options?.origin),
    hasContact: Boolean(item.contact),
    id: item.id,
    interactionCount: interactions.length,
    interactions: interactions.map(toPublicInteraction),
    kind: item.kind,
    kindLabel: item.kindLabel,
    lastActivityAt: item.lastActivityAt,
    resolutionChangedAt: item.resolutionChangedAt,
    resolutionStatus: normalizeBoardResolutionStatus(item.resolutionStatus),
    status: 'visible',
    summary: item.summary,
    summaryLabel: item.summaryLabel,
    title: item.title,
  }
}

function getBoardItemManagementAccess(input: {
  deleteToken: string
  item: StoredBoardItem
  viewer: ViewerAccount | null
}) {
  const normalizedDeleteToken = cleanValue(input.deleteToken)
  const ownsByAdmin = Boolean(input.viewer?.isAdmin)
  const ownsByAccount = Boolean(input.viewer && input.item.author.accountId && input.viewer.id === input.item.author.accountId)
  const ownsByDeleteToken = Boolean(
    normalizedDeleteToken
    && input.item.deleteTokenHash
    && hashDeleteToken(normalizedDeleteToken) === input.item.deleteTokenHash,
  )

  return {
    actor: ownsByAdmin
      ? { kind: 'admin' as const, label: input.viewer?.displayName || 'Admin account' }
      : ownsByAccount
        ? { kind: 'account' as const, label: input.viewer?.displayName || input.item.author.displayName }
        : ownsByDeleteToken
          ? { kind: 'delete_token' as const, label: 'Management link' }
          : null,
    canManage: ownsByAdmin || ownsByAccount || ownsByDeleteToken,
    ownsByAdmin,
  }
}

function normalizeStoredBoardItem(item: StoredBoardItem) {
  return {
    ...item,
    notificationEmail: cleanValue(item.notificationEmail) || undefined,
    notificationPreference: normalizeNotificationPreference(cleanValue(item.notificationPreference)),
    resolutionStatus: normalizeBoardResolutionStatus(item.resolutionStatus),
  } satisfies StoredBoardItem
}

async function getStoredBoardItem(itemId: string) {
  const item = await readJsonFile<StoredBoardItem>(getItemFilePath(itemId))

  if (!item)
    throw new BoardNotFoundError('That board item was not found.')

  return normalizeStoredBoardItem(item)
}

async function getStoredBoardInteraction(itemId: string, interactionId: string) {
  const interaction = await readJsonFile<StoredBoardInteraction>(getInteractionFilePath(itemId, interactionId))

  if (!interaction)
    throw new BoardNotFoundError('That board response was not found.')

  return interaction
}

async function listStoredBoardItems() {
  return (await listJsonDirectory<StoredBoardItem>(getBoardItemDirectory())).map(normalizeStoredBoardItem)
}

async function listStoredInteractions(itemId: string) {
  const interactions = await listJsonDirectory<StoredBoardInteraction>(getInteractionDirectory(itemId))
  return interactions.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
}

async function writeStoredBoardItem(item: StoredBoardItem) {
  await writeJsonFile(getItemFilePath(item.id), item)
}

async function writeStoredBoardInteraction(interaction: StoredBoardInteraction) {
  await writeJsonFile(getInteractionFilePath(interaction.itemId, interaction.id), interaction)
}

async function findStoredBoardItemForSubmission(input: {
  fields: Record<string, string>
  kind: SubmissionKind
  linkedItemId?: string
  submissionId: string
}) {
  if (input.linkedItemId) {
    try {
      return {
        item: await getStoredBoardItem(input.linkedItemId),
        matchedBy: 'linked_item' as const,
      }
    }
    catch (error) {
      if (!(error instanceof BoardNotFoundError))
        throw error
    }
  }

  const items = await listStoredBoardItems()
  const sourceMatch = items.find(item =>
    item.sourceSubmission?.id === input.submissionId
    && item.sourceSubmission.kind === input.kind,
  )

  if (sourceMatch) {
    return {
      item: sourceMatch,
      matchedBy: 'source_submission' as const,
    }
  }

  const fingerprintMatch = items.find(item => doesItemMatchSubmissionFingerprint(item, input.kind, input.fields))

  if (fingerprintMatch) {
    return {
      item: fingerprintMatch,
      matchedBy: 'fingerprint' as const,
    }
  }

  return {
    item: null,
    matchedBy: 'not_found' as const,
  }
}

async function ensureSubmissionLinkOnBoardItem(item: StoredBoardItem, submissionId: string, kind: SubmissionKind) {
  if (item.sourceSubmission?.id === submissionId && item.sourceSubmission.kind === kind)
    return item

  const nextItem: StoredBoardItem = {
    ...item,
    sourceSubmission: {
      id: submissionId,
      kind,
    },
  }

  await writeStoredBoardItem(nextItem)
  return nextItem
}

export async function getBoardStateForSubmission(input: {
  fields: Record<string, string>
  kind: SubmissionKind
  linkedItemId?: string
  submissionId: string
}): Promise<SubmissionBoardState> {
  const match = await findStoredBoardItemForSubmission(input)

  if (!match.item) {
    return {
      itemId: null,
      matchedBy: 'not_found',
      publicState: 'not_created',
    }
  }

  return {
    itemId: match.item.id,
    matchedBy: match.matchedBy,
    publicState: match.item.status,
  }
}

export async function listBoardItems(options?: {
  kind?: SubmissionKind | 'all'
  lat?: number
  lng?: number
  page?: number
  pageSize?: number
  query?: string
  sort?: BoardItemSortOrder
}): Promise<BoardItemListResult> {
  const kindFilter = options?.kind && options.kind !== 'all' ? options.kind : 'all'
  const requestedPageSize = options?.pageSize ?? 12
  const pageSize = Math.min(Math.max(Math.trunc(requestedPageSize) || 12, 1), 50)
  const requestedPage = Math.max(Math.trunc(options?.page || 1), 1)
  const searchQuery = normalizeBoardSearchQuery(options?.query)
  const sort = options?.sort && boardItemSortOrders.includes(options.sort)
    ? options.sort
    : 'recent-activity'
  const origin = Number.isFinite(options?.lat) && Number.isFinite(options?.lng)
    ? {
        lat: Number(options?.lat),
        lng: Number(options?.lng),
      }
    : undefined
  const allVisibleItems = (await listStoredBoardItems())
    .filter(isBoardItemVisibleToPublic)
  const searchedItems = allVisibleItems.filter(item => matchesBoardSearchQuery(item, searchQuery))

  const counts = searchedItems.reduce<BoardItemCounts>((summary, item) => {
    summary.all += 1
    summary[item.kind] += 1
    return summary
  }, createEmptyBoardItemCounts())

  const filteredItems = kindFilter === 'all'
    ? searchedItems
    : searchedItems.filter(item => item.kind === kindFilter)
  const activitySummary = createBoardActivitySummary(filteredItems)
  const sortedItems = sortBoardItems(filteredItems, {
    origin,
    sort,
  })

  const totalItems = sortedItems.length
  const totalPages = totalItems > 0 ? Math.ceil(totalItems / pageSize) : 1
  const page = Math.min(requestedPage, totalPages)
  const startIndex = (page - 1) * pageSize
  const pagedItems = sortedItems.slice(startIndex, startIndex + pageSize)

  const publicItems = await Promise.all(
    pagedItems.map(async (item) => {
      const interactions = (await listStoredInteractions(item.id)).filter(isBoardInteractionVisibleToPublic)
      return toPublicItem(item, interactions, { origin })
    }),
  )

  return {
    activitySummary,
    counts,
    items: publicItems,
    pagination: {
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
      page,
      pageSize,
      totalItems,
      totalPages,
    },
  }
}

export function describeBoardItemResolutionStatus(status: BoardItemResolutionStatus) {
  switch (status) {
    case 'fulfilled':
      return 'Fulfilled'
    case 'closed':
      return 'Closed'
    default:
      return 'Open'
  }
}

export async function getPublicBoardItem(itemId: string) {
  const item = await getStoredBoardItem(itemId)
  assertPublicBoardItemAvailable(item)

  const interactions = (await listStoredInteractions(item.id)).filter(isBoardInteractionVisibleToPublic)
  return toPublicItem(item, interactions)
}

export async function createBoardItemFromSubmission(input: {
  fields: Record<string, string>
  kind: SubmissionKind
  submissionId: string
  viewer: ViewerAccount | null
}) {
  const createdAt = new Date().toISOString()
  const labels = buildItemLabels(input.kind)
  const title = buildItemTitle(input.kind, input.fields)
  const summary = buildItemSummary(input.kind, input.fields)
  const authorName = cleanValue(input.fields.name)
  const contact = normalizeStructuredContact({
    legacyContact: input.fields.contact,
    method: input.fields.contact_method,
    note: input.fields.contact_note,
    value: input.fields.contact_value,
  })

  validateHumanText(title, 'A title')
  validateHumanText(summary, labels.summaryLabel, 4000)
  validateHumanText(authorName, 'A name', 80)
  if (contact.invalidMethod)
    throw new SubmissionValidationError('Choose a valid contact method.')
  if (contact.invalidValue) {
    throw new SubmissionValidationError(
      contact.method === 'email'
        ? 'Enter a valid email address.'
        : 'Enter a valid phone number.',
    )
  }
  validateHumanText(contact.value, 'A contact method', 320)
  if (contact.note)
    validateHumanText(contact.note, 'A contact note', 320)
  const notificationSettings = buildBoardNotificationSettings({
    contact,
    fields: input.fields,
  })
  const deleteToken = createBoardDeleteToken()
  const managementToken = !input.viewer && contact.managementEmail ? createBoardManagementToken() : ''

  const item: StoredBoardItem = {
    id: randomUUID(),
    attributes: buildBoardAttributes(input.kind, input.fields),
    author: {
      accountId: input.viewer?.id,
      displayName: authorName,
      hasAccount: Boolean(input.viewer),
    },
    contact: contact.display,
    contactMethod: contact.method || undefined,
    contactNote: contact.note || undefined,
    contactValue: contact.value || undefined,
    createdAt,
    deleteTokenHash: hashDeleteToken(deleteToken),
    geo: buildBoardGeo(input.kind, input.fields),
    interactionCount: 0,
    kind: input.kind,
    kindLabel: labels.kindLabel,
    lastActivityAt: createdAt,
    managementTokenHash: managementToken ? hashDeleteToken(managementToken) : undefined,
    notificationEmail: notificationSettings.notificationEmail || undefined,
    notificationPreference: notificationSettings.notificationPreference,
    resolutionStatus: 'open',
    sourceSubmission: {
      id: input.submissionId,
      kind: input.kind,
    },
    status: 'visible',
    summary,
    summaryLabel: labels.summaryLabel,
    title,
  }

  await writeStoredBoardItem(item)
  await recordBoardActivity({
    action: 'board_item_created',
    actor: input.viewer
      ? { kind: 'account', label: authorName }
      : { kind: 'anonymous', label: authorName },
    category: 'posts',
    createdAt,
    detail: 'Posted to the public board.',
    itemId: item.id,
    kind: input.kind,
    submissionId: input.submissionId,
    title: item.title,
    visibilityState: item.status,
  })

  return {
    deleteToken,
    item: toPublicItem(item, []),
    managementRecipientEmail: managementToken ? contact.managementEmail : '',
    managementToken,
  }
}

export async function createBoardInteraction(input: {
  contact: string
  contactMethod: string
  contactNote: string
  contactValue: string
  itemId: string
  message: string
  name: string
  viewer: ViewerAccount | null
}) {
  const item = await getStoredBoardItem(input.itemId)
  assertPublicBoardItemAvailable(item)
  assertPublicBoardItemOpenForReplies(item)

  const createdAt = new Date().toISOString()
  const authorName = cleanValue(input.name) || input.viewer?.displayName || ''
  const contact = normalizeStructuredContact({
    legacyContact: input.contact || input.viewer?.email || '',
    method: input.contactMethod || (input.viewer?.email ? 'email' : ''),
    note: input.contactNote,
    value: input.contactValue || '',
  })
  const message = cleanValue(input.message)

  validateHumanText(authorName, 'A name', 80)
  if (contact.invalidMethod)
    throw new SubmissionValidationError('Choose a valid contact method.')
  if (contact.invalidValue) {
    throw new SubmissionValidationError(
      contact.method === 'email'
        ? 'Enter a valid email address.'
        : 'Enter a valid phone number.',
    )
  }
  validateHumanText(contact.value, 'A contact method', 320)
  if (contact.note)
    validateHumanText(contact.note, 'A contact note', 320)
  validateHumanText(message, 'A message', 2000)

  const interaction: StoredBoardInteraction = {
    author: {
      accountId: input.viewer?.id,
      displayName: authorName,
      hasAccount: Boolean(input.viewer),
    },
    contact: contact.display,
    contactMethod: contact.method || undefined,
    contactNote: contact.note || undefined,
    contactValue: contact.value || undefined,
    createdAt,
    hasContact: Boolean(contact.display),
    id: randomUUID(),
    itemId: input.itemId,
    message,
    status: 'visible',
  }

  await writeStoredBoardInteraction(interaction)
  await writeStoredBoardItem({
    ...item,
    interactionCount: item.interactionCount + 1,
    lastActivityAt: createdAt,
  })
  await recordBoardActivity({
    action: 'board_interaction_created',
    actor: input.viewer
      ? { kind: 'account', label: authorName }
      : { kind: 'anonymous', label: authorName },
    category: 'replies',
    createdAt,
    detail: `Posted a reply on "${item.title}".`,
    interactionId: interaction.id,
    itemId: item.id,
    kind: item.kind,
    submissionId: item.sourceSubmission?.id,
    title: item.title,
    visibilityState: interaction.status,
  })

  return {
    interaction: toPublicInteraction(interaction),
    itemNotificationEmail: item.notificationEmail || '',
    itemNotificationPreference: item.notificationPreference,
    itemTitle: item.title,
  }
}

export async function setBoardItemResolution(input: {
  deleteToken: string
  itemId: string
  resolutionStatus: string
  viewer: ViewerAccount | null
}) {
  if (!boardItemResolutionStatuses.includes(input.resolutionStatus as BoardItemResolutionStatus))
    throw new BoardValidationError('Choose a valid board resolution status.')

  const item = await getStoredBoardItem(input.itemId)
  assertPublicBoardItemAvailable(item)

  const access = getBoardItemManagementAccess({
    deleteToken: input.deleteToken,
    item,
    viewer: input.viewer,
  })

  if (!access.canManage || !access.actor)
    throw new BoardAuthorizationError('You are not allowed to update that board item.')

  const nextResolutionStatus = input.resolutionStatus as BoardItemResolutionStatus

  if (item.resolutionStatus === nextResolutionStatus)
    return getPublicBoardItem(item.id)

  const changedAt = new Date().toISOString()
  const nextItem: StoredBoardItem = {
    ...item,
    resolutionChangedAt: changedAt,
    resolutionStatus: nextResolutionStatus,
  }

  await writeStoredBoardItem(nextItem)
  const action = nextResolutionStatus === 'fulfilled'
    ? 'board_item_fulfilled'
    : nextResolutionStatus === 'closed'
      ? 'board_item_closed'
      : 'board_item_reopened'
  const detail = nextResolutionStatus === 'fulfilled'
    ? 'Marked fulfilled while keeping the post visible for reference.'
    : nextResolutionStatus === 'closed'
      ? 'Closed the post to new public replies while keeping it visible.'
      : 'Reopened the post for new public replies.'
  await recordBoardActivity({
    action,
    actor: access.actor,
    category: 'moderation',
    createdAt: changedAt,
    detail,
    itemId: item.id,
    kind: item.kind,
    submissionId: item.sourceSubmission?.id,
    title: item.title,
    visibilityState: item.status,
  })

  const interactions = (await listStoredInteractions(item.id)).filter(isBoardInteractionVisibleToPublic)
  return toPublicItem(nextItem, interactions)
}

export async function revealBoardItemContact(itemId: string) {
  const item = await getStoredBoardItem(itemId)
  assertPublicBoardItemAvailable(item)

  if (!item.contact)
    throw new BoardNotFoundError('No contact method is available for that board item.')

  return item.contact
}

export async function revealBoardInteractionContact(itemId: string, interactionId: string) {
  const item = await getStoredBoardItem(itemId)
  assertPublicBoardItemAvailable(item)

  const interaction = await getStoredBoardInteraction(itemId, interactionId)
  assertPublicBoardInteractionAvailable(interaction)

  if (!interaction.contact)
    throw new BoardNotFoundError('No contact method is available for that response.')

  return interaction.contact
}

export async function createBoardItemReport(input: {
  details: string
  itemId: string
  reason: string
  viewer: ViewerAccount | null
}) {
  const item = await getStoredBoardItem(input.itemId)
  assertPublicBoardItemAvailable(item)

  const report = validateBoardReportPayload({
    details: cleanValue(input.details),
    reason: cleanValue(input.reason),
  })

  const entry = await recordBoardActivity({
    action: 'board_item_reported',
    actor: input.viewer
      ? {
          kind: input.viewer.isAdmin ? 'admin' : 'account',
          label: input.viewer.displayName,
        }
      : { kind: 'anonymous', label: 'Anonymous reporter' },
    category: 'reports',
    detail: buildBoardReportDetail(report.reason, report.details, 'this post'),
    itemId: item.id,
    kind: item.kind,
    submissionId: item.sourceSubmission?.id,
    title: item.title,
    visibilityState: item.status,
  })

  return entry.id
}

export async function createBoardInteractionReport(input: {
  details: string
  interactionId: string
  itemId: string
  reason: string
  viewer: ViewerAccount | null
}) {
  const item = await getStoredBoardItem(input.itemId)
  assertPublicBoardItemAvailable(item)
  const interaction = await getStoredBoardInteraction(input.itemId, input.interactionId)
  assertPublicBoardInteractionAvailable(interaction)
  const report = validateBoardReportPayload({
    details: cleanValue(input.details),
    reason: cleanValue(input.reason),
  })

  const entry = await recordBoardActivity({
    action: 'board_interaction_reported',
    actor: input.viewer
      ? {
          kind: input.viewer.isAdmin ? 'admin' : 'account',
          label: input.viewer.displayName,
        }
      : { kind: 'anonymous', label: 'Anonymous reporter' },
    category: 'reports',
    detail: buildBoardReportDetail(report.reason, report.details, `reply on "${item.title}"`),
    interactionId: interaction.id,
    itemId: item.id,
    kind: item.kind,
    submissionId: item.sourceSubmission?.id,
    title: item.title,
    visibilityState: interaction.status,
  })

  return entry.id
}

export async function claimBoardItemManagement(input: {
  itemId: string
  managementToken: string
}) {
  const item = await getStoredBoardItem(input.itemId)
  const normalizedManagementToken = cleanValue(input.managementToken)
  const ownsByManagementToken = Boolean(
    normalizedManagementToken
    && item.managementTokenHash
    && hashDeleteToken(normalizedManagementToken) === item.managementTokenHash,
  )

  if (!ownsByManagementToken)
    throw new BoardAuthorizationError('That management link is invalid or has expired.')

  const deleteToken = createBoardDeleteToken()
  await writeStoredBoardItem({
    ...item,
    deleteTokenHash: hashDeleteToken(deleteToken),
  })

  return deleteToken
}

export async function syncBoardItemVisibilityFromSubmissionReview(input: {
  actorLabel: string
  fields: Record<string, string>
  kind: SubmissionKind
  linkedItemId?: string
  reviewStatus: SubmissionReviewStatus
  submissionId: string
}) {
  const match = await findStoredBoardItemForSubmission(input)

  if (!match.item) {
    return {
      changed: false,
      itemId: null,
      matchedBy: 'not_found' as const,
      publicState: 'not_created' as const,
    }
  }

  let nextItem = await ensureSubmissionLinkOnBoardItem(match.item, input.submissionId, input.kind)
  let changed = nextItem.id !== match.item.id
  const now = new Date().toISOString()
  let nextStatus = nextItem.status

  if (input.reviewStatus === 'rejected' && nextItem.status === 'visible')
    nextStatus = 'hidden_by_admin'
  else if (input.reviewStatus !== 'rejected' && nextItem.status === 'hidden_by_admin')
    nextStatus = 'visible'

  if (nextStatus !== nextItem.status) {
    nextItem = {
      ...nextItem,
      status: nextStatus,
      statusChangedAt: now,
    }
    await writeStoredBoardItem(nextItem)
    changed = true

    await recordBoardActivity({
      action: nextStatus === 'hidden_by_admin' ? 'board_item_hidden_by_admin' : 'board_item_restored_to_public',
      actor: { kind: 'admin', label: input.actorLabel },
      category: 'moderation',
      createdAt: now,
      detail: nextStatus === 'hidden_by_admin'
        ? 'Hidden from the public board because the submission was rejected.'
        : 'Restored to the public board after a review status change.',
      itemId: nextItem.id,
      kind: nextItem.kind,
      submissionId: input.submissionId,
      title: nextItem.title,
      visibilityState: nextStatus,
    })
  }

  return {
    changed,
    itemId: nextItem.id,
    matchedBy: match.matchedBy,
    publicState: nextItem.status,
  }
}

export async function deleteBoardItem(input: {
  deleteToken: string
  itemId: string
  viewer: ViewerAccount | null
}) {
  const item = await getStoredBoardItem(input.itemId)
  const access = getBoardItemManagementAccess({
    deleteToken: input.deleteToken,
    item,
    viewer: input.viewer,
  })

  if (!access.canManage || !access.actor)
    throw new BoardAuthorizationError('You are not allowed to delete that board item.')

  const nextStatus: BoardItemStatus = access.ownsByAdmin ? 'deleted_by_admin' : 'deleted_by_owner'

  if (item.status !== nextStatus) {
    const nextItem: StoredBoardItem = {
      ...item,
      status: nextStatus,
      statusChangedAt: new Date().toISOString(),
    }

    await writeStoredBoardItem(nextItem)
    await recordBoardActivity({
      action: 'board_item_deleted',
      actor: access.actor,
      category: 'deletions',
      detail: 'Removed from the public board while preserving the internal record.',
      itemId: item.id,
      kind: item.kind,
      submissionId: item.sourceSubmission?.id,
      title: item.title,
      visibilityState: nextStatus,
    })
  }
}

export async function deleteBoardInteraction(input: {
  interactionId: string
  itemId: string
  viewer: ViewerAccount | null
}) {
  const item = await getStoredBoardItem(input.itemId)
  const interaction = await getStoredBoardInteraction(input.itemId, input.interactionId)
  const ownsByAdmin = Boolean(input.viewer?.isAdmin)
  const ownsByAccount = Boolean(input.viewer && interaction.author.accountId && input.viewer.id === interaction.author.accountId)

  if (!ownsByAdmin && !ownsByAccount)
    throw new BoardAuthorizationError('You are not allowed to delete that board response.')

  const nextStatus: BoardInteractionStatus = ownsByAdmin ? 'deleted_by_admin' : 'deleted_by_author'

  if (interaction.status !== nextStatus) {
    await writeStoredBoardInteraction({
      ...interaction,
      status: nextStatus,
      statusChangedAt: new Date().toISOString(),
    })
    await recordBoardActivity({
      action: 'board_interaction_deleted',
      actor: ownsByAdmin
        ? { kind: 'admin', label: input.viewer?.displayName || 'Admin account' }
        : { kind: 'account', label: input.viewer?.displayName || interaction.author.displayName },
      category: 'deletions',
      detail: `Removed a reply from "${item.title}" while preserving the internal record.`,
      interactionId: interaction.id,
      itemId: item.id,
      kind: item.kind,
      submissionId: item.sourceSubmission?.id,
      title: item.title,
      visibilityState: nextStatus,
    })
  }

  const remainingVisibleInteractions = (await listStoredInteractions(item.id)).filter(isBoardInteractionVisibleToPublic)
  await writeStoredBoardItem({
    ...item,
    interactionCount: remainingVisibleInteractions.length,
    lastActivityAt: remainingVisibleInteractions[0]?.createdAt || item.createdAt,
  })
}

export async function purgeBoardItemArtifacts(itemId: string) {
  await removePathIfExists(getItemFilePath(itemId))
  await removePathIfExists(getInteractionDirectory(itemId))
}
