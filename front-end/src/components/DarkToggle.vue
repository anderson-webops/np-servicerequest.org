<script setup lang="ts">
const colorMode = useColorMode()

const isDark = computed(() => colorMode.value === 'dark')
const nextLabel = computed(() => isDark.value ? 'light' : 'dark')

function toggleTheme() {
  colorMode.preference = isDark.value ? 'light' : 'dark'
}
</script>

<template>
  <button
    class="theme-toggle"
    type="button"
    :aria-pressed="isDark"
    :aria-label="`Switch to ${nextLabel} mode`"
    :title="`Switch to ${nextLabel} mode`"
    @click="toggleTheme"
  >
    <span :class="isDark ? 'i-carbon-moon' : 'i-carbon-sun'" aria-hidden="true" class="theme-toggle__icon" />
    <span class="theme-toggle__label">{{ isDark ? 'Dark' : 'Light' }}</span>
  </button>
</template>

<style scoped>
.theme-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  min-height: 2.9rem;
  padding: 0.7rem 1rem;
  border: 1px solid var(--site-border);
  border-radius: 999px;
  background: var(--site-elevated);
  color: var(--site-heading);
  font: inherit;
  font-size: 0.9rem;
  font-weight: 700;
  box-shadow: 0 10px 24px rgba(21, 17, 13, 0.08);
  backdrop-filter: blur(16px);
  cursor: pointer;
  transition:
    transform 180ms ease,
    border-color 180ms ease,
    background-color 180ms ease,
    color 180ms ease,
    box-shadow 180ms ease;
}

.theme-toggle:hover,
.theme-toggle:focus-visible {
  transform: translateY(-1px);
  border-color: var(--site-accent-soft-strong);
  background: var(--site-elevated-strong);
  box-shadow: 0 16px 30px rgba(21, 17, 13, 0.12);
}

.theme-toggle:focus-visible {
  outline: 2px solid var(--site-focus);
  outline-offset: 3px;
}

.theme-toggle__icon {
  font-size: 1rem;
  color: var(--site-link);
}

.theme-toggle__label {
  line-height: 1;
}

@media (max-width: 760px) {
  .theme-toggle {
    padding-inline: 0.9rem;
  }

  .theme-toggle__label {
    display: none;
  }
}
</style>
