<script setup lang="ts">
import {
  areaSpecificServiceSites,
  nationwideServiceSites,
  serviceDirectoryAudienceLabels,
} from '~/utils/serviceDirectory'

definePageMeta({
  layout: 'home',
})

useSeoMeta({
  title: 'Service directory',
  description:
    'Browse curated nationwide and area-specific service websites, then continue to live search when it is useful.',
})
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
      <h1>Browse service websites.</h1>
      <p class="service-directory-page__lede">
        Start with the broad volunteer networks, then move into regional
        organizations and local service hubs.
      </p>

      <div class="service-directory-page__actions">
        <NuxtLink prefetch-on="interaction" to="/service-search">
          Open live service search
        </NuxtLink>
      </div>
    </section>

    <section class="directory-section">
      <div class="section-heading">
        <p class="eyebrow">
          Nationwide platforms
        </p>
        <h2>Use the large networks when you need a broad search.</h2>
        <p class="section-copy">
          These platforms are best when you want many opportunities across
          cities, causes, or organizations.
        </p>
      </div>

      <div class="directory-grid">
        <article
          v-for="site in nationwideServiceSites"
          :key="site.id"
          class="directory-card"
        >
          <p class="directory-card__eyebrow">
            {{ serviceDirectoryAudienceLabels[site.audience] }}
          </p>
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

    <section class="directory-section">
      <div class="section-heading">
        <p class="eyebrow">
          Area-specific organizations
        </p>
        <h2>Use regional hubs when you want place-specific service work.</h2>
        <p class="section-copy">
          These are local or metro-specific sites that are useful when you want
          neighborhood, county, or city-level service opportunities.
        </p>
      </div>

      <div class="directory-grid">
        <article
          v-for="site in areaSpecificServiceSites"
          :key="site.id"
          class="directory-card"
        >
          <p class="directory-card__eyebrow">
            {{ serviceDirectoryAudienceLabels[site.audience] }}
          </p>
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

    <section class="directory-cta">
      <div>
        <p class="eyebrow">
          Live search
        </p>
        <h2>Need something more dynamic?</h2>
        <p class="section-copy">
          Use the live search page when you want to search local links by
          distance and pull live provider results when the backend is configured
          for it.
        </p>
      </div>

      <NuxtLink
        class="directory-cta__link"
        prefetch-on="interaction"
        to="/service-search"
      >
        Go to live service search
      </NuxtLink>
    </section>
  </div>
</template>

<style scoped>
.service-directory-page {
  display: grid;
  gap: var(--page-section-gap);
  padding-right: var(--page-inline-end);
  padding-bottom: 2.75rem;
  padding-left: var(--page-inline-start);
}

.service-directory-page__hero {
  display: grid;
  gap: var(--page-hero-gap);
  max-width: var(--page-hero-max);
  padding-block: var(--page-hero-space);
}

.service-directory-page__back {
  width: fit-content;
  text-decoration: none;
  color: var(--site-link);
  font-weight: 700;
}

.service-directory-page__back:hover,
.service-directory-page__back:focus-visible,
.service-directory-page__actions a:hover,
.service-directory-page__actions a:focus-visible,
.directory-cta__link:hover,
.directory-cta__link:focus-visible {
  text-decoration: underline;
  text-underline-offset: 0.2em;
}

.eyebrow,
.directory-card__eyebrow {
  margin: 0;
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--site-muted);
}

.service-directory-page h1,
.section-heading h2,
.directory-cta h2,
.directory-card h3 {
  margin: 0;
  font-family: 'DM Serif Display', serif;
  font-weight: 400;
  letter-spacing: -0.03em;
  color: var(--site-heading);
}

.service-directory-page h1 {
  max-width: var(--page-hero-title-max);
  font-size: var(--page-hero-title-size);
  line-height: 0.92;
  text-wrap: balance;
}

.service-directory-page__lede,
.section-copy,
.directory-card__summary,
.directory-card__coverage {
  margin: 0;
  color: var(--site-text);
  line-height: 1.7;
}

.service-directory-page__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.9rem;
}

.service-directory-page__actions a,
.directory-cta__link,
.directory-card__actions a {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2.95rem;
  padding: 0.88rem 1.2rem;
  border-radius: 1rem;
  text-decoration: none;
  font-size: 0.96rem;
  font-weight: 700;
  transition:
    transform 180ms ease,
    box-shadow 180ms ease,
    background-color 180ms ease,
    color 180ms ease,
    border-color 180ms ease;
}

.service-directory-page__actions a,
.directory-cta__link {
  background: var(--site-button-bg);
  color: var(--site-button-text);
  box-shadow: 0 16px 30px var(--site-focus-ring);
}

.directory-section {
  display: grid;
  gap: 1.2rem;
}

.section-heading {
  max-width: 42rem;
  display: grid;
  gap: 0.9rem;
}

.directory-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.directory-card,
.directory-cta {
  display: grid;
  gap: 1rem;
  padding: var(--page-surface-padding);
  border-radius: var(--page-surface-radius);
  border: 1px solid var(--site-border);
  background: color-mix(in srgb, var(--site-surface-soft) 86%, transparent);
  box-shadow: var(--site-shadow-soft);
}

.directory-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.directory-card__tags li {
  padding: 0.35rem 0.7rem;
  border-radius: 999px;
  background: var(--site-surface-soft-strong);
  color: var(--site-subtle);
  font-size: 0.82rem;
}

.directory-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.directory-card__actions a {
  border: 1px solid var(--site-border-strong);
  background: var(--site-input-bg);
  color: var(--site-text-strong);
  box-shadow: none;
}

.directory-cta {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
}

@media (max-width: 860px) {
  .directory-grid,
  .directory-cta {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .service-directory-page__actions,
  .directory-card__actions {
    flex-direction: column;
    align-items: stretch;
  }

  .directory-cta__link,
  .service-directory-page__actions a,
  .directory-card__actions a {
    width: 100%;
  }
}
</style>
