<template>
  <footer class="site-footer">
    <div class="site-footer__copy">
      <p class="site-footer__label">
        Neighbors helping neighbors
      </p>
      <p class="site-footer__text">
        Request a project, borrow something useful, or offer items that another person can put to work.
      </p>
    </div>

    <div class="site-footer__links">
      <a href="/#service-request">Service projects</a>
      <a href="/#item-request">Borrow an item</a>
      <a href="/#item-lending">Lend an item</a>
    </div>
  </footer>
</template>

<style scoped>
.site-footer {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1.5rem;
  padding: 2.5rem 5vw 3rem;
  color: #3c4c42;
}

.site-footer__copy {
  max-width: 34rem;
}

.site-footer__label {
  margin: 0 0 0.45rem;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.site-footer__text {
  margin: 0;
  font-size: 0.98rem;
  line-height: 1.65;
}

.site-footer__links {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.75rem;
}

.site-footer__links a {
  color: #243128;
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
