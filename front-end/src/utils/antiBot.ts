import type { AntiBotChallenge } from './board'

const antiBotMinimumAgeMs = 1200
const antiBotMaximumAgeMs = 1000 * 60 * 60 * 12
const antiBotSafetyMarginMs = 100
const observedAtByChallenge = new WeakMap<AntiBotChallenge, number>()

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

export function markAntiBotChallengeObserved(challenge: AntiBotChallenge, observedAt = Date.now()) {
  observedAtByChallenge.set(challenge, observedAt)
  return challenge
}

function getObservedAt(challenge: AntiBotChallenge) {
  const existingObservedAt = observedAtByChallenge.get(challenge)

  if (typeof existingObservedAt === 'number')
    return existingObservedAt

  const observedAt = Date.now()
  observedAtByChallenge.set(challenge, observedAt)
  return observedAt
}

export function isAntiBotChallengeExpired(challenge: AntiBotChallenge) {
  return Date.now() - challenge.issuedAt >= antiBotMaximumAgeMs
}

export async function waitForAntiBotChallengeMinimumAge(challenge: AntiBotChallenge) {
  const now = Date.now()
  const observedAt = getObservedAt(challenge)
  const issuedAgeMs = now - challenge.issuedAt
  const observedAgeMs = now - observedAt
  const remainingMs = Math.max(antiBotMinimumAgeMs - issuedAgeMs, antiBotMinimumAgeMs - observedAgeMs)

  if (remainingMs > 0)
    await sleep(remainingMs + antiBotSafetyMarginMs)
}
