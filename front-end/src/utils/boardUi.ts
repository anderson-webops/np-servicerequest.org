import type { SubmissionKind } from './submissions'

import { submissionKinds } from './submissions'

export interface BoardFormErrorState {
  detail: string
  message: string
}

export interface BoardFormStatus {
  error: BoardFormErrorState | null
  pending: boolean
  success: boolean
}

export interface BoardReplyDraft {
  'bot-field': string
  'contact': string
  'message': string
  'name': string
}

export function formatBoardDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function getReplyActionLabel(kind: SubmissionKind) {
  if (kind === submissionKinds.service)
    return 'Offer help'

  if (kind === submissionKinds.itemRequest)
    return 'I can lend this'

  return 'I am interested'
}

export function getContactActionLabel(kind: SubmissionKind) {
  if (kind === submissionKinds.itemLending)
    return 'Reveal lender contact'

  return 'Reveal contact'
}

export function getRevealKey(itemId: string, interactionId?: string) {
  return interactionId ? `${itemId}:${interactionId}` : itemId
}

export function getInteractionDeleteKey(itemId: string, interactionId: string) {
  return `${itemId}:${interactionId}`
}

export function getBoardDetailPath(itemId: string) {
  return `/post?id=${encodeURIComponent(itemId)}`
}

export function getBoardApiErrorState(
  error: unknown,
  endpoint: string,
  fallbackMessage: string,
  applyServerContext?: (payload: unknown) => void,
): BoardFormErrorState {
  const fallbackDetail = `Request URL: ${endpoint}. Please try again in a moment.`
  let statusCode: number | null = null
  let serverMessage = ''

  if (error && typeof error === 'object') {
    if ('status' in error && typeof error.status === 'number')
      statusCode = error.status

    if ('data' in error) {
      const data = (error as { data?: unknown }).data
      applyServerContext?.(data)

      if (data && typeof data === 'object' && 'message' in data && typeof data.message === 'string')
        serverMessage = data.message
    }
  }

  if (statusCode === 404) {
    return {
      message: serverMessage || 'The server did not recognize this URL.',
      detail: `Request URL: ${endpoint}. A stale cached client can cause this after deployment, so try a hard refresh and then retry.`,
    }
  }

  if (statusCode === 429) {
    return {
      message: serverMessage || 'Too many requests arrived from this browser.',
      detail: 'The board is rate-limiting repeat actions for bot protection. Wait a moment, then try again.',
    }
  }

  if (statusCode != null) {
    return {
      message: serverMessage || fallbackMessage,
      detail: `Request URL: ${endpoint}.`,
    }
  }

  return {
    message: serverMessage || fallbackMessage,
    detail: serverMessage ? `Request URL: ${endpoint}.` : fallbackDetail,
  }
}
