<script setup lang="ts">
import { postTypeLinks } from '~/utils/postTypes'
</script>

<template>
  <footer class="site-footer">
    <div class="site-footer__inner">
      <nav aria-label="Footer" class="site-footer__nav">
        <div class="site-footer__group">
          <h2>Board</h2>
          <ul>
            <li>
              <NuxtLink prefetch-on="interaction" to="/#live-board">
                Live board
              </NuxtLink>
            </li>
            <li>
              <NuxtLink prefetch-on="interaction" to="/account">
                Account
              </NuxtLink>
            </li>
            <li>
              <NuxtLink prefetch-on="interaction" to="/help">
                Help
              </NuxtLink>
            </li>
          </ul>
        </div>

        <div class="site-footer__group">
          <h2>Post</h2>
          <ul>
            <li v-for="postType in postTypeLinks" :key="postType.to">
              <NuxtLink prefetch-on="interaction" :to="postType.to">
                {{ postType.label }}
              </NuxtLink>
            </li>
          </ul>
        </div>

        <div class="site-footer__group">
          <h2>Resources</h2>
          <ul>
            <li>
              <NuxtLink prefetch-on="interaction" to="/service-directory">
                Service directory
              </NuxtLink>
            </li>
            <li>
              <NuxtLink prefetch-on="interaction" to="/service-search">
                Local service search
              </NuxtLink>
            </li>
          </ul>
        </div>
      </nav>

      <div class="site-footer__theme">
        <ThemeSchemePicker compact align="end" panel-align="end" />
      </div>
    </div>
  </footer>
</template>

<style scoped>
.site-footer {
  margin-top: clamp(2.5rem, 5vw, 4rem);
  border-top: 1px solid var(--divider);
  color: var(--site-subtle);
}

.site-footer__inner {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 2rem;
  max-width: var(--content-max);
  margin-inline: auto;
  padding: 2rem var(--page-inline-end) max(2.5rem, calc(1.5rem + var(--page-block-end))) var(--page-inline-start);
}

.site-footer__nav {
  display: flex;
  flex-wrap: wrap;
  gap: 1.5rem clamp(2rem, 6vw, 4.5rem);
}

.site-footer__group h2 {
  margin-bottom: 0.6rem;
  color: var(--site-subtle);
  font-size: var(--text-xs);
  font-weight: 700;
}

.site-footer__group ul {
  display: grid;
  gap: 0.4rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.site-footer__group a {
  color: var(--site-heading);
  font-size: var(--text-sm);
  font-weight: 600;
  text-decoration: none;
}

.site-footer__group a:hover,
.site-footer__group a:focus-visible {
  text-decoration: underline;
}

.site-footer__theme {
  width: min(100%, 13.5rem);
}

@media (max-width: 640px) {
  .site-footer__theme {
    width: 100%;
  }
}
</style>
