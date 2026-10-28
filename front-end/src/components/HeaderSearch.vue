<script setup lang="ts">
const route = useRoute()
const router = useRouter()
const panelId = useId()
const dialog = ref<HTMLDialogElement | null>(null)
const input = ref<HTMLInputElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const open = ref(false)
const query = ref('')
const panelTop = ref('4rem')

function closeSearch() {
  dialog.value?.close()
}

async function openSearch() {
  query.value = typeof route.query.q === 'string' ? route.query.q : ''
  panelTop.value = `${(trigger.value?.getBoundingClientRect().bottom || 56) + 8}px`
  dialog.value?.showModal()
  open.value = true
  await nextTick()
  input.value?.focus()
}

function handleBackdrop(event: MouseEvent) {
  if (!dialog.value || event.target !== dialog.value)
    return

  const bounds = dialog.value.getBoundingClientRect()
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)
    closeSearch()
}

async function search() {
  const nextQuery: Record<string, string> = {}
  if (route.path === '/') {
    for (const key of ['filter', 'sort']) {
      const value = route.query[key]
      if (typeof value === 'string')
        nextQuery[key] = value
    }
  }
  const value = query.value.trim().slice(0, 120)
  if (value)
    nextQuery.q = value

  closeSearch()
  await router.push({ path: '/', query: nextQuery, hash: '#live-board' })
  await nextTick()
  document.querySelector<HTMLElement>('#live-board-heading')?.focus({ preventScroll: true })
}

watch(() => route.fullPath, closeSearch)
</script>

<template>
  <div class="header-search">
    <button
      ref="trigger"
      class="header-search__trigger"
      type="button"
      aria-label="Search posts"
      aria-haspopup="dialog"
      :aria-controls="panelId"
      :aria-expanded="open"
      @click="openSearch"
    >
      <span class="i-carbon-search" aria-hidden="true" />
    </button>

    <dialog
      :id="panelId"
      ref="dialog"
      class="header-search__panel"
      aria-label="Search posts"
      :style="{ top: panelTop }"
      @click="handleBackdrop"
      @close="open = false"
    >
      <form role="search" @submit.prevent="search">
        <label class="header-search__field">
          <span class="sr-only">Search the live board</span>
          <input ref="input" v-model="query" class="input" name="board_search" maxlength="120" placeholder="Search posts" type="search">
        </label>
        <button class="button button--primary" type="submit" aria-label="Submit search">
          <span class="i-carbon-search" aria-hidden="true" />
        </button>
        <button class="button button--quiet" type="button" aria-label="Close search" @click="closeSearch">
          <span class="i-carbon-close" aria-hidden="true" />
        </button>
      </form>
    </dialog>
  </div>
</template>

<style scoped>
.header-search__trigger {
  display: inline-grid;
  place-items: center;
  width: 2.75rem;
  height: 2.75rem;
  padding: 0;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--site-heading);
  font-size: 1.2rem;
  cursor: pointer;
}

.header-search__trigger:hover,
.header-search__trigger[aria-expanded='true'] {
  background: var(--site-accent-soft);
}

.header-search__panel {
  position: fixed;
  right: max(1rem, var(--page-inline-end));
  left: auto;
  width: min(29rem, calc(100% - 2rem));
  max-width: none;
  margin: 0;
  padding: 0.75rem;
  border: 1px solid var(--field-border);
  border-radius: var(--radius-md);
  background: var(--site-surface-strong);
  color: var(--site-text);
  box-shadow: var(--site-shadow);
}

.header-search__panel::backdrop {
  background: rgb(0 0 0 / 12%);
}

.header-search__panel form {
  display: flex;
  gap: 0.35rem;
}

.header-search__field {
  flex: 1;
  min-width: 0;
}

.header-search__panel .button {
  padding-inline: 0.75rem;
}
</style>
