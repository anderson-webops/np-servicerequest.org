<script setup lang="ts">
import type { ThemeSchemeId } from '~/utils/theme'
import { isDarkThemeValue } from '~/utils/theme'

const props = withDefaults(defineProps<{
  align?: 'end' | 'start'
  compact?: boolean
  panelAlign?: 'end' | 'start'
}>(), {
  align: 'end',
  compact: false,
  panelAlign: undefined,
})

const colorMode = useColorMode()
const { activeScheme, scheme, schemes } = useThemeScheme()

const hasMounted = ref(false)
const open = ref(false)
const panelElement = ref<HTMLElement | null>(null)
const panelStyle = ref<Record<string, string>>({})
const rootElement = ref<HTMLElement | null>(null)
const triggerElement = ref<HTMLElement | null>(null)

const panelAlignment = computed(() => props.panelAlign || props.align)
const modeLabel = computed(() => {
  if (!hasMounted.value)
    return 'Mode'

  return isDarkThemeValue(colorMode.value) ? 'Dark' : 'Light'
})

function closePanel() {
  open.value = false
}

function togglePanel() {
  if (!hasMounted.value)
    return

  open.value = !open.value
}

function updatePanelPosition() {
  if (!open.value || !panelElement.value || !triggerElement.value)
    return

  const viewportMargin = 12
  const triggerRect = triggerElement.value.getBoundingClientRect()
  const panelRect = panelElement.value.getBoundingClientRect()
  const preferredLeft = panelAlignment.value === 'start'
    ? triggerRect.left
    : triggerRect.right - panelRect.width
  const maxLeft = Math.max(viewportMargin, window.innerWidth - panelRect.width - viewportMargin)
  const left = Math.min(Math.max(preferredLeft, viewportMargin), maxLeft)

  panelStyle.value = {
    transform: `translateX(${Math.round(left - triggerRect.left)}px)`,
  }
}

function selectScheme(nextScheme: ThemeSchemeId) {
  scheme.value = nextScheme
}

function handlePointerDown(event: MouseEvent) {
  if (!rootElement.value)
    return

  if (event.target instanceof Node && !rootElement.value.contains(event.target))
    closePanel()
}

function handleEscape(event: KeyboardEvent) {
  if (event.key === 'Escape')
    closePanel()
}

function handleResize() {
  updatePanelPosition()
}

onMounted(() => {
  hasMounted.value = true
  window.addEventListener('mousedown', handlePointerDown)
  window.addEventListener('keydown', handleEscape)
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('mousedown', handlePointerDown)
  window.removeEventListener('keydown', handleEscape)
  window.removeEventListener('resize', handleResize)
})

watch(open, async (nextOpen) => {
  if (!nextOpen) {
    panelStyle.value = {}
    return
  }

  await nextTick()
  updatePanelPosition()
})

watch(panelAlignment, async () => {
  if (!open.value)
    return

  await nextTick()
  updatePanelPosition()
})
</script>

<template>
  <div
    ref="rootElement"
    class="palette-control"
    :class="[
      props.align === 'start' ? 'palette-control--start' : 'palette-control--end',
      { 'palette-control--compact': props.compact },
    ]"
  >
    <div
      v-if="hasMounted && open"
      ref="panelElement"
      class="palette-control__panel"
      :class="panelAlignment === 'start' ? 'palette-control__panel--start' : 'palette-control__panel--end'"
      :style="panelStyle"
      role="dialog"
      aria-label="Color scheme picker"
    >
      <div class="palette-control__panel-head">
        <div>
          <p class="palette-control__eyebrow">
            Color scheme
          </p>
          <h2>Choose the palette family</h2>
          <p>
            The palette applies to both light and dark mode. Use the header theme control for system, light, or dark.
          </p>
        </div>
        <button
          class="palette-control__close"
          type="button"
          aria-label="Close color scheme picker"
          @click="closePanel"
        >
          <span class="i-carbon-close" aria-hidden="true" />
        </button>
      </div>

      <div class="palette-control__options" role="radiogroup" aria-label="Color schemes">
        <button
          v-for="option in schemes"
          :key="option.id"
          class="palette-control__option"
          :class="{ 'palette-control__option--active': option.id === scheme }"
          type="button"
          role="radio"
          :aria-checked="option.id === scheme"
          @click="selectScheme(option.id)"
        >
          <span class="palette-control__option-copy">
            <span class="palette-control__option-title">
              <span>{{ option.label }}</span>
              <span v-if="option.isDefault" class="palette-control__badge">Default</span>
              <span v-if="option.id === scheme" class="palette-control__badge palette-control__badge--active">Active</span>
            </span>
            <span class="palette-control__option-description">{{ option.description }}</span>
          </span>

          <span class="palette-control__swatches" aria-hidden="true">
            <span class="palette-control__swatch-group palette-control__swatch-group--light">
              <span :style="{ backgroundColor: option.swatches.light.surface }" />
              <span :style="{ backgroundColor: option.swatches.light.accent }" />
              <span :style="{ backgroundColor: option.swatches.light.text }" />
            </span>
            <span class="palette-control__swatch-group palette-control__swatch-group--dark">
              <span :style="{ backgroundColor: option.swatches.dark.surface }" />
              <span :style="{ backgroundColor: option.swatches.dark.accent }" />
              <span :style="{ backgroundColor: option.swatches.dark.text }" />
            </span>
          </span>
        </button>
      </div>
    </div>

    <button
      ref="triggerElement"
      class="palette-control__trigger"
      :class="{ 'palette-control__trigger--compact': props.compact }"
      type="button"
      :aria-expanded="hasMounted && open"
      aria-haspopup="dialog"
      @click="togglePanel"
    >
      <span class="i-carbon-color-palette palette-control__trigger-icon" aria-hidden="true" />
      <span class="palette-control__trigger-label">{{ activeScheme.label }}</span>
      <span class="palette-control__trigger-mode">{{ modeLabel }}</span>
    </button>
  </div>
</template>

<style scoped>
.palette-control {
  position: relative;
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.palette-control--start {
  align-items: flex-start;
}

.palette-control--end {
  align-items: flex-end;
}

.palette-control--compact {
  width: min(100%, 13.5rem);
}

.palette-control__trigger {
  display: inline-flex;
  align-items: center;
  gap: 0.65rem;
  min-height: 2.95rem;
  padding: 0.78rem 1rem;
  border: 1px solid var(--site-border);
  border-radius: 1rem;
  background: var(--site-surface);
  color: var(--site-heading);
  font: inherit;
  font-weight: 700;
  box-shadow: var(--site-shadow);
  cursor: pointer;
  backdrop-filter: blur(16px);
  transition:
    transform 180ms ease,
    border-color 180ms ease,
    background-color 180ms ease,
    box-shadow 180ms ease;
}

.palette-control__trigger--compact {
  width: 100%;
  justify-content: space-between;
}

.palette-control__trigger:hover,
.palette-control__trigger:focus-visible {
  transform: translateY(-1px);
  border-color: var(--site-accent-soft-strong);
  background: var(--site-surface-strong);
}

.palette-control__trigger:focus-visible,
.palette-control__close:focus-visible,
.palette-control__option:focus-visible {
  outline: 2px solid var(--site-focus);
  outline-offset: 3px;
}

.palette-control__trigger-icon {
  color: var(--site-link);
  font-size: 1rem;
}

.palette-control__trigger-label {
  min-width: 4.5rem;
  text-align: left;
}

.palette-control__trigger-mode {
  color: var(--site-muted);
  font-size: 0.72rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.palette-control__panel {
  position: absolute;
  bottom: calc(100% + 0.75rem);
  left: 0;
  width: min(30rem, calc(100vw - 1.5rem));
  padding: 1rem;
  border: 1px solid var(--site-border);
  border-radius: 1.4rem;
  background: var(--site-surface-strong);
  box-shadow: var(--site-shadow-strong);
  backdrop-filter: blur(20px);
}

.palette-control__panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.palette-control__panel-head h2,
.palette-control__panel-head p,
.palette-control__eyebrow {
  margin: 0;
}

.palette-control__panel-head h2 {
  margin-top: 0.4rem;
  font-family: 'DM Serif Display', serif;
  font-size: 1.45rem;
  font-weight: 400;
  line-height: 1;
  color: var(--site-heading);
}

.palette-control__panel-head p:not(.palette-control__eyebrow) {
  margin-top: 0.55rem;
  color: var(--site-subtle);
  font-size: 0.88rem;
  line-height: 1.55;
}

.palette-control__eyebrow {
  color: var(--site-muted);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.palette-control__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.35rem;
  height: 2.35rem;
  border: 1px solid var(--site-border);
  border-radius: 999px;
  background: transparent;
  color: var(--site-heading);
  cursor: pointer;
  transition:
    border-color 180ms ease,
    background-color 180ms ease;
}

.palette-control__close:hover {
  border-color: var(--site-border-strong);
  background: var(--site-accent-soft);
}

.palette-control__options {
  display: grid;
  gap: 0.65rem;
  margin-top: 1rem;
}

.palette-control__option {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  width: 100%;
  padding: 0.9rem;
  border: 1px solid var(--site-border);
  border-radius: 1.1rem;
  background: var(--site-surface);
  color: var(--site-heading);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    border-color 180ms ease,
    background-color 180ms ease,
    box-shadow 180ms ease;
}

.palette-control__option:hover,
.palette-control__option--active {
  border-color: var(--site-accent-soft-strong);
  background: var(--site-accent-soft);
  box-shadow: 0 0 0 1px var(--site-focus-ring);
}

.palette-control__option-copy {
  display: grid;
  gap: 0.35rem;
  min-width: 0;
}

.palette-control__option-title {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  align-items: center;
  font-weight: 800;
}

.palette-control__option-description {
  color: var(--site-subtle);
  font-size: 0.87rem;
  line-height: 1.5;
}

.palette-control__badge {
  display: inline-flex;
  padding: 0.18rem 0.42rem;
  border-radius: 999px;
  background: var(--site-elevated);
  color: var(--site-muted);
  font-size: 0.66rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.palette-control__badge--active {
  background: var(--site-button-bg);
  color: var(--site-button-text);
}

.palette-control__swatches {
  display: flex;
  flex-shrink: 0;
  gap: 0.45rem;
}

.palette-control__swatch-group {
  display: flex;
  gap: 0.18rem;
  padding: 0.32rem;
  border-radius: 0.85rem;
}

.palette-control__swatch-group--light {
  background: rgba(255, 255, 255, 0.52);
  border: 1px solid rgba(0, 0, 0, 0.08);
}

.palette-control__swatch-group--dark {
  background: rgba(0, 0, 0, 0.18);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.palette-control__swatch-group span {
  width: 0.68rem;
  height: 1.6rem;
  border-radius: 999px;
}

.palette-control__swatch-group span:first-child {
  width: 1.6rem;
  border-radius: 0.62rem;
}

@media (max-width: 760px) {
  .palette-control,
  .palette-control--compact {
    width: 100%;
    align-items: stretch;
  }

  .palette-control__panel {
    right: auto;
    left: 0;
    width: min(100%, calc(100vw - 2.5rem));
  }

  .palette-control__option {
    flex-direction: column;
  }
}
</style>
