<template>
  <footer class="site-footer">
    <NuxtLink class="site-footer__help" prefetch-on="interaction" to="/help">
      Help
    </NuxtLink>

    <div class="site-footer__links">
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
    </div>
  </footer>
</template>

<style scoped>
.site-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1.5rem;
  padding-top: 2.5rem;
  padding-right: var(--page-inline-end);
  padding-bottom: max(3rem, calc(2rem + var(--page-block-end)));
  padding-left: var(--page-inline-start);
  color: var(--site-subtle);
}

.site-footer__links {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-left: auto;
  max-width: 48rem;
}

.site-footer__help,
.site-footer__links a {
  color: var(--site-heading);
  text-decoration: none;
  font-weight: 600;
}

.site-footer__help:hover,
.site-footer__help:focus-visible,
.site-footer__links a:hover,
.site-footer__links a:focus-visible {
  text-decoration: underline;
  text-underline-offset: 0.22em;
}

@media (max-width: 760px) {
  .site-footer {
    flex-direction: column;
    align-items: flex-start;
  }

  .site-footer__links {
    margin-left: 0;
    justify-content: flex-start;
  }
}
</style>
