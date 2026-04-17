<script setup lang="ts">
import type {
  AntiBotChallenge,
  AuthResponse,
  BoardBootstrapResponse,
  BoardContactResponse,
  BoardInteractionResponse,
  BoardItem,
  BoardItemsResponse,
  ViewerAccount,
} from '~/utils/board'
import type { SubmissionKind } from '~/utils/submissions'
import { getBoardEndpoint } from '~/utils/board'
import { submissionKinds } from '~/utils/submissions'

type BoardFilter = 'all' | SubmissionKind
type AuthTab = 'login' | 'register'

interface FormErrorState {
  detail: string
  message: string
}

interface FormStatus {
  error: FormErrorState | null
  pending: boolean
  success: boolean
}

interface ReplyDraft {
  'bot-field': string
  'contact': string
  'message': string
  'name': string
}

definePageMeta({
  layout: 'home',
})

useSeoMeta({
  title: 'Live request board for service projects, borrowing, and lending',
  description: 'Post service projects, borrow requests, and lending offers on a live community board. Anonymous use is open, and optional accounts are available for repeat participants.',
})

const runtimeConfig = useRuntimeConfig()

const antiBotChallenge = ref<AntiBotChallenge | null>(null)
const viewer = ref<ViewerAccount | null>(null)
const boardItems = ref<BoardItem[]>([])
const boardPending = ref(false)
const boardLoaded = ref(false)
const boardError = ref<FormErrorState | null>(null)
const securityError = ref<FormErrorState | null>(null)
const boardFilter = ref<BoardFilter>('all')
const authTab = ref<AuthTab>('register')
const authNotice = ref('')
const authError = ref<FormErrorState | null>(null)
const authPending = ref(false)
const logoutPending = ref(false)
const openReplyItemId = ref<string | null>(null)

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

const replyDrafts = reactive<Record<string, ReplyDraft>>({})
const replyStatuses = reactive<Record<string, FormStatus>>({})
const revealItemContacts = reactive<Record<string, string>>({})
const revealInteractionContacts = reactive<Record<string, string>>({})
const revealErrors = reactive<Record<string, FormErrorState | null>>({})
const revealPending = reactive<Record<string, boolean>>({})

const processSteps = [
  {
    number: '01',
    title: 'Choose the dedicated page',
    description: 'Service projects, item requests, and lending offers each have their own page so posting stays focused and easier to scan.',
  },
  {
    number: '02',
    title: 'Reply in public or reveal contact on demand',
    description: 'Neighbors can respond on the thread immediately, or reveal a contact method only when they intentionally need it.',
  },
  {
    number: '03',
    title: 'Stay anonymous or create an account',
    description: 'Anonymous participation stays open, while optional accounts add an identity anchor for repeat contributors.',
  },
]

const boardGroups = [
  {
    title: 'Service projects',
    items: ['yard cleanup', 'small repairs', 'moving help', 'accessibility upgrades', 'setup or teardown'],
  },
  {
    title: 'Borrow requests',
    items: ['axes and hand tools', 'kitchen utensils', 'books', 'ladders', 'seasonal gear'],
  },
  {
    title: 'Items to lend',
    items: ['power tools', 'cookware', 'study materials', 'gardening supplies', 'one-off specialty items'],
  },
]

const boardFilters = [
  { key: 'all' as const, label: 'All posts' },
  { key: submissionKinds.service, label: 'Service projects' },
  { key: submissionKinds.itemRequest, label: 'Borrow requests' },
  { key: submissionKinds.itemLending, label: 'Items to lend' },
]

const filteredBoardItems = computed(() => {
  if (boardFilter.value === 'all')
    return boardItems.value

  return boardItems.value.filter(item => item.kind === boardFilter.value)
})

const boardCounts = computed(() => ({
  all: boardItems.value.length,
  [submissionKinds.service]: boardItems.value.filter(item => item.kind === submissionKinds.service).length,
  [submissionKinds.itemRequest]: boardItems.value.filter(item => item.kind === submissionKinds.itemRequest).length,
  [submissionKinds.itemLending]: boardItems.value.filter(item => item.kind === submissionKinds.itemLending).length,
}))

function isAntiBotChallenge(value: unknown): value is AntiBotChallenge {
  return Boolean(
    value
    && typeof value === 'object'
    && 'action' in value
    && typeof value.action === 'string'
    && 'issuedAt' in value
    && typeof value.issuedAt === 'number'
    && 'token' in value
    && typeof value.token === 'string',
  )
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
    && typeof value.email === 'string',
  )
}

function applyServerContext(payload: unknown) {
  if (!payload || typeof payload !== 'object')
    return

  const record = payload as Record<string, unknown>

  if (isAntiBotChallenge(record.antiBot))
    antiBotChallenge.value = record.antiBot

  if (record.viewer === null)
    viewer.value = null
  else if (isViewerAccount(record.viewer))
    viewer.value = record.viewer
}

function formatBoardDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function sortBoardItems(items: BoardItem[]) {
  return [...items].sort((left, right) => Date.parse(right.lastActivityAt) - Date.parse(left.lastActivityAt))
}

function appendInteraction(itemId: string, interaction: BoardInteractionResponse['interaction']) {
  boardItems.value = sortBoardItems(boardItems.value.map((item) => {
    if (item.id !== itemId)
      return item

    return {
      ...item,
      interactionCount: item.interactionCount + 1,
      interactions: [interaction, ...item.interactions],
      lastActivityAt: interaction.createdAt,
    }
  }))
}

function getReplyDraft(itemId: string) {
  if (!replyDrafts[itemId]) {
    replyDrafts[itemId] = {
      'bot-field': '',
      'contact': viewer.value?.email || '',
      'message': '',
      'name': viewer.value?.displayName || '',
    }
  }

  if (viewer.value) {
    if (!replyDrafts[itemId].name)
      replyDrafts[itemId].name = viewer.value.displayName

    if (!replyDrafts[itemId].contact)
      replyDrafts[itemId].contact = viewer.value.email
  }

  return replyDrafts[itemId]
}

function getReplyStatus(itemId: string) {
  if (!replyStatuses[itemId]) {
    replyStatuses[itemId] = {
      error: null,
      pending: false,
      success: false,
    }
  }

  return replyStatuses[itemId]
}

function getRevealKey(itemId: string, interactionId?: string) {
  return interactionId ? `${itemId}:${interactionId}` : itemId
}

function ensureRevealState(key: string) {
  if (!(key in revealPending))
    revealPending[key] = false

  if (!(key in revealErrors))
    revealErrors[key] = null
}

function getReplyActionLabel(kind: SubmissionKind) {
  if (kind === submissionKinds.service)
    return 'Offer help'

  if (kind === submissionKinds.itemRequest)
    return 'I can lend this'

  return 'I am interested'
}

function getContactActionLabel(kind: SubmissionKind) {
  if (kind === submissionKinds.itemLending)
    return 'Reveal lender contact'

  return 'Reveal contact'
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
}

async function loadBoardItems() {
  const endpoint = getBoardEndpoint(runtimeConfig.public.apiBaseUrl, 'items')
  boardPending.value = true
  boardError.value = null

  try {
    const response = await $fetch<BoardItemsResponse>(endpoint, {
      credentials: 'include',
    })

    boardItems.value = sortBoardItems(response.items)
  }
  catch (error) {
    boardError.value = getApiErrorState(error, endpoint, 'Unable to load the live board right now.')
  }
  finally {
    boardPending.value = false
    boardLoaded.value = true
  }
}

async function ensureAntiBotReady() {
  if (!antiBotChallenge.value)
    await loadBootstrap()

  if (!antiBotChallenge.value)
    throw new Error('Missing anti-bot challenge.')
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

async function submitBoardReply(item: BoardItem) {
  const draft = getReplyDraft(item.id)
  const status = getReplyStatus(item.id)
  const endpoint = getBoardEndpoint(runtimeConfig.public.apiBaseUrl, `items/${item.id}/interactions`)
  status.pending = true
  status.success = false
  status.error = null

  try {
    const response = await protectedPost<BoardInteractionResponse>(endpoint, {
      ...draft,
      itemTitle: item.title,
    })

    applyServerContext(response)
    appendInteraction(item.id, response.interaction)
    draft.message = ''
    status.success = true
  }
  catch (error) {
    status.error = getApiErrorState(error, endpoint, 'We could not post that board response right now.')
  }
  finally {
    status.pending = false
  }
}

async function revealItemContact(item: BoardItem) {
  const key = getRevealKey(item.id)
  ensureRevealState(key)
  const endpoint = getBoardEndpoint(runtimeConfig.public.apiBaseUrl, `items/${item.id}/contact`)
  revealPending[key] = true
  revealErrors[key] = null

  try {
    const response = await protectedPost<BoardContactResponse>(endpoint, {
      'bot-field': '',
    })

    applyServerContext(response)
    revealItemContacts[item.id] = response.contact
  }
  catch (error) {
    revealErrors[key] = getApiErrorState(error, endpoint, 'We could not reveal that contact right now.')
  }
  finally {
    revealPending[key] = false
  }
}

async function revealInteractionContact(itemId: string, interactionId: string) {
  const key = getRevealKey(itemId, interactionId)
  ensureRevealState(key)
  const endpoint = getBoardEndpoint(runtimeConfig.public.apiBaseUrl, `items/${itemId}/interactions/${interactionId}/contact`)
  revealPending[key] = true
  revealErrors[key] = null

  try {
    const response = await protectedPost<BoardContactResponse>(endpoint, {
      'bot-field': '',
    })

    applyServerContext(response)
    revealInteractionContacts[key] = response.contact
  }
  catch (error) {
    revealErrors[key] = getApiErrorState(error, endpoint, 'We could not reveal that contact right now.')
  }
  finally {
    revealPending[key] = false
  }
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

function openReplyForm(itemId: string) {
  getReplyDraft(itemId)
  getReplyStatus(itemId)
  openReplyItemId.value = openReplyItemId.value === itemId ? null : itemId
}

watch(viewer, (nextViewer) => {
  if (!nextViewer)
    return

  for (const draft of Object.values(replyDrafts)) {
    if (!draft.name)
      draft.name = nextViewer.displayName

    if (!draft.contact)
      draft.contact = nextViewer.email
  }
})

onMounted(() => {
  void Promise.allSettled([
    loadBootstrap(),
    loadBoardItems(),
  ])
})
</script>

<template>
  <div class="home-page">
    <section class="hero">
      <div class="hero__inner">
        <div class="hero__copy">
          <p class="eyebrow">
            One shared place for community requests
          </p>
          <h1>
            A live request board for help, borrowing, and lending.
          </h1>
          <p class="hero__lede">
            Post service projects, ask to borrow something practical, or lend useful items to a neighbor. The board stays open to everyone, and optional accounts are available for repeat contributors.
          </p>

          <div class="hero__actions">
            <a href="#live-board">View the live board</a>
            <NuxtLink to="/service-request">
              Service project
            </NuxtLink>
            <NuxtLink to="/item-request">
              Borrow item
            </NuxtLink>
            <NuxtLink to="/item-lending">
              Lend item
            </NuxtLink>
          </div>

          <p class="hero__caption">
            Contact details stay hidden until someone intentionally reveals them, and rate limits plus honeypots help reduce bot traffic.
          </p>
        </div>

        <div aria-hidden="true" class="hero__poster">
          <div class="poster">
            <div class="poster__stamp">
              live board
            </div>
            <div class="poster__headline">
              <strong>{{ boardCounts.all }}</strong>
              <span>active community posts</span>
            </div>
            <div class="poster__lanes">
              <div>
                <small>service</small>
                <strong>{{ boardCounts[submissionKinds.service] }}</strong>
              </div>
              <div>
                <small>borrow</small>
                <strong>{{ boardCounts[submissionKinds.itemRequest] }}</strong>
              </div>
              <div>
                <small>lend</small>
                <strong>{{ boardCounts[submissionKinds.itemLending] }}</strong>
              </div>
            </div>
            <p class="poster__note">
              anonymous use stays open
            </p>
          </div>
        </div>
      </div>
    </section>

    <section id="live-board" class="live-board">
      <div class="live-board__heading">
        <div class="section-heading">
          <p class="eyebrow">
            Live board
          </p>
          <h2>
            Requests and offers now live in a board that anyone can browse and answer.
          </h2>
          <p class="section-copy">
            Post publicly, respond publicly, or reveal a contact method only when you need it. The email notification pipeline exists in the backend, but the board itself is the primary interaction surface.
          </p>
        </div>

        <div class="board-filter-strip" role="tablist" aria-label="Board filters">
          <button
            v-for="filter in boardFilters"
            :key="filter.key"
            :aria-selected="boardFilter === filter.key"
            class="board-filter" :class="[{ 'board-filter--active': boardFilter === filter.key }]"
            type="button"
            @click="boardFilter = filter.key"
          >
            <span>{{ filter.label }}</span>
            <strong>{{ boardCounts[filter.key] }}</strong>
          </button>
        </div>
      </div>

      <div class="live-board__layout">
        <aside id="account-hub" class="account-panel">
          <p class="eyebrow">
            Account optional
          </p>
          <h3>
            Keep the board open to everyone, then add an account only if it helps.
          </h3>
          <p>
            Anonymous replies and submissions are fully allowed. A board account just gives repeat participants a stable identity and quicker follow-up.
          </p>

          <ul class="account-panel__benefits">
            <li>Anonymous use stays open by default.</li>
            <li>Account-backed posts show a stronger identity marker.</li>
            <li>Logged-in replies can reuse the email already on the account.</li>
          </ul>

          <p v-if="securityError" class="account-panel__note account-panel__note--warning" role="alert">
            {{ securityError.message }} {{ securityError.detail }}
          </p>
          <p v-if="authNotice" class="account-panel__note account-panel__note--success" role="status">
            {{ authNotice }}
          </p>
          <p v-if="authError" class="account-panel__note account-panel__note--warning" role="alert">
            {{ authError.message }} {{ authError.detail }}
          </p>

          <div v-if="viewer" class="account-panel__signed-in">
            <div>
              <p class="account-panel__label">
                Signed in as
              </p>
              <strong>{{ viewer.displayName }}</strong>
              <small>{{ viewer.email }}</small>
            </div>

            <button class="secondary-button" :disabled="logoutPending" type="button" @click="logoutAccount">
              {{ logoutPending ? 'Signing out...' : 'Sign out' }}
            </button>
          </div>

          <template v-else>
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

              <button class="submit-button submit-button--slim" :disabled="authPending" type="submit">
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

              <button class="submit-button submit-button--slim" :disabled="authPending" type="submit">
                {{ authPending ? 'Signing in...' : 'Sign in' }}
              </button>
            </form>
          </template>

          <p class="account-panel__privacy">
            Contact details are intentionally hidden from the page markup and only revealed through a separate, rate-limited action.
          </p>
        </aside>

        <div class="board-feed">
          <div class="board-feed__meta">
            <p>
              {{ boardCounts.all }} live posts
            </p>
            <p>
              {{ viewer ? 'You can reply with your account or anonymously.' : 'You can reply anonymously right now, even without signing in.' }}
            </p>
          </div>

          <div v-if="boardPending && !boardLoaded" class="board-empty board-empty--loading">
            Loading the live board...
          </div>

          <div v-else-if="boardError" class="board-empty board-empty--error" role="alert">
            <p>{{ boardError.message }}</p>
            <p>{{ boardError.detail }}</p>
          </div>

          <div v-else-if="!filteredBoardItems.length" class="board-empty">
            <p>No posts match this filter yet.</p>
            <p>
              Create the first one from the dedicated
              <NuxtLink to="/service-request">
                service project
              </NuxtLink>,
              <NuxtLink to="/item-request">
                item request
              </NuxtLink>, or
              <NuxtLink to="/item-lending">
                item lending
              </NuxtLink>
              page.
            </p>
          </div>

          <div v-else class="board-feed__list">
            <article v-for="item in filteredBoardItems" :key="item.id" class="board-card">
              <header class="board-card__header">
                <div>
                  <p class="board-card__kind">
                    {{ item.kindLabel }}
                  </p>
                  <h3>{{ item.title }}</h3>
                </div>

                <div class="board-card__meta">
                  <span>{{ formatBoardDate(item.createdAt) }}</span>
                  <span>{{ item.interactionCount }} replies</span>
                </div>
              </header>

              <div class="board-card__author">
                <strong>{{ item.author.displayName }}</strong>
                <span v-if="item.author.hasAccount" class="board-card__badge">account-backed</span>
              </div>

              <p class="board-card__summary-label">
                {{ item.summaryLabel }}
              </p>
              <p class="board-card__summary">
                {{ item.summary }}
              </p>

              <dl v-if="item.attributes.length" class="board-card__attributes">
                <div v-for="attribute in item.attributes" :key="`${item.id}-${attribute.label}`">
                  <dt>{{ attribute.label }}</dt>
                  <dd>{{ attribute.value }}</dd>
                </div>
              </dl>

              <div class="board-card__actions">
                <button
                  class="secondary-button"
                  :disabled="revealPending[item.id]"
                  type="button"
                  @click="revealItemContact(item)"
                >
                  {{ revealPending[item.id] ? 'Revealing...' : getContactActionLabel(item.kind) }}
                </button>
                <button class="secondary-button secondary-button--dark" type="button" @click="openReplyForm(item.id)">
                  {{ openReplyItemId === item.id ? 'Hide reply form' : getReplyActionLabel(item.kind) }}
                </button>
              </div>

              <p class="board-card__contact-note">
                Contact details are hidden until you deliberately reveal them to reduce scraping.
              </p>

              <p v-if="revealErrors[item.id]" class="inline-note inline-note--error" role="alert">
                {{ revealErrors[item.id]?.message }} {{ revealErrors[item.id]?.detail }}
              </p>
              <p v-if="revealItemContacts[item.id]" class="inline-note inline-note--success" role="status">
                Contact: {{ revealItemContacts[item.id] }}
              </p>

              <div class="board-card__thread">
                <p class="board-card__thread-label">
                  Board responses
                </p>

                <div v-if="item.interactions.length" class="thread-list">
                  <article v-for="interaction in item.interactions" :key="interaction.id" class="thread-item">
                    <div class="thread-item__header">
                      <div>
                        <strong>{{ interaction.author.displayName }}</strong>
                        <span v-if="interaction.author.hasAccount" class="board-card__badge">account-backed</span>
                      </div>
                      <span>{{ formatBoardDate(interaction.createdAt) }}</span>
                    </div>
                    <p>{{ interaction.message }}</p>
                    <button
                      class="thread-item__contact"
                      :disabled="revealPending[getRevealKey(item.id, interaction.id)]"
                      type="button"
                      @click="revealInteractionContact(item.id, interaction.id)"
                    >
                      {{ revealPending[getRevealKey(item.id, interaction.id)] ? 'Revealing...' : 'Reveal reply contact' }}
                    </button>
                    <p v-if="revealErrors[getRevealKey(item.id, interaction.id)]" class="inline-note inline-note--error" role="alert">
                      {{ revealErrors[getRevealKey(item.id, interaction.id)]?.message }}
                    </p>
                    <p v-if="revealInteractionContacts[getRevealKey(item.id, interaction.id)]" class="inline-note inline-note--success" role="status">
                      Contact: {{ revealInteractionContacts[getRevealKey(item.id, interaction.id)] }}
                    </p>
                  </article>
                </div>

                <p v-else class="board-card__thread-empty">
                  No responses yet. This is the place where neighbors can answer the request directly.
                </p>
              </div>

              <form
                v-if="openReplyItemId === item.id"
                class="reply-form"
                :aria-busy="replyStatuses[item.id]?.pending"
                @submit.prevent="submitBoardReply(item)"
              >
                <p class="sr-only">
                  <label>Do not fill this field if you are human. <input v-model="replyDrafts[item.id]!['bot-field']" name="bot-field" type="text"></label>
                </p>

                <div class="field-grid">
                  <label class="field">
                    <span>Your name</span>
                    <input v-model="replyDrafts[item.id]!.name" :required="!viewer" autocomplete="name" placeholder="Jane Smith" type="text">
                  </label>

                  <label class="field">
                    <span>{{ viewer ? 'Contact method (optional when signed in)' : 'Email or phone' }}</span>
                    <input v-model="replyDrafts[item.id]!.contact" :required="!viewer" autocomplete="email" placeholder="jane@email.com or 555-123-4567" type="text">
                  </label>

                  <label class="field field--wide">
                    <span>Message</span>
                    <textarea v-model="replyDrafts[item.id]!.message" placeholder="Tell them what you can offer, what timing works, and anything they should know before reaching out." required rows="5" />
                  </label>
                </div>

                <p v-if="replyStatuses[item.id]?.error" class="inline-note inline-note--error" role="alert">
                  {{ replyStatuses[item.id]?.error?.message }} {{ replyStatuses[item.id]?.error?.detail }}
                </p>
                <p v-if="replyStatuses[item.id]?.success" class="inline-note inline-note--success" role="status">
                  Your response is now on the board.
                </p>

                <button class="submit-button submit-button--slim" :disabled="replyStatuses[item.id]?.pending" type="submit">
                  {{ replyStatuses[item.id]?.pending ? 'Posting response...' : 'Post board response' }}
                </button>
              </form>
            </article>
          </div>
        </div>
      </div>
    </section>

    <section class="process">
      <div class="section-heading">
        <p class="eyebrow">
          How it works
        </p>
        <h2>
          The board is designed for immediate use, not for private gatekeeping.
        </h2>
      </div>

      <ol class="process__list">
        <li v-for="step in processSteps" :key="step.number">
          <span class="process__number">{{ step.number }}</span>
          <div>
            <h3>{{ step.title }}</h3>
            <p>{{ step.description }}</p>
          </div>
        </li>
      </ol>
    </section>

    <section class="board-groups">
      <div class="section-heading">
        <p class="eyebrow">
          What belongs here
        </p>
        <h2>
          Keep posts practical, specific, and clear enough for another person to act on them.
        </h2>
      </div>

      <div class="board-groups__grid">
        <article v-for="group in boardGroups" :key="group.title">
          <h3>{{ group.title }}</h3>
          <ul>
            <li v-for="item in group.items" :key="item">
              {{ item }}
            </li>
          </ul>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped>
.home-page {
  display: flex;
  flex-direction: column;
  gap: 2.75rem;
  padding-bottom: 2rem;
}

.hero,
.live-board,
.process,
.board-groups {
  padding-inline: 5vw;
}

.hero {
  padding-top: 1.75rem;
}

.hero__inner {
  min-height: calc(100svh - 7rem);
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(250px, 0.65fr);
  align-items: center;
  gap: clamp(2rem, 4vw, 4.5rem);
}

.hero__copy {
  max-width: 46rem;
  padding-right: clamp(0rem, 2vw, 1.75rem);
  animation: rise-in 700ms ease both;
}

.eyebrow {
  margin: 0 0 1rem;
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #6d7267;
}

.hero h1,
.section-heading h2,
.account-panel h3 {
  margin: 0;
  font-family: 'DM Serif Display', serif;
  font-weight: 400;
  letter-spacing: -0.03em;
  color: #162219;
}

.hero h1 {
  max-width: 13ch;
  font-size: clamp(2.7rem, 5.4vw, 5.15rem);
  line-height: 0.92;
  text-wrap: balance;
}

.hero__lede,
.section-copy,
.account-panel p,
.process__list p,
.board-groups li,
.board-card__summary,
.board-card__contact-note,
.board-card__thread-empty,
.thread-item p {
  color: #33433a;
  line-height: 1.7;
}

.hero__lede {
  max-width: 38rem;
  margin: 1.35rem 0 0;
  font-size: 1.04rem;
}

.hero__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.9rem;
  margin-top: 2rem;
}

.hero__actions a,
.submit-button,
.secondary-button,
.board-filter,
.account-tabs__button {
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

.hero__actions a,
.submit-button,
.secondary-button--dark {
  background: #294635;
  color: #f8f5ee;
  box-shadow: 0 16px 30px rgba(41, 70, 53, 0.18);
}

.hero__actions a:hover,
.hero__actions a:focus-visible,
.submit-button:hover,
.submit-button:focus-visible,
.secondary-button--dark:hover,
.secondary-button--dark:focus-visible {
  transform: translateY(-1px);
  background: #1d3528;
}

.hero__caption {
  margin: 1.35rem 0 0;
  max-width: 32rem;
  color: #526257;
  line-height: 1.65;
}

.hero__poster {
  display: flex;
  justify-content: flex-end;
  animation: poster-in 860ms ease 60ms both;
}

.poster {
  position: relative;
  width: min(27rem, 100%);
  padding: 1.55rem;
  border-radius: 2rem;
  background: linear-gradient(160deg, rgba(255, 250, 243, 0.96), rgba(244, 234, 216, 0.92)), #fff;
  border: 1px solid rgba(40, 58, 45, 0.08);
  box-shadow:
    0 32px 70px rgba(53, 69, 57, 0.14),
    inset 0 1px 0 rgba(255, 255, 255, 0.5);
  transform: rotate(2deg);
}

.poster::before {
  content: '';
  position: absolute;
  top: 1rem;
  right: 1rem;
  width: 5.5rem;
  height: 5.5rem;
  border-radius: 50%;
  background: rgba(121, 159, 129, 0.12);
  filter: blur(2px);
}

.poster__stamp {
  display: inline-flex;
  padding: 0.45rem 0.75rem;
  border-radius: 999px;
  background: rgba(41, 70, 53, 0.08);
  font-size: 0.76rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #30503d;
}

.poster__headline {
  margin-top: 1.4rem;
  display: grid;
  gap: 0.35rem;
}

.poster__headline strong {
  font-family: 'DM Serif Display', serif;
  font-size: clamp(2.7rem, 6vw, 4rem);
  line-height: 0.95;
  color: #17231b;
}

.poster__headline span {
  max-width: 15rem;
  color: #536257;
  line-height: 1.5;
}

.poster__lanes {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.8rem;
  margin-top: 1.45rem;
}

.poster__lanes div {
  padding: 0.9rem 0.95rem;
  border-radius: 1.2rem;
  background: rgba(255, 255, 255, 0.84);
  border: 1px solid rgba(40, 58, 45, 0.08);
}

.poster__lanes small {
  display: block;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: #6a7369;
  font-size: 0.72rem;
}

.poster__lanes strong {
  display: block;
  margin-top: 0.3rem;
  font-size: 1.55rem;
  color: #162219;
}

.poster__note {
  margin: 1.1rem 0 0;
  color: #526257;
  font-size: 0.94rem;
}

.live-board {
  display: grid;
  gap: 1.5rem;
}

.live-board__heading {
  display: grid;
  gap: 1rem;
}

.section-heading {
  max-width: 42rem;
}

.section-copy {
  margin: 1rem 0 0;
}

.board-filter-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.board-filter {
  gap: 0.7rem;
  background: rgba(255, 250, 243, 0.84);
  color: #263329;
  border: 1px solid rgba(40, 58, 45, 0.1);
}

.board-filter strong {
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  background: rgba(41, 70, 53, 0.08);
  font-size: 0.82rem;
}

.board-filter:hover,
.board-filter:focus-visible,
.board-filter--active {
  transform: translateY(-1px);
  border-color: rgba(41, 70, 53, 0.22);
  background: #294635;
  color: #f8f5ee;
}

.board-filter--active strong,
.board-filter:hover strong,
.board-filter:focus-visible strong {
  background: rgba(255, 255, 255, 0.16);
}

.live-board__layout {
  display: grid;
  gap: 1.35rem;
  align-items: start;
}

.account-panel,
.board-card {
  padding: 1.5rem;
  border-radius: 1.65rem;
  background: rgba(255, 250, 243, 0.84);
  border: 1px solid rgba(40, 58, 45, 0.08);
  box-shadow: 0 24px 50px rgba(52, 66, 56, 0.08);
}

.account-panel {
  position: static;
}

.account-panel h3 {
  font-size: 2rem;
  line-height: 1.05;
}

.account-panel__benefits {
  margin: 1rem 0 0;
  padding-left: 1.2rem;
  color: #324137;
  line-height: 1.7;
}

.account-panel__signed-in {
  margin-top: 1.2rem;
  padding: 1rem;
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: center;
  border-radius: 1.2rem;
  background: rgba(255, 255, 255, 0.76);
}

.account-panel__label {
  margin: 0 0 0.2rem;
  font-size: 0.74rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #647067;
}

.account-panel__signed-in strong,
.account-panel__signed-in small {
  display: block;
}

.account-panel__signed-in small {
  margin-top: 0.2rem;
  color: #5a665d;
}

.account-tabs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.6rem;
  margin-top: 1.2rem;
}

.account-tabs__button {
  background: rgba(255, 255, 255, 0.76);
  color: #223126;
  border: 1px solid rgba(40, 58, 45, 0.08);
}

.account-tabs__button--active {
  background: #294635;
  color: #f8f5ee;
}

.account-form {
  margin-top: 1rem;
  display: grid;
  gap: 0.85rem;
}

.account-panel__privacy,
.board-card__contact-note {
  margin: 1rem 0 0;
  font-size: 0.94rem;
}

.account-panel__note,
.inline-note,
.success-note,
.error-panel {
  margin-top: 1rem;
  padding: 0.9rem 1rem;
  border-radius: 1rem;
  line-height: 1.55;
}

.account-panel__note--success,
.inline-note--success,
.success-note {
  background: rgba(92, 148, 103, 0.12);
  color: #24402e;
}

.account-panel__note--warning,
.inline-note--error,
.error-panel {
  background: rgba(148, 91, 82, 0.12);
  color: #6a2d23;
}

.board-feed {
  display: grid;
  gap: 1rem;
}

.board-feed__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.85rem;
  color: #566359;
  font-size: 0.95rem;
}

.board-feed__meta p {
  margin: 0;
  padding: 0.55rem 0.85rem;
  border-radius: 999px;
  background: rgba(255, 250, 243, 0.7);
  border: 1px solid rgba(40, 58, 45, 0.08);
}

.board-feed__list {
  display: grid;
  gap: 1rem;
}

.board-empty {
  padding: 1.4rem 1.5rem;
  border-radius: 1.4rem;
  background: rgba(255, 250, 243, 0.72);
  border: 1px dashed rgba(40, 58, 45, 0.16);
  color: #405046;
}

.board-empty p {
  margin: 0;
}

.board-empty p + p {
  margin-top: 0.55rem;
}

.board-empty a {
  color: #294635;
  font-weight: 700;
  text-decoration: none;
}

.board-empty a:hover,
.board-empty a:focus-visible {
  text-decoration: underline;
  text-underline-offset: 0.2em;
}

.board-card {
  display: grid;
  gap: 1rem;
}

.board-card__header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
}

.board-card__kind,
.board-card__thread-label,
.board-card__summary-label {
  margin: 0;
  font-size: 0.76rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #6d7267;
}

.board-card__header h3 {
  margin: 0.35rem 0 0;
  font-family: 'DM Serif Display', serif;
  font-size: 2rem;
  line-height: 1;
  color: #17231b;
}

.board-card__meta {
  display: grid;
  gap: 0.35rem;
  justify-items: end;
  color: #5b675d;
  font-size: 0.88rem;
}

.board-card__author {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  align-items: center;
  color: #223026;
}

.board-card__badge {
  display: inline-flex;
  padding: 0.28rem 0.55rem;
  border-radius: 999px;
  background: rgba(41, 70, 53, 0.08);
  color: #294635;
  font-size: 0.76rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.board-card__summary-label {
  margin-bottom: -0.4rem;
}

.board-card__summary {
  margin: 0;
}

.board-card__attributes {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 0.8rem;
  margin: 0;
}

.board-card__attributes div {
  padding: 0.9rem 0.95rem;
  border-radius: 1rem;
  background: rgba(255, 255, 255, 0.76);
}

.board-card__attributes dt {
  margin: 0;
  font-size: 0.75rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #6a746a;
}

.board-card__attributes dd {
  margin: 0.4rem 0 0;
  color: #1d2d23;
  line-height: 1.55;
}

.board-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.secondary-button {
  background: rgba(255, 255, 255, 0.76);
  color: #243128;
  border: 1px solid rgba(40, 58, 45, 0.12);
}

.secondary-button:hover,
.secondary-button:focus-visible {
  transform: translateY(-1px);
  background: rgba(255, 255, 255, 0.96);
}

.secondary-button:disabled,
.submit-button:disabled,
.board-filter:disabled,
.account-tabs__button:disabled {
  opacity: 0.68;
  cursor: wait;
  transform: none;
}

.secondary-button--dark {
  background: #294635;
  color: #f8f5ee;
}

.board-card__thread {
  display: grid;
  gap: 0.8rem;
  padding-top: 0.25rem;
  border-top: 1px solid rgba(40, 58, 45, 0.08);
}

.thread-list {
  display: grid;
  gap: 0.8rem;
}

.thread-item {
  padding: 1rem;
  border-radius: 1.15rem;
  background: rgba(255, 255, 255, 0.76);
  display: grid;
  gap: 0.65rem;
}

.thread-item__header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
  color: #57645a;
  font-size: 0.88rem;
}

.thread-item__header strong {
  color: #1f2e24;
}

.thread-item p {
  margin: 0;
}

.thread-item__contact {
  padding: 0;
  background: none;
  border: 0;
  color: #294635;
  font-weight: 700;
  justify-self: flex-start;
  cursor: pointer;
}

.thread-item__contact:hover,
.thread-item__contact:focus-visible {
  text-decoration: underline;
  text-underline-offset: 0.2em;
}

.reply-form {
  display: grid;
  gap: 0.9rem;
  padding: 1rem;
  border-radius: 1.2rem;
  background: rgba(255, 255, 255, 0.78);
}

.process {
  display: grid;
  gap: 1rem;
}

.process__list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;
  padding: 0;
  margin: 0;
  list-style: none;
}

.process__list li,
.board-groups__grid article {
  padding: 1.25rem;
  border-radius: 1.4rem;
  background: rgba(255, 250, 243, 0.72);
  border: 1px solid rgba(40, 58, 45, 0.08);
}

.process__number {
  display: inline-flex;
  margin-bottom: 1rem;
  font-size: 1rem;
  font-weight: 700;
  color: #294635;
}

.process__list h3,
.board-groups__grid h3 {
  margin: 0;
  font-family: 'DM Serif Display', serif;
  font-size: 1.55rem;
  line-height: 1.05;
  color: #17231b;
}

.process__list p {
  margin: 0.75rem 0 0;
}

.board-groups {
  display: grid;
  gap: 1rem;
}

.board-groups__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;
}

.board-groups__grid ul {
  margin: 0.85rem 0 0;
  padding-left: 1.15rem;
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.95rem;
}

.field {
  display: grid;
  gap: 0.45rem;
}

.field--wide {
  grid-column: 1 / -1;
}

.field span {
  font-size: 0.88rem;
  font-weight: 700;
  color: #2b382f;
}

.field input,
.field textarea,
.field select {
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

.field textarea {
  resize: vertical;
  min-height: 8rem;
}

.field input:focus-visible,
.field textarea:focus-visible,
.field select:focus-visible {
  outline: none;
  border-color: rgba(41, 70, 53, 0.32);
  box-shadow: 0 0 0 4px rgba(41, 70, 53, 0.1);
  background: #fff;
}

.submit-button {
  width: fit-content;
}

.submit-button--slim {
  min-height: 2.95rem;
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

@keyframes rise-in {
  from {
    opacity: 0;
    transform: translateY(22px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes poster-in {
  from {
    opacity: 0;
    transform: translateY(20px) rotate(6deg);
  }

  to {
    opacity: 1;
    transform: translateY(0) rotate(2deg);
  }
}

@media (max-width: 1080px) {
  .hero__inner {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 860px) {
  .process__list,
  .board-groups__grid,
  .field-grid,
  .poster__lanes {
    grid-template-columns: 1fr;
  }

  .board-card__header,
  .thread-item__header {
    flex-direction: column;
    align-items: flex-start;
  }

  .board-card__meta {
    justify-items: start;
  }
}

@media (max-width: 760px) {
  .hero,
  .live-board,
  .process,
  .board-groups {
    padding-inline: 1.25rem;
  }

  .hero__inner {
    min-height: auto;
    gap: 2rem;
  }

  .hero h1 {
    max-width: 100%;
  }

  .board-card,
  .account-panel {
    padding: 1.2rem;
  }

  .hero__actions,
  .board-card__actions {
    flex-direction: column;
    align-items: stretch;
  }

  .submit-button,
  .secondary-button,
  .hero__actions a {
    width: 100%;
  }
}
</style>
