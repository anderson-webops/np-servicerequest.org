<script setup lang="ts">
definePageMeta({
  layout: 'home',
})

useSeoMeta({
  title: 'Help',
  description:
    'Learn how the live community board works and what kinds of requests and lending offers belong there.',
})

const processSteps = [
  {
    number: '01',
    title: 'Choose the dedicated page',
    description:
      'Use the matching page so the post lands in the right category from the start.',
  },
  {
    number: '02',
    title: 'Reply on the board or reveal contact when needed',
    description:
      'People can answer publicly on the thread or reveal contact only when they are ready to reach out directly.',
  },
  {
    number: '03',
    title: 'Stay anonymous or create an account',
    description:
      'An account is optional. It only helps if you want a consistent identity across repeat posts and replies.',
  },
]

const boardGroups = [
  {
    title: 'Service projects',
    items: [
      'yard cleanup',
      'small repairs',
      'moving help',
      'accessibility upgrades',
      'setup or teardown',
    ],
  },
  {
    title: 'Borrow requests',
    items: [
      'axes and hand tools',
      'kitchen utensils',
      'books',
      'ladders',
      'seasonal gear',
    ],
  },
  {
    title: 'Items to lend',
    items: [
      'power tools',
      'cookware',
      'study materials',
      'gardening supplies',
      'one-off specialty items',
    ],
  },
]
</script>

<template>
  <div class="help-page">
    <section class="help-page__hero">
      <NuxtLink
        class="help-page__back"
        prefetch-on="interaction"
        to="/#live-board"
      >
        Back to live board
      </NuxtLink>

      <p class="eyebrow">
        Help
      </p>
      <h1>Quick guidance for using the board well.</h1>
      <p class="help-page__lede">
        Use the right posting page, keep requests specific, and make it easy for
        someone else to act.
      </p>
    </section>

    <section class="help-section">
      <div class="section-heading">
        <p class="eyebrow">
          How it works
        </p>
        <h2>
          Post clearly, reply clearly, and reveal contact only when needed.
        </h2>
      </div>

      <ol class="process__list">
        <li v-for="step in processSteps" :key="step.number">
          <span class="process__number">{{ step.number }}</span>
          <div>
            <h3>{{ step.title }}</h3>
            <p>{{ step.description }}</p>
          </div>
        </li>
      </ol>
    </section>

    <section class="help-section">
      <div class="section-heading">
        <p class="eyebrow">
          What belongs here
        </p>
        <h2>
          Keep posts practical and specific enough for another person to respond
          quickly.
        </h2>
      </div>

      <div class="board-groups__grid">
        <article v-for="group in boardGroups" :key="group.title">
          <h3>{{ group.title }}</h3>
          <ul>
            <li v-for="item in group.items" :key="item">
              {{ item }}
            </li>
          </ul>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped>
.help-page {
  display: grid;
  gap: var(--page-section-gap);
  padding-top: 0;
  padding-right: var(--page-inline-end);
  padding-bottom: 2.75rem;
  padding-left: var(--page-inline-start);
}

.help-page__hero,
.help-section {
  display: grid;
  gap: 1rem;
}

.help-page__hero {
  min-width: 0;
  max-width: var(--page-hero-max);
  padding-block: var(--page-hero-space);
  gap: var(--page-hero-gap);
}

.help-page__back {
  width: fit-content;
  text-decoration: none;
  color: var(--site-link);
  font-weight: 700;
}

.help-page__back:hover,
.help-page__back:focus-visible {
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

.help-page h1,
.section-heading h2,
.process__list h3,
.board-groups__grid h3 {
  margin: 0;
  font-family: 'DM Serif Display', serif;
  font-weight: 400;
  letter-spacing: -0.03em;
  color: var(--site-heading);
}

.help-page h1 {
  font-size: var(--page-hero-title-size);
  line-height: 0.92;
  max-width: var(--page-hero-title-max);
  overflow-wrap: anywhere;
  text-wrap: balance;
}

.help-page__lede,
.process__list p,
.board-groups__grid li {
  color: var(--site-text);
  line-height: 1.7;
}

.help-page__lede {
  max-width: var(--page-hero-copy-max);
  margin: 0;
  font-size: 1.02rem;
}

.section-heading {
  max-width: var(--page-hero-copy-max);
}

.process__list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr));
  gap: 1rem;
  padding: 0;
  margin: 0;
  list-style: none;
}

.process__list li,
.board-groups__grid article {
  padding: var(--page-surface-padding);
  border-radius: var(--page-surface-radius);
  background: color-mix(in srgb, var(--site-surface-soft) 82%, transparent);
  border: 1px solid var(--site-border);
}

.process__number {
  display: inline-flex;
  margin-bottom: 1rem;
  font-size: 1rem;
  font-weight: 700;
  color: var(--site-link);
}

.process__list h3,
.board-groups__grid h3 {
  font-size: 1.55rem;
  line-height: 1.05;
}

.process__list p {
  margin: 0.75rem 0 0;
}

.board-groups__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr));
  gap: 1rem;
}

.board-groups__grid ul {
  margin: 0.85rem 0 0;
  padding-left: 1.15rem;
}

@media (max-width: 760px) {
  .help-page h1 {
    max-width: 100%;
  }
}
</style>
