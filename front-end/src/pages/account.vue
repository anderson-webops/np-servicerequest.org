<script setup lang="ts">
import type { AntiBotChallenge, AuthResponse, BoardBootstrapResponse, ViewerAccount } from '~/utils/board'

import { isAntiBotChallenge, isAntiBotChallengeExpired, markAntiBotChallengeObserved, waitForAntiBotChallengeMinimumAge } from '~/utils/antiBot'
import { getBoardEndpoint } from '~/utils/board'

type AuthTab = 'login' | 'register'

interface FormErrorState {
  detail: string
  message: string
}

function isViewerAccount(value: unknown): value is ViewerAccount {
  return Boolean(
    value
    && typeof value === 'object'
    && 'id' in value
    && typeof value.id === 'string'
    && 'displayName' in value
    && typeof value.displayName === 'string'
    && 'email' in value
    && typeof value.email === 'string'
    && 'isAdmin' in value
    && typeof value.isAdmin === 'boolean',
  )
}

definePageMeta({
  layout: 'home',
})

useSeoMeta({
  title: 'Optional account',
  description: 'Create or sign in to an optional account for repeat participation on the live community board.',
})

const runtimeConfig = useRuntimeConfig()

const hasHydrated = ref(false)
const antiBotChallenge = ref<AntiBotChallenge | null>(null)
const viewer = ref<ViewerAccount | null>(null)
const bootstrapLoaded = ref(false)
const securityError = ref<FormErrorState | null>(null)
const authNotice = ref('')
const authError = ref<FormErrorState | null>(null)
const authPending = ref(false)
const logoutPending = ref(false)
const authTab = ref<AuthTab>('register')

const registerForm = reactive({
  'bot-field': '',
  'displayName': '',
  'email': '',
  'password': '',
})

const loginForm = reactive({
  'bot-field': '',
  'email': '',
  'password': '',
})

const accountUiReady = computed(() => hasHydrated.value && bootstrapLoaded.value)

function applyServerContext(payload: unknown) {
  if (!payload || typeof payload !== 'object')
    return

  const record = payload as Record<string, unknown>

  if (isAntiBotChallenge(record.antiBot))
    antiBotChallenge.value = markAntiBotChallengeObserved(record.antiBot)

  if (record.viewer === null)
    viewer.value = null
  else if (isViewerAccount(record.viewer))
    viewer.value = record.viewer
}

function getApiErrorState(error: unknown, endpoint: string, fallbackMessage: string): FormErrorState {
  const fallbackDetail = `Request URL: ${endpoint}. Please try again in a moment.`
  let statusCode: number | null = null
  let serverMessage = ''

  if (error && typeof error === 'object') {
    if ('status' in error && typeof error.status === 'number')
      statusCode = error.status

    if ('data' in error) {
      const data = (error as { data?: unknown }).data
      applyServerContext(data)

      if (data && typeof data === 'object' && 'message' in data && typeof data.message === 'string')
        serverMessage = data.message
    }
  }

  if (statusCode === 404) {
    return {
      message: serverMessage || 'The server did not recognize this URL.',
      detail: `Request URL: ${endpoint}. A stale cached client can cause this after deployment, so try a hard refresh and then retry.`,
    }
  }

  if (statusCode === 429) {
    return {
      message: serverMessage || 'Too many requests arrived from this browser.',
      detail: 'The board is rate-limiting repeat actions for bot protection. Wait a moment, then try again.',
    }
  }

  if (statusCode != null) {
    return {
      message: serverMessage || fallbackMessage,
      detail: `Request URL: ${endpoint}.`,
    }
  }

  return {
    message: serverMessage || fallbackMessage,
    detail: serverMessage ? `Request URL: ${endpoint}.` : fallbackDetail,
  }
}

async function loadBootstrap() {
  const endpoint = getBoardEndpoint(runtimeConfig.public.apiBaseUrl, 'bootstrap')

  try {
    const response = await $fetch<BoardBootstrapResponse>(endpoint, {
      credentials: 'include',
    })

    applyServerContext(response)
    securityError.value = null
  }
  catch (error) {
    securityError.value = getApiErrorState(error, endpoint, 'Unable to initialize board security right now.')
  }
  finally {
    bootstrapLoaded.value = true
  }
}

async function ensureAntiBotReady() {
  if (!antiBotChallenge.value || isAntiBotChallengeExpired(antiBotChallenge.value))
    await loadBootstrap()

  if (!antiBotChallenge.value)
    throw new Error('Missing anti-bot challenge.')

  await waitForAntiBotChallengeMinimumAge(antiBotChallenge.value)
}

async function protectedPost<T>(endpoint: string, body: Record<string, string>) {
  await ensureAntiBotReady()

  return $fetch<T>(endpoint, {
    body: {
      ...body,
      challengeIssuedAt: String(antiBotChallenge.value?.issuedAt || ''),
      challengeToken: antiBotChallenge.value?.token || '',
    },
    credentials: 'include',
    method: 'POST',
  })
}

async function registerAccount() {
  const endpoint = getBoardEndpoint(runtimeConfig.public.apiBaseUrl, 'account/register')
  authPending.value = true
  authError.value = null
  authNotice.value = ''

  try {
    const response = await protectedPost<AuthResponse>(endpoint, registerForm)
    applyServerContext(response)

    registerForm.password = ''
    authNotice.value = 'Account ready. You can still keep using the board without one, but replies now have a consistent identity.'
  }
  catch (error) {
    authError.value = getApiErrorState(error, endpoint, 'We could not create an account right now.')
  }
  finally {
    authPending.value = false
  }
}

async function loginAccount() {
  const endpoint = getBoardEndpoint(runtimeConfig.public.apiBaseUrl, 'account/login')
  authPending.value = true
  authError.value = null
  authNotice.value = ''

  try {
    const response = await protectedPost<AuthResponse>(endpoint, loginForm)
    applyServerContext(response)

    loginForm.password = ''
    authNotice.value = 'Signed in. Anonymous posting still stays open for everyone else.'
  }
  catch (error) {
    authError.value = getApiErrorState(error, endpoint, 'We could not sign you in right now.')
  }
  finally {
    authPending.value = false
  }
}

async function logoutAccount() {
  const endpoint = getBoardEndpoint(runtimeConfig.public.apiBaseUrl, 'account/logout')
  logoutPending.value = true
  authError.value = null
  authNotice.value = ''

  try {
    const response = await $fetch<{ antiBot?: AntiBotChallenge, ok: boolean }>(endpoint, {
      credentials: 'include',
      method: 'POST',
    })

    applyServerContext(response)
    viewer.value = null
    authNotice.value = 'Signed out. The board still works without an account.'
  }
  catch (error) {
    authError.value = getApiErrorState(error, endpoint, 'We could not sign you out right now.')
  }
  finally {
    logoutPending.value = false
  }
}

onMounted(() => {
  hasHydrated.value = true
  void loadBootstrap()
})
</script>

<template>
  <div class="account-page">
    <section class="account-page__hero">
      <NuxtLink class="account-page__back" prefetch-on="interaction" to="/#live-board">
        Back to live board
      </NuxtLink>

      <p class="eyebrow">
        Account optional
      </p>
      <h1>
        Keep the board open to everyone, then add an account only if it helps.
      </h1>
      <p class="account-page__lede">
        Anonymous replies and submissions are fully allowed. A board account just gives repeat participants a stable identity and quicker follow-up.
      </p>
    </section>

    <section class="account-page__panel">
      <div class="account-page__copy">
        <ul class="account-panel__benefits">
          <li>Anonymous use stays open by default.</li>
          <li>Account-backed posts show a stronger identity marker.</li>
          <li>Logged-in replies can reuse the email already on the account.</li>
        </ul>

        <p class="account-panel__privacy">
          Contact details are intentionally hidden from the page markup and only revealed through a separate, rate-limited action.
        </p>
      </div>

      <div class="account-panel">
        <p v-if="!accountUiReady" class="account-panel__note" role="status">
          Account tools load after the page initializes.
        </p>
        <p v-else-if="securityError" class="account-panel__note account-panel__note--warning" role="alert">
          {{ securityError.message }} {{ securityError.detail }}
        </p>
        <p v-if="authNotice" class="account-panel__note account-panel__note--success" role="status">
          {{ authNotice }}
        </p>
        <p v-if="authError" class="account-panel__note account-panel__note--warning" role="alert">
          {{ authError.message }} {{ authError.detail }}
        </p>

        <div v-if="accountUiReady && viewer" class="account-panel__signed-in">
          <div>
            <p class="account-panel__label">
              Signed in as
            </p>
            <strong>{{ viewer.displayName }}</strong>
            <small>{{ viewer.email }}</small>
            <small v-if="viewer.isAdmin" class="account-panel__admin">
              Admin tools active
            </small>
          </div>

          <button class="secondary-button" :disabled="logoutPending" type="button" @click="logoutAccount">
            {{ logoutPending ? 'Signing out...' : 'Sign out' }}
          </button>
        </div>

        <template v-else-if="accountUiReady">
          <div class="account-tabs">
            <button
              class="account-tabs__button" :class="[{ 'account-tabs__button--active': authTab === 'register' }]"
              type="button"
              @click="authTab = 'register'"
            >
              Create account
            </button>
            <button
              class="account-tabs__button" :class="[{ 'account-tabs__button--active': authTab === 'login' }]"
              type="button"
              @click="authTab = 'login'"
            >
              Sign in
            </button>
          </div>

          <form v-if="authTab === 'register'" class="account-form" @submit.prevent="registerAccount">
            <p class="sr-only">
              <label>Do not fill this field if you are human. <input v-model="registerForm['bot-field']" name="bot-field" type="text"></label>
            </p>

            <label class="field">
              <span>Display name</span>
              <input v-model="registerForm.displayName" autocomplete="name" placeholder="Jane Smith" required type="text">
            </label>

            <label class="field">
              <span>Email</span>
              <input v-model="registerForm.email" autocomplete="email" placeholder="jane@email.com" required type="email">
            </label>

            <label class="field">
              <span>Password</span>
              <input v-model="registerForm.password" autocomplete="new-password" minlength="10" required type="password">
            </label>

            <button class="submit-button" :disabled="authPending" type="submit">
              {{ authPending ? 'Creating account...' : 'Create optional account' }}
            </button>
          </form>

          <form v-else class="account-form" @submit.prevent="loginAccount">
            <p class="sr-only">
              <label>Do not fill this field if you are human. <input v-model="loginForm['bot-field']" name="bot-field" type="text"></label>
            </p>

            <label class="field">
              <span>Email</span>
              <input v-model="loginForm.email" autocomplete="email" placeholder="jane@email.com" required type="email">
            </label>

            <label class="field">
              <span>Password</span>
              <input v-model="loginForm.password" autocomplete="current-password" minlength="10" required type="password">
            </label>

            <button class="submit-button" :disabled="authPending" type="submit">
              {{ authPending ? 'Signing in...' : 'Sign in' }}
            </button>
          </form>
        </template>
      </div>
    </section>
  </div>
</template>

<style scoped>
.account-page {
  display: grid;
  gap: 1.5rem;
  padding-top: 0;
  padding-right: var(--page-inline-end);
  padding-bottom: 2.75rem;
  padding-left: var(--page-inline-start);
}

.account-page__hero {
  display: grid;
  gap: 0.9rem;
  min-width: 0;
  max-width: 56rem;
  padding-block: var(--page-hero-space);
}

.account-page__back {
  width: fit-content;
  text-decoration: none;
  color: var(--site-link);
  font-weight: 700;
}

.account-page__back:hover,
.account-page__back:focus-visible {
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

.account-page h1,
.account-panel h2 {
  margin: 0;
  font-family: 'DM Serif Display', serif;
  font-weight: 400;
  letter-spacing: -0.03em;
  color: var(--site-heading);
}

.account-page h1 {
  font-size: clamp(2.35rem, 4.6vw, 4rem);
  line-height: 0.92;
  max-width: 15ch;
  overflow-wrap: anywhere;
  text-wrap: balance;
}

.account-page__lede,
.account-page__copy,
.account-panel__benefits {
  color: var(--site-text);
  line-height: 1.7;
}

.account-page__lede {
  max-width: 42rem;
  margin: 0;
  font-size: 1.02rem;
}

.account-page__panel {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  gap: 1.2rem;
  align-items: start;
}

.account-page__copy,
.account-panel {
  min-width: 0;
  padding: 1.5rem;
  border-radius: 1.65rem;
  background: var(--site-surface);
  border: 1px solid var(--site-border);
  box-shadow: var(--site-shadow);
}

.account-page__copy {
  display: grid;
  gap: 1rem;
}

.account-panel {
  display: grid;
  gap: 1rem;
}

.account-tabs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.6rem;
}

.account-tabs__button,
.submit-button,
.secondary-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 3.1rem;
  padding: 0.88rem 1.2rem;
  border: 0;
  border-radius: 999px;
  text-decoration: none;
  font-size: 0.96rem;
  font-weight: 700;
  transition:
    transform 180ms ease,
    box-shadow 180ms ease,
    background-color 180ms ease,
    color 180ms ease,
    border-color 180ms ease;
}

.account-tabs__button {
  background: var(--site-elevated);
  color: var(--site-text-strong);
  border: 1px solid var(--site-border);
  touch-action: manipulation;
}

.account-tabs__button:hover,
.account-tabs__button:focus-visible {
  transform: translateY(-1px);
  border-color: var(--site-accent-soft-strong);
  background: var(--site-elevated-strong);
}

.account-tabs__button--active,
.submit-button {
  background: var(--site-button-bg);
  color: var(--site-button-text);
  box-shadow: 0 16px 30px var(--site-focus-ring);
}

.submit-button:hover,
.submit-button:focus-visible {
  transform: translateY(-1px);
  background: var(--site-button-bg-hover);
}

.secondary-button {
  background: var(--site-elevated);
  color: var(--site-heading);
  border: 1px solid var(--site-border-strong);
}

.secondary-button:hover,
.secondary-button:focus-visible {
  transform: translateY(-1px);
  background: var(--site-elevated-strong);
}

.submit-button:disabled,
.secondary-button:disabled,
.account-tabs__button:disabled {
  opacity: 0.68;
  cursor: wait;
  transform: none;
}

.account-form {
  display: grid;
  gap: 0.85rem;
}

.field {
  display: grid;
  gap: 0.45rem;
}

.field span {
  font-size: 0.88rem;
  font-weight: 700;
  color: var(--site-text);
}

.field input {
  width: 100%;
  border: 1px solid var(--site-border-strong);
  border-radius: 1rem;
  background: var(--site-input-bg);
  color: var(--site-input-text);
  padding: 0.95rem 1rem;
  font: inherit;
}

.field input:focus-visible {
  outline: 2px solid transparent;
  border-color: var(--site-link);
  box-shadow: 0 0 0 3px var(--site-focus-ring);
}

.account-panel__benefits {
  margin: 0;
  padding-left: 1.2rem;
}

.account-panel__signed-in {
  padding: 1rem;
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: center;
  border-radius: 1.2rem;
  background: var(--site-elevated);
}

.account-panel__label {
  margin: 0 0 0.2rem;
  font-size: 0.74rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--site-muted);
}

.account-panel__signed-in strong,
.account-panel__signed-in small {
  display: block;
  overflow-wrap: anywhere;
}

.account-panel__signed-in small {
  margin-top: 0.2rem;
  color: var(--site-subtle);
}

.account-panel__admin {
  color: var(--site-link);
  font-weight: 700;
}

.account-panel__privacy {
  margin: 0;
  font-size: 0.94rem;
  color: var(--site-subtle);
}

.account-panel__note {
  margin: 0;
  padding: 0.9rem 1rem;
  border-radius: 1rem;
  line-height: 1.55;
  background: var(--site-surface-soft);
  color: var(--site-subtle);
}

.account-panel__note--success {
  background: var(--site-success-bg);
  color: var(--site-success-text);
}

.account-panel__note--warning {
  background: var(--site-error-bg);
  color: var(--site-error-text);
}

@media (max-width: 1080px) {
  .account-page__panel {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .account-page h1 {
    max-width: 100%;
  }

  .account-page__copy,
  .account-panel {
    padding: 1.2rem;
  }

  .account-tabs {
    grid-template-columns: 1fr;
  }

  .submit-button,
  .secondary-button {
    width: 100%;
  }

  .account-panel__signed-in {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
