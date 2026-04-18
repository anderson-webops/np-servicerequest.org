import type { SubmissionKind } from './submissions'
import { getApiEndpoint } from './api'

export const adminReviewStatuses = [
  'pending',
  'approved',
  'needs-follow-up',
  'rejected',
] as const

export type AdminReviewStatus = (typeof adminReviewStatuses)[number]

export interface AdminFieldEntry {
  label: string
  value: string
}

export interface AdminSubmissionRecord {
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

export interface AdminSubmissionsResponse {
  counts: AdminSubmissionCounts
  ok: boolean
  submissions: AdminSubmissionRecord[]
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
