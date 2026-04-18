<template>
  <footer class="site-footer">
    <div class="site-footer__links">
      <a href="/#live-board">Live board</a>
      <NuxtLink to="/service-request">
        Service projects
      </NuxtLink>
      <NuxtLink to="/item-request">
        Borrow an item
      </NuxtLink>
      <NuxtLink to="/item-lending">
        Lend an item
      </NuxtLink>
      <NuxtLink to="/account">
        Optional account
      </NuxtLink>
    </div>
  </footer>
</template>

<style scoped>
.site-footer {
  display: flex;
  justify-content: flex-end;
  padding: 2.5rem 5vw 3rem;
  color: var(--site-subtle);
}

.site-footer__links {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.75rem;
}

.site-footer__links a {
  color: var(--site-heading);
  text-decoration: none;
  font-weight: 600;
}

.site-footer__links a:hover,
.site-footer__links a:focus-visible {
  text-decoration: underline;
  text-underline-offset: 0.22em;
}

@media (max-width: 760px) {
  .site-footer {
    flex-direction: column;
    align-items: flex-start;
    padding-inline: 1.25rem;
  }

  .site-footer__links {
    justify-content: flex-start;
  }
}
</style>
