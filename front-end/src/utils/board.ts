import type { SubmissionKind } from './submissions'
import { getApiEndpoint } from './api'

export interface AntiBotChallenge {
  action: string
  issuedAt: number
  token: string
}

export interface ViewerAccount {
  createdAt: string
  displayName: string
  email: string
  id: string
}

export interface BoardAuthor {
  accountId?: string
  displayName: string
  hasAccount: boolean
}

export interface BoardAttribute {
  label: string
  value: string
}

export interface BoardInteraction {
  author: BoardAuthor
  createdAt: string
  hasContact: boolean
  id: string
  message: string
}

export interface BoardItem {
  attributes: BoardAttribute[]
  author: BoardAuthor
  createdAt: string
  hasContact: boolean
  id: string
  interactionCount: number
  interactions: BoardInteraction[]
  kind: SubmissionKind
  kindLabel: string
  lastActivityAt: string
  status: 'open'
  summary: string
  summaryLabel: string
  title: string
}

export interface BoardBootstrapResponse {
  antiBot: AntiBotChallenge
  viewer: ViewerAccount | null
}

export interface BoardItemsResponse {
  items: BoardItem[]
}

export interface BoardContactResponse {
  antiBot: AntiBotChallenge
  contact: string
  ok: boolean
}

export interface BoardDeleteResponse {
  antiBot: AntiBotChallenge
  itemId: string
  ok: boolean
}

export interface BoardInteractionResponse {
  antiBot: AntiBotChallenge
  interaction: BoardInteraction
  ok: boolean
}

export interface SubmissionResponse {
  accepted: boolean
  antiBot: AntiBotChallenge
  boardItem?: BoardItem
  createdAt: string
  deleteToken?: string
  id: string
  ok: boolean
}

export interface AuthResponse {
  antiBot: AntiBotChallenge
  ok: boolean
  viewer: ViewerAccount
}

export function getBoardEndpoint(apiBaseUrl: string, path: string) {
  const normalizedPath = path.replace(/^\/+/, '').replace(/^board\/+/, '').replace(/^api\/board\/+/, '')

  return getApiEndpoint(apiBaseUrl, `board/${normalizedPath}`)
}

const deleteTokenStorageKey = 'np_sr_board_delete_tokens'

function readDeleteTokenStore() {
  if (!import.meta.client)
    return {} as Record<string, string>

  try {
    const rawValue = window.localStorage.getItem(deleteTokenStorageKey)

    if (!rawValue)
      return {} as Record<string, string>

    const parsed = JSON.parse(rawValue)

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return {} as Record<string, string>

    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[0] === 'string' && typeof entry[1] === 'string'),
    )
  }
  catch {
    return {} as Record<string, string>
  }
}

function writeDeleteTokenStore(tokens: Record<string, string>) {
  if (!import.meta.client)
    return

  window.localStorage.setItem(deleteTokenStorageKey, JSON.stringify(tokens))
}

export function rememberBoardDeleteToken(itemId: string, token: string) {
  if (!import.meta.client || !itemId || !token)
    return

  const tokens = readDeleteTokenStore()
  tokens[itemId] = token
  writeDeleteTokenStore(tokens)
}

export function getStoredBoardDeleteToken(itemId: string) {
  return readDeleteTokenStore()[itemId] || ''
}

export function forgetBoardDeleteToken(itemId: string) {
  if (!import.meta.client)
    return

  const tokens = readDeleteTokenStore()

  if (!(itemId in tokens))
    return

  const nextTokens = Object.fromEntries(
    Object.entries(tokens).filter(([storedItemId]) => storedItemId !== itemId),
  )

  writeDeleteTokenStore(nextTokens)
}

export function listStoredBoardDeleteTokenIds() {
  return Object.keys(readDeleteTokenStore())
}
