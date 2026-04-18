<script setup lang="ts">
import type {
  AntiBotChallenge,
  BoardBootstrapResponse,
  BoardClaimManagementResponse,
  BoardContactResponse,
  BoardDeleteResponse,
  BoardInteractionDeleteResponse,
  BoardInteractionResponse,
  BoardItem,
  BoardItemDetailResponse,
  BoardItemResolutionResponse,
  ViewerAccount,
} from '~/utils/board'
import type { BoardFormErrorState, BoardFormStatus, BoardReplyDraft } from '~/utils/boardUi'

import { isAntiBotChallenge, isAntiBotChallengeExpired, markAntiBotChallengeObserved, waitForAntiBotChallengeMinimumAge } from '~/utils/antiBot'
import { forgetBoardDeleteToken, getBoardEndpoint, getStoredBoardDeleteToken, rememberBoardDeleteToken } from '~/utils/board'
import { formatBoardDate, getBoardApiErrorState, getContactActionLabel, getInteractionDeleteKey, getReplyActionLabel, getRevealKey } from '~/utils/boardUi'
import {
  boardContactMethodOptions,
  getBoardContactValueAutocomplete,
  getBoardContactValueInputMode,
  getBoardContactValueLabel,
  getBoardContactValuePlaceholder,
  getBoardContactValueType,
} from '~/utils/contact'

definePageMeta({
  layout: 'home',
})

const runtimeConfig = useRuntimeConfig()
const route = useRoute()
const router = useRouter()

const antiBotChallenge = ref<AntiBotChallenge | null>(null)
const viewer = ref<ViewerAccount | null>(null)
const item = ref<BoardItem | null>(null)
const itemLoaded = ref(false)
const itemPending = ref(false)
const itemError = ref<BoardFormErrorState | null>(null)
const securityError = ref<BoardFormErrorState | null>(null)
const managementNotice = ref('')
const managementPending = ref(false)
const managementError = ref<BoardFormErrorState | null>(null)
const openReply = ref(false)
const confirmDelete = ref(false)
const confirmDeleteInteractionKey = ref<string | null>(null)
const storedDeleteToken = ref('')

const replyDraft = ref<BoardReplyDraft>({
  'bot-field': '',
  'contact_method': 'email',
  'contact_note': '',
  'contact_value': '',
  'message': '',
  'name': '',
})
const replyStatus = ref<BoardFormStatus>({
  error: null,
  pending: false,
  success: false,
})

const revealItemContact = ref('')
const revealItemContactVisible = ref(false)
const revealItemError = ref<BoardFormErrorState | null>(null)
const revealItemPending = ref(false)

const revealInteractionContacts = reactive<Record<string, string>>({})
const revealInteractionContactVisibility = reactive<Record<string, boolean>>({})
const revealErrors = reactive<Record<string, BoardFormErrorState | null>>({})
const revealPending = reactive<Record<string, boolean>>({})
const deleteInteractionErrors = reactive<Record<string, BoardFormErrorState | null>>({})
const deleteInteractionPending = reactive<Record<string, boolean>>({})

const deleteError = ref<BoardFormErrorState | null>(null)
const deletePending = ref(false)
const resolveError = ref<BoardFormErrorState | null>(null)
const resolvePending = ref(false)

const routeItemId = computed(() => getQueryValue(route.query.id) || getQueryValue(route.query.manageItem))
const routeManagementToken = computed(() => getQueryValue(route.query.manageToken))
const pageHeading = computed(() => item.value?.title || 'Board post')
const pageDescription = computed(() => item.value?.summary || 'View one request or lending offer, reveal contact when needed, and respond on the public board.')

useSeoMeta({
  title: () => item.value ? `${item.value.title} | Live board` : 'Board post',
  description: () => pageDescription.value,
})

function getQueryValue(value: unknown) {
  if (Array.isArray(value))
    return getQueryValue(value[0])

  return typeof value === 'string' ? value : ''
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

function refreshStoredDeleteToken() {
  storedDeleteToken.value = item.value ? getStoredBoardDeleteToken(item.value.id) : ''
}

function resetReplyDraft() {
  replyDraft.value = {
    'bot-field': '',
    'contact_method': 'email',
    'contact_note': '',
    'contact_value': viewer.value?.email || '',
    'message': '',
    'name': viewer.value?.displayName || '',
  }
}

function resetReplyStatus() {
  replyStatus.value = {
    error: null,
    pending: false,
    success: false,
  }
}

function syncReplyDraftWithViewer() {
  if (!viewer.value)
    return

  if (!replyDraft.value.name)
    replyDraft.value.name = viewer.value.displayName

  if (!replyDraft.value.contact_value)
    replyDraft.value.contact_value = viewer.value.email
}

function replaceItem(nextItem: BoardItem) {
  item.value = nextItem
  refreshStoredDeleteToken()

  if (nextItem.resolutionStatus === 'resolved')
    openReply.value = false
}

function appendInteraction(interaction: BoardInteractionResponse['interaction']) {
  if (!item.value)
    return

  item.value = {
    ...item.value,
    interactionCount: item.value.interactionCount + 1,
    interactions: [interaction, ...item.value.interactions],
    lastActivityAt: interaction.createdAt,
  }
}

function removeInteraction(interactionId: string) {
  if (!item.value)
    return

  const remainingInteractions = item.value.interactions.filter(interaction => interaction.id !== interactionId)
  item.value = {
    ...item.value,
    interactionCount: remainingInteractions.length,
    interactions: remainingInteractions,
    lastActivityAt: remainingInteractions[0]?.createdAt || item.value.createdAt,
  }
}

function ensureInteractionDeleteState(key: string) {
  if (!(key in deleteInteractionPending))
    deleteInteractionPending[key] = false

  if (!(key in deleteInteractionErrors))
    deleteInteractionErrors[key] = null
}

function ensureRevealState(key: string) {
  if (!(key in revealPending))
    revealPending[key] = false

  if (!(key in revealErrors))
    revealErrors[key] = null
}

function canDeleteItem(currentItem: BoardItem) {
  if (viewer.value?.isAdmin)
    return true

  if (viewer.value && currentItem.author.accountId && viewer.value.id === currentItem.author.accountId)
    return true

  return Boolean(storedDeleteToken.value)
}

function canResolveItem(currentItem: BoardItem) {
  return canDeleteItem(currentItem)
}

function canDeleteInteraction(interaction: BoardItem['interactions'][number]) {
  if (viewer.value?.isAdmin)
    return true

  return Boolean(viewer.value && interaction.author.accountId && viewer.value.id === interaction.author.accountId)
}

function canReplyToItem(currentItem: BoardItem) {
  return currentItem.resolutionStatus === 'open'
}

function getItemContactActionLabel(currentItem: BoardItem) {
  if (revealItemPending.value)
    return 'Revealing...'

  if (revealItemContact.value && revealItemContactVisible.value)
    return currentItem.kind === 'item-lending' ? 'Hide lender contact' : 'Hide contact'

  return getContactActionLabel(currentItem.kind)
}

function isInteractionContactVisible(interactionId: string) {
  const key = getRevealKey(item.value?.id || '', interactionId)
  return Boolean(revealInteractionContactVisibility[key] && revealInteractionContacts[key])
}

function getInteractionContactActionLabel(interactionId: string) {
  const key = getRevealKey(item.value?.id || '', interactionId)

  if (revealPending[key])
    return 'Revealing...'

  if (isInteractionContactVisible(interactionId))
    return 'Hide reply contact'

  return 'Reveal reply contact'
}

function getDeleteActionLabel() {
  if (deletePending.value)
    return 'Deleting...'

  return confirmDelete.value ? 'Click again to delete' : 'Delete post'
}

function getDeleteInteractionActionLabel(interactionId: string) {
  const key = getInteractionDeleteKey(item.value?.id || '', interactionId)

  if (deleteInteractionPending[key])
    return 'Deleting...'

  if (confirmDeleteInteractionKey.value === key)
    return 'Click again to delete'

  return 'Delete reply'
}

function getResolutionActionLabel(currentItem: BoardItem) {
  if (resolvePending.value)
    return 'Saving...'

  return currentItem.resolutionStatus === 'resolved' ? 'Mark open' : 'Mark resolved'
}

function getResolvedNote(currentItem: BoardItem) {
  const resolvedAt = currentItem.resolutionChangedAt || currentItem.lastActivityAt
  return `This post was marked resolved ${formatBoardDate(resolvedAt)}. It stays visible for reference, and new public replies are closed until it is reopened.`
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
    securityError.value = getBoardApiErrorState(error, endpoint, 'Unable to initialize board security right now.', applyServerContext)
  }
}

async function loadItem(itemId: string) {
  const endpoint = getBoardEndpoint(runtimeConfig.public.apiBaseUrl, `items/${itemId}`)
  itemPending.value = true
  itemError.value = null

  try {
    const response = await $fetch<BoardItemDetailResponse>(endpoint, {
      credentials: 'include',
    })

    item.value = response.item
    refreshStoredDeleteToken()
    syncReplyDraftWithViewer()
  }
  catch (error) {
    item.value = null
    itemError.value = getBoardApiErrorState(error, endpoint, 'Unable to load that board post right now.', applyServerContext)
  }
  finally {
    itemPending.value = false
    itemLoaded.value = true
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

async function protectedDelete<T>(endpoint: string, body: Record<string, string>) {
  await ensureAntiBotReady()

  return $fetch<T>(endpoint, {
    body: {
      ...body,
      challengeIssuedAt: String(antiBotChallenge.value?.issuedAt || ''),
      challengeToken: antiBotChallenge.value?.token || '',
    },
    credentials: 'include',
    method: 'DELETE',
  })
}

async function claimBoardManagementLink(itemId: string, managementToken: string) {
  const endpoint = getBoardEndpoint(runtimeConfig.public.apiBaseUrl, `items/${itemId}/claim-management`)
  managementPending.value = true
  managementError.value = null
  managementNotice.value = ''

  try {
    const response = await $fetch<BoardClaimManagementResponse>(endpoint, {
      body: {
        token: managementToken,
      },
      credentials: 'include',
      method: 'POST',
    })

    applyServerContext(response)
    rememberBoardDeleteToken(response.itemId, response.deleteToken)
    refreshStoredDeleteToken()
    managementNotice.value = 'Management access for this post is now saved in this browser. You can delete it or reopen it from this page.'
  }
  catch (error) {
    managementError.value = getBoardApiErrorState(error, endpoint, 'We could not claim that management link right now.', applyServerContext)
  }
  finally {
    managementPending.value = false

    await router.replace({
      path: route.path,
      query: {
        id: routeItemId.value || undefined,
      },
    })
  }
}

async function submitBoardReply() {
  if (!item.value)
    return

  const endpoint = getBoardEndpoint(runtimeConfig.public.apiBaseUrl, `items/${item.value.id}/interactions`)
  replyStatus.value = {
    error: null,
    pending: true,
    success: false,
  }

  try {
    const response = await protectedPost<BoardInteractionResponse>(endpoint, {
      ...replyDraft.value,
      itemTitle: item.value.title,
    })

    applyServerContext(response)
    appendInteraction(response.interaction)
    replyDraft.value.message = ''
    replyStatus.value.success = true
  }
  catch (error) {
    replyStatus.value.error = getBoardApiErrorState(error, endpoint, 'We could not post that board response right now.', applyServerContext)
  }
  finally {
    replyStatus.value.pending = false
  }
}

async function revealCurrentItemContact() {
  if (!item.value)
    return

  if (revealItemContact.value) {
    revealItemContactVisible.value = !revealItemContactVisible.value
    revealItemError.value = null
    return
  }

  const endpoint = getBoardEndpoint(runtimeConfig.public.apiBaseUrl, `items/${item.value.id}/contact`)
  revealItemPending.value = true
  revealItemError.value = null

  try {
    const response = await protectedPost<BoardContactResponse>(endpoint, {
      'bot-field': '',
    })

    applyServerContext(response)
    revealItemContact.value = response.contact
    revealItemContactVisible.value = true
  }
  catch (error) {
    revealItemError.value = getBoardApiErrorState(error, endpoint, 'We could not reveal that contact right now.', applyServerContext)
  }
  finally {
    revealItemPending.value = false
  }
}

async function revealInteractionContact(interactionId: string) {
  if (!item.value)
    return

  const key = getRevealKey(item.value.id, interactionId)
  ensureRevealState(key)

  if (revealInteractionContacts[key]) {
    revealInteractionContactVisibility[key] = !isInteractionContactVisible(interactionId)
    revealErrors[key] = null
    return
  }

  const endpoint = getBoardEndpoint(runtimeConfig.public.apiBaseUrl, `items/${item.value.id}/interactions/${interactionId}/contact`)
  revealPending[key] = true
  revealErrors[key] = null

  try {
    const response = await protectedPost<BoardContactResponse>(endpoint, {
      'bot-field': '',
    })

    applyServerContext(response)
    revealInteractionContacts[key] = response.contact
    revealInteractionContactVisibility[key] = true
  }
  catch (error) {
    revealErrors[key] = getBoardApiErrorState(error, endpoint, 'We could not reveal that contact right now.', applyServerContext)
  }
  finally {
    revealPending[key] = false
  }
}

async function toggleBoardResolution() {
  if (!item.value)
    return

  const endpoint = getBoardEndpoint(runtimeConfig.public.apiBaseUrl, `items/${item.value.id}/resolution`)
  resolvePending.value = true
  resolveError.value = null

  try {
    const response = await protectedPost<BoardItemResolutionResponse>(endpoint, {
      'bot-field': '',
      'deleteToken': storedDeleteToken.value,
      'status': item.value.resolutionStatus === 'resolved' ? 'open' : 'resolved',
    })

    applyServerContext(response)
    replaceItem(response.item)
  }
  catch (error) {
    resolveError.value = getBoardApiErrorState(error, endpoint, 'We could not update that post right now.', applyServerContext)
  }
  finally {
    resolvePending.value = false
  }
}

async function deleteBoardPost() {
  if (!item.value)
    return

  if (!confirmDelete.value) {
    confirmDelete.value = true
    deleteError.value = null
    return
  }

  const endpoint = getBoardEndpoint(runtimeConfig.public.apiBaseUrl, `items/${item.value.id}`)
  confirmDelete.value = false
  deletePending.value = true
  deleteError.value = null

  try {
    const response = await protectedDelete<BoardDeleteResponse>(endpoint, {
      'bot-field': '',
      'deleteToken': storedDeleteToken.value,
    })

    applyServerContext(response)
    forgetBoardDeleteToken(response.itemId)
    storedDeleteToken.value = ''
    await router.push({
      hash: '#live-board',
      path: '/',
    })
  }
  catch (error) {
    confirmDelete.value = true
    deleteError.value = getBoardApiErrorState(error, endpoint, 'We could not delete that board item right now.', applyServerContext)
  }
  finally {
    deletePending.value = false
  }
}

async function deleteBoardInteraction(interactionId: string) {
  if (!item.value)
    return

  const key = getInteractionDeleteKey(item.value.id, interactionId)

  if (confirmDeleteInteractionKey.value !== key) {
    confirmDeleteInteractionKey.value = key
    ensureInteractionDeleteState(key)
    deleteInteractionErrors[key] = null
    return
  }

  const endpoint = getBoardEndpoint(runtimeConfig.public.apiBaseUrl, `items/${item.value.id}/interactions/${interactionId}`)
  confirmDeleteInteractionKey.value = null
  deleteInteractionPending[key] = true
  deleteInteractionErrors[key] = null

  try {
    const response = await protectedDelete<BoardInteractionDeleteResponse>(endpoint, {
      'bot-field': '',
    })

    applyServerContext(response)
    removeInteraction(response.interactionId)
  }
  catch (error) {
    confirmDeleteInteractionKey.value = key
    deleteInteractionErrors[key] = getBoardApiErrorState(error, endpoint, 'We could not delete that board response right now.', applyServerContext)
  }
  finally {
    deleteInteractionPending[key] = false
  }
}

function openReplyForm() {
  if (!item.value || !canReplyToItem(item.value))
    return

  openReply.value = !openReply.value
}

watch(viewer, () => {
  syncReplyDraftWithViewer()
})

onMounted(() => {
  resetReplyDraft()
  resetReplyStatus()
  void loadBootstrap()

  if (routeItemId.value) {
    void loadItem(routeItemId.value)
  }
  else {
    itemLoaded.value = true
    itemError.value = { detail: 'Add a valid board post id to the URL and try again.', message: 'No board post was selected.' }
  }

  if (routeItemId.value && routeManagementToken.value)
    void claimBoardManagementLink(routeItemId.value, routeManagementToken.value)
})

watch(routeItemId, (nextItemId, previousItemId) => {
  if (nextItemId === previousItemId)
    return

  itemLoaded.value = false
  managementNotice.value = ''
  managementError.value = null
  revealItemContact.value = ''
  revealItemContactVisible.value = false
  revealItemError.value = null
  deleteError.value = null
  resolveError.value = null
  openReply.value = false
  confirmDelete.value = false
  confirmDeleteInteractionKey.value = null
  resetReplyDraft()
  resetReplyStatus()

  if (nextItemId) {
    void loadItem(nextItemId)
  }
  else {
    itemLoaded.value = true
    itemError.value = { detail: 'Add a valid board post id to the URL and try again.', message: 'No board post was selected.' }
  }
})

watch(routeManagementToken, (nextToken, previousToken) => {
  if (!routeItemId.value || !nextToken || nextToken === previousToken)
    return

  void claimBoardManagementLink(routeItemId.value, nextToken)
})
</script>

<template>
  <div class="post-page">
    <section class="post-page__hero">
      <NuxtLink class="post-page__back" prefetch-on="interaction" to="/#live-board">
        Back to live board
      </NuxtLink>

      <p class="eyebrow">
        Board post
      </p>
      <h1>
        {{ pageHeading }}
      </h1>
      <p class="post-page__lede">
        {{ pageDescription }}
      </p>

      <p v-if="securityError" class="inline-note inline-note--error" role="alert">
        {{ securityError.message }} {{ securityError.detail }}
      </p>
      <p v-if="managementNotice" class="inline-note inline-note--success" role="status">
        {{ managementNotice }}
      </p>
      <p v-if="managementError" class="inline-note inline-note--error" role="alert">
        {{ managementError.message }} {{ managementError.detail }}
      </p>
      <p v-if="managementPending" class="inline-note" role="status">
        Claiming management access...
      </p>
    </section>

    <section class="post-page__body">
      <div v-if="!itemLoaded || itemPending" class="board-empty board-empty--loading" role="status">
        Loading this board post...
      </div>

      <div v-else-if="itemError" class="board-empty board-empty--error" role="alert">
        <p>{{ itemError.message }}</p>
        <p>{{ itemError.detail }}</p>
      </div>

      <article v-else-if="item" class="board-card">
        <header class="board-card__header">
          <div>
            <p class="board-card__kind">
              {{ item.kindLabel }}
            </p>
            <h2>{{ item.title }}</h2>
          </div>

          <div class="board-card__meta">
            <span>{{ formatBoardDate(item.createdAt) }}</span>
            <span>{{ item.interactionCount }} replies</span>
          </div>
        </header>

        <div class="board-card__author">
          <strong>{{ item.author.displayName }}</strong>
          <span v-if="item.author.hasAccount" class="board-card__badge">account-backed</span>
          <span v-if="item.resolutionStatus === 'resolved'" class="board-card__badge board-card__badge--resolved">resolved</span>
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
            :disabled="revealItemPending"
            type="button"
            @click="revealCurrentItemContact"
          >
            {{ getItemContactActionLabel(item) }}
          </button>
          <button
            v-if="canReplyToItem(item)"
            class="secondary-button secondary-button--dark"
            type="button"
            @click="openReplyForm"
          >
            {{ openReply ? 'Hide reply form' : getReplyActionLabel(item.kind) }}
          </button>
          <button
            v-if="canResolveItem(item)"
            class="secondary-button"
            :disabled="resolvePending"
            type="button"
            @click="toggleBoardResolution"
          >
            {{ getResolutionActionLabel(item) }}
          </button>
          <button
            v-if="canDeleteItem(item)"
            class="secondary-button secondary-button--danger"
            :disabled="deletePending"
            type="button"
            @click="deleteBoardPost"
          >
            {{ getDeleteActionLabel() }}
          </button>
        </div>

        <p class="board-card__contact-note">
          Contact details are hidden until you deliberately reveal them to reduce scraping.
        </p>
        <p v-if="item.resolutionStatus === 'resolved'" class="board-card__resolved-note">
          {{ getResolvedNote(item) }}
        </p>

        <p v-if="deleteError" class="inline-note inline-note--error" role="alert">
          {{ deleteError.message }} {{ deleteError.detail }}
        </p>
        <p v-if="resolveError" class="inline-note inline-note--error" role="alert">
          {{ resolveError.message }} {{ resolveError.detail }}
        </p>
        <p v-if="revealItemError" class="inline-note inline-note--error" role="alert">
          {{ revealItemError.message }} {{ revealItemError.detail }}
        </p>
        <p v-if="revealItemContact && revealItemContactVisible" class="inline-note inline-note--success" role="status">
          Contact: {{ revealItemContact }}
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
                @click="revealInteractionContact(interaction.id)"
              >
                {{ getInteractionContactActionLabel(interaction.id) }}
              </button>
              <button
                v-if="canDeleteInteraction(interaction)"
                class="thread-item__contact thread-item__contact--danger"
                :disabled="deleteInteractionPending[getInteractionDeleteKey(item.id, interaction.id)]"
                type="button"
                @click="deleteBoardInteraction(interaction.id)"
              >
                {{ getDeleteInteractionActionLabel(interaction.id) }}
              </button>
              <p v-if="revealErrors[getRevealKey(item.id, interaction.id)]" class="inline-note inline-note--error" role="alert">
                {{ revealErrors[getRevealKey(item.id, interaction.id)]?.message }} {{ revealErrors[getRevealKey(item.id, interaction.id)]?.detail }}
              </p>
              <p v-if="deleteInteractionErrors[getInteractionDeleteKey(item.id, interaction.id)]" class="inline-note inline-note--error" role="alert">
                {{ deleteInteractionErrors[getInteractionDeleteKey(item.id, interaction.id)]?.message }} {{ deleteInteractionErrors[getInteractionDeleteKey(item.id, interaction.id)]?.detail }}
              </p>
              <p v-if="isInteractionContactVisible(interaction.id)" class="inline-note inline-note--success" role="status">
                Contact: {{ revealInteractionContacts[getRevealKey(item.id, interaction.id)] }}
              </p>
            </article>
          </div>

          <p v-else class="board-card__thread-empty">
            No responses yet. This is the place where neighbors can answer the request directly.
          </p>
        </div>

        <p v-if="item.resolutionStatus === 'resolved'" class="board-card__thread-empty">
          This post is resolved, so new public replies are closed unless the owner or an admin reopens it.
        </p>

        <form
          v-if="openReply && canReplyToItem(item)"
          class="reply-form"
          :aria-busy="replyStatus.pending"
          @submit.prevent="submitBoardReply"
        >
          <p class="sr-only">
            <label>Do not fill this field if you are human. <input v-model="replyDraft['bot-field']" name="bot-field" type="text"></label>
          </p>

          <div class="field-grid">
            <label class="field">
              <span>Your name</span>
              <input v-model="replyDraft.name" :required="!viewer" autocomplete="name" placeholder="Jane Smith" type="text">
            </label>

            <label class="field">
              <span>Contact method</span>
              <select v-model="replyDraft.contact_method" :required="!viewer">
                <option v-for="option in boardContactMethodOptions" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
            </label>

            <label class="field">
              <span>{{ viewer ? `${getBoardContactValueLabel(replyDraft.contact_method)} (optional when signed in)` : getBoardContactValueLabel(replyDraft.contact_method) }}</span>
              <input
                v-model="replyDraft.contact_value"
                :autocomplete="getBoardContactValueAutocomplete(replyDraft.contact_method)"
                :inputmode="getBoardContactValueInputMode(replyDraft.contact_method)"
                :placeholder="getBoardContactValuePlaceholder(replyDraft.contact_method)"
                :required="!viewer"
                :type="getBoardContactValueType(replyDraft.contact_method)"
              >
            </label>

            <label class="field field--wide">
              <span>Contact note (optional)</span>
              <input v-model="replyDraft.contact_note" placeholder="Example: text first, evenings are best, or include the item name when you reach out." type="text">
            </label>

            <label class="field field--wide">
              <span>Message</span>
              <textarea v-model="replyDraft.message" placeholder="Tell them what you can offer, what timing works, and anything they should know before reaching out." required rows="5" />
            </label>
          </div>

          <p v-if="replyStatus.error" class="inline-note inline-note--error" role="alert">
            {{ replyStatus.error.message }} {{ replyStatus.error.detail }}
          </p>
          <p v-if="replyStatus.success" class="inline-note inline-note--success" role="status">
            Your response is now on the board.
          </p>

          <button class="submit-button submit-button--slim" :disabled="replyStatus.pending" type="submit">
            {{ replyStatus.pending ? 'Posting response...' : 'Post board response' }}
          </button>
        </form>
      </article>
    </section>
  </div>
</template>

<style scoped>
.post-page {
  display: grid;
  gap: 1.5rem;
  padding-right: var(--page-inline-end);
  padding-bottom: 2.75rem;
  padding-left: var(--page-inline-start);
}

.post-page__hero,
.post-page__body {
  display: grid;
  gap: 1rem;
}

.post-page__hero {
  max-width: 58rem;
  padding-block: var(--page-hero-space);
}

.post-page__back {
  width: fit-content;
  color: var(--site-link);
  font-weight: 700;
  text-decoration: none;
}

.post-page__back:hover,
.post-page__back:focus-visible {
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

.post-page h1,
.board-card__header h2 {
  margin: 0;
  font-family: 'DM Serif Display', serif;
  font-weight: 400;
  letter-spacing: -0.03em;
  color: var(--site-heading);
}

.post-page h1 {
  max-width: 14ch;
  font-size: clamp(2.35rem, 4.8vw, 4.25rem);
  line-height: 0.92;
  overflow-wrap: anywhere;
  text-wrap: balance;
}

.post-page__lede,
.board-card__summary,
.board-card__contact-note,
.board-card__resolved-note,
.board-card__thread-empty,
.thread-item p {
  color: var(--site-text);
  line-height: 1.7;
}

.post-page__lede {
  max-width: 44rem;
  margin: 0;
  font-size: 1.02rem;
}

.board-empty {
  padding: 1.4rem 1.5rem;
  border-radius: 1.4rem;
  background: var(--site-surface-soft);
  border: 1px dashed var(--site-border-dashed);
  color: var(--site-subtle);
}

.board-empty p {
  margin: 0;
}

.board-empty p + p {
  margin-top: 0.55rem;
}

.board-card {
  display: grid;
  gap: 1rem;
  padding: 1.5rem;
  border-radius: 1.65rem;
  background: var(--site-surface);
  border: 1px solid var(--site-border);
  box-shadow: var(--site-shadow);
}

.board-card__header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
}

.board-card__header > div,
.thread-item__header > div {
  min-width: 0;
}

.board-card__kind,
.board-card__thread-label,
.board-card__summary-label {
  margin: 0;
  font-size: 0.76rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--site-muted);
}

.board-card__header h2 {
  margin-top: 0.35rem;
  font-size: 2rem;
  line-height: 1;
  overflow-wrap: anywhere;
  text-wrap: balance;
}

.board-card__meta {
  display: grid;
  gap: 0.35rem;
  justify-items: end;
  color: var(--site-subtle);
  font-size: 0.88rem;
}

.board-card__author {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  align-items: center;
  color: var(--site-text-strong);
}

.board-card__badge {
  display: inline-flex;
  padding: 0.28rem 0.55rem;
  border-radius: 999px;
  background: var(--site-accent-soft);
  color: var(--site-link);
  font-size: 0.76rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.board-card__badge--resolved {
  background: var(--site-success-bg);
  color: var(--site-success-text);
}

.board-card__summary-label {
  margin-bottom: -0.4rem;
}

.board-card__summary {
  margin: 0;
  overflow-wrap: anywhere;
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
  background: var(--site-elevated);
}

.board-card__attributes dt {
  margin: 0;
  font-size: 0.75rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--site-muted);
}

.board-card__attributes dd {
  margin: 0.4rem 0 0;
  color: var(--site-heading);
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.board-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.board-card__contact-note,
.board-card__resolved-note {
  margin: 0;
}

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
  touch-action: manipulation;
  transition:
    transform 180ms ease,
    box-shadow 180ms ease,
    background-color 180ms ease,
    color 180ms ease,
    border-color 180ms ease;
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

.secondary-button:disabled,
.submit-button:disabled {
  opacity: 0.68;
  cursor: wait;
  transform: none;
}

.submit-button,
.secondary-button--dark {
  background: var(--site-button-bg);
  color: var(--site-button-text);
  box-shadow: 0 16px 30px var(--site-focus-ring);
}

.submit-button:hover,
.submit-button:focus-visible,
.secondary-button--dark:hover,
.secondary-button--dark:focus-visible {
  transform: translateY(-1px);
  background: var(--site-button-bg-hover);
}

.secondary-button--danger {
  border-color: rgba(181, 95, 82, 0.3);
  color: var(--site-error-text);
  background: var(--site-error-bg);
  box-shadow: none;
}

.secondary-button--danger:hover,
.secondary-button--danger:focus-visible {
  background: rgba(181, 95, 82, 0.24);
}

.inline-note {
  margin-top: 1rem;
  padding: 0.9rem 1rem;
  border-radius: 1rem;
  line-height: 1.55;
}

.inline-note--success {
  background: var(--site-success-bg);
  color: var(--site-success-text);
}

.inline-note--error {
  background: var(--site-error-bg);
  color: var(--site-error-text);
}

.board-card__thread {
  display: grid;
  gap: 0.8rem;
  padding-top: 0.25rem;
  border-top: 1px solid var(--site-border);
}

.thread-list {
  display: grid;
  gap: 0.8rem;
}

.thread-item {
  padding: 1rem;
  border-radius: 1.15rem;
  background: var(--site-elevated);
  display: grid;
  gap: 0.65rem;
}

.thread-item__header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
  color: var(--site-subtle);
  font-size: 0.88rem;
}

.thread-item__header strong {
  color: var(--site-heading);
}

.thread-item p {
  margin: 0;
  overflow-wrap: anywhere;
}

.thread-item__contact {
  padding: 0;
  background: none;
  border: 0;
  color: var(--site-link);
  font-weight: 700;
  justify-self: flex-start;
  cursor: pointer;
}

.thread-item__contact:hover,
.thread-item__contact:focus-visible {
  text-decoration: underline;
  text-underline-offset: 0.2em;
}

.thread-item__contact--danger {
  color: var(--site-error-text);
}

.reply-form {
  display: grid;
  gap: 0.9rem;
  padding: 1rem;
  border-radius: 1.2rem;
  background: var(--site-elevated);
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
  color: var(--site-text);
}

.field input,
.field textarea {
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

.field textarea {
  resize: vertical;
  min-height: 8rem;
}

.field input:focus-visible,
.field textarea:focus-visible {
  outline: none;
  border-color: var(--site-focus);
  box-shadow: 0 0 0 4px var(--site-focus-ring);
  background: var(--site-elevated-strong);
}

.submit-button {
  width: fit-content;
}

.submit-button--slim {
  min-height: 2.95rem;
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

@media (max-width: 860px) {
  .field-grid {
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
  .post-page h1 {
    max-width: 100%;
  }

  .board-card {
    padding: 1.2rem;
  }

  .board-card__actions {
    flex-direction: column;
    align-items: stretch;
  }

  .submit-button,
  .secondary-button {
    width: 100%;
  }
}
</style>
