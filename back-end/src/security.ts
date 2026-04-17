import { Buffer } from 'node:buffer'
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { env } from 'node:process'

const antiBotSecret = env.ANTI_BOT_SECRET || randomBytes(32).toString('hex')
const antiBotMinAgeMs = 1200
const antiBotMaxAgeMs = 1000 * 60 * 60 * 12
const sessionDurationSeconds = 60 * 60 * 24 * 30

const requestBuckets = new Map<string, number[]>()

export const sessionCookieName = 'np_sr_session'

export interface AntiBotChallenge {
  action: string
  issuedAt: number
  token: string
}

export class BotProtectionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BotProtectionError'
  }
}

export class RateLimitError extends Error {
  retryAfterMs: number

  constructor(message: string, retryAfterMs: number) {
    super(message)
    this.name = 'RateLimitError'
    this.retryAfterMs = retryAfterMs
  }
}

function signChallenge(action: string, issuedAt: number) {
  return createHmac('sha256', antiBotSecret)
    .update(`${action}:${issuedAt}`)
    .digest('hex')
}

function getObjectValue(payload: unknown, key: string) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    return ''

  const value = (payload as Record<string, unknown>)[key]
  return typeof value === 'string' ? value.trim() : ''
}

function isSafeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)

  if (leftBuffer.length !== rightBuffer.length)
    return false

  return timingSafeEqual(leftBuffer, rightBuffer)
}

export function createAntiBotChallenge(action = 'board'): AntiBotChallenge {
  const issuedAt = Date.now()

  return {
    action,
    issuedAt,
    token: signChallenge(action, issuedAt),
  }
}

export function validateAntiBotPayload(payload: unknown, action = 'board') {
  const honeypot = getObjectValue(payload, 'bot-field')

  if (honeypot)
    throw new BotProtectionError('Automated submissions are not allowed.')

  const token = getObjectValue(payload, 'challengeToken')
  const issuedAtValue = getObjectValue(payload, 'challengeIssuedAt')
  const issuedAt = Number(issuedAtValue)

  if (!token || !Number.isFinite(issuedAt))
    throw new BotProtectionError('A fresh anti-bot challenge is required.')

  const ageMs = Date.now() - issuedAt

  if (ageMs < antiBotMinAgeMs)
    throw new BotProtectionError('Please wait a moment before submitting.')

  if (ageMs > antiBotMaxAgeMs)
    throw new BotProtectionError('This page has been open too long. Refresh and try again.')

  const expectedToken = signChallenge(action, issuedAt)

  if (!isSafeEqual(token, expectedToken))
    throw new BotProtectionError('The anti-bot challenge is invalid.')
}

export function consumeRateLimit(key: string, options: { limit: number, windowMs: number }) {
  const now = Date.now()
  const windowStart = now - options.windowMs
  const timestamps = (requestBuckets.get(key) || []).filter(timestamp => timestamp >= windowStart)

  if (timestamps.length >= options.limit) {
    const retryAfterMs = options.windowMs - (now - timestamps[0])
    throw new RateLimitError('Too many requests. Please slow down and try again soon.', retryAfterMs)
  }

  timestamps.push(now)
  requestBuckets.set(key, timestamps)
}

export function hashSessionToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export function readCookieValue(cookieHeader: string | undefined, name: string) {
  if (!cookieHeader)
    return null

  const target = `${name}=`

  for (const part of cookieHeader.split(';')) {
    const trimmedPart = part.trim()

    if (trimmedPart.startsWith(target))
      return trimmedPart.slice(target.length)
  }

  return null
}

export function createSessionCookie(token: string) {
  const segments = [
    `${sessionCookieName}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${sessionDurationSeconds}`,
  ]

  if (env.NODE_ENV === 'production')
    segments.push('Secure')

  return segments.join('; ')
}

export function clearSessionCookie() {
  const segments = [
    `${sessionCookieName}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ]

  if (env.NODE_ENV === 'production')
    segments.push('Secure')

  return segments.join('; ')
}

export function createSessionExpiry() {
  return new Date(Date.now() + sessionDurationSeconds * 1000).toISOString()
}
