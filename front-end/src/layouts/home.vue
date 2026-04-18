<template>
  <div class="site-shell">
    <SiteHeader />
    <main class="site-shell__content">
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
  overflow: clip;
}
</style>
