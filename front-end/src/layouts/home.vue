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
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background:
    radial-gradient(circle at top left, var(--site-bg-accent), transparent 30rem),
    linear-gradient(180deg, var(--site-bg-start) 0%, var(--site-bg-end) 100%);
  color: var(--site-text);
  transition:
    background 220ms ease,
    color 220ms ease;
}

.site-shell__content {
  --page-hero-space: clamp(1.5rem, 3vw, 2.5rem);
  --page-hero-gap: 0.75rem;
  --page-hero-max: var(--content-narrow);
  --page-hero-title-max: 30ch;
  --page-hero-copy-max: 44rem;
  --page-hero-title-size: var(--text-2xl);
  --page-section-gap: 1.5rem;
  --page-surface-padding: clamp(1.1rem, 2vw, 1.5rem);
  --page-surface-radius: var(--radius-lg);
  flex: 1;
  width: 100%;
  max-width: var(--content-max);
  margin-inline: auto;
  overflow: clip;
}

.site-shell__content:focus {
  outline: none;
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
}
</style>
