<script setup lang="ts">
import type {
  FormErrorState,
  FormStatus,
} from '~/composables/useBoardSubmission'

const props = defineProps<{
  description: string
  draftKey?: string
  eyebrow: string
  examples: string[]
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
const draftSaved = ref(false)
const draftRestored = ref(false)

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

onMounted(async () => {
  await nextTick()

  if (!formElement.value)
    return

  const savedDraft = readStoredDraft()

  if (savedDraft && Object.keys(savedDraft).length) {
    restoreDraftIntoForm(formElement.value, savedDraft)
    draftSaved.value = true
    draftRestored.value = true
  }
})

watch(
  () => props.status.success,
  (nextSuccess, previousSuccess) => {
    if (!nextSuccess || previousSuccess)
      return

    clearStoredDraft()
    draftSaved.value = false
    draftRestored.value = false
  },
)
</script>

<template>
  <div class="submission-page">
    <section class="submission-page__hero">
      <NuxtLink
        class="submission-page__back"
        prefetch-on="interaction"
        to="/#live-board"
      >
        Back to live board
      </NuxtLink>

      <p class="eyebrow">
        {{ eyebrow }}
      </p>
      <h1>{{ title }}</h1>
      <p class="submission-page__lede">
        {{ description }}
      </p>
    </section>

    <section class="submission-page__panel">
      <div class="submission-page__tips">
        <p class="eyebrow">
          Quick checklist
        </p>
        <ul class="submission-page__examples">
          <li v-for="example in examples" :key="example">
            {{ example }}
          </li>
        </ul>
      </div>

      <form
        ref="formElement"
        class="submission-page__form"
        :aria-busy="status.pending"
        @change="persistDraft"
        @input="persistDraft"
        @submit.prevent="emit('submit', $event)"
      >
        <div
          v-if="draftSaved || draftRestored"
          class="submission-page__draft"
        >
          <p>
            {{
              draftRestored
                ? 'Saved draft restored in this browser.'
                : 'Draft saves automatically in this browser.'
            }}
          </p>
          <button
            class="submission-page__draft-clear"
            type="button"
            @click="clearDraftAndResetForm"
          >
            Clear draft
          </button>
        </div>

        <p v-if="status.success" class="success-note" role="status">
          {{ successText }}
        </p>
        <div v-if="status.error" class="error-panel" role="alert">
          <p class="error-note">
            {{ status.error.message }}
          </p>
          <p class="error-note-detail">
            {{ status.error.detail }}
          </p>
        </div>
        <div v-if="securityError" class="error-panel" role="alert">
          <p class="error-note">
            {{ securityError.message }}
          </p>
          <p class="error-note-detail">
            {{ securityError.detail }}
          </p>
        </div>

        <p class="sr-only">
          <label>Do not fill this field if you are human.
            <input name="bot-field" type="text"></label>
        </p>

        <div class="field-grid">
          <slot />
        </div>

        <button class="submit-button" :disabled="status.pending" type="submit">
          {{ status.pending ? pendingLabel : submitLabel }}
        </button>
      </form>
    </section>
  </div>
</template>

<style scoped>
.submission-page {
  display: grid;
  gap: 1.5rem;
  padding-top: 0;
  padding-right: var(--page-inline-end);
  padding-bottom: 2.75rem;
  padding-left: var(--page-inline-start);
}

.submission-page__hero {
  display: grid;
  gap: 0.9rem;
  min-width: 0;
  max-width: 56rem;
  padding-block: var(--page-hero-space);
}

.submission-page__back {
  width: fit-content;
  text-decoration: none;
  color: var(--site-link);
  font-weight: 700;
}

.submission-page__back:hover,
.submission-page__back:focus-visible {
  text-decoration: underline;
  text-underline-offset: 0.2em;
}

.eyebrow {
  margin: 0;
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--site-muted);
}

.submission-page h1,
.submission-page h2 {
  margin: 0;
  font-family: 'DM Serif Display', serif;
  font-weight: 400;
  letter-spacing: -0.03em;
  color: var(--site-heading);
}

.submission-page h1 {
  font-size: clamp(2.35rem, 4.6vw, 4rem);
  line-height: 0.92;
  max-width: 15ch;
  overflow-wrap: anywhere;
  text-wrap: balance;
}

.submission-page__lede,
.submission-page__tips,
.submission-page__examples {
  color: var(--site-text);
  line-height: 1.7;
}

.submission-page__lede {
  max-width: 42rem;
  margin: 0;
  font-size: 1.02rem;
}

.submission-page__panel {
  display: grid;
  gap: 0.95rem;
  align-items: start;
  max-width: 48rem;
}

.submission-page__tips,
.submission-page__form {
  min-width: 0;
  padding: 1.2rem 1.3rem;
  border-radius: 1.35rem;
  background: var(--site-surface);
  border: 1px solid var(--site-border);
  box-shadow: var(--site-shadow);
}

.submission-page__tips {
  display: grid;
  gap: 0.7rem;
}

.submission-page__examples {
  margin: 0;
  padding-left: 1.15rem;
}

.submission-page__form {
  display: grid;
  gap: 1rem;
}

.submission-page__draft {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.85rem 1rem;
  border-radius: 1rem;
  background: var(--site-surface-soft);
  border: 1px solid var(--site-border);
  color: var(--site-subtle);
}

.submission-page__draft p {
  margin: 0;
}

.submission-page__draft-clear {
  padding: 0;
  border: 0;
  background: none;
  color: var(--site-link);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.submission-page__draft-clear:hover,
.submission-page__draft-clear:focus-visible {
  text-decoration: underline;
  text-underline-offset: 0.2em;
}

:deep(.field-grid) {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.95rem;
}

:deep(.field) {
  display: grid;
  gap: 0.45rem;
}

:deep(.field--wide) {
  grid-column: 1 / -1;
}

:deep(.field span) {
  font-size: 0.88rem;
  font-weight: 700;
  color: var(--site-text);
}

:deep(.field input),
:deep(.field textarea),
:deep(.field select) {
  width: 100%;
  border: 1px solid var(--site-border-strong);
  border-radius: 1rem;
  background: var(--site-input-bg);
  color: var(--site-input-text);
  padding: 0.92rem 1rem;
  font: inherit;
  transition:
    border-color 180ms ease,
    box-shadow 180ms ease,
    background-color 180ms ease;
}

:deep(.field textarea) {
  resize: vertical;
  min-height: 8rem;
}

:deep(.field input:focus-visible),
:deep(.field textarea:focus-visible),
:deep(.field select:focus-visible) {
  outline: none;
  border-color: var(--site-focus);
  box-shadow: 0 0 0 4px var(--site-focus-ring);
  background: var(--site-elevated-strong);
}

.submit-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 3.1rem;
  width: fit-content;
  padding: 0.88rem 1.2rem;
  border: 0;
  border-radius: 999px;
  background: var(--site-button-bg);
  color: var(--site-button-text);
  font-size: 0.96rem;
  font-weight: 700;
  touch-action: manipulation;
  box-shadow: 0 16px 30px var(--site-focus-ring);
  transition:
    transform 180ms ease,
    box-shadow 180ms ease,
    background-color 180ms ease,
    color 180ms ease;
}

.submit-button:hover,
.submit-button:focus-visible {
  transform: translateY(-1px);
  background: var(--site-button-bg-hover);
}

.submit-button:disabled {
  opacity: 0.68;
  cursor: wait;
  transform: none;
}

.success-note,
.error-panel {
  margin: 0;
  padding: 0.9rem 1rem;
  border-radius: 1rem;
  line-height: 1.55;
}

.success-note {
  background: var(--site-success-bg);
  color: var(--site-success-text);
}

.error-panel {
  background: var(--site-error-bg);
  color: var(--site-error-text);
}

.error-note,
.error-note-detail {
  margin: 0;
}

.error-note-detail {
  margin-top: 0.35rem;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 760px) {
  .submission-page__tips,
  .submission-page__form {
    padding: 1.2rem;
  }

  .submission-page__draft {
    align-items: flex-start;
  }

  :deep(.field-grid) {
    grid-template-columns: 1fr;
  }

  .submit-button {
    width: 100%;
  }
}
</style>
