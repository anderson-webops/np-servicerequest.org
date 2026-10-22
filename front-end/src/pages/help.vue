<script setup lang="ts">
definePageMeta({
  layout: 'home',
})

useSeoMeta({
  title: 'Help',
  description:
    'Learn how the live community board works and what kinds of requests and lending offers belong there.',
})
</script>

<template>
  <div class="help-page container">
    <header class="page-header">
      <h1>Help</h1>
    </header>

    <div class="help-page__sections">
      <section class="help-section" aria-labelledby="help-public-heading">
        <h2 id="help-public-heading">
          Public posts and contact details
        </h2>
        <p>
          Posts and replies are public. Other visitors can reveal the contact details you provide.
        </p>
      </section>

      <section class="help-section" aria-labelledby="help-manage-heading">
        <h2 id="help-manage-heading">
          Managing posts
        </h2>
        <p>
          For posts made with email, a private management link allows deletion from another browser.
        </p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.help-page__sections {
  display: grid;
  gap: 1.75rem;
  max-width: var(--content-narrow);
}

.help-section {
  display: grid;
  gap: 0.4rem;
}

.help-section h2 {
  font-size: var(--text-lg);
  font-weight: 700;
}
</style>
