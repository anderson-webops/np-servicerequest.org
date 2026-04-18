<template>
  <header class="site-header">
    <NuxtLink class="site-header__brand" prefetch-on="interaction" to="/">
      <span class="site-header__eyebrow">Community request board</span>
      <span class="site-header__name">np-servicerequest.org</span>
    </NuxtLink>

    <div class="site-header__actions">
      <nav aria-label="Primary" class="site-header__nav">
        <a href="/#live-board">Live board</a>
        <NuxtLink prefetch-on="interaction" to="/service-request">
          Service projects
        </NuxtLink>
        <NuxtLink prefetch-on="interaction" to="/item-request">
          Borrow an item
        </NuxtLink>
        <NuxtLink prefetch-on="interaction" to="/item-lending">
          Lend an item
        </NuxtLink>
        <NuxtLink prefetch-on="interaction" to="/account">
          Optional account
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
  gap: 0.9rem;
}

.site-header__nav {
  display: flex;
  flex-wrap: wrap;
  min-width: 0;
  justify-content: flex-end;
  gap: 0.65rem;
}

.site-header__nav a {
  padding: 0.55rem 0.95rem;
  border-radius: 999px;
  text-decoration: none;
  color: var(--site-heading);
  font-size: 0.95rem;
  font-weight: 600;
  white-space: nowrap;
  touch-action: manipulation;
  transition:
    transform 160ms ease,
    background-color 160ms ease,
    color 160ms ease;
}

.site-header__nav a:hover,
.site-header__nav a:focus-visible {
  background: var(--site-accent-soft);
  color: var(--site-text-strong);
  transform: translateY(-1px);
}

@media (max-width: 980px) {
  .site-header {
    align-items: flex-start;
    flex-direction: column;
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

@media (max-width: 640px) {
  .site-header__actions {
    flex-direction: column-reverse;
    align-items: stretch;
  }

  .site-header__nav {
    justify-content: flex-start;
  }

  .site-header__nav a {
    text-align: center;
  }

  :deep(.theme-toggle) {
    align-self: flex-end;
  }
}
</style>
