import type { SubmissionKind } from './submissions'
import { getApiEndpoint } from './api'

export const adminReviewStatuses = [
  'pending',
  'approved',
  'needs-follow-up',
  'rejected',
] as const

export type AdminReviewStatus = (typeof adminReviewStatuses)[number]

export type AdminBoardPublicState = 'visible' | 'hidden_by_admin' | 'deleted_by_owner' | 'deleted_by_admin' | 'not_created'

export type AdminActivityCategory = 'posts' | 'replies' | 'moderation' | 'deletions' | 'reports'

export type AdminActivityActorKind = 'system' | 'admin' | 'account' | 'anonymous' | 'delete_token'

export interface AdminFieldEntry {
  label: string
  value: string
}

export interface AdminSubmissionRecord {
  board: {
    itemId: string | null
    matchedBy: 'linked_item' | 'source_submission' | 'fingerprint' | 'not_found'
    publicState: AdminBoardPublicState
    publicStateLabel: string
    visibilityNote: string
  }
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

export interface AdminActivityEntry {
  action: string
  actor: {
    kind: AdminActivityActorKind
    label: string
  }
  category: AdminActivityCategory
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

export interface AdminSubmissionCounts {
  approved: number
  needsFollowUp: number
  pending: number
  rejected: number
  total: number
}

export interface AdminKindCounts {
  'all': number
  'item-lending': number
  'item-request': number
  'service-request': number
}

export interface AdminActivityCounts {
  deletions: number
  moderation: number
  posts: number
  reports: number
  replies: number
  total: number
}

export interface AdminPagination {
  hasNextPage: boolean
  hasPreviousPage: boolean
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
}

export interface AdminSubmissionsResponse {
  activity: AdminActivityEntry[]
  activityCounts: AdminActivityCounts
  activityPagination: AdminPagination
  counts: AdminSubmissionCounts
  kindCounts: AdminKindCounts
  ok: boolean
  submissions: AdminSubmissionRecord[]
  submissionsPagination: AdminPagination
}

export interface AdminReviewResponse {
  ok: boolean
  submission: AdminSubmissionRecord
}

export function getAdminEndpoint(apiBaseUrl: string, path: string) {
  const normalizedPath = path.replace(/^\/+/, '').replace(/^admin\/+/, '').replace(/^api\/admin\/+/, '')

  return getApiEndpoint(apiBaseUrl, `admin/${normalizedPath}`)
}

const adminKeyStorageKey = 'np_sr_admin_key'

export function readStoredAdminKey() {
  if (!import.meta.client)
    return ''

  return window.sessionStorage.getItem(adminKeyStorageKey) || ''
}

export function writeStoredAdminKey(adminKey: string) {
  if (!import.meta.client)
    return

  window.sessionStorage.setItem(adminKeyStorageKey, adminKey)
}

export function clearStoredAdminKey() {
  if (!import.meta.client)
    return

  window.sessionStorage.removeItem(adminKeyStorageKey)
}
