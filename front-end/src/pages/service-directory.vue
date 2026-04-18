<script setup lang="ts">
import type { ServiceGeoPoint } from '~/utils/serviceDirectory'

import {
  findKnownPlace,
  nationwideServiceSites,
  searchAreaSpecificSites,
  serviceDirectoryApiSources,
  serviceDirectoryApiStatusLabels,
  serviceDirectoryAudienceLabels,
  serviceDirectoryResearchPrompt,
} from '~/utils/serviceDirectory'

definePageMeta({
  layout: 'home',
})

useSeoMeta({
  title: 'Service Directory',
  description: 'Browse nationwide volunteer platforms, search seeded regional service websites, and evaluate which official APIs could eventually power a fuller service-opportunity finder.',
})

const locationQuery = ref('')
const radiusMiles = ref(40)
const browserOrigin = ref<ServiceGeoPoint | null>(null)
const geoPending = ref(false)
const geoError = ref('')
const copyNotice = ref('')
const hasHydrated = ref(false)

const placeMatch = computed(() => findKnownPlace(locationQuery.value))
const activeOrigin = computed(() => browserOrigin.value ?? placeMatch.value?.coordinates ?? null)
const areaResults = computed(() =>
  searchAreaSpecificSites({
    origin: activeOrigin.value,
    query: locationQuery.value,
    radiusMiles: radiusMiles.value,
  }),
)

const searchModeLabel = computed(() => {
  if (browserOrigin.value)
    return 'Using your current browser location for exact radius filtering.'

  if (placeMatch.value)
    return `Using seeded place matching for ${placeMatch.value.label}.`

  if (locationQuery.value.trim())
    return 'Using text matching only. Exact radius filtering will improve once a geocoder or live directory API is connected.'

  return 'Showing the current seeded local examples. Use your location or type a supported city or region to narrow them.'
})

const nationwideCounts = computed(() => {
  return {
    apiReady: nationwideServiceSites.filter(site => site.apiStatus === 'available').length,
    manual: nationwideServiceSites.filter(site => site.apiStatus === 'manual').length,
    partner: nationwideServiceSites.filter(site => site.apiStatus === 'partner').length,
    total: nationwideServiceSites.length,
  }
})

onMounted(() => {
  hasHydrated.value = true
})

async function useCurrentLocation() {
  if (!import.meta.client || !navigator.geolocation) {
    geoError.value = 'Browser geolocation is not available here.'
    return
  }

  geoPending.value = true
  geoError.value = ''

  try {
    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: false,
        maximumAge: 5 * 60 * 1000,
        timeout: 10 * 1000,
      })
    })

    browserOrigin.value = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
    }
  }
  catch {
    geoError.value = 'Could not read your current location. You can still search by city or region text.'
  }
  finally {
    geoPending.value = false
  }
}

function clearDirectorySearch() {
  browserOrigin.value = null
  copyNotice.value = ''
  geoError.value = ''
  locationQuery.value = ''
  radiusMiles.value = 40
}

async function copyResearchPrompt() {
  if (!import.meta.client || !navigator.clipboard) {
    copyNotice.value = 'Copy is not available in this browser.'
    return
  }

  try {
    await navigator.clipboard.writeText(serviceDirectoryResearchPrompt)
    copyNotice.value = 'Deep research prompt copied.'
  }
  catch {
    copyNotice.value = 'Copy failed. You can still select the prompt manually.'
  }
}
</script>

<template>
  <div class="service-directory-page">
    <section class="service-directory-page__hero">
      <NuxtLink class="service-directory-page__back" prefetch-on="interaction" to="/#live-board">
        Back to live board
      </NuxtLink>

      <p class="eyebrow">
        Service directory
      </p>
      <h1>
        A starter map for finding service opportunities beyond this board.
      </h1>
      <p class="service-directory-page__lede">
        This page is a directory framework: seeded nationwide volunteer platforms, searchable area-specific examples, and a clear read on which official APIs could realistically power a broader service-opportunity finder later.
      </p>

      <div class="directory-hero__metrics">
        <article>
          <strong>{{ nationwideCounts.total }}</strong>
          <span>seeded nationwide websites</span>
        </article>
        <article>
          <strong>{{ serviceDirectoryApiSources.length }}</strong>
          <span>integration paths reviewed</span>
        </article>
        <article>
          <strong>{{ nationwideCounts.apiReady }}</strong>
          <span>official API-led candidates</span>
        </article>
      </div>
    </section>

    <section class="directory-section">
      <div class="section-heading">
        <p class="eyebrow">
          Nationwide platforms
        </p>
        <h2>
          Start with the large discovery networks before you build a metro-by-metro map.
        </h2>
        <p class="section-copy">
          These are the broadest service and volunteer directories I could anchor to official sources right now. The API badge shows whether the site looks automatable, partner-oriented, or still manual for now.
        </p>
      </div>

      <div class="nationwide-grid">
        <article v-for="site in nationwideServiceSites" :key="site.id" class="directory-card">
          <div class="directory-card__meta">
            <span>{{ serviceDirectoryAudienceLabels[site.audience] }}</span>
            <span class="directory-badge" :data-status="site.apiStatus">
              {{ serviceDirectoryApiStatusLabels[site.apiStatus] }}
            </span>
          </div>

          <h3>{{ site.name }}</h3>
          <p class="directory-card__coverage">
            {{ site.coverageLabel }}
          </p>
          <p class="directory-card__summary">
            {{ site.summary }}
          </p>
          <p class="directory-card__notes">
            {{ site.apiNotes }}
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
          The current release is seeded with a small local dataset so the page works right now. Exact radius filtering already works with your browser location or supported place matches, and the same UI can later sit on top of a real geocoder or listings API.
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
              {{ geoPending ? 'Reading location…' : 'Use my current location' }}
            </button>

            <button class="secondary-button" type="button" @click="clearDirectorySearch">
              Clear search
            </button>
          </div>

          <p class="finder-panel__note">
            {{ searchModeLabel }}
          </p>
          <p v-if="geoError" class="inline-note inline-note--error" role="alert">
            {{ geoError }}
          </p>
          <p v-if="placeMatch" class="inline-note" role="status">
            Supported place match: {{ placeMatch.label }}
          </p>
        </aside>

        <div class="finder-results">
          <div class="finder-results__summary">
            <span>{{ areaResults.length }} seeded local result<span v-if="areaResults.length !== 1">s</span></span>
            <span>Framework-ready for more regional entries and live adapters.</span>
          </div>

          <div v-if="!areaResults.length" class="finder-empty">
            <h3>No seeded local websites match that search yet.</h3>
            <p>
              The framework is in place, but this release only seeds a few example regional sites. The next step would be to expand the regional directory manually or plug in a live source such as Idealist, VolunteerMatch, or a partner integration.
            </p>
          </div>

          <div v-else class="finder-results__grid">
            <article v-for="site in areaResults" :key="site.id" class="finder-card">
              <div class="directory-card__meta">
                <span>{{ serviceDirectoryAudienceLabels[site.audience] }}</span>
                <span class="directory-badge" :data-status="site.apiStatus">
                  {{ serviceDirectoryApiStatusLabels[site.apiStatus] }}
                </span>
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
              <p v-if="site.distanceMiles != null" class="finder-card__distance">
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

    <section class="directory-section">
      <div class="section-heading">
        <p class="eyebrow">
          API and integration outlook
        </p>
        <h2>
          These are the most plausible data feeds if this evolves from a directory into a live search product.
        </h2>
        <p class="section-copy">
          Not every service website exposes a public API. The cards below separate direct listings APIs from partner-style integrations and site-only sources that still need manual curation.
        </p>
      </div>

      <div class="integration-grid">
        <article v-for="source in serviceDirectoryApiSources" :key="source.id" class="integration-card">
          <div class="directory-card__meta">
            <span>{{ source.coverageLabel }}</span>
            <span class="directory-badge" :data-status="source.status">
              {{ serviceDirectoryApiStatusLabels[source.status] }}
            </span>
          </div>

          <h3>{{ source.name }}</h3>
          <p class="directory-card__summary">
            {{ source.summary }}
          </p>
          <p class="directory-card__notes">
            {{ source.notes }}
          </p>

          <div class="directory-card__actions">
            <a :href="source.url" rel="noreferrer" target="_blank">
              Open source
            </a>
            <a v-if="source.integrationUrl" :href="source.integrationUrl" rel="noreferrer" target="_blank">
              Integration details
            </a>
          </div>
        </article>
      </div>
    </section>

    <section class="directory-section directory-section--prompt">
      <div class="section-heading">
        <p class="eyebrow">
          Deep research prompt
        </p>
        <h2>
          Use this prompt to expand the directory city by city.
        </h2>
        <p class="section-copy">
          This is written for a ChatGPT deep research pass so you can systematically grow the directory, confirm which sites are still active, and separate real integration paths from manual-only websites.
        </p>
      </div>

      <div class="prompt-card">
        <div class="prompt-card__actions">
          <button class="submit-button" type="button" @click="copyResearchPrompt">
            Copy prompt
          </button>
          <p v-if="copyNotice" class="inline-note" role="status">
            {{ copyNotice }}
          </p>
        </div>

        <textarea readonly :value="serviceDirectoryResearchPrompt" />
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
