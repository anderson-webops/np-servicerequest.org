import type { SubmissionKind } from './submissions'

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
  id: string
  ok: boolean
}

export interface AuthResponse {
  antiBot: AntiBotChallenge
  ok: boolean
  viewer: ViewerAccount
}

export function getBoardEndpoint(apiBaseUrl: string, path: string) {
  const normalizedBaseUrl = apiBaseUrl.replace(/\/$/, '')
  const normalizedPath = path.startsWith('/') ? path : `/${path}`

  return `${normalizedBaseUrl}${normalizedPath}`
}
