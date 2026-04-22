export interface GeoPoint {
  lat: number
  lng: number
}

export interface KnownPlace {
  aliases: string[]
  coordinates: GeoPoint
  id: string
  label: string
}

export const knownPlaces: KnownPlace[] = [
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
  {
    aliases: ['decatur', 'decatur ga', 'decatur georgia'],
    coordinates: { lat: 33.7748, lng: -84.2963 },
    id: 'decatur-ga',
    label: 'Decatur, GA',
  },
  {
    aliases: ['marietta', 'marietta ga', 'marietta georgia', 'cobb county'],
    coordinates: { lat: 33.9526, lng: -84.5499 },
    id: 'marietta-ga',
    label: 'Marietta, GA',
  },
  {
    aliases: ['alpharetta', 'alpharetta ga', 'alpharetta georgia'],
    coordinates: { lat: 34.0754, lng: -84.2941 },
    id: 'alpharetta-ga',
    label: 'Alpharetta, GA',
  },
  {
    aliases: ['roswell', 'roswell ga', 'roswell georgia'],
    coordinates: { lat: 34.0232, lng: -84.3616 },
    id: 'roswell-ga',
    label: 'Roswell, GA',
  },
  {
    aliases: ['duluth', 'duluth ga', 'duluth georgia'],
    coordinates: { lat: 34.0029, lng: -84.1446 },
    id: 'duluth-ga',
    label: 'Duluth, GA',
  },
  {
    aliases: ['norcross', 'norcross ga', 'norcross georgia'],
    coordinates: { lat: 33.9412, lng: -84.2135 },
    id: 'norcross-ga',
    label: 'Norcross, GA',
  },
  {
    aliases: ['athens', 'athens ga', 'athens georgia', 'athens clarke'],
    coordinates: { lat: 33.9519, lng: -83.3576 },
    id: 'athens-ga',
    label: 'Athens, GA',
  },
  {
    aliases: ['savannah', 'savannah ga', 'savannah georgia'],
    coordinates: { lat: 32.0809, lng: -81.0912 },
    id: 'savannah-ga',
    label: 'Savannah, GA',
  },
]

function normalizeSearchValue(value: string) {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, ' ')
    .trim()
}

function toRadians(value: number) {
  return value * (Math.PI / 180)
}

export function getDistanceMiles(origin: GeoPoint, target: GeoPoint) {
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

export function findKnownPlace(query: string) {
  const normalizedQuery = normalizeSearchValue(query)

  if (!normalizedQuery)
    return null

  return knownPlaces.find((place) => {
    const normalizedLabel = normalizeSearchValue(place.label)

    if (normalizedLabel === normalizedQuery)
      return true

    return place.aliases.some((alias) => {
      const normalizedAlias = normalizeSearchValue(alias)
      return normalizedAlias === normalizedQuery
        || normalizedQuery.includes(normalizedAlias)
        || normalizedAlias.includes(normalizedQuery)
    })
  }) || null
}

export function inferKnownPlaceFromText(...values: Array<string | undefined>) {
  for (const value of values) {
    const normalizedValue = normalizeSearchValue(value || '')

    if (!normalizedValue)
      continue

    const matchedPlace = findKnownPlace(normalizedValue)

    if (matchedPlace) {
      return {
        coordinates: matchedPlace.coordinates,
        id: matchedPlace.id,
        label: matchedPlace.label,
        sourceText: (value || '').trim(),
      }
    }
  }

  return null
}
