import { getApiEndpoint } from './api'

export interface ServiceGeoPoint {
  lat: number
  lng: number
}

export interface ServiceKnownPlace {
  aliases: string[]
  coordinates: ServiceGeoPoint
  id: string
  label: string
}

export type ServiceDirectoryAudience = 'directory' | 'nonprofit' | 'government' | 'network'
export type ServiceDirectoryApiStatus = 'available' | 'partner' | 'manual'

export interface ServiceDirectoryEntry {
  apiNotes: string
  apiStatus: ServiceDirectoryApiStatus
  audience: ServiceDirectoryAudience
  coordinates?: ServiceGeoPoint
  coverageLabel: string
  id: string
  name: string
  opportunityUrl: string
  serviceAreas: string[]
  sourceUrl: string
  summary: string
  tags: string[]
  url: string
}

export interface ServiceDirectoryMatch extends ServiceDirectoryEntry {
  distanceMiles: number | null
  matchReason: string
}

export interface ServiceDirectoryProviderStatus {
  configured: boolean
  id: 'idealist'
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
  provider: 'idealist'
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
    provider: 'idealist'
    query: string
    radiusMiles: number
    refresh: boolean
  }
  results: ServiceDirectoryProviderResult[]
}

export function getServiceDirectoryEndpoint(apiBaseUrl: string, path = 'search') {
  const normalizedPath = path.replace(/^\/+/, '').replace(/^service-directory\/+/, '').replace(/^api\/service-directory\/+/, '')

  return getApiEndpoint(apiBaseUrl, `service-directory/${normalizedPath}`)
}

export const serviceDirectoryAudienceLabels: Record<ServiceDirectoryAudience, string> = {
  directory: 'Platform',
  government: 'Government',
  network: 'Network',
  nonprofit: 'Nonprofit',
}

export const serviceKnownPlaces: ServiceKnownPlace[] = [
  {
    aliases: ['atlanta', 'atlanta ga', 'atlanta georgia', 'metro atlanta', 'atl'],
    coordinates: { lat: 33.749, lng: -84.388 },
    id: 'atlanta-ga',
    label: 'Atlanta, GA',
  },
  {
    aliases: ['lawrenceville', 'lawrenceville ga', 'lawrenceville georgia', 'gwinnett', 'gwinnett county'],
    coordinates: { lat: 33.9562, lng: -83.9879 },
    id: 'lawrenceville-ga',
    label: 'Lawrenceville, GA',
  },
]

export const nationwideServiceSites: ServiceDirectoryEntry[] = [
  {
    apiNotes: 'Idealist advertises a volunteer listings API for integrating large-scale volunteer data directly into another platform.',
    apiStatus: 'available',
    audience: 'directory',
    coverageLabel: 'Nationwide / multi-country',
    id: 'idealist',
    name: 'Idealist Volunteer Match',
    opportunityUrl: 'https://www.idealist.org/en/volunteer',
    serviceAreas: ['United States', 'international'],
    sourceUrl: 'https://www.idealist.org/en/open-network-api',
    summary: 'Large volunteer opportunity marketplace with location, radius, cause-area, and skills-based search.',
    tags: ['volunteer opportunities', 'cause areas', 'skills', 'location radius'],
    url: 'https://www.idealist.org/',
  },
  {
    apiNotes: 'VolunteerMatch still publishes Open Network API material for direct opportunity syndication and GraphQL access; evaluate overlap with Idealist before integrating both.',
    apiStatus: 'available',
    audience: 'directory',
    coverageLabel: 'Nationwide',
    id: 'volunteermatch',
    name: 'VolunteerMatch Open Network',
    opportunityUrl: 'https://solutions.volunteermatch.org/open-network-api',
    serviceAreas: ['United States'],
    sourceUrl: 'https://solutions.volunteermatch.org/open-network-api',
    summary: 'VolunteerMatch network syndication and search infrastructure for embedding vetted opportunities into other products.',
    tags: ['graphql', 'api', 'syndication', 'zip code', 'virtual opportunities'],
    url: 'https://www.volunteermatch.org/',
  },
  {
    apiNotes: 'I did not find a public search API in JustServe’s official materials, so plan for manual linking or a partner conversation unless documentation changes.',
    apiStatus: 'manual',
    audience: 'directory',
    coverageLabel: 'Nationwide / multi-country',
    id: 'justserve',
    name: 'JustServe',
    opportunityUrl: 'https://www.justserve.org/',
    serviceAreas: ['United States', 'Canada', 'Mexico', 'Puerto Rico', 'international'],
    sourceUrl: 'https://www.justserve.org/content/about.rss',
    summary: 'Free volunteer platform that connects people with local and virtual service projects and lets organizations post projects directly.',
    tags: ['free platform', 'local service projects', 'virtual opportunities'],
    url: 'https://www.justserve.org/',
  },
  {
    apiNotes: 'AmeriCorps exposes a public search experience and partner network, but I did not find a comparable self-serve public API on the official pages reviewed.',
    apiStatus: 'manual',
    audience: 'government',
    coverageLabel: 'Nationwide',
    id: 'americorps',
    name: 'AmeriCorps Volunteer Search',
    opportunityUrl: 'https://www.americorps.gov/join/find-volunteer-opportunity',
    serviceAreas: ['United States'],
    sourceUrl: 'https://www.americorps.gov/serve/volunteer',
    summary: 'Federal volunteer discovery route that points people to AmeriCorps, Idealist, JustServe, VolunteerMatch, and other service partners.',
    tags: ['government', 'volunteer search', 'service programs'],
    url: 'https://www.americorps.gov/serve/volunteer',
  },
  {
    apiNotes: 'Points of Light Engage appears to support partner integrations and widgets, but I did not find a self-serve public API in the official materials reviewed.',
    apiStatus: 'partner',
    audience: 'network',
    coverageLabel: 'Nationwide / global network',
    id: 'points-of-light',
    name: 'Points of Light Engage',
    opportunityUrl: 'https://engage.pointsoflight.org/',
    serviceAreas: ['United States', 'global network'],
    sourceUrl: 'https://www.pointsoflight.org/for-volunteers/',
    summary: 'Large engagement hub and search experience for volunteer opportunities by location and interest, backed by a broad affiliate network.',
    tags: ['engage', 'global network', 'location search', 'interest filters'],
    url: 'https://www.pointsoflight.org/volunteer-search/',
  },
]

export const areaSpecificServiceSites: ServiceDirectoryEntry[] = [
  {
    apiNotes: 'The public site clearly exposes volunteer opportunities, but I did not find a public API for pulling the calendar or project catalog.',
    apiStatus: 'manual',
    audience: 'directory',
    coordinates: { lat: 33.749, lng: -84.388 },
    coverageLabel: 'Metro Atlanta',
    id: 'hands-on-atlanta',
    name: 'Hands On Atlanta',
    opportunityUrl: 'https://www.handsonatlanta.org/home',
    serviceAreas: ['Atlanta', 'Metro Atlanta', 'Georgia'],
    sourceUrl: 'https://www.handsonatlanta.org/',
    summary: 'Regional volunteer platform focused on trusted Atlanta-area nonprofit and school projects, issue-based service, and recurring community events.',
    tags: ['atlanta', 'metro atlanta', 'regional volunteer hub', 'calendar', 'projects'],
    url: 'https://www.handsonatlanta.org/',
  },
  {
    apiNotes: 'StreetWise Georgia publishes volunteer information and event details on the public site, but I did not find a public API for programmatic listing access.',
    apiStatus: 'manual',
    audience: 'nonprofit',
    coordinates: { lat: 33.9562, lng: -83.9879 },
    coverageLabel: 'Lawrenceville / Gwinnett County',
    id: 'streetwise-georgia',
    name: 'StreetWise Georgia',
    opportunityUrl: 'https://streetwisegeorgia.org/get-involved/volunteer/',
    serviceAreas: ['Lawrenceville', 'Gwinnett County', 'Metro Atlanta', 'Georgia'],
    sourceUrl: 'https://streetwisegeorgia.org/get-involved/volunteer/',
    summary: 'Local nonprofit with recurring volunteer roles and event-based service opportunities centered in Gwinnett County.',
    tags: ['lawrenceville', 'gwinnett', 'food pantry', 'local nonprofit', 'volunteer application'],
    url: 'https://streetwisegeorgia.org/',
  },
]

function normalizeSearchValue(value: string) {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, ' ')
    .trim()
}

function getDistanceMiles(origin: ServiceGeoPoint, target: ServiceGeoPoint) {
  const earthRadiusMiles = 3958.8
  const latDelta = toRadians(target.lat - origin.lat)
  const lngDelta = toRadians(target.lng - origin.lng)
  const originLat = toRadians(origin.lat)
  const targetLat = toRadians(target.lat)

  const a = Math.sin(latDelta / 2) ** 2
    + Math.cos(originLat) * Math.cos(targetLat) * Math.sin(lngDelta / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return earthRadiusMiles * c
}

function toRadians(value: number) {
  return value * (Math.PI / 180)
}

export function findKnownPlace(query: string) {
  const normalizedQuery = normalizeSearchValue(query)

  if (!normalizedQuery)
    return null

  return serviceKnownPlaces.find(place =>
    place.aliases.some(alias => normalizeSearchValue(alias) === normalizedQuery)
    || normalizeSearchValue(place.label) === normalizedQuery,
  ) || null
}

export function searchAreaSpecificSites(options: {
  origin: ServiceGeoPoint | null
  query: string
  radiusMiles: number
}) {
  const normalizedQuery = normalizeSearchValue(options.query)
  const knownPlace = findKnownPlace(options.query)

  const matches = areaSpecificServiceSites
    .map<ServiceDirectoryMatch | null>((entry) => {
      const distanceMiles = options.origin && entry.coordinates
        ? getDistanceMiles(options.origin, entry.coordinates)
        : null

      if (options.origin && distanceMiles != null && distanceMiles > options.radiusMiles)
        return null

      if (!normalizedQuery) {
        return {
          ...entry,
          distanceMiles,
          matchReason: options.origin
            ? `Within ${options.radiusMiles} miles of your active search origin.`
            : 'Seeded regional listing ready for future expansion.',
        }
      }

      const haystack = normalizeSearchValue([
        entry.name,
        entry.coverageLabel,
        ...entry.serviceAreas,
        ...entry.tags,
      ].join(' '))
      const queryTokens = normalizedQuery.split(' ').filter(Boolean)
      const tokenMatch = queryTokens.every(token => haystack.includes(token))

      if (tokenMatch) {
        return {
          ...entry,
          distanceMiles,
          matchReason: knownPlace
            ? `${entry.name} matches the supported place "${knownPlace.label}" and falls inside the chosen radius.`
            : 'Matched against the regional name, tags, or service area text.',
        }
      }

      if (options.origin && distanceMiles != null) {
        return {
          ...entry,
          distanceMiles,
          matchReason: `Distance match from your active search origin.`,
        }
      }

      return null
    })
    .filter((entry): entry is ServiceDirectoryMatch => Boolean(entry))

  return matches.sort((left, right) => {
    if (left.distanceMiles != null && right.distanceMiles != null)
      return left.distanceMiles - right.distanceMiles

    if (left.distanceMiles != null)
      return -1

    if (right.distanceMiles != null)
      return 1

    return left.name.localeCompare(right.name)
  })
}
