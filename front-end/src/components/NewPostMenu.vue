<script setup lang="ts">
import { postTypeLinks } from '~/utils/postTypes'

const route = useRoute()
const open = ref(false)
const rootElement = ref<HTMLElement | null>(null)
const triggerElement = ref<HTMLButtonElement | null>(null)
const panelId = useId()

function close(returnFocus = false) {
  if (!open.value)
    return

  open.value = false

  if (returnFocus)
    triggerElement.value?.focus()
}

function handleDocumentPointer(event: PointerEvent) {
  if (rootElement.value && !rootElement.value.contains(event.target as Node))
    close()
}

function handleFocusOut(event: FocusEvent) {
  const nextTarget = event.relatedTarget as Node | null

  if (nextTarget && rootElement.value && !rootElement.value.contains(nextTarget))
    close()
}

watch(() => route.fullPath, () => close())

watch(open, (isOpen) => {
  if (!import.meta.client)
    return

  if (isOpen)
    document.addEventListener('pointerdown', handleDocumentPointer)
  else
    document.removeEventListener('pointerdown', handleDocumentPointer)
})

onBeforeUnmount(() => {
  if (import.meta.client)
    document.removeEventListener('pointerdown', handleDocumentPointer)
})
</script>

<template>
  <div
    ref="rootElement"
    class="new-post"
    @focusout="handleFocusOut"
    @keydown.escape="close(true)"
  >
    <button
      ref="triggerElement"
      :aria-controls="panelId"
      :aria-expanded="open"
      class="button button--primary new-post__trigger"
      type="button"
      @click="open = !open"
    >
      <span aria-hidden="true" class="i-carbon-add" />
      <span>New<span class="new-post__label-extra"> post</span></span>
      <span aria-hidden="true" class="i-carbon-chevron-down new-post__chevron" />
    </button>

    <ul v-show="open" :id="panelId" class="new-post__panel surface">
      <li v-for="postType in postTypeLinks" :key="postType.to">
        <NuxtLink
          class="new-post__option"
          :class="postType.tone"
          prefetch-on="interaction"
          :to="postType.to"
        >
          <span aria-hidden="true" class="new-post__icon"><span :class="postType.icon" /></span>
          {{ postType.label }}
        </NuxtLink>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.new-post {
  position: relative;
}

@media (max-width: 420px) {
  .new-post__trigger {
    padding-inline: 0.8rem;
  }

  .new-post__label-extra {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
  }
}

.new-post__chevron {
  transition: transform 160ms ease;
}

.new-post__trigger[aria-expanded='true'] .new-post__chevron {
  transform: rotate(180deg);
}

.new-post__panel {
  position: absolute;
  top: calc(100% + 0.5rem);
  right: 0;
  z-index: 40;
  display: grid;
  gap: 0.15rem;
  min-width: 16.5rem;
  margin: 0;
  padding: 0.4rem;
  list-style: none;
  background: linear-gradient(var(--site-surface-strong), var(--site-surface-strong)), var(--site-bg-start);
  box-shadow: var(--site-shadow-strong);
}

.new-post__option {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.7rem 0.75rem;
  border-radius: var(--radius-sm);
  color: var(--site-heading);
  font-weight: 600;
  text-decoration: none;
}

.new-post__option:hover,
.new-post__option:focus-visible {
  background: var(--site-accent-soft);
  color: var(--site-heading);
}

.new-post__icon {
  flex: none;
  display: inline-grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--kind) 14%, transparent);
  color: var(--kind);
}
</style>
