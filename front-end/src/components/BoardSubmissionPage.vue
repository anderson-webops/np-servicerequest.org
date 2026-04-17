<script setup lang="ts">
import type { FormErrorState, FormStatus } from '~/composables/useBoardSubmission'

defineProps<{
  description: string
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
</script>

<template>
  <div class="submission-page">
    <section class="submission-page__hero">
      <NuxtLink class="submission-page__back" to="/#live-board">
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
      <div class="submission-page__copy">
        <p class="eyebrow">
          Before you post
        </p>
        <h2>
          Keep the request specific enough for another person to respond quickly.
        </h2>

        <ul class="submission-page__examples">
          <li v-for="example in examples" :key="example">
            {{ example }}
          </li>
        </ul>

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
      </div>

      <form
        class="submission-page__form"
        :aria-busy="status.pending"
        @submit.prevent="emit('submit', $event)"
      >
        <p class="sr-only">
          <label>Do not fill this field if you are human. <input name="bot-field" type="text"></label>
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
  padding: 2rem 5vw 2.75rem;
}

.submission-page__hero {
  display: grid;
  gap: 0.9rem;
  max-width: 42rem;
}

.submission-page__back {
  width: fit-content;
  text-decoration: none;
  color: #294635;
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
  color: #6d7267;
}

.submission-page h1,
.submission-page h2 {
  margin: 0;
  font-family: 'DM Serif Display', serif;
  font-weight: 400;
  letter-spacing: -0.03em;
  color: #162219;
}

.submission-page h1 {
  font-size: clamp(2.8rem, 6vw, 4.9rem);
  line-height: 0.95;
  max-width: 12ch;
}

.submission-page h2 {
  font-size: clamp(1.8rem, 4vw, 2.6rem);
  line-height: 1;
}

.submission-page__lede,
.submission-page__copy,
.submission-page__examples {
  color: #33433a;
  line-height: 1.7;
}

.submission-page__lede {
  max-width: 34rem;
  margin: 0;
  font-size: 1.06rem;
}

.submission-page__panel {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  gap: 1.2rem;
  align-items: start;
}

.submission-page__copy,
.submission-page__form {
  padding: 1.5rem;
  border-radius: 1.65rem;
  background: rgba(255, 250, 243, 0.84);
  border: 1px solid rgba(40, 58, 45, 0.08);
  box-shadow: 0 24px 50px rgba(52, 66, 56, 0.08);
}

.submission-page__copy {
  display: grid;
  gap: 1rem;
}

.submission-page__examples {
  margin: 0;
  padding-left: 1.15rem;
}

.submission-page__form {
  display: grid;
  gap: 1rem;
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
  color: #2b382f;
}

:deep(.field input),
:deep(.field textarea),
:deep(.field select) {
  width: 100%;
  border: 1px solid rgba(40, 58, 45, 0.12);
  border-radius: 1rem;
  background: rgba(255, 255, 255, 0.88);
  color: #1c2a21;
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
  border-color: rgba(41, 70, 53, 0.32);
  box-shadow: 0 0 0 4px rgba(41, 70, 53, 0.1);
  background: #fff;
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
  background: #294635;
  color: #f8f5ee;
  font-size: 0.96rem;
  font-weight: 700;
  box-shadow: 0 16px 30px rgba(41, 70, 53, 0.18);
  transition:
    transform 180ms ease,
    box-shadow 180ms ease,
    background-color 180ms ease,
    color 180ms ease;
}

.submit-button:hover,
.submit-button:focus-visible {
  transform: translateY(-1px);
  background: #1d3528;
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
  background: rgba(92, 148, 103, 0.12);
  color: #24402e;
}

.error-panel {
  background: rgba(148, 91, 82, 0.12);
  color: #6a2d23;
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

@media (max-width: 980px) {
  .submission-page__panel {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .submission-page {
    padding-inline: 1.25rem;
  }

  .submission-page__copy,
  .submission-page__form {
    padding: 1.2rem;
  }

  :deep(.field-grid) {
    grid-template-columns: 1fr;
  }

  .submit-button {
    width: 100%;
  }
}
</style>
