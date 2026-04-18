import type { AntiBotChallenge, BoardBootstrapResponse, SubmissionResponse } from '~/utils/board'
import { isAntiBotChallenge, isAntiBotChallengeExpired, markAntiBotChallengeObserved, waitForAntiBotChallengeMinimumAge } from '~/utils/antiBot'
import { getBoardEndpoint, rememberBoardDeleteToken } from '~/utils/board'
import { getSubmissionEndpoint, submissionKinds } from '~/utils/submissions'

export interface FormErrorState {
  detail: string
  message: string
}

export interface FormStatus {
  error: FormErrorState | null
  pending: boolean
  success: boolean
}

export function useBoardSubmission(kind: keyof typeof submissionKinds) {
  const runtimeConfig = useRuntimeConfig()

  const antiBotChallenge = ref<AntiBotChallenge | null>(null)
  const securityError = ref<FormErrorState | null>(null)
  const status = reactive<FormStatus>({
    error: null,
    pending: false,
    success: false,
  })

  function applyServerContext(payload: unknown) {
    if (!payload || typeof payload !== 'object')
      return

    const record = payload as Record<string, unknown>

    if (isAntiBotChallenge(record.antiBot))
      antiBotChallenge.value = markAntiBotChallengeObserved(record.antiBot)
  }

  function getApiErrorState(error: unknown, endpoint: string, fallbackMessage: string): FormErrorState {
    const fallbackDetail = `Request URL: ${endpoint}. Please try again in a moment.`
    let statusCode: number | null = null
    let serverMessage = ''

    if (error && typeof error === 'object') {
      if ('status' in error && typeof error.status === 'number')
        statusCode = error.status

      if ('data' in error) {
        const data = (error as { data?: unknown }).data
        applyServerContext(data)

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

  async function loadBootstrap() {
    const endpoint = getBoardEndpoint(runtimeConfig.public.apiBaseUrl, 'bootstrap')

    try {
      const response = await $fetch<BoardBootstrapResponse>(endpoint, {
        credentials: 'include',
      })

      applyServerContext(response)
      securityError.value = null
    }
    catch (error) {
      securityError.value = getApiErrorState(error, endpoint, 'Unable to initialize board security right now.')
    }
  }

  async function ensureAntiBotReady() {
    if (!antiBotChallenge.value || isAntiBotChallengeExpired(antiBotChallenge.value))
      await loadBootstrap()

    if (!antiBotChallenge.value)
      throw new Error('Missing anti-bot challenge.')

    await waitForAntiBotChallengeMinimumAge(antiBotChallenge.value)
  }

  async function submit(event: Event) {
    const form = event.currentTarget

    if (!(form instanceof HTMLFormElement))
      return null

    const endpoint = getSubmissionEndpoint(runtimeConfig.public.apiBaseUrl, submissionKinds[kind])
    status.pending = true
    status.success = false
    status.error = null

    const payload = Object.fromEntries(
      Array.from(new FormData(form).entries()).map(([key, value]) => [key, typeof value === 'string' ? value : '']),
    )

    try {
      await ensureAntiBotReady()

      const response = await $fetch<SubmissionResponse>(endpoint, {
        body: {
          ...payload,
          challengeIssuedAt: String(antiBotChallenge.value?.issuedAt || ''),
          challengeToken: antiBotChallenge.value?.token || '',
        },
        credentials: 'include',
        method: 'POST',
      })

      applyServerContext(response)

      if (response.boardItem?.id && response.deleteToken)
        rememberBoardDeleteToken(response.boardItem.id, response.deleteToken)

      form.reset()
      status.success = true
      return response
    }
    catch (error) {
      status.error = getApiErrorState(error, endpoint, 'We could not send your submission right now.')
      return null
    }
    finally {
      status.pending = false
    }
  }

  return {
    loadBootstrap,
    securityError,
    status,
    submit,
  }
}
