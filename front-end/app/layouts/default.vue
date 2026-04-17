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
    radial-gradient(circle at top left, rgba(165, 196, 177, 0.42), transparent 24%),
    linear-gradient(180deg, #f5f0e5 0%, #efe7d8 100%);
  color: #1f2b23;
  font-family: 'DM Sans', sans-serif;
}

.site-shell__content {
  overflow: clip;
}
</style>
