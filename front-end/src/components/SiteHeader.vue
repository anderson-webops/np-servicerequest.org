<template>
  <header class="site-header">
    <NuxtLink class="site-header__brand" prefetch-on="interaction" to="/">
      <span class="site-header__eyebrow">Community request board</span>
      <span class="site-header__name">np-servicerequest.org</span>
    </NuxtLink>

    <div class="site-header__actions">
      <nav aria-label="Primary" class="site-header__nav">
        <NuxtLink prefetch-on="interaction" to="/#live-board">
          <span class="site-header__label-full">Live board</span>
          <span class="site-header__label-short">Board</span>
        </NuxtLink>
        <NuxtLink prefetch-on="interaction" to="/service-request">
          <span class="site-header__label-full">Service projects</span>
          <span class="site-header__label-short">Service</span>
        </NuxtLink>
        <NuxtLink prefetch-on="interaction" to="/item-request">
          <span class="site-header__label-full">Borrow an item</span>
          <span class="site-header__label-short">Borrow</span>
        </NuxtLink>
        <NuxtLink prefetch-on="interaction" to="/item-lending">
          <span class="site-header__label-full">Lend an item</span>
          <span class="site-header__label-short">Lend</span>
        </NuxtLink>
      </nav>

      <DarkToggle />
    </div>
  </header>
</template>

<style scoped>
.site-header {
  position: sticky;
  top: 0;
  z-index: 30;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
  padding-top: max(1rem, var(--page-block-start));
  padding-right: var(--page-inline-end);
  padding-bottom: 1rem;
  padding-left: var(--page-inline-start);
  background: var(--site-header-bg);
  backdrop-filter: blur(18px);
  border-bottom: 1px solid var(--site-header-border);
}

.site-header__brand {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
  text-decoration: none;
  color: var(--site-heading);
}

.site-header__eyebrow {
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--site-muted);
}

.site-header__name {
  font-family: 'DM Serif Display', serif;
  font-size: 1.55rem;
  line-height: 1;
}

.site-header__actions {
  display: flex;
  flex: 1;
  min-width: 0;
  align-items: center;
  justify-content: flex-end;
  gap: 0.7rem;
}

.site-header__nav {
  display: flex;
  flex-wrap: wrap;
  min-width: 0;
  justify-content: flex-end;
  gap: 0.35rem 0.55rem;
}

.site-header__nav a {
  padding: 0.6rem 0.78rem;
  border: 1px solid transparent;
  border-radius: 0.95rem;
  text-decoration: none;
  color: var(--site-heading);
  font-size: 0.92rem;
  font-weight: 600;
  white-space: nowrap;
  touch-action: manipulation;
  transition:
    border-color 160ms ease,
    background-color 160ms ease,
    color 160ms ease;
}

.site-header__nav a:hover,
.site-header__nav a:focus-visible {
  border-color: var(--site-border);
  background: color-mix(in srgb, var(--site-surface-soft) 86%, transparent);
  color: var(--site-text-strong);
}

.site-header__label-short {
  display: none;
}

@media (max-width: 1080px) {
  .site-header {
    align-items: flex-start;
    flex-direction: column;
    gap: 1rem;
  }

  .site-header__actions {
    width: 100%;
    justify-content: space-between;
  }

  .site-header__nav {
    flex: 1;
    justify-content: flex-start;
  }
}

@media (max-width: 760px) {
  .site-header {
    position: sticky;
    gap: 0.8rem;
    padding-top: max(0.85rem, var(--page-block-start));
    padding-bottom: 0.85rem;
  }

  .site-header__brand {
    padding-right: 4.25rem;
  }

  .site-header__eyebrow {
    font-size: 0.66rem;
  }

  .site-header__name {
    font-size: 1.35rem;
  }

  .site-header__actions {
    display: block;
    width: 100%;
  }

  .site-header__nav {
    display: flex;
    flex-wrap: nowrap;
    justify-content: flex-start;
    overflow-x: auto;
    padding-bottom: 0.05rem;
    scrollbar-width: none;
  }

  .site-header__nav::-webkit-scrollbar {
    display: none;
  }

  .site-header__nav a {
    flex: 0 0 auto;
    padding: 0.55rem 0.64rem;
    font-size: 0.86rem;
    text-align: center;
  }

  .site-header__label-full {
    display: none;
  }

  .site-header__label-short {
    display: inline;
  }

  :deep(.theme-control) {
    position: absolute;
    top: max(0.85rem, var(--page-block-start));
    right: var(--page-inline-end);
  }

  :deep(.theme-toggle) {
    min-height: 2.55rem;
    padding: 0.55rem 0.75rem;
    border-radius: 0.9rem;
  }
}
</style>
