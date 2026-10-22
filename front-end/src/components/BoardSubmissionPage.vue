<script setup lang="ts">
import type {
  FormErrorState,
  FormStatus,
} from '~/composables/useBoardSubmission'
import type { BoardActivitySummary, BoardItem, BoardItemsResponse } from '~/utils/board'
import type { SubmissionKind } from '~/utils/submissions'
import { getBoardEndpoint } from '~/utils/board'
import { getBoardDetailPath } from '~/utils/boardUi'
import { formatRelativeTime, formatReplyCount, getPostType } from '~/utils/postTypes'

const props = defineProps<{
  draftKey?: string
  kind: SubmissionKind
  notePlaceholder: string
  pendingLabel: string
  securityError: FormErrorState | null
  status: FormStatus
  submitLabel: string
  successText: string
  title: string
}>()

const emit = defineEmits<{
  submit: [event: Event]
}>()

const formElement = ref<HTMLFormElement | null>(null)
const resultElement = ref<HTMLElement | null>(null)
const draftSaved = ref(false)
const draftRestored = ref(false)
const runtimeConfig = useRuntimeConfig()
const activityPending = ref(false)
const activityLoaded = ref(false)
const activityError = ref<FormErrorState | null>(null)
const recentItems = ref<BoardItem[]>([])
const activitySummary = ref<BoardActivitySummary>({
  answered: 0,
  closed: 0,
  fulfilled: 0,
  needsFirstReply: 0,
  open: 0,
  total: 0,
})

const categoryCopy = computed(() => {
  if (props.kind === 'service-request') {
    return {
      empty: 'No public service projects are waiting yet.',
      label: 'Recent service projects',
    }
  }

  if (props.kind === 'item-request') {
    return {
      empty: 'No public borrow requests are waiting yet.',
      label: 'Recent borrow requests',
    }
  }

  return {
    empty: 'No public lending offers are available yet.',
    label: 'Recent lending offers',
  }
})

const postType = computed(() => getPostType(props.kind))
const boardFilterPath = computed(() => `/?filter=${props.kind}#live-board`)

const draftStorageKey = computed(() =>
  props.draftKey ? `np_sr_submission_draft:${props.draftKey}` : '',
)

function readStoredDraft() {
  if (!import.meta.client || !draftStorageKey.value)
    return null

  try {
    const rawValue = window.localStorage.getItem(draftStorageKey.value)

    if (!rawValue)
      return null

    const parsed = JSON.parse(rawValue)

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return null

    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] =>
          typeof entry[0] === 'string' && typeof entry[1] === 'string',
      ),
    )
  }
  catch {
    return null
  }
}

function clearStoredDraft() {
  if (!import.meta.client || !draftStorageKey.value)
    return

  window.localStorage.removeItem(draftStorageKey.value)
}

function serializeForm(form: HTMLFormElement) {
  return Object.fromEntries(
    Array.from(new FormData(form).entries())
      .map(([key, value]) => [key, typeof value === 'string' ? value : ''] as const)
      .filter(([key, value]) => key !== 'bot-field' && value.trim().length > 0),
  )
}

function dispatchFieldSync(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) {
  element.dispatchEvent(new Event('input', { bubbles: true }))
  element.dispatchEvent(new Event('change', { bubbles: true }))
}

function applyDraftValue(field: Element | null, value: string) {
  if (
    field instanceof HTMLInputElement
    || field instanceof HTMLTextAreaElement
    || field instanceof HTMLSelectElement
  ) {
    field.value = value
    dispatchFieldSync(field)
  }
}

function restoreDraftIntoForm(form: HTMLFormElement, draft: Record<string, string>) {
  for (const [fieldName, value] of Object.entries(draft)) {
    const field = form.elements.namedItem(fieldName)

    if (!field)
      continue

    if (typeof RadioNodeList !== 'undefined' && field instanceof RadioNodeList) {
      for (const option of Array.from(field))
        applyDraftValue(option, value)
      continue
    }

    applyDraftValue(field as Element, value)
  }
}

function persistDraft() {
  if (!import.meta.client || !draftStorageKey.value || !formElement.value)
    return

  const nextDraft = serializeForm(formElement.value)

  if (!Object.keys(nextDraft).length) {
    clearStoredDraft()
    draftSaved.value = false
    draftRestored.value = false
    return
  }

  window.localStorage.setItem(draftStorageKey.value, JSON.stringify(nextDraft))
  draftSaved.value = true
}

function clearDraftAndResetForm() {
  clearStoredDraft()
  draftSaved.value = false
  draftRestored.value = false

  if (!formElement.value)
    return

  formElement.value.reset()

  for (const field of Array.from(formElement.value.elements)) {
    if (
      field instanceof HTMLInputElement
      || field instanceof HTMLTextAreaElement
      || field instanceof HTMLSelectElement
    ) {
      dispatchFieldSync(field)
    }
  }
}

function buildActivityEndpoint() {
  const params = new URLSearchParams({
    kind: props.kind,
    page: '1',
    pageSize: '3',
    sort: 'recent-activity',
  })

  return `${getBoardEndpoint(runtimeConfig.public.apiBaseUrl, 'items')}?${params.toString()}`
}

function getFallbackActivitySummary(items: BoardItem[], totalItems: number): BoardActivitySummary {
  return items.reduce<BoardActivitySummary>((summary, item) => {
    summary.total = totalItems

    if (item.resolutionStatus === 'open')
      summary.open += 1
    else if (item.resolutionStatus === 'fulfilled')
      summary.fulfilled += 1
    else if (item.resolutionStatus === 'closed')
      summary.closed += 1

    if (item.interactionCount > 0)
      summary.answered += 1
    else if (item.resolutionStatus === 'open')
      summary.needsFirstReply += 1

    return summary
  }, {
    answered: 0,
    closed: 0,
    fulfilled: 0,
    needsFirstReply: 0,
    open: 0,
    total: totalItems,
  })
}

function getActivityErrorState(error: unknown, endpoint: string): FormErrorState {
  let serverMessage = ''

  if (error && typeof error === 'object' && 'data' in error) {
    const data = (error as { data?: unknown }).data

    if (data && typeof data === 'object' && 'message' in data && typeof data.message === 'string')
      serverMessage = data.message
  }

  return {
    detail: `Request URL: ${endpoint}.`,
    message: serverMessage || 'Category activity is unavailable right now.',
  }
}

async function loadCategoryActivity() {
  const endpoint = buildActivityEndpoint()

  activityPending.value = true
  activityError.value = null

  try {
    const response = await $fetch<BoardItemsResponse>(endpoint, {
      credentials: 'include',
    })

    recentItems.value = response.items
    activitySummary.value = response.activitySummary
      || getFallbackActivitySummary(response.items, response.pagination.totalItems)
    activityLoaded.value = true
  }
  catch (error) {
    activityError.value = getActivityErrorState(error, endpoint)
  }
  finally {
    activityPending.value = false
  }
}

onMounted(async () => {
  await nextTick()

  void loadCategoryActivity()

  if (!formElement.value)
    return

  const savedDraft = readStoredDraft()

  if (savedDraft && Object.keys(savedDraft).length) {
    restoreDraftIntoForm(formElement.value, savedDraft)
    draftSaved.value = true
    draftRestored.value = true
  }
})

async function focusResult() {
  await nextTick()
  resultElement.value?.focus()
  resultElement.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

watch(
  () => [props.status.success, props.status.error] as const,
  ([nextSuccess, nextError]) => {
    if (nextSuccess || nextError)
      void focusResult()
  },
)

watch(
  () => props.status.success,
  (nextSuccess, previousSuccess) => {
    if (!nextSuccess || previousSuccess)
      return

    clearStoredDraft()
    draftSaved.value = false
    draftRestored.value = false
    void loadCategoryActivity()
  },
)
</script>

<template>
  <div class="submission-page container" :class="postType.tone">
    <header class="page-header submission-page__header">
      <NuxtLink class="back-link" prefetch-on="interaction" to="/#live-board">
        <span aria-hidden="true" class="i-carbon-arrow-left" />
        Live board
      </NuxtLink>
      <h1>
        <span aria-hidden="true" class="submission-page__icon"><span :class="postType.icon" /></span>
        {{ title }}
      </h1>
    </header>

    <div class="submission-page__layout">
      <form
        ref="formElement"
        class="submission-page__form surface"
        :aria-busy="status.pending"
        @change="persistDraft"
        @input="persistDraft"
        @submit.prevent="emit('submit', $event)"
      >
        <div
          v-if="status.success"
          ref="resultElement"
          class="notice notice--success submission-page__result"
          role="status"
          tabindex="-1"
        >
          <span aria-hidden="true" class="i-carbon-checkmark-filled submission-page__result-icon" />
          <div>
            <p>{{ successText }}</p>
            <NuxtLink
              v-if="status.itemId"
              class="submission-page__result-link"
              prefetch-on="interaction"
              :to="getBoardDetailPath(status.itemId)"
            >
              View your post
            </NuxtLink>
          </div>
        </div>
        <div
          v-if="status.error"
          ref="resultElement"
          class="notice notice--error"
          role="alert"
          tabindex="-1"
        >
          <p class="notice__title">
            {{ status.error.message }}
          </p>
          <p>{{ status.error.detail }}</p>
        </div>
        <div v-if="securityError" class="notice notice--error" role="alert">
          <p class="notice__title">
            {{ securityError.message }}
          </p>
          <p>{{ securityError.detail }}</p>
        </div>

        <p class="sr-only">
          <label>Do not fill this field if you are human.
            <input name="bot-field" type="text"></label>
        </p>

        <slot />

        <BoardContactFields :note-placeholder="notePlaceholder" :reset-on="status.success" />

        <div class="submission-page__submit">
          <button class="button button--primary submission-page__submit-button" :disabled="status.pending" type="submit">
            {{ status.pending ? pendingLabel : submitLabel }}
          </button>
          <p v-if="draftSaved || draftRestored" class="submission-page__draft">
            {{ draftRestored ? 'Draft restored from this browser.' : 'Draft saved in this browser.' }}
            <button class="button button--quiet button--small" type="button" @click="clearDraftAndResetForm">
              Clear draft
            </button>
          </p>
        </div>
      </form>

      <aside class="submission-page__rail" aria-labelledby="submission-activity-heading">
        <div class="submission-page__activity">
          <h2 id="submission-activity-heading">
            {{ categoryCopy.label }}
          </h2>

          <p v-if="activityError" class="submission-page__rail-note submission-page__rail-note--error" role="status">
            {{ activityError.message }}
          </p>
          <p v-else-if="!activityLoaded" class="submission-page__rail-note" role="status">
            {{ activityPending ? 'Loading recent posts...' : '' }}
          </p>
          <p v-else-if="!recentItems.length" class="submission-page__rail-note">
            {{ categoryCopy.empty }}
          </p>
          <ul v-else class="submission-page__recent">
            <li v-for="recent in recentItems" :key="recent.id">
              <NuxtLink :to="getBoardDetailPath(recent.id)" prefetch-on="interaction">
                {{ recent.title }}
              </NuxtLink>
              <span>
                {{ formatRelativeTime(recent.createdAt) }} · {{ formatReplyCount(recent.interactionCount) }}
              </span>
            </li>
          </ul>

          <p v-if="activityLoaded && activitySummary.total" class="submission-page__rail-note">
            {{ activitySummary.open }} open · {{ activitySummary.needsFirstReply }} without replies
          </p>
          <NuxtLink
            v-if="activityLoaded && activitySummary.total"
            class="submission-page__all"
            prefetch-on="interaction"
            :to="boardFilterPath"
          >
            See all on the board
            <span aria-hidden="true" class="i-carbon-arrow-right" />
          </NuxtLink>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.submission-page {
  padding-bottom: 1rem;
}

.submission-page__header h1 {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.submission-page__icon {
  flex: none;
  display: inline-grid;
  place-items: center;
  width: 2.75rem;
  height: 2.75rem;
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--kind) 14%, transparent);
  color: var(--kind);
  font-size: 1.35rem;
}

.submission-page__layout {
  display: grid;
  grid-template-columns: minmax(0, 46rem) minmax(16rem, 22rem);
  justify-content: space-between;
  gap: 1.5rem clamp(1.5rem, 4vw, 3.5rem);
  align-items: start;
}

.submission-page__form {
  display: grid;
  gap: 1.5rem;
  min-width: 0;
  padding: clamp(1.1rem, 3vw, 2rem);
}

.submission-page__result {
  display: flex;
  gap: 0.75rem;
  align-items: flex-start;
}

.submission-page__result-icon {
  flex: none;
  margin-top: 0.2rem;
  font-size: 1.25rem;
}

.submission-page__result-link {
  display: inline-block;
  margin-top: 0.35rem;
  color: inherit;
  font-weight: 700;
}

.submission-page__submit {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem 1rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--divider);
}

.submission-page__submit-button {
  min-height: 3rem;
  padding-inline: 1.5rem;
  font-size: var(--text-md);
}

.submission-page__draft {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem;
  color: var(--site-subtle);
  font-size: var(--text-sm);
}

.submission-page__rail {
  position: sticky;
  top: 5.5rem;
  min-width: 0;
}

.submission-page__activity {
  display: grid;
  gap: 0.85rem;
  padding: 1.25rem;
  border: 1px solid var(--card-border);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--site-surface-soft) 80%, transparent);
}

.submission-page__activity h2 {
  font-size: var(--text-md);
  font-weight: 700;
}

.submission-page__recent {
  display: grid;
  gap: 0.75rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.submission-page__recent li {
  display: grid;
  gap: 0.1rem;
}

.submission-page__recent a {
  color: var(--site-heading);
  font-weight: 600;
  overflow-wrap: anywhere;
}

.submission-page__recent span,
.submission-page__rail-note {
  color: var(--site-subtle);
  font-size: var(--text-sm);
}

.submission-page__rail-note:empty {
  display: none;
}

.submission-page__rail-note--error {
  color: var(--site-error-text);
}

.submission-page__all {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  width: fit-content;
  font-size: var(--text-sm);
  font-weight: 700;
}

@media (max-width: 960px) {
  .submission-page__layout {
    grid-template-columns: minmax(0, 46rem);
  }

  .submission-page__rail {
    position: static;
  }
}

@media (max-width: 640px) {
  .submission-page__submit-button {
    width: 100%;
  }
}
</style>
