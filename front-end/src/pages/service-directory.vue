<script setup lang="ts">
import type {
  ServiceDirectoryProviderResult,
  ServiceDirectoryProviderStatus,
  ServiceDirectorySearchResponse,
  ServiceGeoPoint,
} from '~/utils/serviceDirectory'

import {
  findKnownPlace,
  getServiceDirectoryEndpoint,
  nationwideServiceSites,
  searchAreaSpecificSites,
  serviceDirectoryAudienceLabels,
} from '~/utils/serviceDirectory'

definePageMeta({
  layout: 'home',
})

useSeoMeta({
  title: 'Service Directory',
  description:
    'Browse nationwide volunteer platforms, search local service websites, and look for live opportunities when available.',
})

const runtimeConfig = useRuntimeConfig()
const locationQuery = ref('')
const radiusMiles = ref(40)
const browserOrigin = ref<ServiceGeoPoint | null>(null)
const geoPending = ref(false)
const geoError = ref('')
const hasHydrated = ref(false)
const providerPending = ref(false)
const providerError = ref('')
const providerResults = ref<ServiceDirectoryProviderResult[]>([])
const providerPagination = ref({
  hasNextPage: false,
  hasPreviousPage: false,
  page: 1,
  pageSize: 12,
  totalItems: 0,
  totalPages: 1,
})
const providerStatus = ref<ServiceDirectoryProviderStatus>({
  configured: false,
  id: 'idealist',
  lastAttemptedAt: null,
  lastError: null,
  lastSyncedAt: null,
  listingCount: 0,
  message: 'The live provider has not been queried yet.',
  sourceUrl: 'https://www.idealist.org/en/open-network-api',
  syncState: 'unconfigured',
})

const placeMatch = computed(() => findKnownPlace(locationQuery.value))
const activeOrigin = computed(
  () => browserOrigin.value ?? placeMatch.value?.coordinates ?? null,
)
const areaResults = computed(() =>
  searchAreaSpecificSites({
    origin: activeOrigin.value,
    query: locationQuery.value,
    radiusMiles: radiusMiles.value,
  }),
)

const searchModeLabel = computed(() => {
  if (browserOrigin.value)
    return 'Using your current location for local matching.'

  if (placeMatch.value)
    return `Using ${placeMatch.value.label} for local matching.`

  if (locationQuery.value.trim())
    return 'Using text matching only. Your current location will produce better nearby results.'

  return 'Start with the local examples below, or enter a place to narrow them.'
})

const providerSummaryLabel = computed(() => {
  if (providerPending.value)
    return 'Loading live Idealist listings…'

  if (providerError.value)
    return 'Live search is unavailable right now. The directory links on this page still work.'

  if (!providerStatus.value.configured)
    return 'Live search is not enabled on this server yet. Use the directory links on this page for now.'

  return `${providerResults.value.length} live Idealist result${providerResults.value.length === 1 ? '' : 's'} shown from ${providerPagination.value.totalItems} current matches.`
})

onMounted(() => {
  hasHydrated.value = true
  void runProviderSearch()
})

async function useCurrentLocation() {
  if (!import.meta.client || !navigator.geolocation) {
    geoError.value = 'Browser geolocation is not available here.'
    return
  }

  geoPending.value = true
  geoError.value = ''

  try {
    const position = await new Promise<GeolocationPosition>(
      (resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          maximumAge: 5 * 60 * 1000,
          timeout: 10 * 1000,
        })
      },
    )

    browserOrigin.value = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
    }

    await runProviderSearch()
  }
  catch {
    geoError.value
      = 'Could not read your current location. You can still search by city or region text.'
  }
  finally {
    geoPending.value = false
  }
}

function clearDirectorySearch() {
  browserOrigin.value = null
  geoError.value = ''
  locationQuery.value = ''
  radiusMiles.value = 40
  providerError.value = ''
  providerPagination.value.page = 1
  void runProviderSearch()
}

async function runProviderSearch(options?: {
  page?: number
  refresh?: boolean
}) {
  providerPending.value = true
  providerError.value = ''

  try {
    const endpoint = new URL(
      getServiceDirectoryEndpoint(runtimeConfig.public.apiBaseUrl),
    )

    endpoint.searchParams.set('provider', 'idealist')
    endpoint.searchParams.set('query', locationQuery.value.trim())
    endpoint.searchParams.set('radiusMiles', String(radiusMiles.value))
    endpoint.searchParams.set(
      'page',
      String(options?.page || providerPagination.value.page || 1),
    )
    endpoint.searchParams.set(
      'pageSize',
      String(providerPagination.value.pageSize),
    )

    if (activeOrigin.value) {
      endpoint.searchParams.set('lat', String(activeOrigin.value.lat))
      endpoint.searchParams.set('lng', String(activeOrigin.value.lng))
    }

    if (options?.refresh)
      endpoint.searchParams.set('refresh', 'true')

    const response = await $fetch<ServiceDirectorySearchResponse>(
      endpoint.toString(),
    )
    providerResults.value = response.results
    providerPagination.value = response.pagination
    providerStatus.value = response.provider
  }
  catch (error) {
    providerError.value = 'Unable to load live Idealist listings right now.'

    if (error && typeof error === 'object' && 'data' in error) {
      const data = (error as { data?: unknown }).data

      if (
        data
        && typeof data === 'object'
        && 'message' in data
        && typeof data.message === 'string'
      ) {
        providerError.value = data.message
      }
    }
  }
  finally {
    providerPending.value = false
  }
}

function changeProviderPage(nextPage: number) {
  const boundedPage = Math.min(
    Math.max(nextPage, 1),
    providerPagination.value.totalPages,
  )

  if (boundedPage === providerPagination.value.page)
    return

  void runProviderSearch({ page: boundedPage })
}
</script>

<template>
  <div class="service-directory-page">
    <section class="service-directory-page__hero">
      <NuxtLink
        class="service-directory-page__back"
        prefetch-on="interaction"
        to="/#live-board"
      >
        Back to live board
      </NuxtLink>

      <p class="eyebrow">
        Service directory
      </p>
      <h1>Find service opportunities beyond this board.</h1>
      <p class="service-directory-page__lede">
        Start with the large volunteer networks, then narrow toward local
        organizations and live opportunity results when they are available.
      </p>
    </section>

    <section class="directory-section">
      <div class="section-heading">
        <p class="eyebrow">
          Nationwide platforms
        </p>
        <h2>Start with the large volunteer networks first.</h2>
        <p class="section-copy">
          These are the broadest directories for service and volunteer
          opportunities. Use them first when you want a wider search than one
          city or organization can provide.
        </p>
      </div>

      <div class="nationwide-grid">
        <article
          v-for="site in nationwideServiceSites"
          :key="site.id"
          class="directory-card"
        >
          <div class="directory-card__meta">
            <span>{{ serviceDirectoryAudienceLabels[site.audience] }}</span>
          </div>

          <h3>{{ site.name }}</h3>
          <p class="directory-card__coverage">
            {{ site.coverageLabel }}
          </p>
          <p class="directory-card__summary">
            {{ site.summary }}
          </p>

          <ul class="directory-card__tags">
            <li v-for="tag in site.tags" :key="tag">
              {{ tag }}
            </li>
          </ul>

          <div class="directory-card__actions">
            <a :href="site.opportunityUrl" rel="noreferrer" target="_blank">
              Open opportunities
            </a>
            <a :href="site.sourceUrl" rel="noreferrer" target="_blank">
              Official source
            </a>
          </div>
        </article>
      </div>
    </section>

    <section class="directory-section directory-section--finder">
      <div class="section-heading">
        <p class="eyebrow">
          Area-specific search
        </p>
        <h2>
          Search local and metro-specific service websites by place and radius.
        </h2>
        <p class="section-copy">
          Use your current location or type a place to narrow the local links
          below.
        </p>
      </div>

      <div class="finder-layout">
        <aside class="finder-panel">
          <label class="field field--wide">
            <span>Current location or metro</span>
            <input
              v-model="locationQuery"
              autocomplete="off"
              name="directory_location"
              placeholder="Try Atlanta, GA or Lawrenceville"
              spellcheck="false"
              type="text"
            >
          </label>

          <label class="field field--wide">
            <span>Search radius</span>
            <div class="finder-panel__range">
              <input
                v-model="radiusMiles"
                max="100"
                min="10"
                name="directory_radius"
                step="5"
                type="range"
              >
              <strong>{{ radiusMiles }} miles</strong>
            </div>
          </label>

          <div class="finder-panel__actions">
            <button
              v-if="hasHydrated"
              class="submit-button"
              :disabled="geoPending"
              type="button"
              @click="useCurrentLocation"
            >
              {{ geoPending ? "Reading location…" : "Use my current location" }}
            </button>

            <button
              class="secondary-button"
              type="button"
              @click="clearDirectorySearch"
            >
              Clear search
            </button>

            <button
              class="secondary-button secondary-button--dark"
              :disabled="providerPending"
              type="button"
              @click="runProviderSearch({ page: 1 })"
            >
              {{
                providerPending
                  ? "Searching live listings…"
                  : "Search live Idealist results"
              }}
            </button>

            <button
              class="secondary-button"
              :disabled="providerPending"
              type="button"
              @click="runProviderSearch({ page: 1, refresh: true })"
            >
              Refresh live results
            </button>
          </div>

          <p class="finder-panel__note">
            {{ searchModeLabel }}
          </p>
          <p
            v-if="geoError"
            class="inline-note inline-note--error"
            role="alert"
          >
            {{ geoError }}
          </p>
          <p v-if="placeMatch" class="inline-note" role="status">
            Supported place match: {{ placeMatch.label }}
          </p>
        </aside>

        <div class="finder-results">
          <div class="finder-results__summary">
            <span>{{ areaResults.length }} local directory result<span
              v-if="areaResults.length !== 1"
            >s</span></span>
            <span>Use your current location for tighter local matching.</span>
          </div>

          <div v-if="!areaResults.length" class="finder-empty">
            <h3>No local directory links match that search yet.</h3>
            <p>Try a broader place name or widen the radius.</p>
          </div>

          <div v-else class="finder-results__grid">
            <article
              v-for="site in areaResults"
              :key="site.id"
              class="finder-card"
            >
              <div class="directory-card__meta">
                <span>{{ serviceDirectoryAudienceLabels[site.audience] }}</span>
              </div>

              <h3>{{ site.name }}</h3>
              <p class="directory-card__coverage">
                {{ site.coverageLabel }}
              </p>
              <p class="directory-card__summary">
                {{ site.summary }}
              </p>
              <p class="finder-card__match">
                {{ site.matchReason }}
              </p>
              <p
                v-if="site.distanceMiles != null"
                class="finder-card__distance"
              >
                Approx. {{ site.distanceMiles.toFixed(1) }} miles away.
              </p>

              <ul class="directory-card__tags">
                <li v-for="area in site.serviceAreas" :key="area">
                  {{ area }}
                </li>
              </ul>

              <div class="directory-card__actions">
                <a :href="site.opportunityUrl" rel="noreferrer" target="_blank">
                  Open site
                </a>
                <a :href="site.sourceUrl" rel="noreferrer" target="_blank">
                  Official source
                </a>
              </div>
            </article>
          </div>
        </div>
      </div>
    </section>

    <section class="directory-section directory-section--provider">
      <div class="section-heading">
        <p class="eyebrow">
          Live search
        </p>
        <h2>Search live opportunities when they are available.</h2>
        <p class="section-copy">
          The same controls above can also search current Idealist opportunities
          when live search is enabled on this server.
        </p>
      </div>

      <div class="provider-results">
        <div class="finder-results__summary">
          <span>{{ providerSummaryLabel }}</span>
          <span v-if="providerPagination.totalItems">Page {{ providerPagination.page }} of
            {{ providerPagination.totalPages }}</span>
        </div>

        <p
          v-if="providerError"
          class="inline-note inline-note--error"
          role="alert"
        >
          {{ providerError }}
        </p>
        <p
          v-else-if="!providerStatus.configured"
          class="inline-note"
          role="status"
        >
          Live Idealist search is not enabled on this server yet.
        </p>
        <p
          v-else-if="providerStatus.lastError"
          class="inline-note inline-note--error"
          role="alert"
        >
          {{ providerStatus.lastError }}
        </p>

        <div
          v-if="providerPending && !providerResults.length"
          class="finder-empty"
          role="status"
        >
          <h3>Loading live listings…</h3>
          <p>Checking current Idealist opportunities now.</p>
        </div>

        <div v-else-if="!providerResults.length" class="finder-empty">
          <h3>No live Idealist listings matched this search yet.</h3>
          <p>Try a broader keyword or a wider radius.</p>
        </div>

        <div v-else class="finder-results__grid">
          <article
            v-for="result in providerResults"
            :key="result.id"
            class="finder-card"
          >
            <div class="directory-card__meta">
              <span>Live {{ result.provider }}</span>
              <span
                class="directory-badge"
                :data-status="
                  result.locationType === 'REMOTE' ? 'partner' : 'available'
                "
              >
                {{ result.locationType }}
              </span>
            </div>

            <h3>{{ result.title }}</h3>
            <p class="directory-card__coverage">
              {{ result.organizationName }}
            </p>
            <p class="directory-card__summary">
              {{ result.summary }}
            </p>
            <p class="finder-card__match">
              {{ result.matchReason }}
            </p>
            <p class="finder-card__distance">
              {{ result.locationLabel }}
              <span v-if="result.distanceMiles != null">
                · {{ result.distanceMiles.toFixed(1) }} miles away</span>
            </p>

            <ul class="directory-card__tags">
              <li
                v-for="tag in [
                  ...result.areasOfFocus,
                  ...result.functionTags,
                ].slice(0, 5)"
                :key="tag"
              >
                {{ tag }}
              </li>
              <li v-if="result.isRecurring">
                recurring
              </li>
            </ul>

            <div class="directory-card__actions">
              <a :href="result.opportunityUrl" rel="noreferrer" target="_blank">
                Open listing
              </a>
              <a :href="result.applyUrl" rel="noreferrer" target="_blank">
                Apply / learn more
              </a>
            </div>
          </article>
        </div>

        <div v-if="providerPagination.totalPages > 1" class="admin-pagination">
          <button
            class="secondary-button"
            :disabled="providerPending || !providerPagination.hasPreviousPage"
            type="button"
            @click="changeProviderPage(providerPagination.page - 1)"
          >
            Newer results
          </button>
          <button
            class="secondary-button secondary-button--dark"
            :disabled="providerPending || !providerPagination.hasNextPage"
            type="button"
            @click="changeProviderPage(providerPagination.page + 1)"
          >
            More results
          </button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.service-directory-page {
  display: grid;
  gap: 1.75rem;
  padding-top: 0;
  padding-right: var(--page-inline-end);
  padding-bottom: 2.75rem;
  padding-left: var(--page-inline-start);
}

.service-directory-page__hero,
.directory-section {
  display: grid;
  gap: 1rem;
}

.service-directory-page__hero {
  max-width: 66rem;
  min-width: 0;
  padding-block: var(--page-hero-space);
}

.service-directory-page__back {
  width: fit-content;
  text-decoration: none;
  color: var(--site-link);
  font-weight: 700;
}

.service-directory-page__back:hover,
.service-directory-page__back:focus-visible {
  text-decoration: underline;
  text-underline-offset: 0.2em;
}

.eyebrow {
  margin: 0;
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--site-muted);
}

.service-directory-page h1,
.directory-section h2,
.directory-card h3,
.provider-status-card h3,
.finder-empty h3,
.integration-card h3 {
  margin: 0;
  font-family: 'DM Serif Display', serif;
  font-weight: 400;
  letter-spacing: -0.03em;
  color: var(--site-heading);
}

.service-directory-page h1 {
  max-width: 14ch;
  font-size: clamp(2.45rem, 4.9vw, 4.45rem);
  line-height: 0.92;
  text-wrap: balance;
}

.service-directory-page__lede,
.section-copy,
.directory-card__summary,
.directory-card__notes,
.finder-card__match,
.finder-empty p,
.finder-panel__note {
  margin: 0;
  color: var(--site-text);
  line-height: 1.7;
}

.service-directory-page__lede {
  max-width: 48rem;
  font-size: 1.04rem;
}

.directory-hero__metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr));
  gap: 0.9rem;
  max-width: 52rem;
}

.directory-hero__metrics article,
.finder-panel,
.finder-empty,
.prompt-card,
.provider-status-card,
.directory-card,
.integration-card,
.finder-card {
  border: 1px solid var(--site-border);
  border-radius: 1.5rem;
  background: color-mix(in srgb, var(--site-surface-soft) 88%, transparent);
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.08);
}

.directory-hero__metrics article {
  display: grid;
  gap: 0.2rem;
  padding: 1.1rem 1.15rem;
}

.directory-hero__metrics strong {
  font-size: 1.9rem;
  line-height: 1;
  color: var(--site-heading);
}

.directory-hero__metrics span,
.directory-card__coverage,
.finder-results__summary,
.finder-card__distance {
  color: var(--site-subtle);
}

.section-heading {
  max-width: 46rem;
}

.nationwide-grid,
.integration-grid,
.finder-results__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr));
  gap: 1rem;
}

.directory-card,
.integration-card,
.provider-status-card,
.finder-card {
  display: grid;
  gap: 0.95rem;
  padding: 1.25rem;
}

.directory-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  align-items: center;
  justify-content: space-between;
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--site-muted);
}

.directory-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.32rem 0.75rem;
  border-radius: 999px;
  background: var(--site-accent-soft);
  color: var(--site-link);
}

.directory-badge[data-status='available'] {
  background: color-mix(in srgb, var(--site-link) 16%, transparent);
}

.directory-badge[data-status='partner'] {
  background: color-mix(in srgb, var(--site-heading) 12%, transparent);
}

.directory-badge[data-status='manual'] {
  background: color-mix(in srgb, var(--site-warning, #b85c22) 16%, transparent);
  color: color-mix(in srgb, var(--site-warning, #b85c22) 72%, var(--site-heading) 28%);
}

.directory-card h3,
.integration-card h3,
.provider-status-card h3,
.finder-card h3,
.finder-empty h3 {
  font-size: 1.8rem;
  line-height: 0.98;
}

.directory-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  padding: 0;
  margin: 0;
  list-style: none;
}

.directory-card__tags li {
  padding: 0.4rem 0.75rem;
  border-radius: 999px;
  background: var(--site-surface);
  color: var(--site-text-strong);
  font-size: 0.88rem;
}

.directory-card__actions,
.finder-panel__actions,
.prompt-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
}

.directory-card__actions a,
.submit-button,
.secondary-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2.8rem;
  padding: 0.7rem 1rem;
  border: 1px solid var(--site-border);
  border-radius: 999px;
  text-decoration: none;
  font-weight: 700;
  transition:
    transform 160ms ease,
    background-color 160ms ease,
    color 160ms ease,
    border-color 160ms ease;
}

.directory-card__actions a,
.secondary-button {
  background: transparent;
  color: var(--site-heading);
}

.submit-button {
  border-color: color-mix(in srgb, var(--site-link) 35%, var(--site-border) 65%);
  background: var(--site-button-bg);
  color: var(--site-button-text);
}

.secondary-button--dark {
  background: var(--site-button-bg);
  color: var(--site-button-text);
}

.directory-card__actions a:hover,
.directory-card__actions a:focus-visible,
.submit-button:hover,
.submit-button:focus-visible,
.secondary-button:hover,
.secondary-button:focus-visible {
  transform: translateY(-1px);
}

.secondary-button:hover,
.secondary-button:focus-visible,
.directory-card__actions a:hover,
.directory-card__actions a:focus-visible {
  background: var(--site-accent-soft);
}

.secondary-button--dark:hover,
.secondary-button--dark:focus-visible {
  background: var(--site-button-bg-hover);
}

.finder-layout {
  display: grid;
  grid-template-columns: minmax(18rem, 24rem) minmax(0, 1fr);
  gap: 1rem;
  align-items: start;
}

.finder-panel {
  display: grid;
  gap: 1rem;
  padding: 1.25rem;
  position: sticky;
  top: calc(5rem + var(--page-block-start));
}

.field {
  display: grid;
  gap: 0.45rem;
}

.field span {
  font-size: 0.86rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--site-muted);
}

.field input,
.prompt-card textarea {
  width: 100%;
  border: 1px solid var(--site-border);
  border-radius: 1rem;
  background: var(--site-surface);
  color: var(--site-text-strong);
}

.field input {
  min-height: 3rem;
  padding: 0.85rem 1rem;
}

.finder-panel__range {
  display: grid;
  gap: 0.6rem;
}

.finder-panel__range input {
  padding: 0;
}

.finder-results {
  display: grid;
  gap: 1rem;
}

.provider-layout {
  display: grid;
  grid-template-columns: minmax(18rem, 22rem) minmax(0, 1fr);
  gap: 1rem;
  align-items: start;
}

.provider-status-card,
.provider-results {
  display: grid;
  gap: 1rem;
}

.finder-results__summary {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.75rem;
  font-size: 0.92rem;
}

.finder-empty {
  display: grid;
  gap: 0.75rem;
  padding: 1.35rem;
}

.finder-card__match {
  font-size: 0.96rem;
}

.admin-pagination {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  justify-content: flex-end;
}

.inline-note {
  margin: 0;
  font-size: 0.94rem;
  color: var(--site-subtle);
}

.inline-note--error {
  color: color-mix(in srgb, #cf4d34 72%, var(--site-heading) 28%);
}

.prompt-card {
  display: grid;
  gap: 1rem;
  padding: 1.25rem;
}

.prompt-card textarea {
  min-height: 20rem;
  padding: 1rem;
  line-height: 1.6;
  resize: vertical;
}

@media (max-width: 920px) {
  .finder-layout {
    grid-template-columns: 1fr;
  }

  .provider-layout {
    grid-template-columns: 1fr;
  }

  .finder-panel {
    position: static;
  }
}

@media (max-width: 760px) {
  .service-directory-page h1 {
    max-width: 100%;
  }

  .directory-card__meta,
  .finder-results__summary {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
