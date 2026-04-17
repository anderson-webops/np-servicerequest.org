<template>
  <header class="site-header">
    <NuxtLink class="site-header__brand" to="/">
      <span class="site-header__eyebrow">Community request board</span>
      <span class="site-header__name">np-servicerequest.org</span>
    </NuxtLink>

    <nav aria-label="Primary" class="site-header__nav">
      <a href="/#live-board">Live board</a>
      <a href="/#service-request">Service projects</a>
      <a href="/#item-request">Borrow an item</a>
      <a href="/#item-lending">Lend an item</a>
      <a href="/#account-hub">Optional account</a>
    </nav>
  </header>
</template>

<style scoped>
.site-header {
  position: sticky;
  top: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
  padding: 1rem 5vw;
  background: linear-gradient(180deg, rgba(245, 240, 229, 0.96), rgba(245, 240, 229, 0.82));
  backdrop-filter: blur(18px);
  border-bottom: 1px solid rgba(37, 50, 41, 0.08);
}

.site-header__brand {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  text-decoration: none;
  color: #1e2a22;
}

.site-header__eyebrow {
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #6c7268;
}

.site-header__name {
  font-family: 'DM Serif Display', serif;
  font-size: 1.55rem;
  line-height: 1;
}

.site-header__nav {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.65rem;
}

.site-header__nav a {
  padding: 0.55rem 0.95rem;
  border-radius: 999px;
  text-decoration: none;
  color: #243128;
  font-size: 0.95rem;
  font-weight: 600;
  transition:
    transform 160ms ease,
    background-color 160ms ease,
    color 160ms ease;
}

.site-header__nav a:hover,
.site-header__nav a:focus-visible {
  background: rgba(58, 91, 71, 0.1);
  color: #102017;
  transform: translateY(-1px);
}

@media (max-width: 760px) {
  .site-header {
    align-items: flex-start;
    flex-direction: column;
    padding-inline: 1.25rem;
  }

  .site-header__nav {
    justify-content: flex-start;
  }
}
</style>
