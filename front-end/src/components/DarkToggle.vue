<script setup lang="ts">
type ThemePreference = 'system' | 'light' | 'dark'

const colorMode = useColorMode()
const hasMounted = ref(false)
const menuOpen = ref(false)
const rootElement = ref<HTMLElement | null>(null)

const themeOptions: Array<{
  icon: string
  label: string
  value: ThemePreference
}> = [
  { icon: 'i-carbon-contrast', label: 'System', value: 'system' },
  { icon: 'i-carbon-sun', label: 'Light', value: 'light' },
  { icon: 'i-carbon-moon', label: 'Dark', value: 'dark' },
]

const activePreference = computed<ThemePreference>(() => {
  if (!hasMounted.value)
    return 'system'

  return colorMode.preference === 'light' || colorMode.preference === 'dark'
    ? colorMode.preference
    : 'system'
})

const activeOption = computed(() =>
  themeOptions.find(option => option.value === activePreference.value)
  || themeOptions[0]!,
)

const buttonLabel = computed(() => {
  if (!hasMounted.value)
    return 'Theme'

  return activeOption.value.label
})

const buttonIconClass = computed(() => {
  if (!hasMounted.value)
    return 'i-carbon-contrast'

  return activeOption.value.icon
})

function closeMenu() {
  menuOpen.value = false
}

function toggleMenu() {
  if (!hasMounted.value)
    return

  menuOpen.value = !menuOpen.value
}

function setTheme(preference: ThemePreference) {
  colorMode.preference = preference
  closeMenu()
}

function handlePointerDown(event: MouseEvent) {
  if (!rootElement.value)
    return

  if (event.target instanceof Node && !rootElement.value.contains(event.target))
    closeMenu()
}

function handleEscape(event: KeyboardEvent) {
  if (event.key === 'Escape')
    closeMenu()
}

onMounted(() => {
  hasMounted.value = true
  window.addEventListener('mousedown', handlePointerDown)
  window.addEventListener('keydown', handleEscape)
})

onBeforeUnmount(() => {
  window.removeEventListener('mousedown', handlePointerDown)
  window.removeEventListener('keydown', handleEscape)
})
</script>

<template>
  <div ref="rootElement" class="theme-control">
    <button
      class="theme-toggle"
      type="button"
      aria-haspopup="menu"
      :aria-expanded="menuOpen"
      :aria-label="hasMounted ? `Theme: ${buttonLabel}` : 'Theme'"
      :title="hasMounted ? `Theme: ${buttonLabel}` : 'Theme'"
      @click="toggleMenu"
    >
      <span :class="buttonIconClass" aria-hidden="true" class="theme-toggle__icon" />
      <span class="theme-toggle__label">{{ buttonLabel }}</span>
      <span aria-hidden="true" class="i-carbon-chevron-down theme-toggle__chevron" />
    </button>

    <div v-if="hasMounted && menuOpen" class="theme-menu" role="menu">
      <button
        v-for="option in themeOptions"
        :key="option.value"
        class="theme-menu__option"
        :class="{ 'theme-menu__option--active': activePreference === option.value }"
        role="menuitemradio"
        :aria-checked="activePreference === option.value"
        type="button"
        @click="setTheme(option.value)"
      >
        <span :class="option.icon" aria-hidden="true" class="theme-menu__icon" />
        <span>{{ option.label }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.theme-control {
  position: relative;
}

.theme-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  min-height: 2.9rem;
  padding: 0.7rem 1rem;
  border: 1px solid var(--site-border);
  border-radius: 1rem;
  background: transparent;
  color: var(--site-heading);
  font: inherit;
  font-size: 0.9rem;
  font-weight: 700;
  box-shadow: none;
  backdrop-filter: blur(12px);
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
  border-color: var(--site-accent-soft-strong);
  background: color-mix(in srgb, var(--site-surface-soft) 86%, transparent);
}

.theme-toggle:focus-visible {
  outline: 2px solid var(--site-focus);
  outline-offset: 3px;
}

.theme-toggle__icon,
.theme-menu__icon {
  font-size: 1rem;
  color: var(--site-link);
}

.theme-toggle__label {
  line-height: 1;
}

.theme-toggle__chevron {
  font-size: 0.9rem;
  color: var(--site-muted);
}

.theme-menu {
  position: absolute;
  top: calc(100% + 0.55rem);
  right: 0;
  display: grid;
  gap: 0.35rem;
  min-width: 11rem;
  padding: 0.55rem;
  border-radius: 1rem;
  background: var(--site-surface);
  border: 1px solid var(--site-border);
  box-shadow: var(--site-shadow-strong);
  z-index: 30;
}

.theme-menu__option {
  display: inline-flex;
  align-items: center;
  gap: 0.65rem;
  width: 100%;
  padding: 0.75rem 0.85rem;
  border: 1px solid transparent;
  border-radius: 0.85rem;
  background: transparent;
  color: var(--site-heading);
  font: inherit;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
  transition:
    border-color 180ms ease,
    background-color 180ms ease,
    color 180ms ease;
}

.theme-menu__option:hover,
.theme-menu__option:focus-visible,
.theme-menu__option--active {
  background: var(--site-elevated);
  border-color: var(--site-border-strong);
}

.theme-menu__option:focus-visible {
  outline: 2px solid var(--site-focus);
  outline-offset: 2px;
}

@media (max-width: 760px) {
  .theme-toggle__label {
    display: none;
  }

  .theme-menu {
    right: auto;
    left: 0;
  }
}
</style>
