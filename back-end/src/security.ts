import { Buffer } from 'node:buffer'
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { env } from 'node:process'

const configuredAntiBotSecret = env.ANTI_BOT_SECRET?.trim() || ''

if (env.NODE_ENV === 'production' && configuredAntiBotSecret.length < 32)
  throw new Error('ANTI_BOT_SECRET must contain at least 32 characters in production.')

const antiBotSecret = configuredAntiBotSecret || randomBytes(32).toString('hex')
const antiBotMinAgeMs = 1200
const antiBotMaxAgeMs = 1000 * 60 * 60 * 12
const sessionDurationSeconds = 60 * 60 * 24 * 7
const rateLimitBucketLimit = 10_000

interface RequestBucket {
  lastSeenAt: number
  timestamps: number[]
  windowMs: number
}

const requestBuckets = new Map<string, RequestBucket>()
let lastRateLimitPruneAt = 0

export const sessionCookieName = env.NODE_ENV === 'production'
  ? '__Host-np_sr_session'
  : 'np_sr_session'

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

export class RequestOriginError extends Error {
  constructor(message = 'This request did not come from an allowed site origin.') {
    super(message)
    this.name = 'RequestOriginError'
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

export function isSafeEqual(left: string, right: string) {
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
  pruneRateLimitBuckets(now)
  const timestamps = (requestBuckets.get(key)?.timestamps || []).filter(timestamp => timestamp >= windowStart)

  if (timestamps.length >= options.limit) {
    const retryAfterMs = options.windowMs - (now - timestamps[0])
    throw new RateLimitError('Too many requests. Please slow down and try again soon.', retryAfterMs)
  }

  timestamps.push(now)
  requestBuckets.set(key, {
    lastSeenAt: now,
    timestamps,
    windowMs: options.windowMs,
  })
}

function pruneRateLimitBuckets(now: number) {
  if (now - lastRateLimitPruneAt < 60_000 && requestBuckets.size < rateLimitBucketLimit)
    return

  lastRateLimitPruneAt = now

  for (const [key, bucket] of requestBuckets) {
    if (bucket.lastSeenAt < now - bucket.windowMs)
      requestBuckets.delete(key)
  }

  while (requestBuckets.size >= rateLimitBucketLimit) {
    const oldestKey = requestBuckets.keys().next().value

    if (typeof oldestKey !== 'string')
      break

    requestBuckets.delete(oldestKey)
  }
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
    'SameSite=Strict',
    `Max-Age=${sessionDurationSeconds}`,
    'Priority=High',
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
    'SameSite=Strict',
    'Max-Age=0',
    'Priority=High',
  ]

  if (env.NODE_ENV === 'production')
    segments.push('Secure')

  return segments.join('; ')
}

export function createSessionExpiry() {
  return new Date(Date.now() + sessionDurationSeconds * 1000).toISOString()
}

export function hashRateLimitIdentifier(value: string) {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex')
}

function getAllowedOrigins() {
  const configuredOrigins = [
    env.BOARD_ALLOWED_ORIGINS,
    env.ALLOWED_ORIGINS,
  ]
    .flatMap(value => (value || '').split(','))
    .map(value => value.trim())
    .filter(Boolean)

  const defaults = env.NODE_ENV === 'production'
    ? ['https://np-servicerequest.org']
    : [
        'http://127.0.0.1:3006',
        'http://127.0.0.1:3333',
        'http://localhost:3006',
        'http://localhost:3333',
      ]

  return new Set(configuredOrigins.length ? configuredOrigins : defaults)
}

export function isAllowedRequestOrigin(origin: string | undefined) {
  return Boolean(origin && getAllowedOrigins().has(origin))
}

export function assertAllowedUnsafeRequest(input: {
  method: string
  origin?: string
  secFetchSite?: string
}) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(input.method.toUpperCase()))
    return

  if (input.origin) {
    if (!isAllowedRequestOrigin(input.origin))
      throw new RequestOriginError()

    return
  }

  if (input.secFetchSite && !['none', 'same-origin'].includes(input.secFetchSite))
    throw new RequestOriginError()
}
