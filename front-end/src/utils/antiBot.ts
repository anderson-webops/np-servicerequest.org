import type { AntiBotChallenge } from './board'

const antiBotMinimumAgeMs = 1200
const antiBotSafetyMarginMs = 50

function sleep(durationMs: number) {
  return new Promise(resolve => setTimeout(resolve, durationMs))
}

export function isAntiBotChallenge(value: unknown): value is AntiBotChallenge {
  return Boolean(
    value
    && typeof value === 'object'
    && 'action' in value
    && typeof value.action === 'string'
    && 'issuedAt' in value
    && typeof value.issuedAt === 'number'
    && 'token' in value
    && typeof value.token === 'string',
  )
}

export async function waitForAntiBotChallengeMinimumAge(challenge: AntiBotChallenge) {
  const challengeAgeMs = Date.now() - challenge.issuedAt
  const remainingMs = antiBotMinimumAgeMs - challengeAgeMs

  if (remainingMs > 0)
    await sleep(remainingMs + antiBotSafetyMarginMs)
}
