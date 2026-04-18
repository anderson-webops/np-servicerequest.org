import type { ViewerAccount } from './accounts.js'
import type { SubmissionKind } from './submissions.js'

import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { listJsonDirectory, readJsonFile, removePathIfExists, resolveDataPath, writeJsonFile } from './data.js'
import { SubmissionValidationError } from './submissions.js'

const boardItemDirectory = resolveDataPath('_board', 'items')
const boardInteractionDirectory = resolveDataPath('_board', 'interactions')

type BoardItemStatus = 'open'

interface BoardAuthor {
  accountId?: string
  displayName: string
  hasAccount: boolean
}

interface BoardAttribute {
  label: string
  value: string
}

interface StoredBoardItem {
  attributes: BoardAttribute[]
  author: BoardAuthor
  contact: string
  createdAt: string
  deleteTokenHash?: string
  id: string
  interactionCount: number
  kind: SubmissionKind
  kindLabel: string
  lastActivityAt: string
  status: BoardItemStatus
  summary: string
  summaryLabel: string
  title: string
}

interface StoredBoardInteraction {
  author: BoardAuthor
  contact: string
  createdAt: string
  hasContact: boolean
  id: string
  itemId: string
  message: string
}

export interface PublicBoardInteraction {
  author: BoardAuthor
  createdAt: string
  hasContact: boolean
  id: string
  message: string
}

export interface PublicBoardItem {
  attributes: BoardAttribute[]
  author: BoardAuthor
  createdAt: string
  hasContact: boolean
  id: string
  interactionCount: number
  interactions: PublicBoardInteraction[]
  kind: SubmissionKind
  kindLabel: string
  lastActivityAt: string
  status: BoardItemStatus
  summary: string
  summaryLabel: string
  title: string
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

function getItemFilePath(itemId: string) {
  return resolve(boardItemDirectory, `${itemId}.json`)
}

function getInteractionDirectory(itemId: string) {
  return resolve(boardInteractionDirectory, itemId)
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

function toPublicInteraction(interaction: StoredBoardInteraction): PublicBoardInteraction {
  return {
    author: interaction.author,
    createdAt: interaction.createdAt,
    hasContact: interaction.hasContact,
    id: interaction.id,
    message: interaction.message,
  }
}

function toPublicItem(item: StoredBoardItem, interactions: StoredBoardInteraction[]): PublicBoardItem {
  return {
    attributes: item.attributes,
    author: item.author,
    createdAt: item.createdAt,
    hasContact: Boolean(item.contact),
    id: item.id,
    interactionCount: item.interactionCount,
    interactions: interactions.map(toPublicInteraction),
    kind: item.kind,
    kindLabel: item.kindLabel,
    lastActivityAt: item.lastActivityAt,
    status: item.status,
    summary: item.summary,
    summaryLabel: item.summaryLabel,
    title: item.title,
  }
}

async function getStoredBoardItem(itemId: string) {
  const item = await readJsonFile<StoredBoardItem>(getItemFilePath(itemId))

  if (!item)
    throw new BoardNotFoundError('That board item was not found.')

  return item
}

async function getStoredBoardInteraction(itemId: string, interactionId: string) {
  const interaction = await readJsonFile<StoredBoardInteraction>(getInteractionFilePath(itemId, interactionId))

  if (!interaction)
    throw new BoardNotFoundError('That board response was not found.')

  return interaction
}

async function listStoredInteractions(itemId: string) {
  const interactions = await listJsonDirectory<StoredBoardInteraction>(getInteractionDirectory(itemId))
  return interactions.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
}

export async function listBoardItems() {
  const items = await listJsonDirectory<StoredBoardItem>(boardItemDirectory)
  const publicItems = await Promise.all(
    items.map(async (item) => {
      const interactions = await listStoredInteractions(item.id)
      return toPublicItem(item, interactions)
    }),
  )

  return publicItems.sort((left, right) => Date.parse(right.lastActivityAt) - Date.parse(left.lastActivityAt))
}

export async function createBoardItemFromSubmission(input: {
  fields: Record<string, string>
  kind: SubmissionKind
  viewer: ViewerAccount | null
}) {
  const createdAt = new Date().toISOString()
  const labels = buildItemLabels(input.kind)
  const title = buildItemTitle(input.kind, input.fields)
  const summary = buildItemSummary(input.kind, input.fields)
  const authorName = cleanValue(input.fields.name)
  const contact = cleanValue(input.fields.contact)

  validateHumanText(title, 'A title')
  validateHumanText(summary, labels.summaryLabel, 4000)
  validateHumanText(authorName, 'A name', 80)
  validateHumanText(contact, 'A contact method', 320)
  const deleteToken = randomBytes(32).toString('hex')

  const item: StoredBoardItem = {
    id: randomUUID(),
    attributes: buildBoardAttributes(input.kind, input.fields),
    author: {
      accountId: input.viewer?.id,
      displayName: authorName,
      hasAccount: Boolean(input.viewer),
    },
    contact,
    createdAt,
    deleteTokenHash: hashDeleteToken(deleteToken),
    interactionCount: 0,
    kind: input.kind,
    kindLabel: labels.kindLabel,
    lastActivityAt: createdAt,
    status: 'open',
    summary,
    summaryLabel: labels.summaryLabel,
    title,
  }

  await writeJsonFile(getItemFilePath(item.id), item)
  return {
    deleteToken,
    item: toPublicItem(item, []),
  }
}

export async function createBoardInteraction(input: {
  contact: string
  itemId: string
  message: string
  name: string
  viewer: ViewerAccount | null
}) {
  const item = await getStoredBoardItem(input.itemId)
  const createdAt = new Date().toISOString()
  const authorName = cleanValue(input.name) || input.viewer?.displayName || ''
  const contact = cleanValue(input.contact) || input.viewer?.email || ''
  const message = cleanValue(input.message)

  validateHumanText(authorName, 'A name', 80)
  validateHumanText(contact, 'A contact method', 320)
  validateHumanText(message, 'A message', 2000)

  const interaction: StoredBoardInteraction = {
    author: {
      accountId: input.viewer?.id,
      displayName: authorName,
      hasAccount: Boolean(input.viewer),
    },
    contact,
    createdAt,
    hasContact: Boolean(contact),
    id: randomUUID(),
    itemId: input.itemId,
    message,
  }

  await writeJsonFile(getInteractionFilePath(input.itemId, interaction.id), interaction)
  await writeJsonFile(getItemFilePath(item.id), {
    ...item,
    interactionCount: item.interactionCount + 1,
    lastActivityAt: createdAt,
  })

  return toPublicInteraction(interaction)
}

export async function revealBoardItemContact(itemId: string) {
  const item = await getStoredBoardItem(itemId)

  if (!item.contact)
    throw new BoardNotFoundError('No contact method is available for that board item.')

  return item.contact
}

export async function revealBoardInteractionContact(itemId: string, interactionId: string) {
  await getStoredBoardItem(itemId)
  const interaction = await getStoredBoardInteraction(itemId, interactionId)

  if (!interaction.contact)
    throw new BoardNotFoundError('No contact method is available for that response.')

  return interaction.contact
}

export async function deleteBoardItem(input: {
  deleteToken: string
  itemId: string
  viewer: ViewerAccount | null
}) {
  const item = await getStoredBoardItem(input.itemId)
  const normalizedDeleteToken = cleanValue(input.deleteToken)
  const ownsByAccount = Boolean(input.viewer && item.author.accountId && input.viewer.id === item.author.accountId)
  const ownsByDeleteToken = Boolean(
    normalizedDeleteToken
    && item.deleteTokenHash
    && hashDeleteToken(normalizedDeleteToken) === item.deleteTokenHash,
  )

  if (!ownsByAccount && !ownsByDeleteToken)
    throw new BoardAuthorizationError('You are not allowed to delete that board item.')

  await removePathIfExists(getItemFilePath(item.id))
  await removePathIfExists(getInteractionDirectory(item.id))
}
