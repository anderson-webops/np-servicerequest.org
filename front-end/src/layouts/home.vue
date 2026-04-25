<template>
  <div class="site-shell">
    <a class="skip-link" href="#main-content">Skip to content</a>
    <SiteHeader />
    <main id="main-content" class="site-shell__content" tabindex="-1">
      <slot />
    </main>
    <Footer />
  </div>
</template>

<style scoped>
.site-shell {
  min-height: 100vh;
  background:
    radial-gradient(circle at top left, var(--site-bg-accent), transparent 24%),
    linear-gradient(180deg, var(--site-bg-start) 0%, var(--site-bg-end) 100%);
  color: var(--site-text);
  font-family: 'DM Sans', sans-serif;
  transition:
    background 220ms ease,
    color 220ms ease;
}

.site-shell__content {
  --page-hero-space: clamp(1.35rem, 2.5vw, 2.6rem);
  --page-hero-gap: 0.95rem;
  --page-hero-max: 58rem;
  --page-hero-title-max: 26ch;
  --page-hero-copy-max: 44rem;
  --page-hero-title-size: clamp(1.85rem, 2.75vw, 2.8rem);
  --page-section-gap: 1.2rem;
  --page-surface-padding: clamp(1.15rem, 2vw, 1.35rem);
  --page-surface-radius: 1.5rem;
  overflow: clip;
}

.skip-link {
  position: absolute;
  top: 0.75rem;
  left: var(--page-inline-start, 1rem);
  z-index: 80;
  padding: 0.8rem 1rem;
  border-radius: 999px;
  background: var(--site-button-bg);
  color: var(--site-button-text);
  text-decoration: none;
  font-weight: 700;
  transform: translateY(-180%);
  transition: transform 180ms ease;
}

.skip-link:focus-visible {
  transform: translateY(0);
  outline: 2px solid var(--site-focus);
  outline-offset: 3px;
}
</style>
