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
  BoardReportReason,
  BoardReportResponse,
  ViewerAccount,
} from '~/utils/board'
import type { BoardFormErrorState, BoardFormStatus, BoardReplyDraft } from '~/utils/boardUi'

import { isAntiBotChallenge, isAntiBotChallengeExpired, markAntiBotChallengeObserved, waitForAntiBotChallengeMinimumAge } from '~/utils/antiBot'
import { boardReportReasonOptions, forgetBoardDeleteToken, getBoardEndpoint, getStoredBoardDeleteToken, rememberBoardDeleteToken } from '~/utils/board'
import { formatBoardDate, getBoardApiErrorState, getBoardDetailPath, getContactActionLabel, getInteractionDeleteKey, getReplyActionLabel, getRevealKey } from '~/utils/boardUi'
import { consumePendingManagementClaim } from '~/utils/managementLink'
import { formatRelativeTime, formatReplyCount, getPostType } from '~/utils/postTypes'
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
const interactionsPending = ref(false)
const interactionsError = ref<BoardFormErrorState | null>(null)
const securityError = ref<BoardFormErrorState | null>(null)
const managementNotice = ref('')
const managementPending = ref(false)
const managementError = ref<BoardFormErrorState | null>(null)
const openReply = ref(false)
const replyMessageElement = ref<HTMLTextAreaElement | null>(null)
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
const itemReportOpen = ref(false)
const itemReportReason = ref<BoardReportReason>('spam')
const itemReportDetails = ref('')
const itemReportError = ref<BoardFormErrorState | null>(null)
const itemReportNotice = ref('')
const itemReportPending = ref(false)

const revealInteractionContacts = reactive<Record<string, string>>({})
const revealInteractionContactVisibility = reactive<Record<string, boolean>>({})
const revealErrors = reactive<Record<string, BoardFormErrorState | null>>({})
const revealPending = reactive<Record<string, boolean>>({})
const deleteInteractionErrors = reactive<Record<string, BoardFormErrorState | null>>({})
const deleteInteractionPending = reactive<Record<string, boolean>>({})
const reportInteractionOpen = reactive<Record<string, boolean>>({})
const reportInteractionReason = reactive<Record<string, BoardReportReason>>({})
const reportInteractionDetails = reactive<Record<string, string>>({})
const reportInteractionErrors = reactive<Record<string, BoardFormErrorState | null>>({})
const reportInteractionNotices = reactive<Record<string, string>>({})
const reportInteractionPending = reactive<Record<string, boolean>>({})

const deleteError = ref<BoardFormErrorState | null>(null)
const deletePending = ref(false)
const resolveError = ref<BoardFormErrorState | null>(null)
const resolvePending = ref(false)

const routeParamItemId = computed(() => {
  const value = (route.params as Record<string, unknown>).id

  if (Array.isArray(value))
    return typeof value[0] === 'string' ? value[0] : ''

  return typeof value === 'string' ? value : ''
})

const routeItemId = computed(() =>
  routeParamItemId.value || getQueryValue(route.query.id) || getQueryValue(route.query.manageItem),
)
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
  interactionsError.value = null
  refreshStoredDeleteToken()

  if (nextItem.resolutionStatus !== 'open')
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
    interactionCount: Math.max(0, item.value.interactionCount - 1),
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

function ensureInteractionReportState(interactionId: string) {
  if (!(interactionId in reportInteractionOpen))
    reportInteractionOpen[interactionId] = false

  if (!(interactionId in reportInteractionReason))
    reportInteractionReason[interactionId] = 'spam'

  if (!(interactionId in reportInteractionDetails))
    reportInteractionDetails[interactionId] = ''

  if (!(interactionId in reportInteractionPending))
    reportInteractionPending[interactionId] = false

  if (!(interactionId in reportInteractionErrors))
    reportInteractionErrors[interactionId] = null

  if (!(interactionId in reportInteractionNotices))
    reportInteractionNotices[interactionId] = ''
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

function getResolutionActionLabel(nextStatus: BoardItem['resolutionStatus']) {
  if (resolvePending.value)
    return 'Saving...'

  if (nextStatus === 'fulfilled')
    return 'Mark fulfilled'

  if (nextStatus === 'closed')
    return 'Close post'

  return 'Reopen post'
}

function getResolvedNote(currentItem: BoardItem) {
  const changedAt = currentItem.resolutionChangedAt || currentItem.lastActivityAt

  if (currentItem.resolutionStatus === 'fulfilled')
    return `Fulfilled ${formatBoardDate(changedAt)}. Replies are closed until this post is reopened.`

  return `Closed ${formatBoardDate(changedAt)}. Replies are closed until this post is reopened.`
}

function getResolutionBadgeLabel(currentItem: BoardItem) {
  return currentItem.resolutionStatus === 'fulfilled' ? 'Fulfilled' : 'Closed'
}

function toggleItemReportForm() {
  itemReportOpen.value = !itemReportOpen.value
  itemReportError.value = null
  itemReportNotice.value = ''
}

function toggleInteractionReportForm(interactionId: string) {
  ensureInteractionReportState(interactionId)
  reportInteractionOpen[interactionId] = !reportInteractionOpen[interactionId]
  reportInteractionErrors[interactionId] = null
  reportInteractionNotices[interactionId] = ''
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
  interactionsError.value = null

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

async function loadMoreInteractions() {
  const currentItem = item.value
  const cursor = currentItem?.interactionPage?.nextCursor

  if (!currentItem || !cursor || interactionsPending.value)
    return

  const endpoint = `${getBoardEndpoint(runtimeConfig.public.apiBaseUrl, `items/${currentItem.id}`)}?after=${encodeURIComponent(cursor)}`
  interactionsPending.value = true
  interactionsError.value = null

  try {
    const response = await $fetch<BoardItemDetailResponse>(endpoint, {
      credentials: 'include',
    })

    if (!item.value || response.item.id !== currentItem.id || item.value.id !== currentItem.id || item.value.interactionPage?.nextCursor !== cursor)
      return

    const loadedIds = new Set(item.value.interactions.map(interaction => interaction.id))
    item.value = {
      ...item.value,
      interactionCount: response.item.interactionCount,
      interactionPage: response.item.interactionPage,
      interactions: [
        ...item.value.interactions,
        ...response.item.interactions.filter(interaction => !loadedIds.has(interaction.id)),
      ],
    }
  }
  catch (error) {
    if (item.value?.id === currentItem.id)
      interactionsError.value = getBoardApiErrorState(error, endpoint, 'Unable to load older responses right now.', applyServerContext)
  }
  finally {
    interactionsPending.value = false
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
      path: routeItemId.value ? getBoardDetailPath(routeItemId.value) : route.path,
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

async function submitItemReport() {
  if (!item.value)
    return

  const endpoint = getBoardEndpoint(runtimeConfig.public.apiBaseUrl, `items/${item.value.id}/report`)
  itemReportPending.value = true
  itemReportError.value = null
  itemReportNotice.value = ''

  try {
    const response = await protectedPost<BoardReportResponse>(endpoint, {
      'bot-field': '',
      'details': itemReportDetails.value,
      'reason': itemReportReason.value,
    })

    applyServerContext(response)
    itemReportOpen.value = false
    itemReportDetails.value = ''
    itemReportReason.value = 'spam'
    itemReportNotice.value = 'Report saved for admin review.'
  }
  catch (error) {
    itemReportError.value = getBoardApiErrorState(error, endpoint, 'We could not save that report right now.', applyServerContext)
  }
  finally {
    itemReportPending.value = false
  }
}

async function submitInteractionReport(interactionId: string) {
  if (!item.value)
    return

  ensureInteractionReportState(interactionId)
  const endpoint = getBoardEndpoint(runtimeConfig.public.apiBaseUrl, `items/${item.value.id}/interactions/${interactionId}/report`)
  reportInteractionPending[interactionId] = true
  reportInteractionErrors[interactionId] = null
  reportInteractionNotices[interactionId] = ''

  try {
    const response = await protectedPost<BoardReportResponse>(endpoint, {
      'bot-field': '',
      'details': reportInteractionDetails[interactionId] || '',
      'reason': reportInteractionReason[interactionId] || 'spam',
    })

    applyServerContext(response)
    reportInteractionOpen[interactionId] = false
    reportInteractionDetails[interactionId] = ''
    reportInteractionReason[interactionId] = 'spam'
    reportInteractionNotices[interactionId] = 'Reply report saved for admin review.'
  }
  catch (error) {
    reportInteractionErrors[interactionId] = getBoardApiErrorState(error, endpoint, 'We could not save that report right now.', applyServerContext)
  }
  finally {
    reportInteractionPending[interactionId] = false
  }
}

async function updateBoardResolution(nextStatus: BoardItem['resolutionStatus']) {
  if (!item.value)
    return

  if (item.value.resolutionStatus === nextStatus)
    return

  const endpoint = getBoardEndpoint(runtimeConfig.public.apiBaseUrl, `items/${item.value.id}/resolution`)
  resolvePending.value = true
  resolveError.value = null

  try {
    const response = await protectedPost<BoardItemResolutionResponse>(endpoint, {
      'bot-field': '',
      'deleteToken': storedDeleteToken.value,
      'status': nextStatus,
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

  if (openReply.value) {
    void nextTick(() => {
      replyMessageElement.value?.focus({ preventScroll: true })
      replyMessageElement.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }
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

  const pendingManagementClaim = consumePendingManagementClaim()
  const managementItemId = pendingManagementClaim?.itemId || routeItemId.value
  const managementToken = pendingManagementClaim?.managementToken || routeManagementToken.value

  if (managementItemId && managementToken)
    void claimBoardManagementLink(managementItemId, managementToken)
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
  itemReportOpen.value = false
  itemReportReason.value = 'spam'
  itemReportDetails.value = ''
  itemReportError.value = null
  itemReportNotice.value = ''
  deleteError.value = null
  resolveError.value = null
  openReply.value = false
  confirmDelete.value = false
  confirmDeleteInteractionKey.value = null
  Object.keys(reportInteractionOpen).forEach((key) => {
    reportInteractionOpen[key] = false
    reportInteractionReason[key] = 'spam'
    reportInteractionDetails[key] = ''
    reportInteractionErrors[key] = null
    reportInteractionNotices[key] = ''
    reportInteractionPending[key] = false
  })
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
  <div class="post-page container" :class="item ? getPostType(item.kind).tone : undefined">
    <header class="page-header post-page__header">
      <NuxtLink class="back-link" prefetch-on="interaction" to="/#live-board">
        <span aria-hidden="true" class="i-carbon-arrow-left" />
        Live board
      </NuxtLink>

      <div v-if="item" class="post-page__badges">
        <span class="badge badge--kind">
          <span aria-hidden="true" :class="getPostType(item.kind).icon" />
          {{ item.kindLabel }}
        </span>
        <span
          v-if="item.resolutionStatus !== 'open'"
          class="badge"
          :class="item.resolutionStatus === 'fulfilled' ? 'badge--success' : 'badge--muted'"
        >{{ getResolutionBadgeLabel(item) }}</span>
      </div>

      <h1>
        {{ pageHeading }}
      </h1>

      <p v-if="item" class="post-page__byline">
        <span>{{ item.author.displayName }}</span>
        <span v-if="item.author.hasAccount" class="badge badge--muted">Member</span>
        <span aria-hidden="true">·</span>
        <time :datetime="item.createdAt" :title="formatBoardDate(item.createdAt)">
          Posted {{ formatRelativeTime(item.createdAt) }}
        </time>
        <span aria-hidden="true">·</span>
        <span>{{ formatReplyCount(item.interactionCount) }}</span>
      </p>
    </header>

    <div class="post-page__notices">
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
    </div>

    <div v-if="!itemLoaded || itemPending" class="post-page__empty" role="status">
      Loading this board post...
    </div>

    <div v-else-if="itemError" class="post-page__empty inline-note--error" role="alert">
      <p>{{ itemError.message }}</p>
      <p>{{ itemError.detail }}</p>
    </div>

    <div v-else-if="item" class="post-page__layout">
      <div class="post-page__main">
        <article class="post-details surface" aria-labelledby="post-details-heading">
          <h2 id="post-details-heading" class="post-details__label">
            {{ item.summaryLabel }}
          </h2>
          <p class="post-details__summary">
            {{ item.summary }}
          </p>

          <dl v-if="item.attributes.length" class="post-details__facts">
            <div v-for="attribute in item.attributes" :key="`${item.id}-${attribute.label}`">
              <dt>{{ attribute.label }}</dt>
              <dd>{{ attribute.value }}</dd>
            </div>
          </dl>

          <p v-if="item.resolutionStatus !== 'open'" class="inline-note">
            {{ getResolvedNote(item) }}
          </p>
        </article>

        <section class="post-thread" aria-labelledby="post-thread-heading">
          <h2 id="post-thread-heading" class="post-thread__heading">
            Responses
            <span class="badge badge--muted">{{ item.interactionCount }}</span>
          </h2>

          <ol v-if="item.interactions.length" class="thread-list">
            <li v-for="interaction in item.interactions" :key="interaction.id" class="thread-item">
              <div class="thread-item__header">
                <strong>{{ interaction.author.displayName }}</strong>
                <span v-if="interaction.author.hasAccount" class="badge badge--muted">Member</span>
                <time :datetime="interaction.createdAt" :title="formatBoardDate(interaction.createdAt)">
                  {{ formatRelativeTime(interaction.createdAt) }}
                </time>
              </div>
              <p class="thread-item__message">
                {{ interaction.message }}
              </p>
              <div class="thread-item__actions">
                <button
                  class="button button--quiet button--small"
                  :disabled="revealPending[getRevealKey(item.id, interaction.id)]"
                  type="button"
                  @click="revealInteractionContact(interaction.id)"
                >
                  {{ getInteractionContactActionLabel(interaction.id) }}
                </button>
                <button
                  v-if="canDeleteInteraction(interaction)"
                  class="button button--quiet button--small thread-item__danger"
                  :disabled="deleteInteractionPending[getInteractionDeleteKey(item.id, interaction.id)]"
                  type="button"
                  @click="deleteBoardInteraction(interaction.id)"
                >
                  {{ getDeleteInteractionActionLabel(interaction.id) }}
                </button>
                <button
                  class="button button--quiet button--small thread-item__report"
                  type="button"
                  @click="toggleInteractionReportForm(interaction.id)"
                >
                  {{
                    reportInteractionOpen[interaction.id]
                      ? "Hide report form"
                      : "Report reply"
                  }}
                </button>
              </div>
              <form
                v-if="reportInteractionOpen[interaction.id]"
                class="report-form"
                :aria-busy="reportInteractionPending[interaction.id]"
                @submit.prevent="submitInteractionReport(interaction.id)"
              >
                <label class="field">
                  <span class="field__label">Reason</span>
                  <select v-model="reportInteractionReason[interaction.id]">
                    <option
                      v-for="option in boardReportReasonOptions"
                      :key="option.value"
                      :value="option.value"
                    >
                      {{ option.label }}
                    </option>
                  </select>
                </label>

                <label class="field">
                  <span class="field__label">Details <span class="field__optional">(optional)</span></span>
                  <textarea
                    v-model="reportInteractionDetails[interaction.id]"
                    rows="3"
                  />
                </label>

                <button
                  class="button button--secondary button--small"
                  :disabled="reportInteractionPending[interaction.id]"
                  type="submit"
                >
                  {{
                    reportInteractionPending[interaction.id]
                      ? "Sending report..."
                      : "Send report"
                  }}
                </button>
              </form>
              <p v-if="revealErrors[getRevealKey(item.id, interaction.id)]" class="inline-note inline-note--error" role="alert">
                {{ revealErrors[getRevealKey(item.id, interaction.id)]?.message }} {{ revealErrors[getRevealKey(item.id, interaction.id)]?.detail }}
              </p>
              <p v-if="deleteInteractionErrors[getInteractionDeleteKey(item.id, interaction.id)]" class="inline-note inline-note--error" role="alert">
                {{ deleteInteractionErrors[getInteractionDeleteKey(item.id, interaction.id)]?.message }} {{ deleteInteractionErrors[getInteractionDeleteKey(item.id, interaction.id)]?.detail }}
              </p>
              <p v-if="reportInteractionErrors[interaction.id]" class="inline-note inline-note--error" role="alert">
                {{ reportInteractionErrors[interaction.id]?.message }} {{ reportInteractionErrors[interaction.id]?.detail }}
              </p>
              <p v-if="reportInteractionNotices[interaction.id]" class="inline-note inline-note--success" role="status">
                {{ reportInteractionNotices[interaction.id] }}
              </p>
              <p v-if="isInteractionContactVisible(interaction.id)" class="inline-note inline-note--success" role="status">
                Contact: {{ revealInteractionContacts[getRevealKey(item.id, interaction.id)] }}
              </p>
            </li>
          </ol>

          <p v-else class="post-thread__empty">
            No responses yet.
          </p>
          <button
            v-if="item.interactionPage?.hasMore"
            class="button button--secondary"
            :disabled="interactionsPending"
            type="button"
            @click="loadMoreInteractions"
          >
            {{ interactionsPending ? 'Loading older responses...' : 'Load older responses' }}
          </button>
          <p v-if="interactionsError" class="inline-note inline-note--error" role="alert">
            {{ interactionsError.message }} {{ interactionsError.detail }}
          </p>

          <section
            v-if="openReply && canReplyToItem(item)"
            class="reply-panel surface"
            aria-labelledby="reply-heading"
          >
            <h3 id="reply-heading">
              {{ getReplyActionLabel(item.kind) }}
            </h3>

            <form
              class="reply-form"
              :aria-busy="replyStatus.pending"
              @submit.prevent="submitBoardReply"
            >
              <p class="sr-only">
                <label>Do not fill this field if you are human. <input v-model="replyDraft['bot-field']" name="bot-field" type="text"></label>
              </p>

              <label class="field">
                <span class="field__label">Message</span>
                <textarea ref="replyMessageElement" v-model="replyDraft.message" required rows="5" />
              </label>

              <p class="form-section__note">
                Replies are public. Other visitors can reveal your contact details.
              </p>

              <div class="field-grid">
                <label class="field field--wide">
                  <span class="field__label">Your name</span>
                  <input v-model="replyDraft.name" :required="!viewer" autocomplete="name" placeholder="Jane Smith" type="text">
                </label>

                <label class="field">
                  <span class="field__label">Contact method</span>
                  <select v-model="replyDraft.contact_method" :required="!viewer">
                    <option v-for="option in boardContactMethodOptions" :key="option.value" :value="option.value">
                      {{ option.label }}
                    </option>
                  </select>
                </label>

                <label class="field">
                  <span class="field__label">
                    {{ getBoardContactValueLabel(replyDraft.contact_method) }}
                    <span v-if="viewer" class="field__optional">(optional when signed in)</span>
                  </span>
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
                  <span class="field__label">Contact note <span class="field__optional">(optional)</span></span>
                  <input v-model="replyDraft.contact_note" placeholder="Text first or evenings." type="text">
                </label>
              </div>

              <p v-if="replyStatus.error" class="inline-note inline-note--error" role="alert">
                {{ replyStatus.error.message }} {{ replyStatus.error.detail }}
              </p>
              <p v-if="replyStatus.success" class="inline-note inline-note--success" role="status">
                Your response is now on the board.
              </p>

              <button class="button button--primary reply-form__submit" :disabled="replyStatus.pending" type="submit">
                {{ replyStatus.pending ? 'Posting response...' : 'Post board response' }}
              </button>
            </form>
          </section>
        </section>
      </div>

      <aside class="post-page__sidebar" aria-label="Post actions">
        <div class="post-actions surface">
          <button
            v-if="canReplyToItem(item)"
            :aria-expanded="openReply"
            class="button button--primary button--block"
            type="button"
            @click="openReplyForm"
          >
            {{ openReply ? 'Hide reply form' : getReplyActionLabel(item.kind) }}
          </button>
          <button
            class="button button--secondary button--block"
            :disabled="revealItemPending"
            type="button"
            @click="revealCurrentItemContact"
          >
            {{ getItemContactActionLabel(item) }}
          </button>

          <p v-if="revealItemContact && revealItemContactVisible" class="inline-note inline-note--success" role="status">
            Contact: {{ revealItemContact }}
          </p>
          <p v-if="revealItemError" class="inline-note inline-note--error" role="alert">
            {{ revealItemError.message }} {{ revealItemError.detail }}
          </p>

          <div
            v-if="canResolveItem(item) || canDeleteItem(item)"
            class="post-actions__group"
          >
            <h2>Manage your post</h2>
            <button
              v-if="canResolveItem(item) && item.resolutionStatus !== 'fulfilled'"
              class="button button--secondary button--block"
              :disabled="resolvePending"
              type="button"
              @click="updateBoardResolution('fulfilled')"
            >
              {{ getResolutionActionLabel('fulfilled') }}
            </button>
            <button
              v-if="canResolveItem(item) && item.resolutionStatus !== 'closed'"
              class="button button--secondary button--block"
              :disabled="resolvePending"
              type="button"
              @click="updateBoardResolution('closed')"
            >
              {{ getResolutionActionLabel('closed') }}
            </button>
            <button
              v-if="canResolveItem(item) && item.resolutionStatus !== 'open'"
              class="button button--secondary button--block"
              :disabled="resolvePending"
              type="button"
              @click="updateBoardResolution('open')"
            >
              {{ getResolutionActionLabel('open') }}
            </button>
            <button
              v-if="canDeleteItem(item)"
              class="button button--danger button--block"
              :disabled="deletePending"
              type="button"
              @click="deleteBoardPost"
            >
              {{ getDeleteActionLabel() }}
            </button>
            <p v-if="deleteError" class="inline-note inline-note--error" role="alert">
              {{ deleteError.message }} {{ deleteError.detail }}
            </p>
            <p v-if="resolveError" class="inline-note inline-note--error" role="alert">
              {{ resolveError.message }} {{ resolveError.detail }}
            </p>
          </div>

          <div class="post-actions__report">
            <button
              :aria-expanded="itemReportOpen"
              class="button button--quiet button--small"
              type="button"
              @click="toggleItemReportForm"
            >
              <span aria-hidden="true" class="i-carbon-flag" />
              {{ itemReportOpen ? "Hide report form" : "Report post" }}
            </button>

            <form
              v-if="itemReportOpen"
              class="report-form"
              :aria-busy="itemReportPending"
              @submit.prevent="submitItemReport"
            >
              <label class="field">
                <span class="field__label">Reason</span>
                <select v-model="itemReportReason">
                  <option
                    v-for="option in boardReportReasonOptions"
                    :key="option.value"
                    :value="option.value"
                  >
                    {{ option.label }}
                  </option>
                </select>
              </label>

              <label class="field">
                <span class="field__label">Details <span class="field__optional">(optional)</span></span>
                <textarea
                  v-model="itemReportDetails"
                  rows="3"
                />
              </label>

              <button
                class="button button--secondary button--small"
                :disabled="itemReportPending"
                type="submit"
              >
                {{ itemReportPending ? "Sending report..." : "Send report" }}
              </button>
            </form>
            <p v-if="itemReportError" class="inline-note inline-note--error" role="alert">
              {{ itemReportError.message }} {{ itemReportError.detail }}
            </p>
            <p v-if="itemReportNotice" class="inline-note inline-note--success" role="status">
              {{ itemReportNotice }}
            </p>
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.post-page__header {
  max-width: var(--content-narrow);
}

.post-page__badges,
.post-page__byline {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem 0.5rem;
}

.post-page__byline {
  color: var(--site-subtle);
  font-size: var(--text-sm);
}

.post-page__notices {
  display: grid;
  gap: 0.6rem;
  margin-bottom: 1rem;
}

.post-page__notices:empty {
  display: none;
}

.post-page__empty {
  display: grid;
  gap: 0.5rem;
  padding: 1.5rem;
  border: 1px dashed var(--field-border);
  border-radius: var(--radius-lg);
  color: var(--site-subtle);
}

.post-page__layout {
  display: grid;
  grid-template-columns: minmax(0, 46rem) minmax(15rem, 20rem);
  justify-content: space-between;
  gap: 1.5rem clamp(1.5rem, 4vw, 3.5rem);
  align-items: start;
}

.post-page__main {
  display: grid;
  gap: 2rem;
  min-width: 0;
}

.post-details {
  display: grid;
  gap: 1rem;
  padding: clamp(1.1rem, 3vw, 1.75rem);
  border-top: 3px solid var(--kind, var(--card-border));
}

.post-details__label {
  color: var(--site-subtle);
  font-size: var(--text-sm);
  font-weight: 700;
}

.post-details__summary {
  color: var(--site-heading);
  font-size: var(--text-lg);
  line-height: 1.6;
  white-space: pre-line;
  overflow-wrap: anywhere;
}

.post-details__facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr));
  gap: 1rem;
  margin: 0;
  padding-top: 1rem;
  border-top: 1px solid var(--divider);
}

.post-details__facts dt {
  color: var(--site-subtle);
  font-size: var(--text-xs);
  font-weight: 600;
}

.post-details__facts dd {
  margin: 0.15rem 0 0;
  color: var(--site-heading);
  font-weight: 600;
  overflow-wrap: anywhere;
}

.post-thread {
  display: grid;
  gap: 1rem;
  justify-items: start;
}

.post-thread > * {
  width: 100%;
}

.post-thread > .button {
  width: auto;
}

.post-thread__heading {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: var(--text-lg);
  font-weight: 700;
}

.post-thread__empty {
  color: var(--site-subtle);
}

.thread-list {
  display: grid;
  gap: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}

.thread-item {
  display: grid;
  gap: 0.5rem;
  padding: 1rem 0;
  border-bottom: 1px solid var(--divider);
}

.thread-item:first-child {
  padding-top: 0;
}

.thread-item__header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem 0.6rem;
}

.thread-item__header strong {
  color: var(--site-heading);
}

.thread-item__header time {
  color: var(--site-subtle);
  font-size: var(--text-sm);
}

.thread-item__message {
  white-space: pre-line;
  overflow-wrap: anywhere;
}

.thread-item__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  margin-left: -0.65rem;
}

.thread-item__report {
  color: var(--site-subtle);
}

.thread-item__danger {
  color: var(--site-error-text);
}

.reply-panel {
  display: grid;
  gap: 1rem;
  padding: clamp(1.1rem, 3vw, 1.75rem);
}

.reply-panel h3 {
  font-size: var(--text-lg);
  font-weight: 700;
}

.reply-form {
  display: grid;
  gap: 1rem;
}

.reply-form__submit {
  justify-self: start;
}

.post-page__sidebar {
  position: sticky;
  top: 5.5rem;
  min-width: 0;
}

.post-actions {
  display: grid;
  gap: 0.6rem;
  padding: 1.1rem;
}

.post-actions__group {
  display: grid;
  gap: 0.5rem;
  padding-top: 0.9rem;
  margin-top: 0.3rem;
  border-top: 1px solid var(--divider);
}

.post-actions__group h2 {
  color: var(--site-subtle);
  font-size: var(--text-sm);
  font-weight: 700;
}

.post-actions__report {
  display: grid;
  gap: 0.6rem;
  justify-items: start;
  padding-top: 0.6rem;
  border-top: 1px solid var(--divider);
}

.post-actions__report > .button {
  margin-left: -0.4rem;
  color: var(--site-subtle);
}

.post-actions__report > * {
  max-width: 100%;
}

.report-form {
  display: grid;
  gap: 0.75rem;
  width: 100%;
  padding: 0.9rem;
  border: 1px solid var(--card-border);
  border-radius: var(--radius-md);
  background: var(--site-surface-soft);
}

.report-form .button {
  justify-self: start;
}

@media (max-width: 900px) {
  .post-page__layout {
    grid-template-columns: minmax(0, 1fr);
  }

  /* Read the post, then act, then the thread. */
  .post-page__main {
    display: contents;
  }

  .post-details {
    order: 1;
  }

  .post-page__sidebar {
    position: static;
    order: 2;
  }

  .post-thread {
    order: 3;
  }
}

@media (max-width: 640px) {
  .reply-form__submit {
    justify-self: stretch;
  }
}
</style>
