<template>
  <section class="not-found">
    <p class="not-found__eyebrow">
      Nothing posted here
    </p>
    <h1>
      That page is not part of the request board.
    </h1>
    <p>
      Head back to the main page to request a service project, borrow an item, or offer something useful to lend.
    </p>
    <NuxtLink class="not-found__link" to="/">
      Return home
    </NuxtLink>
  </section>
</template>

<style scoped>
.not-found {
  max-width: 42rem;
  padding: 5rem 5vw 4rem;
}

.not-found__eyebrow {
  margin: 0 0 1rem;
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #6d7267;
}

.not-found h1 {
  margin: 0;
  font-family: 'DM Serif Display', serif;
  font-size: clamp(2.6rem, 6vw, 4.4rem);
  font-weight: 400;
  line-height: 0.95;
  letter-spacing: -0.03em;
  color: #162219;
}

.not-found p {
  margin: 1.2rem 0 0;
  color: #33433a;
  line-height: 1.7;
}

.not-found__link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 3.25rem;
  margin-top: 1.75rem;
  padding: 0.95rem 1.35rem;
  border-radius: 999px;
  background: #294635;
  color: #f8f4eb;
  text-decoration: none;
  font-weight: 700;
  transition: transform 180ms ease;
}

.not-found__link:hover,
.not-found__link:focus-visible {
  transform: translateY(-2px);
}

@media (max-width: 760px) {
  .not-found {
    padding-inline: 1.25rem;
  }
}
</style>
