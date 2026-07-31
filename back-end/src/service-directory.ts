import { Buffer } from 'node:buffer'
import { env } from 'node:process'

import { listJsonDirectory, readJsonFile, removeFileIfExists, resolveDataPath, writeJsonFile } from './data.js'

export type ServiceDirectoryProviderId = 'idealist'

export interface ServiceDirectorySearchParams {
  lat?: number
  lng?: number
  page?: number
  pageSize?: number
  provider?: ServiceDirectoryProviderId
  query?: string
  radiusMiles?: number
  refresh?: boolean
}

export interface ServiceDirectoryProviderStatus {
  configured: boolean
  id: ServiceDirectoryProviderId
  lastAttemptedAt: string | null
  lastError: string | null
  lastSyncedAt: string | null
  listingCount: number
  message: string
  sourceUrl: string
  syncState: 'idle' | 'syncing' | 'unconfigured'
}

export interface ServiceDirectoryProviderResult {
  applyUrl: string
  areasOfFocus: string[]
  distanceMiles: number | null
  functionTags: string[]
  id: string
  imageUrl: string | null
  isRecurring: boolean
  locationLabel: string
  locationType: 'HYBRID' | 'ONSITE' | 'REMOTE' | 'UNKNOWN'
  matchReason: string
  opportunityUrl: string
  organizationName: string
  organizationUrl: string | null
  provider: ServiceDirectoryProviderId
  sourceUpdatedAt: string
  summary: string
  title: string
}

export interface ServiceDirectorySearchResponse {
  ok: true
  pagination: {
    hasNextPage: boolean
    hasPreviousPage: boolean
    page: number
    pageSize: number
    totalItems: number
    totalPages: number
  }
  provider: ServiceDirectoryProviderStatus
  query: {
    lat: number | null
    lng: number | null
    page: number
    pageSize: number
    provider: ServiceDirectoryProviderId
    query: string
    radiusMiles: number
    refresh: boolean
  }
  results: ServiceDirectoryProviderResult[]
}

interface IdealistListingFeedItem {
  id: string
  isPublished: boolean
  name: string | null
  updated: string
  url: {
    en: string | null
  }
}

interface IdealistListingFeedResponse {
  hasMore: boolean
  volops: IdealistListingFeedItem[]
}

interface IdealistListingDetailResponse {
  volop: IdealistListingDetail
}

interface IdealistListingDetail {
  address?: {
    city?: string | null
    country?: string | null
    full?: string | null
    latitude?: number | null
    longitude?: number | null
    state?: string | null
    stateCode?: string | null
    zipcode?: string | null
  } | null
  applyUrl?: string | null
  areasOfFocus?: string[] | null
  description?: string | null
  endDate?: string | null
  expires?: string | null
  functions?: string[] | null
  id: string
  image?: {
    medium?: string | null
    thumbnail?: string | null
  } | null
  isRecurring?: boolean | null
  locationType?: 'HYBRID' | 'ONSITE' | 'REMOTE' | string | null
  name?: string | null
  org?: {
    name?: string | null
    url?: {
      en?: string | null
    } | null
  } | null
  remoteCountry?: string | null
  remoteZone?: string | null
  startDate?: string | null
  updated: string
  url?: {
    en?: string | null
  } | null
}

interface IdealistStoredListing {
  applyUrl: string
  areasOfFocus: string[]
  functionTags: string[]
  id: string
  imageUrl: string | null
  isRecurring: boolean
  latitude: number | null
  locationLabel: string
  locationSearchText: string
  locationType: 'HYBRID' | 'ONSITE' | 'REMOTE' | 'UNKNOWN'
  longitude: number | null
  opportunityUrl: string
  organizationName: string
  organizationUrl: string | null
  searchText: string
  sourceUpdatedAt: string
  summary: string
  title: string
}

interface IdealistProviderState {
  cursorSince: string | null
  lastAttemptedAt: string | null
  lastError: string | null
  lastSyncedAt: string | null
}

const idealistProviderId: ServiceDirectoryProviderId = 'idealist'
const idealistSourceUrl = 'https://www.idealist.org/en/open-network-api'
const idealistBaseUrl = 'https://www.idealist.org'
const defaultPageSize = 12
const maxPageSize = 24
const defaultRadiusMiles = 40
const maxRadiusMiles = 250
const defaultInitialSyncDays = 45
const defaultSyncTtlMinutes = 360
const defaultMinimumRefreshMinutes = 15
const maxFeedPages = 25
const maxFeedListingsPerPage = 500
const maxListingsPerSync = 250
const maxProviderResponseBytes = 2 * 1024 * 1024
const foregroundSyncWaitMs = 3_000
let idealistSyncPromise: Promise<void> | null = null

function getIdealistApiKey() {
  return env.IDEALIST_API_KEY
    || env.IDEALIST_LISTINGS_API_KEY
    || env.SERVICE_DIRECTORY_IDEALIST_API_KEY
    || ''
}

function getIdealistSyncTtlMinutes() {
  return parsePositiveInt(env.IDEALIST_SYNC_TTL_MINUTES, defaultSyncTtlMinutes)
}

function getIdealistInitialSyncDays() {
  return parsePositiveInt(env.IDEALIST_INITIAL_SYNC_DAYS, defaultInitialSyncDays)
}

function getIdealistMinimumRefreshMinutes() {
  return parsePositiveInt(env.IDEALIST_MIN_REFRESH_MINUTES, defaultMinimumRefreshMinutes)
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsedValue = Number.parseInt(value || '', 10)

  if (!Number.isFinite(parsedValue) || parsedValue < 1)
    return fallback

  return parsedValue
}

function getInitialCursorSince() {
  return new Date(Date.now() - getIdealistInitialSyncDays() * 24 * 60 * 60 * 1000).toISOString()
}

function getIdealistListingFilePath(listingId: string) {
  return resolveDataPath('_service-directory', 'idealist', 'listings', `${normalizeIdealistListingId(listingId)}.json`)
}

function getIdealistStateFilePath() {
  return resolveDataPath('_service-directory', 'idealist', 'state.json')
}

function getIdealistListingDirectoryPath() {
  return resolveDataPath('_service-directory', 'idealist', 'listings')
}

async function readIdealistState() {
  return await readJsonFile<IdealistProviderState>(getIdealistStateFilePath()) || {
    cursorSince: null,
    lastAttemptedAt: null,
    lastError: null,
    lastSyncedAt: null,
  }
}

async function writeIdealistState(state: IdealistProviderState) {
  await writeJsonFile(getIdealistStateFilePath(), state)
}

function createIdealistHeaders() {
  return {
    Accept: 'application/json',
    Authorization: `Basic ${Buffer.from(`${getIdealistApiKey()}:`).toString('base64')}`,
  }
}

function normalizeIdealistListingId(value: string) {
  const listingId = typeof value === 'string' ? value.trim() : ''

  if (!/^[a-z0-9_-]{1,128}$/i.test(listingId))
    throw new Error('Idealist returned an invalid listing id.')

  return listingId
}

function normalizeExternalHttpUrl(
  value: string | null | undefined,
  fallback: string | null,
  options?: { httpsOnly?: boolean },
) {
  const candidate = typeof value === 'string' ? value.trim() || fallback : fallback

  if (!candidate)
    return null

  try {
    const url = new URL(candidate)
    const allowedProtocols = options?.httpsOnly ? ['https:'] : ['http:', 'https:']

    if (!allowedProtocols.includes(url.protocol) || url.username || url.password)
      return fallback

    return url.toString()
  }
  catch {
    return fallback
  }
}

function normalizeLocationType(value: string | null | undefined) {
  if (value === 'ONSITE' || value === 'HYBRID' || value === 'REMOTE')
    return value

  return 'UNKNOWN'
}

function stripHtml(value: string | null | undefined) {
  return (typeof value === 'string' ? value : '')
    .replaceAll(/<br\s*\/?>/gi, '\n')
    .replaceAll(/<\/p>/gi, '\n\n')
    .replaceAll(/<[^>]+>/g, ' ')
    .replaceAll(/&nbsp;/gi, ' ')
    .replaceAll(/&amp;/gi, '&')
    .replaceAll(/&quot;/gi, '"')
    .replaceAll(/&#39;/g, '\'')
    .replaceAll(/\s+/g, ' ')
    .trim()
}

function summarizeText(value: string, maxLength = 280) {
  if (value.length <= maxLength)
    return value

  return `${value.slice(0, maxLength - 1).trimEnd()}…`
}

function normalizeSearchText(parts: Array<string | null | undefined>) {
  return parts
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(' ')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, ' ')
    .trim()
}

function toLabel(value: string) {
  return value
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function formatIdealistLocation(detail: IdealistListingDetail) {
  const locationType = normalizeLocationType(detail.locationType)

  if (locationType === 'REMOTE') {
    const zoneParts = ['Remote']

    if (detail.remoteZone)
      zoneParts.push(toLabel(detail.remoteZone))

    if (detail.remoteCountry)
      zoneParts.push(detail.remoteCountry)

    return zoneParts.join(' • ')
  }

  const address = detail.address

  return address?.full
    || [address?.city, address?.stateCode || address?.state, address?.country].filter(Boolean).join(', ')
    || 'Location not specified'
}

function normalizeIdealistListing(detail: IdealistListingDetail): IdealistStoredListing {
  const description = stripHtml(detail.description).slice(0, 10_000)
  const summary = summarizeText(description || 'No summary provided.')
  const title = (typeof detail.name === 'string' ? detail.name.trim() : '').slice(0, 200)
    || 'Untitled opportunity'
  const locationLabel = formatIdealistLocation(detail).slice(0, 300)
  const locationType = normalizeLocationType(detail.locationType)
  const areasOfFocus = (Array.isArray(detail.areasOfFocus) ? detail.areasOfFocus : [])
    .filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
    .slice(0, 50)
    .map(value => value.trim().slice(0, 100))
  const functionTags = (Array.isArray(detail.functions) ? detail.functions : [])
    .filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
    .slice(0, 50)
    .map(value => value.trim().slice(0, 100))
  const opportunityUrl = normalizeExternalHttpUrl(
    detail.url?.en,
    `${idealistBaseUrl}/en/volunteer`,
    { httpsOnly: true },
  ) || `${idealistBaseUrl}/en/volunteer`

  return {
    applyUrl: normalizeExternalHttpUrl(detail.applyUrl, opportunityUrl, { httpsOnly: true }) || opportunityUrl,
    areasOfFocus,
    functionTags,
    id: normalizeIdealistListingId(detail.id),
    imageUrl: normalizeExternalHttpUrl(detail.image?.medium || detail.image?.thumbnail, null, { httpsOnly: true }),
    isRecurring: Boolean(detail.isRecurring),
    latitude: typeof detail.address?.latitude === 'number'
      && Number.isFinite(detail.address.latitude)
      && detail.address.latitude >= -90
      && detail.address.latitude <= 90
      ? detail.address.latitude
      : null,
    locationLabel,
    locationSearchText: normalizeSearchText([locationLabel]),
    locationType,
    longitude: typeof detail.address?.longitude === 'number'
      && Number.isFinite(detail.address.longitude)
      && detail.address.longitude >= -180
      && detail.address.longitude <= 180
      ? detail.address.longitude
      : null,
    opportunityUrl,
    organizationName: (typeof detail.org?.name === 'string' ? detail.org.name.trim() : '').slice(0, 200)
      || 'Organization not specified',
    organizationUrl: normalizeExternalHttpUrl(detail.org?.url?.en, null, { httpsOnly: true }),
    searchText: normalizeSearchText([
      title,
      description,
      detail.org?.name,
      locationLabel,
      ...areasOfFocus,
      ...functionTags,
    ]),
    sourceUpdatedAt: typeof detail.updated === 'string' ? detail.updated : '',
    summary,
    title,
  }
}

async function readBoundedJson<T>(response: Response): Promise<T> {
  const declaredLength = Number(response.headers.get('content-length') || '')

  if (Number.isFinite(declaredLength) && declaredLength > maxProviderResponseBytes)
    throw new Error('Idealist returned a response larger than the configured limit.')

  if (!response.body)
    throw new Error('Idealist returned an empty response body.')

  const reader = response.body.getReader()
  const chunks: Buffer[] = []
  let receivedBytes = 0

  while (true) {
    const { done, value } = await reader.read()

    if (done)
      break

    const chunk = Buffer.from(value)
    receivedBytes += chunk.length

    if (receivedBytes > maxProviderResponseBytes) {
      await reader.cancel()
      throw new Error('Idealist returned a response larger than the configured limit.')
    }

    chunks.push(chunk)
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T
}

async function fetchIdealistFeedPage(url: string) {
  const response = await fetch(url, {
    headers: createIdealistHeaders(),
    signal: AbortSignal.timeout(15_000),
  })

  if (!response.ok)
    throw new Error(`Idealist feed request failed with ${response.status} ${response.statusText}`)

  const data = await readBoundedJson<IdealistListingFeedResponse>(response)

  if (!data || !Array.isArray(data.volops))
    throw new Error('Idealist returned an invalid listing feed.')

  return {
    hasMore: Boolean(data.hasMore),
    volops: data.volops.slice(0, maxFeedListingsPerPage),
  }
}

async function fetchIdealistListingDetail(listingId: string) {
  const response = await fetch(`${idealistBaseUrl}/api/v1/listings/volops/${encodeURIComponent(normalizeIdealistListingId(listingId))}`, {
    headers: createIdealistHeaders(),
    signal: AbortSignal.timeout(15_000),
  })

  if (response.status === 404)
    return null

  if (!response.ok)
    throw new Error(`Idealist listing detail request failed with ${response.status} ${response.statusText}`)

  const data = await readBoundedJson<IdealistListingDetailResponse>(response)

  if (!data?.volop || typeof data.volop !== 'object')
    throw new Error('Idealist returned an invalid listing detail.')

  return data.volop
}

async function listStoredIdealistListings() {
  const listings = await listJsonDirectory<IdealistStoredListing>(getIdealistListingDirectoryPath())
  const now = Date.now()

  return listings.filter((listing) => {
    const updatedAt = Date.parse(listing.sourceUpdatedAt)
    return Number.isFinite(updatedAt) && updatedAt <= now + 5 * 60 * 1000
  })
}

async function syncIdealistListings() {
  if (!getIdealistApiKey())
    return

  if (idealistSyncPromise)
    return await idealistSyncPromise

  idealistSyncPromise = (async () => {
    const previousState = await readIdealistState()
    const nextState: IdealistProviderState = {
      ...previousState,
      lastAttemptedAt: new Date().toISOString(),
      lastError: null,
    }

    await writeIdealistState(nextState)

    try {
      const seenIds = new Set<string>()
      const unpublishedIds = new Set<string>()
      let since = previousState.cursorSince || getInitialCursorSince()
      let hasMore = true
      let pagesRemaining = maxFeedPages

      while (hasMore && pagesRemaining > 0) {
        const endpoint = new URL(`${idealistBaseUrl}/api/v1/listings/volops`)
        endpoint.searchParams.set('since', since)
        endpoint.searchParams.set('includeUnpublished', 'true')

        const feedPage = await fetchIdealistFeedPage(endpoint.toString())
        const listings = feedPage.volops || []

        if (!listings.length)
          break

        for (const listing of listings) {
          const listingId = normalizeIdealistListingId(listing.id)

          if (listing.isPublished)
            seenIds.add(listingId)
          else
            unpublishedIds.add(listingId)

          if (seenIds.size + unpublishedIds.size >= maxListingsPerSync) {
            hasMore = false
            break
          }
        }

        since = listings[listings.length - 1]?.updated || since
        hasMore = feedPage.hasMore
        pagesRemaining -= 1
      }

      for (const listingId of unpublishedIds)
        await removeFileIfExists(getIdealistListingFilePath(listingId))

      for (const listingId of seenIds) {
        const detail = await fetchIdealistListingDetail(listingId)

        if (!detail) {
          await removeFileIfExists(getIdealistListingFilePath(listingId))
          continue
        }

        await writeJsonFile(getIdealistListingFilePath(listingId), normalizeIdealistListing(detail))
      }

      await writeIdealistState({
        cursorSince: since,
        lastAttemptedAt: nextState.lastAttemptedAt,
        lastError: null,
        lastSyncedAt: new Date().toISOString(),
      })
    }
    catch (error) {
      await writeIdealistState({
        ...previousState,
        lastAttemptedAt: nextState.lastAttemptedAt,
        lastError: error instanceof Error ? error.message : 'Unknown Idealist sync error',
      })
      throw error
    }
  })()

  try {
    await idealistSyncPromise
  }
  finally {
    idealistSyncPromise = null
  }
}

function parseMaybeNumber(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function toRadians(value: number) {
  return value * (Math.PI / 180)
}

function getDistanceMiles(originLat: number, originLng: number, targetLat: number, targetLng: number) {
  const earthRadiusMiles = 3958.8
  const latDelta = toRadians(targetLat - originLat)
  const lngDelta = toRadians(targetLng - originLng)
  const originLatRadians = toRadians(originLat)
  const targetLatRadians = toRadians(targetLat)
  const a = Math.sin(latDelta / 2) ** 2
    + Math.cos(originLatRadians) * Math.cos(targetLatRadians) * Math.sin(lngDelta / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return earthRadiusMiles * c
}

function scoreListingMatch(listing: IdealistStoredListing, queryTokens: string[]) {
  if (!queryTokens.length)
    return 1

  let score = 0

  for (const token of queryTokens) {
    if (listing.title.toLowerCase().includes(token))
      score += 5

    if (listing.organizationName.toLowerCase().includes(token))
      score += 3

    if (listing.locationSearchText.includes(token))
      score += 2

    if (listing.searchText.includes(token))
      score += 1
  }

  return score
}

function buildMatchReason(listing: IdealistStoredListing, distanceMiles: number | null, queryTokens: string[]) {
  if (listing.locationType === 'REMOTE')
    return 'Matched from Idealist as a remote opportunity.'

  if (distanceMiles != null)
    return `Matched from Idealist within ${Math.round(distanceMiles)} miles of the active search origin.`

  if (queryTokens.length)
    return 'Matched against the live Idealist title, organization, or listing text.'

  return 'Live Idealist listing from the current cached provider index.'
}

async function getIdealistProviderStatus() {
  const [state, listings] = await Promise.all([
    readIdealistState(),
    listStoredIdealistListings(),
  ])

  const configured = Boolean(getIdealistApiKey())

  return {
    configured,
    id: idealistProviderId,
    lastAttemptedAt: state.lastAttemptedAt,
    lastError: state.lastError,
    lastSyncedAt: state.lastSyncedAt,
    listingCount: listings.length,
    message: configured
      ? state.lastSyncedAt
        ? 'Live Idealist listings are available through the local cached index.'
        : 'Idealist is configured but has not finished its first sync yet.'
      : 'Idealist is wired in source, but an API key is not configured on this server yet.',
    sourceUrl: idealistSourceUrl,
    syncState: configured ? (idealistSyncPromise ? 'syncing' : 'idle') : 'unconfigured',
  } satisfies ServiceDirectoryProviderStatus
}

function shouldSyncProvider(status: ServiceDirectoryProviderStatus, refresh: boolean) {
  if (!status.configured)
    return false

  if (refresh) {
    const lastAttemptedAt = Date.parse(status.lastAttemptedAt || '')

    return !Number.isFinite(lastAttemptedAt)
      || Date.now() - lastAttemptedAt >= getIdealistMinimumRefreshMinutes() * 60 * 1000
  }

  if (!status.lastSyncedAt || status.listingCount === 0)
    return true

  const syncedAt = Date.parse(status.lastSyncedAt)

  if (!Number.isFinite(syncedAt))
    return true

  return Date.now() - syncedAt >= getIdealistSyncTtlMinutes() * 60 * 1000
}

function buildPagination(totalItems: number, page: number, pageSize: number) {
  const totalPages = Math.max(Math.ceil(totalItems / pageSize), 1)
  const currentPage = Math.min(Math.max(page, 1), totalPages)

  return {
    currentPage,
    hasNextPage: currentPage < totalPages,
    hasPreviousPage: currentPage > 1,
    totalPages,
  }
}

export async function searchServiceDirectory(params: ServiceDirectorySearchParams): Promise<ServiceDirectorySearchResponse> {
  const provider = params.provider || idealistProviderId

  if (provider !== idealistProviderId)
    throw new Error(`Unsupported service directory provider: ${provider}`)

  const query = (params.query || '').trim()
  const queryTokens = normalizeSearchText([query]).split(' ').filter(Boolean)
  const page = Math.max(params.page || 1, 1)
  const pageSize = Math.min(Math.max(params.pageSize || defaultPageSize, 1), maxPageSize)
  const radiusMiles = Math.min(Math.max(params.radiusMiles || defaultRadiusMiles, 1), maxRadiusMiles)
  const parsedLat = parseMaybeNumber(params.lat)
  const parsedLng = parseMaybeNumber(params.lng)
  const lat = parsedLat != null && parsedLat >= -90 && parsedLat <= 90 ? parsedLat : null
  const lng = parsedLng != null && parsedLng >= -180 && parsedLng <= 180 ? parsedLng : null
  const refresh = Boolean(params.refresh)

  let providerStatus = await getIdealistProviderStatus()

  if (shouldSyncProvider(providerStatus, refresh)) {
    const sync = syncIdealistListings().catch((error) => {
      console.error('Failed to sync Idealist listings:', error)
    })
    let syncWait: NodeJS.Timeout | undefined
    await Promise.race([
      sync,
      new Promise<void>((resolveWait) => {
        syncWait = setTimeout(resolveWait, foregroundSyncWaitMs)
        syncWait.unref()
      }),
    ])
    clearTimeout(syncWait)

    providerStatus = await getIdealistProviderStatus()
  }

  const listings = await listStoredIdealistListings()
  const now = Date.now()

  const filteredResults = listings
    .filter((listing) => {
      const updatedAt = Date.parse(listing.sourceUpdatedAt)
      if (!Number.isFinite(updatedAt) || updatedAt > now + 5 * 60 * 1000)
        return false

      return scoreListingMatch(listing, queryTokens) > 0
    })
    .map((listing) => {
      const distanceMiles = lat != null
        && lng != null
        && listing.latitude != null
        && listing.longitude != null
        && listing.locationType !== 'REMOTE'
        ? getDistanceMiles(lat, lng, listing.latitude, listing.longitude)
        : null

      return {
        distanceMiles,
        listing,
        score: scoreListingMatch(listing, queryTokens),
      }
    })
    .filter((entry) => {
      if (entry.listing.locationType === 'REMOTE')
        return true

      if (lat == null || lng == null || entry.distanceMiles == null)
        return true

      return entry.distanceMiles <= radiusMiles
    })
    .sort((left, right) => {
      if (left.listing.locationType === 'REMOTE' && right.listing.locationType !== 'REMOTE')
        return 1

      if (right.listing.locationType === 'REMOTE' && left.listing.locationType !== 'REMOTE')
        return -1

      if (right.score !== left.score)
        return right.score - left.score

      if (left.distanceMiles != null && right.distanceMiles != null && left.distanceMiles !== right.distanceMiles)
        return left.distanceMiles - right.distanceMiles

      return Date.parse(right.listing.sourceUpdatedAt) - Date.parse(left.listing.sourceUpdatedAt)
    })

  const paginationState = buildPagination(filteredResults.length, page, pageSize)
  const startIndex = (paginationState.currentPage - 1) * pageSize
  const results = filteredResults
    .slice(startIndex, startIndex + pageSize)
    .map<ServiceDirectoryProviderResult>(entry => ({
      applyUrl: entry.listing.applyUrl,
      areasOfFocus: entry.listing.areasOfFocus,
      distanceMiles: entry.distanceMiles,
      functionTags: entry.listing.functionTags,
      id: entry.listing.id,
      imageUrl: entry.listing.imageUrl,
      isRecurring: entry.listing.isRecurring,
      locationLabel: entry.listing.locationLabel,
      locationType: entry.listing.locationType,
      matchReason: buildMatchReason(entry.listing, entry.distanceMiles, queryTokens),
      opportunityUrl: entry.listing.opportunityUrl,
      organizationName: entry.listing.organizationName,
      organizationUrl: entry.listing.organizationUrl,
      provider: idealistProviderId,
      sourceUpdatedAt: entry.listing.sourceUpdatedAt,
      summary: entry.listing.summary,
      title: entry.listing.title,
    }))

  return {
    ok: true,
    pagination: {
      hasNextPage: paginationState.hasNextPage,
      hasPreviousPage: paginationState.hasPreviousPage,
      page: paginationState.currentPage,
      pageSize,
      totalItems: filteredResults.length,
      totalPages: paginationState.totalPages,
    },
    provider: providerStatus,
    query: {
      lat,
      lng,
      page: paginationState.currentPage,
      pageSize,
      provider,
      query,
      radiusMiles,
      refresh,
    },
    results,
  }
}
