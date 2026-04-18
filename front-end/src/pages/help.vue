<script setup lang="ts">
definePageMeta({
  layout: 'home',
})

useSeoMeta({
  title: 'Help',
  description: 'Learn how the live community board works and what kinds of requests and lending offers belong there.',
})

const processSteps = [
  {
    number: '01',
    title: 'Choose the dedicated page',
    description: 'Service projects, item requests, and lending offers each have their own page so posting stays focused and easier to scan.',
  },
  {
    number: '02',
    title: 'Reply in public or reveal contact on demand',
    description: 'Neighbors can respond on the thread immediately, or reveal a contact method only when they intentionally need it.',
  },
  {
    number: '03',
    title: 'Stay anonymous or create an account',
    description: 'Anonymous participation stays open, while optional accounts add an identity anchor for repeat contributors.',
  },
]

const boardGroups = [
  {
    title: 'Service projects',
    items: ['yard cleanup', 'small repairs', 'moving help', 'accessibility upgrades', 'setup or teardown'],
  },
  {
    title: 'Borrow requests',
    items: ['axes and hand tools', 'kitchen utensils', 'books', 'ladders', 'seasonal gear'],
  },
  {
    title: 'Items to lend',
    items: ['power tools', 'cookware', 'study materials', 'gardening supplies', 'one-off specialty items'],
  },
]
</script>

<template>
  <div class="help-page">
    <section class="help-page__hero">
      <NuxtLink class="help-page__back" to="/#live-board">
        Back to live board
      </NuxtLink>

      <p class="eyebrow">
        Help
      </p>
      <h1>
        How the board works and what belongs here.
      </h1>
      <p class="help-page__lede">
        Use this page when you need the structure behind the board: which page to post from, how contact reveal works, and the kinds of requests or lending offers that fit best.
      </p>
    </section>

    <section class="help-section">
      <div class="section-heading">
        <p class="eyebrow">
          How it works
        </p>
        <h2>
          The board is designed for immediate use, not for private gatekeeping.
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
          Keep posts practical, specific, and clear enough for another person to act on them.
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
  gap: 1.5rem;
  padding: 0 5vw 2.75rem;
}

.help-page__hero,
.help-section {
  display: grid;
  gap: 1rem;
}

.help-page__hero {
  max-width: 58rem;
  padding-block: var(--page-hero-space);
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
  font-size: clamp(2.35rem, 4.8vw, 4.25rem);
  line-height: 0.92;
  max-width: 14ch;
  text-wrap: balance;
}

.help-page__lede,
.process__list p,
.board-groups__grid li {
  color: var(--site-text);
  line-height: 1.7;
}

.help-page__lede {
  max-width: 42rem;
  margin: 0;
  font-size: 1.02rem;
}

.section-heading {
  max-width: 42rem;
}

.process__list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;
  padding: 0;
  margin: 0;
  list-style: none;
}

.process__list li,
.board-groups__grid article {
  padding: 1.25rem;
  border-radius: 1.4rem;
  background: var(--site-surface-soft);
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
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;
}

.board-groups__grid ul {
  margin: 0.85rem 0 0;
  padding-left: 1.15rem;
}

@media (max-width: 860px) {
  .process__list,
  .board-groups__grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .help-page {
    padding-inline: 1.25rem;
  }

  .help-page h1 {
    max-width: 100%;
  }
}
</style>
