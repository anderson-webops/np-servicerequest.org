import { getApiEndpoint } from './api'

export const submissionKinds = {
  itemLending: 'item-lending',
  itemRequest: 'item-request',
  service: 'service-request',
} as const

export type SubmissionKind = (typeof submissionKinds)[keyof typeof submissionKinds]

export function getSubmissionEndpoint(apiBaseUrl: string, kind: SubmissionKind) {
  return getApiEndpoint(apiBaseUrl, `submissions/${kind}`)
}
