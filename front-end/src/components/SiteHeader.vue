<script setup lang="ts">
const route = useRoute()

const navLinks = [
  { label: 'Board', to: '/#live-board', match: (path: string) => path === '/' || path.startsWith('/post') },
  { label: 'Directory', to: '/service-directory', match: (path: string) => path.startsWith('/service-directory') || path.startsWith('/service-search') },
  { label: 'Help', to: '/help', match: (path: string) => path.startsWith('/help') },
  { label: 'Account', to: '/account', match: (path: string) => path.startsWith('/account') },
]
</script>

<template>
  <header class="site-header">
    <div class="site-header__inner">
      <NuxtLink class="site-header__brand" prefetch-on="interaction" to="/">
        np-servicerequest.org
      </NuxtLink>

      <nav aria-label="Primary" class="site-header__nav">
        <NuxtLink
          v-for="link in navLinks"
          :key="link.to"
          :aria-current="link.match(route.path) ? 'page' : undefined"
          prefetch-on="interaction"
          :to="link.to"
        >
          {{ link.label }}
        </NuxtLink>
      </nav>

      <div class="site-header__actions">
        <NewPostMenu />
        <HeaderSearch />
      </div>
    </div>
  </header>
</template>

<style scoped>
.site-header {
  position: sticky;
  top: 0;
  z-index: 30;
  padding-top: var(--page-block-start);
  background: var(--site-header-bg);
  backdrop-filter: blur(18px);
  border-bottom: 1px solid var(--divider);
}

.site-header__inner {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  grid-template-areas: 'brand nav actions';
  align-items: center;
  gap: 0.75rem 1.5rem;
  max-width: var(--content-max);
  margin-inline: auto;
  padding: 0.5rem var(--page-inline-end) 0.5rem var(--page-inline-start);
}

.site-header__brand {
  grid-area: brand;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--site-heading);
  font-family: var(--font-serif);
  font-size: 1.35rem;
  line-height: 1;
  text-decoration: none;
  white-space: nowrap;
}

.site-header__brand:hover {
  color: var(--site-heading);
}

.site-header__nav {
  grid-area: nav;
  display: flex;
  gap: 0.25rem;
  min-width: 0;
}

.site-header__nav a {
  position: relative;
  padding: 0.55rem 0.7rem;
  border-radius: var(--radius-sm);
  color: var(--site-text);
  font-size: var(--text-sm);
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
}

.site-header__nav a:hover,
.site-header__nav a:focus-visible {
  background: var(--site-accent-soft);
  color: var(--site-heading);
}

.site-header__nav a[aria-current='page'] {
  color: var(--site-heading);
}

.site-header__nav a[aria-current='page']::after {
  content: '';
  position: absolute;
  right: 0.7rem;
  bottom: 0.2rem;
  left: 0.7rem;
  height: 2px;
  border-radius: 2px;
  background: currentColor;
}

.site-header__actions {
  grid-area: actions;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

@media (max-width: 860px) {
  .site-header__inner {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      'brand actions'
      'nav nav';
    padding-bottom: 0.35rem;
  }

  .site-header__nav {
    margin-inline: -0.7rem;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .site-header__nav::-webkit-scrollbar {
    display: none;
  }
}

@media (max-width: 520px) {
  .site-header__inner {
    column-gap: 0.5rem;
  }

  .site-header__brand {
    font-size: 1.05rem;
  }

  .site-header__actions :deep(.theme-toggle__label),
  .site-header__actions :deep(.theme-toggle__chevron) {
    display: none;
  }

  .site-header__actions :deep(.theme-toggle) {
    min-height: 2.75rem;
    padding-inline: 0.75rem;
  }
}
</style>
