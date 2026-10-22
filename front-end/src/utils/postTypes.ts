import type { SubmissionKind } from './submissions'
import { submissionKinds } from './submissions'

export interface PostTypeLink {
  icon: string
  kind: SubmissionKind
  label: string
  shortLabel: string
  tone: string
  to: string
}

// Icon and tone classes are literal strings so UnoCSS and the global
// stylesheet can see them.
export const postTypeLinks: PostTypeLink[] = [
  {
    icon: 'i-carbon-tool-kit',
    kind: submissionKinds.service,
    label: 'Request a service project',
    shortLabel: 'Service project',
    tone: 'kind-service',
    to: '/service-request',
  },
  {
    icon: 'i-carbon-box',
    kind: submissionKinds.itemRequest,
    label: 'Borrow an item',
    shortLabel: 'Borrow',
    tone: 'kind-borrow',
    to: '/item-request',
  },
  {
    icon: 'i-carbon-share',
    kind: submissionKinds.itemLending,
    label: 'Lend an item',
    shortLabel: 'Lend',
    tone: 'kind-lend',
    to: '/item-lending',
  },
]

export function getPostType(kind: SubmissionKind) {
  return postTypeLinks.find(postType => postType.kind === kind) || postTypeLinks[0]!
}

const relativeTimeUnits: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 60 * 60],
  ['month', 30 * 24 * 60 * 60],
  ['week', 7 * 24 * 60 * 60],
  ['day', 24 * 60 * 60],
  ['hour', 60 * 60],
  ['minute', 60],
]

export function formatRelativeTime(value: string, now = Date.now()) {
  const elapsedSeconds = (new Date(value).getTime() - now) / 1000

  if (!Number.isFinite(elapsedSeconds))
    return ''

  if (Math.abs(elapsedSeconds) < 60)
    return 'just now'

  const formatter = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' })

  for (const [unit, unitSeconds] of relativeTimeUnits) {
    if (Math.abs(elapsedSeconds) >= unitSeconds)
      return formatter.format(Math.round(elapsedSeconds / unitSeconds), unit)
  }

  return 'just now'
}

export function formatReplyCount(count: number) {
  return count === 1 ? '1 reply' : `${count} replies`
}
