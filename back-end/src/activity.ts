import type { SubmissionKind } from './submissions.js'
import { randomUUID } from 'node:crypto'

import { resolve } from 'node:path'
import { listJsonDirectory, resolveDataPath, writeJsonFile } from './data.js'

export const boardActivityCategories = [
  'posts',
  'replies',
  'moderation',
  'deletions',
] as const

export type BoardActivityCategory = (typeof boardActivityCategories)[number]

export const boardActivityActorKinds = [
  'system',
  'admin',
  'account',
  'anonymous',
  'delete_token',
] as const

export type BoardActivityActorKind = (typeof boardActivityActorKinds)[number]

export interface BoardActivityActor {
  kind: BoardActivityActorKind
  label: string
}

export interface BoardActivityEntry {
  action: string
  actor: BoardActivityActor
  category: BoardActivityCategory
  createdAt: string
  detail: string
  id: string
  interactionId?: string
  itemId?: string
  kind?: SubmissionKind
  submissionId?: string
  title: string
  visibilityState?: string
}

function getBoardActivityDirectory() {
  return resolveDataPath('_board', 'activity')
}

function buildBoardActivityFileName(createdAt: string, id: string) {
  return `${createdAt.replaceAll(':', '-').replaceAll('.', '-')}--${id}.json`
}

export async function recordBoardActivity(input: {
  action: string
  actor: BoardActivityActor
  category: BoardActivityCategory
  createdAt?: string
  detail: string
  interactionId?: string
  itemId?: string
  kind?: SubmissionKind
  submissionId?: string
  title: string
  visibilityState?: string
}) {
  const createdAt = input.createdAt || new Date().toISOString()
  const entry: BoardActivityEntry = {
    action: input.action,
    actor: input.actor,
    category: input.category,
    createdAt,
    detail: input.detail,
    id: randomUUID(),
    interactionId: input.interactionId,
    itemId: input.itemId,
    kind: input.kind,
    submissionId: input.submissionId,
    title: input.title,
    visibilityState: input.visibilityState,
  }

  await writeJsonFile(
    resolve(getBoardActivityDirectory(), buildBoardActivityFileName(createdAt, entry.id)),
    entry,
  )

  return entry
}

export async function listBoardActivity(limit = 200) {
  const entries = await listJsonDirectory<BoardActivityEntry>(getBoardActivityDirectory())

  return entries
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .slice(0, limit)
}
