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
  BoardItemCounts,
  BoardItemResolutionResponse,
  BoardItemsPagination,
  BoardItemsResponse,
  ViewerAccount,
} from '~/utils/board'
import type { BoardFormErrorState, BoardFormStatus, BoardReplyDraft } from '~/utils/boardUi'
import type { SubmissionKind } from '~/utils/submissions'
import { isAntiBotChallenge, isAntiBotChallengeExpired, markAntiBotChallengeObserved, waitForAntiBotChallengeMinimumAge } from '~/utils/antiBot'
import { forgetBoardDeleteToken, getBoardEndpoint, getStoredBoardDeleteToken, listStoredBoardDeleteTokenIds, rememberBoardDeleteToken } from '~/utils/board'
import { formatBoardDate, getBoardApiErrorState, getBoardDetailPath, getContactActionLabel, getInteractionDeleteKey, getReplyActionLabel, getRevealKey } from '~/utils/boardUi'
import {
  boardContactMethodOptions,
  getBoardContactValueAutocomplete,
  getBoardContactValueInputMode,
  getBoardContactValueLabel,
  getBoardContactValuePlaceholder,
  getBoardContactValueType,
} from '~/utils/contact'
import { submissionKinds } from '~/utils/submissions'

type BoardFilter = 'all' | SubmissionKind

definePageMeta({
  layout: 'home',
})

useSeoMeta({
  title: 'Live request board for service projects, borrowing, and lending',
  description: 'Post service projects, borrow requests, and lending offers on a live community board. Anonymous use is open, and optional accounts are available for repeat participants.',
})

const runtimeConfig = useRuntimeConfig()
const route = useRoute()
const router = useRouter()

const hasHydrated = ref(false)
const antiBotChallenge = ref<AntiBotChallenge | null>(null)
const viewer = ref<ViewerAccount | null>(null)
const boardItems = ref<BoardItem[]>([])
const boardLoaded = ref(false)
const boardPending = ref(false)
const bootstrapLoaded = ref(false)
const boardError = ref<BoardFormErrorState | null>(null)
const securityError = ref<BoardFormErrorState | null>(null)
const boardFilter = ref<BoardFilter>('all')
const boardCounts = ref<BoardItemCounts>({
  all: 0,
  [submissionKinds.service]: 0,
  [submissionKinds.itemRequest]: 0,
  [submissionKinds.itemLending]: 0,
})
const boardPagination = ref<BoardItemsPagination>({
  hasNextPage: false,
  hasPreviousPage: false,
  page: 1,
  pageSize: 12,
  totalItems: 0,
  totalPages: 1,
})
const managementNotice = ref('')
const managementPending = ref(false)
const managementError = ref<BoardFormErrorState | null>(null)
const openReplyItemId = ref<string | null>(null)
const confirmDeleteItemId = ref<string | null>(null)
const confirmDeleteInteractionKey = ref<string | null>(null)

const replyDrafts = reactive<Record<string, BoardReplyDraft>>({})
const replyStatuses = reactive<Record<string, BoardFormStatus>>({})
const revealItemContacts = reactive<Record<string, string>>({})
const revealInteractionContacts = reactive<Record<string, string>>({})
const revealItemContactVisibility = reactive<Record<string, boolean>>({})
const revealInteractionContactVisibility = reactive<Record<string, boolean>>({})
const revealErrors = reactive<Record<string, BoardFormErrorState | null>>({})
const revealPending = reactive<Record<string, boolean>>({})
const deleteErrors = reactive<Record<string, BoardFormErrorState | null>>({})
const deletePending = reactive<Record<string, boolean>>({})
const deleteInteractionErrors = reactive<Record<string, BoardFormErrorState | null>>({})
const deleteInteractionPending = reactive<Record<string, boolean>>({})
const resolveErrors = reactive<Record<string, BoardFormErrorState | null>>({})
const resolvePending = reactive<Record<string, boolean>>({})
const storedDeleteTokenItemIds = ref<string[]>([])

const boardFilters = [
  { key: 'all' as const, label: 'All posts' },
  { key: submissionKinds.service, label: 'Service projects' },
  { key: submissionKinds.itemRequest, label: 'Borrow requests' },
  { key: submissionKinds.itemLending, label: 'Items to lend' },
]

const placeholderBoardCounts: BoardItemCounts = {
  all: 0,
  [submissionKinds.service]: 0,
  [submissionKinds.itemRequest]: 0,
  [submissionKinds.itemLending]: 0,
}

const boardUiReady = computed(() => hasHydrated.value && boardLoaded.value)
const accountUiReady = computed(() => hasHydrated.value && bootstrapLoaded.value)
const displayBoardCounts = computed<BoardItemCounts>(() => (
  boardUiReady.value && !boardError.value ? boardCounts.value : placeholderBoardCounts
))
const activeBoardTotal = computed(() => (
  boardFilter.value === 'all'
    ? displayBoardCounts.value.all
    : displayBoardCounts.value[boardFilter.value]
))
const boardAudienceNote = computed(() => {
  if (!accountUiReady.value)
    return 'Board tools load after the page initializes.'

  return viewer.value
    ? 'You can reply with your account or anonymously.'
    : 'You can reply anonymously right now, even without signing in.'
})

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
      'contact_method': 'email',
      'contact_note': '',
      'contact_value': viewer.value?.email || '',
      'message': '',
      'name': viewer.value?.displayName || '',
    }
  }

  if (viewer.value) {
    if (!replyDrafts[itemId].name)
      replyDrafts[itemId].name = viewer.value.displayName

    if (!replyDrafts[itemId].contact_value)
      replyDrafts[itemId].contact_value = viewer.value.email
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

function ensureDeleteState(itemId: string) {
  if (!(itemId in deletePending))
    deletePending[itemId] = false

  if (!(itemId in deleteErrors))
    deleteErrors[itemId] = null
}

function ensureInteractionDeleteState(key: string) {
  if (!(key in deleteInteractionPending))
    deleteInteractionPending[key] = false

  if (!(key in deleteInteractionErrors))
    deleteInteractionErrors[key] = null
}

function ensureResolutionState(itemId: string) {
  if (!(itemId in resolvePending))
    resolvePending[itemId] = false

  if (!(itemId in resolveErrors))
    resolveErrors[itemId] = null
}

function ensureRevealState(key: string) {
  if (!(key in revealPending))
    revealPending[key] = false

  if (!(key in revealErrors))
    revealErrors[key] = null
}

function isItemContactVisible(itemId: string) {
  return Boolean(revealItemContactVisibility[itemId] && revealItemContacts[itemId])
}

function isInteractionContactVisible(itemId: string, interactionId: string) {
  const key = getRevealKey(itemId, interactionId)
  return Boolean(revealInteractionContactVisibility[key] && revealInteractionContacts[key])
}

function getItemContactActionLabel(item: BoardItem) {
  if (revealPending[item.id])
    return 'Revealing...'

  if (isItemContactVisible(item.id))
    return item.kind === submissionKinds.itemLending ? 'Hide lender contact' : 'Hide contact'

  return getContactActionLabel(item.kind)
}

function getInteractionContactActionLabel(itemId: string, interactionId: string) {
  const key = getRevealKey(itemId, interactionId)

  if (revealPending[key])
    return 'Revealing...'

  if (isInteractionContactVisible(itemId, interactionId))
    return 'Hide reply contact'

  return 'Reveal reply contact'
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
  finally {
    bootstrapLoaded.value = true
  }
}

async function loadBoardItems() {
  const endpoint = new URL(getBoardEndpoint(runtimeConfig.public.apiBaseUrl, 'items'))
  endpoint.searchParams.set('kind', boardFilter.value)
  endpoint.searchParams.set('page', String(boardPagination.value.page))
  endpoint.searchParams.set('pageSize', String(boardPagination.value.pageSize))
  boardPending.value = true
  boardError.value = null

  try {
    const response = await $fetch<BoardItemsResponse>(endpoint.toString(), {
      credentials: 'include',
    })

    boardCounts.value = response.counts
    boardPagination.value = response.pagination
    boardItems.value = sortBoardItems(response.items)
  }
  catch (error) {
    boardError.value = getBoardApiErrorState(error, endpoint.toString(), 'Unable to load the live board right now.', applyServerContext)
  }
  finally {
    boardPending.value = false
    boardLoaded.value = true
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
    refreshStoredDeleteTokenIds()
    managementNotice.value = 'Management access for this post is now saved in this browser. You can delete it from the live board.'
  }
  catch (error) {
    managementError.value = getBoardApiErrorState(error, endpoint, 'We could not claim that management link right now.', applyServerContext)
  }
  finally {
    managementPending.value = false

    await router.replace({
      hash: '#live-board',
      path: route.path,
      query: {
        ...route.query,
        filter: boardFilter.value === 'all' ? undefined : boardFilter.value,
        manageItem: undefined,
        manageToken: undefined,
        page: boardPagination.value.page > 1 ? String(boardPagination.value.page) : undefined,
      },
    })
  }
}

function refreshStoredDeleteTokenIds() {
  storedDeleteTokenItemIds.value = listStoredBoardDeleteTokenIds()
}

function canDeleteItem(item: BoardItem) {
  if (viewer.value?.isAdmin)
    return true

  if (viewer.value && item.author.accountId && viewer.value.id === item.author.accountId)
    return true

  return storedDeleteTokenItemIds.value.includes(item.id)
}

function canResolveItem(item: BoardItem) {
  return canDeleteItem(item)
}

function canDeleteInteraction(interaction: BoardItem['interactions'][number]) {
  if (viewer.value?.isAdmin)
    return true

  return Boolean(viewer.value && interaction.author.accountId && viewer.value.id === interaction.author.accountId)
}

function canReplyToItem(item: BoardItem) {
  return item.resolutionStatus === 'open'
}

function getResolvedNote(item: BoardItem) {
  const resolvedAt = item.resolutionChangedAt || item.lastActivityAt
  return `This post was marked resolved ${formatBoardDate(resolvedAt)}. It stays visible for reference, and new public replies are closed until it is reopened.`
}

function getDeleteActionLabel(itemId: string) {
  if (deletePending[itemId])
    return 'Deleting...'

  if (confirmDeleteItemId.value === itemId)
    return 'Click again to delete'

  return 'Delete post'
}

function getDeleteInteractionActionLabel(itemId: string, interactionId: string) {
  const key = getInteractionDeleteKey(itemId, interactionId)

  if (deleteInteractionPending[key])
    return 'Deleting...'

  if (confirmDeleteInteractionKey.value === key)
    return 'Click again to delete'

  return 'Delete reply'
}

function getResolutionActionLabel(item: BoardItem) {
  if (resolvePending[item.id])
    return 'Saving...'

  return item.resolutionStatus === 'resolved' ? 'Mark open' : 'Mark resolved'
}

function removeInteractionFromBoard(itemId: string, interactionId: string) {
  boardItems.value = sortBoardItems(boardItems.value.map((item) => {
    if (item.id !== itemId)
      return item

    const remainingInteractions = item.interactions.filter(interaction => interaction.id !== interactionId)
    return {
      ...item,
      interactionCount: remainingInteractions.length,
      interactions: remainingInteractions,
      lastActivityAt: remainingInteractions[0]?.createdAt || item.createdAt,
    }
  }))
}

function replaceBoardItem(nextItem: BoardItem) {
  boardItems.value = sortBoardItems(boardItems.value.map(item => item.id === nextItem.id ? nextItem : item))
}

function getQueryValue(value: unknown) {
  if (Array.isArray(value))
    return getQueryValue(value[0])

  return typeof value === 'string' ? value : ''
}

function parseBoardFilter(value: string): BoardFilter {
  return value === submissionKinds.service || value === submissionKinds.itemRequest || value === submissionKinds.itemLending
    ? value
    : 'all'
}

function parsePositivePage(value: string) {
  const parsedValue = Number.parseInt(value, 10)

  if (!Number.isFinite(parsedValue) || parsedValue < 1)
    return 1

  return parsedValue
}

function syncBoardStateFromRoute() {
  let changed = false
  const nextBoardFilter = parseBoardFilter(getQueryValue(route.query.filter))
  const nextPage = parsePositivePage(getQueryValue(route.query.page))

  if (boardFilter.value !== nextBoardFilter) {
    boardFilter.value = nextBoardFilter
    changed = true
  }

  if (boardPagination.value.page !== nextPage) {
    boardPagination.value = {
      ...boardPagination.value,
      page: nextPage,
    }
    changed = true
  }

  return changed
}

async function pushBoardRouteState(nextState?: {
  filter?: BoardFilter
  page?: number
}) {
  const nextFilter = nextState?.filter ?? boardFilter.value
  const nextPage = Math.max(nextState?.page ?? boardPagination.value.page, 1)

  await router.push({
    hash: route.hash,
    path: route.path,
    query: {
      ...route.query,
      filter: nextFilter === 'all' ? undefined : nextFilter,
      page: nextPage > 1 ? String(nextPage) : undefined,
    },
  })
}

function setBoardFilter(nextFilter: BoardFilter) {
  if (boardFilter.value === nextFilter && boardPagination.value.page === 1)
    return

  void pushBoardRouteState({
    filter: nextFilter,
    page: 1,
  })
}

function changeBoardPage(nextPage: number) {
  const normalizedPage = Math.min(Math.max(nextPage, 1), boardPagination.value.totalPages)

  if (normalizedPage === boardPagination.value.page)
    return

  void pushBoardRouteState({
    page: normalizedPage,
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
    status.error = getBoardApiErrorState(error, endpoint, 'We could not post that board response right now.', applyServerContext)
  }
  finally {
    status.pending = false
  }
}

async function revealItemContact(item: BoardItem) {
  const key = getRevealKey(item.id)
  ensureRevealState(key)
  if (revealItemContacts[item.id]) {
    revealItemContactVisibility[item.id] = !isItemContactVisible(item.id)
    revealErrors[key] = null
    return
  }

  const endpoint = getBoardEndpoint(runtimeConfig.public.apiBaseUrl, `items/${item.id}/contact`)
  revealPending[key] = true
  revealErrors[key] = null

  try {
    const response = await protectedPost<BoardContactResponse>(endpoint, {
      'bot-field': '',
    })

    applyServerContext(response)
    revealItemContacts[item.id] = response.contact
    revealItemContactVisibility[item.id] = true
  }
  catch (error) {
    revealErrors[key] = getBoardApiErrorState(error, endpoint, 'We could not reveal that contact right now.', applyServerContext)
  }
  finally {
    revealPending[key] = false
  }
}

async function revealInteractionContact(itemId: string, interactionId: string) {
  const key = getRevealKey(itemId, interactionId)
  ensureRevealState(key)
  if (revealInteractionContacts[key]) {
    revealInteractionContactVisibility[key] = !isInteractionContactVisible(itemId, interactionId)
    revealErrors[key] = null
    return
  }

  const endpoint = getBoardEndpoint(runtimeConfig.public.apiBaseUrl, `items/${itemId}/interactions/${interactionId}/contact`)
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

async function toggleBoardResolution(item: BoardItem) {
  ensureResolutionState(item.id)
  const endpoint = getBoardEndpoint(runtimeConfig.public.apiBaseUrl, `items/${item.id}/resolution`)
  resolvePending[item.id] = true
  resolveErrors[item.id] = null

  try {
    const response = await protectedPost<BoardItemResolutionResponse>(endpoint, {
      'bot-field': '',
      'deleteToken': getStoredBoardDeleteToken(item.id),
      'status': item.resolutionStatus === 'resolved' ? 'open' : 'resolved',
    })

    applyServerContext(response)
    replaceBoardItem(response.item)

    if (response.item.resolutionStatus === 'resolved' && openReplyItemId.value === item.id)
      openReplyItemId.value = null
  }
  catch (error) {
    resolveErrors[item.id] = getBoardApiErrorState(error, endpoint, 'We could not update that post right now.', applyServerContext)
  }
  finally {
    resolvePending[item.id] = false
  }
}

async function deleteBoardPost(item: BoardItem) {
  if (confirmDeleteItemId.value !== item.id) {
    confirmDeleteItemId.value = item.id
    ensureDeleteState(item.id)
    deleteErrors[item.id] = null
    return
  }

  confirmDeleteItemId.value = null
  ensureDeleteState(item.id)
  const endpoint = getBoardEndpoint(runtimeConfig.public.apiBaseUrl, `items/${item.id}`)
  deletePending[item.id] = true
  deleteErrors[item.id] = null

  try {
    const response = await protectedDelete<BoardDeleteResponse>(endpoint, {
      'bot-field': '',
      'deleteToken': getStoredBoardDeleteToken(item.id),
    })

    applyServerContext(response)
    forgetBoardDeleteToken(item.id)
    refreshStoredDeleteTokenIds()
    revealItemContacts[item.id] = ''
    revealItemContactVisibility[item.id] = false

    for (const interaction of item.interactions) {
      const key = getRevealKey(item.id, interaction.id)
      revealInteractionContacts[key] = ''
      revealInteractionContactVisibility[key] = false
      revealErrors[key] = null
      revealPending[key] = false
    }

    deleteErrors[item.id] = null
    deletePending[item.id] = false

    if (openReplyItemId.value === item.id)
      openReplyItemId.value = null

    if (boardItems.value.length <= 1 && boardPagination.value.page > 1) {
      await pushBoardRouteState({
        page: boardPagination.value.page - 1,
      })
      return
    }

    await loadBoardItems()
  }
  catch (error) {
    confirmDeleteItemId.value = item.id
    deleteErrors[item.id] = getBoardApiErrorState(error, endpoint, 'We could not delete that board item right now.', applyServerContext)
  }
  finally {
    if (item.id in deletePending)
      deletePending[item.id] = false
  }
}

async function deleteBoardInteraction(item: BoardItem, interaction: BoardItem['interactions'][number]) {
  const key = getInteractionDeleteKey(item.id, interaction.id)

  if (confirmDeleteInteractionKey.value !== key) {
    confirmDeleteInteractionKey.value = key
    ensureInteractionDeleteState(key)
    deleteInteractionErrors[key] = null
    return
  }

  confirmDeleteInteractionKey.value = null
  ensureInteractionDeleteState(key)
  const endpoint = getBoardEndpoint(runtimeConfig.public.apiBaseUrl, `items/${item.id}/interactions/${interaction.id}`)
  deleteInteractionPending[key] = true
  deleteInteractionErrors[key] = null

  try {
    const response = await protectedDelete<BoardInteractionDeleteResponse>(endpoint, {
      'bot-field': '',
    })

    applyServerContext(response)
    removeInteractionFromBoard(item.id, interaction.id)
    deleteInteractionErrors[key] = null
  }
  catch (error) {
    confirmDeleteInteractionKey.value = key
    deleteInteractionErrors[key] = getBoardApiErrorState(error, endpoint, 'We could not delete that board response right now.', applyServerContext)
  }
  finally {
    deleteInteractionPending[key] = false
  }
}

function openReplyForm(item: BoardItem) {
  if (!canReplyToItem(item))
    return

  getReplyDraft(item.id)
  getReplyStatus(item.id)
  openReplyItemId.value = openReplyItemId.value === item.id ? null : item.id
}

watch(viewer, (nextViewer) => {
  if (!nextViewer)
    return

  for (const draft of Object.values(replyDrafts)) {
    if (!draft.name)
      draft.name = nextViewer.displayName

    if (!draft.contact_value)
      draft.contact_value = nextViewer.email
  }
})

onMounted(() => {
  hasHydrated.value = true
  refreshStoredDeleteTokenIds()
  syncBoardStateFromRoute()
  const manageItem = getQueryValue(route.query.manageItem)
  const manageToken = getQueryValue(route.query.manageToken)

  if (manageItem && manageToken)
    void claimBoardManagementLink(manageItem, manageToken)

  void Promise.allSettled([
    loadBootstrap(),
    loadBoardItems(),
  ])
})

watch(
  () => [
    getQueryValue(route.query.filter),
    getQueryValue(route.query.page),
  ],
  () => {
    if (!hasHydrated.value)
      return

    const changed = syncBoardStateFromRoute()

    if (changed)
      void loadBoardItems()
  },
)
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
            <NuxtLink prefetch-on="interaction" to="/service-request">
              Service project
            </NuxtLink>
            <NuxtLink prefetch-on="interaction" to="/item-request">
              Borrow item
            </NuxtLink>
            <NuxtLink prefetch-on="interaction" to="/item-lending">
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
              <strong>{{ displayBoardCounts.all }}</strong>
              <span>active community posts</span>
            </div>
            <div class="poster__lanes">
              <div>
                <small>service</small>
                <strong>{{ displayBoardCounts[submissionKinds.service] }}</strong>
              </div>
              <div>
                <small>borrow</small>
                <strong>{{ displayBoardCounts[submissionKinds.itemRequest] }}</strong>
              </div>
              <div>
                <small>lend</small>
                <strong>{{ displayBoardCounts[submissionKinds.itemLending] }}</strong>
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
            :disabled="boardPending"
            class="board-filter" :class="[{ 'board-filter--active': boardFilter === filter.key }]"
            type="button"
            @click="setBoardFilter(filter.key)"
          >
            <span>{{ filter.label }}</span>
            <strong>{{ displayBoardCounts[filter.key] }}</strong>
          </button>
        </div>
      </div>

      <div class="live-board__layout">
        <div class="board-feed">
          <p v-if="securityError" class="inline-note inline-note--error" role="alert">
            {{ securityError.message }} {{ securityError.detail }}
          </p>
          <p v-if="managementNotice" class="inline-note inline-note--success" role="status">
            {{ managementNotice }}
          </p>
          <p v-if="managementError" class="inline-note inline-note--error" role="alert">
            {{ managementError.message }} {{ managementError.detail }}
          </p>

          <div class="board-feed__meta">
            <p>
              {{ activeBoardTotal }} {{ boardFilter === 'all' ? 'live posts' : 'matching posts' }}
            </p>
            <p>
              {{ boardAudienceNote }}
            </p>
            <p v-if="managementPending">
              Claiming management access...
            </p>
            <p v-else-if="boardPending && boardUiReady">
              Refreshing this board view...
            </p>
          </div>

          <div v-if="!boardUiReady" class="board-empty board-empty--loading" role="status">
            Loading the live board...
          </div>

          <div v-else-if="boardError" class="board-empty board-empty--error" role="alert">
            <p>{{ boardError.message }}</p>
            <p>{{ boardError.detail }}</p>
          </div>

          <div v-else-if="!boardItems.length" class="board-empty">
            <p>No posts match this filter yet.</p>
            <p>
              Create the first one from the dedicated
              <NuxtLink prefetch-on="interaction" to="/service-request">
                service project
              </NuxtLink>,
              <NuxtLink prefetch-on="interaction" to="/item-request">
                item request
              </NuxtLink>, or
              <NuxtLink prefetch-on="interaction" to="/item-lending">
                item lending
              </NuxtLink>
              page.
            </p>
          </div>

          <div v-else class="board-feed__list">
            <article v-for="item in boardItems" :key="item.id" class="board-card">
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
                <NuxtLink class="secondary-button" prefetch-on="interaction" :to="getBoardDetailPath(item.id)">
                  View details
                </NuxtLink>
                <button
                  class="secondary-button"
                  :disabled="revealPending[item.id]"
                  type="button"
                  @click="revealItemContact(item)"
                >
                  {{ getItemContactActionLabel(item) }}
                </button>
                <button
                  v-if="canReplyToItem(item)"
                  class="secondary-button secondary-button--dark"
                  type="button"
                  @click="openReplyForm(item)"
                >
                  {{ openReplyItemId === item.id ? 'Hide reply form' : getReplyActionLabel(item.kind) }}
                </button>
                <button
                  v-if="canResolveItem(item)"
                  class="secondary-button"
                  :disabled="resolvePending[item.id]"
                  type="button"
                  @click="toggleBoardResolution(item)"
                >
                  {{ getResolutionActionLabel(item) }}
                </button>
                <button
                  v-if="canDeleteItem(item)"
                  class="secondary-button secondary-button--danger"
                  :disabled="deletePending[item.id]"
                  type="button"
                  @click="deleteBoardPost(item)"
                >
                  {{ getDeleteActionLabel(item.id) }}
                </button>
              </div>

              <p class="board-card__contact-note">
                Contact details are hidden until you deliberately reveal them to reduce scraping.
              </p>
              <p v-if="item.resolutionStatus === 'resolved'" class="board-card__resolved-note">
                {{ getResolvedNote(item) }}
              </p>

              <p v-if="deleteErrors[item.id]" class="inline-note inline-note--error" role="alert">
                {{ deleteErrors[item.id]?.message }} {{ deleteErrors[item.id]?.detail }}
              </p>
              <p v-if="resolveErrors[item.id]" class="inline-note inline-note--error" role="alert">
                {{ resolveErrors[item.id]?.message }} {{ resolveErrors[item.id]?.detail }}
              </p>
              <p v-if="revealErrors[item.id]" class="inline-note inline-note--error" role="alert">
                {{ revealErrors[item.id]?.message }} {{ revealErrors[item.id]?.detail }}
              </p>
              <p v-if="isItemContactVisible(item.id)" class="inline-note inline-note--success" role="status">
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
                      {{ getInteractionContactActionLabel(item.id, interaction.id) }}
                    </button>
                    <button
                      v-if="canDeleteInteraction(interaction)"
                      class="thread-item__contact thread-item__contact--danger"
                      :disabled="deleteInteractionPending[getInteractionDeleteKey(item.id, interaction.id)]"
                      type="button"
                      @click="deleteBoardInteraction(item, interaction)"
                    >
                      {{ getDeleteInteractionActionLabel(item.id, interaction.id) }}
                    </button>
                    <p v-if="revealErrors[getRevealKey(item.id, interaction.id)]" class="inline-note inline-note--error" role="alert">
                      {{ revealErrors[getRevealKey(item.id, interaction.id)]?.message }} {{ revealErrors[getRevealKey(item.id, interaction.id)]?.detail }}
                    </p>
                    <p v-if="deleteInteractionErrors[getInteractionDeleteKey(item.id, interaction.id)]" class="inline-note inline-note--error" role="alert">
                      {{ deleteInteractionErrors[getInteractionDeleteKey(item.id, interaction.id)]?.message }} {{ deleteInteractionErrors[getInteractionDeleteKey(item.id, interaction.id)]?.detail }}
                    </p>
                    <p v-if="isInteractionContactVisible(item.id, interaction.id)" class="inline-note inline-note--success" role="status">
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
                v-if="openReplyItemId === item.id && canReplyToItem(item)"
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
                    <span>Contact method</span>
                    <select v-model="replyDrafts[item.id]!.contact_method" :required="!viewer">
                      <option v-for="option in boardContactMethodOptions" :key="option.value" :value="option.value">
                        {{ option.label }}
                      </option>
                    </select>
                  </label>

                  <label class="field">
                    <span>{{ viewer ? `${getBoardContactValueLabel(replyDrafts[item.id]!.contact_method)} (optional when signed in)` : getBoardContactValueLabel(replyDrafts[item.id]!.contact_method) }}</span>
                    <input
                      v-model="replyDrafts[item.id]!.contact_value"
                      :autocomplete="getBoardContactValueAutocomplete(replyDrafts[item.id]!.contact_method)"
                      :inputmode="getBoardContactValueInputMode(replyDrafts[item.id]!.contact_method)"
                      :placeholder="getBoardContactValuePlaceholder(replyDrafts[item.id]!.contact_method)"
                      :required="!viewer"
                      :type="getBoardContactValueType(replyDrafts[item.id]!.contact_method)"
                    >
                  </label>

                  <label class="field field--wide">
                    <span>Contact note (optional)</span>
                    <input v-model="replyDrafts[item.id]!.contact_note" placeholder="Example: text first, evenings are best, or include the item name when you reach out." type="text">
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

          <div v-if="boardUiReady && !boardError" class="board-pagination">
            <div class="board-pagination__summary">
              Page {{ boardPagination.page }} of {{ boardPagination.totalPages }}
              <span>· {{ boardPagination.totalItems }} total in this view</span>
            </div>
            <div class="board-pagination__actions">
              <button
                class="secondary-button"
                :disabled="boardPending || !boardPagination.hasPreviousPage"
                type="button"
                @click="changeBoardPage(boardPagination.page - 1)"
              >
                Newer posts
              </button>
              <button
                class="secondary-button secondary-button--dark"
                :disabled="boardPending || !boardPagination.hasNextPage"
                type="button"
                @click="changeBoardPage(boardPagination.page + 1)"
              >
                Older posts
              </button>
            </div>
          </div>
        </div>
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
.live-board {
  padding-right: var(--page-inline-end);
  padding-left: var(--page-inline-start);
}

.hero {
  padding-top: 0.4rem;
}

.hero__inner {
  min-height: calc(100svh - 7rem);
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(250px, 0.65fr);
  align-items: center;
  gap: clamp(2rem, 4vw, 4.5rem);
  padding-block: var(--page-hero-space);
}

.hero__copy {
  align-self: center;
  min-width: 0;
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
  color: var(--site-muted);
}

.hero h1,
.section-heading h2 {
  margin: 0;
  font-family: 'DM Serif Display', serif;
  font-weight: 400;
  letter-spacing: -0.03em;
  color: var(--site-heading);
}

.hero h1 {
  max-width: 13ch;
  font-size: clamp(2.7rem, 5.4vw, 5.15rem);
  line-height: 0.92;
  overflow-wrap: anywhere;
  text-wrap: balance;
}

.hero__lede,
.section-copy,
.board-card__summary,
.board-card__contact-note,
.board-card__thread-empty,
.thread-item p {
  color: var(--site-text);
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
.board-filter {
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

.hero__actions a,
.submit-button,
.secondary-button--dark {
  background: var(--site-button-bg);
  color: var(--site-button-text);
  box-shadow: 0 16px 30px var(--site-focus-ring);
}

.hero__actions a:hover,
.hero__actions a:focus-visible,
.submit-button:hover,
.submit-button:focus-visible,
.secondary-button--dark:hover,
.secondary-button--dark:focus-visible {
  transform: translateY(-1px);
  background: var(--site-button-bg-hover);
}

.hero__caption {
  margin: 1.35rem 0 0;
  max-width: 32rem;
  color: var(--site-subtle);
  line-height: 1.65;
}

.hero__poster {
  align-self: center;
  display: flex;
  min-width: 0;
  justify-content: flex-end;
  animation: poster-in 860ms ease 60ms both;
}

.poster {
  position: relative;
  width: min(27rem, 100%);
  padding: 1.55rem;
  border-radius: 2rem;
  background: linear-gradient(160deg, var(--site-poster-start), var(--site-poster-end)), var(--site-elevated-strong);
  border: 1px solid var(--site-border);
  box-shadow:
    var(--site-shadow-strong),
    inset 0 1px 0 var(--site-accent-ghost);
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
  background: var(--site-highlight);
  filter: blur(2px);
}

.poster__stamp {
  display: inline-flex;
  padding: 0.45rem 0.75rem;
  border-radius: 999px;
  background: var(--site-accent-soft);
  font-size: 0.76rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--site-link);
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
  color: var(--site-text-strong);
}

.poster__headline span {
  max-width: 15rem;
  color: var(--site-subtle);
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
  background: var(--site-elevated);
  border: 1px solid var(--site-border);
}

.poster__lanes small {
  display: block;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--site-muted);
  font-size: 0.72rem;
}

.poster__lanes strong {
  display: block;
  margin-top: 0.3rem;
  font-size: 1.55rem;
  color: var(--site-heading);
}

.poster__note {
  margin: 1.1rem 0 0;
  color: var(--site-subtle);
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
  min-width: 0;
  max-width: 42rem;
}

.section-copy {
  margin: 1rem 0 0;
}

.board-filter-strip {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr));
  gap: 0.75rem;
}

.board-filter {
  width: 100%;
  gap: 0.7rem;
  background: var(--site-surface);
  color: var(--site-text-strong);
  border: 1px solid var(--site-border);
}

.board-filter strong {
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  background: var(--site-accent-soft);
  font-size: 0.82rem;
}

.board-filter:hover,
.board-filter:focus-visible,
.board-filter--active {
  transform: translateY(-1px);
  border-color: var(--site-accent-soft-strong);
  background: var(--site-button-bg);
  color: var(--site-button-text);
}

.board-filter--active strong,
.board-filter:hover strong,
.board-filter:focus-visible strong {
  background: var(--site-accent-ghost);
}

.live-board__layout {
  display: grid;
  gap: 1.35rem;
  align-items: start;
}

.board-card {
  padding: 1.5rem;
  border-radius: 1.65rem;
  background: var(--site-surface);
  border: 1px solid var(--site-border);
  box-shadow: var(--site-shadow);
}
.board-card__contact-note {
  margin: 1rem 0 0;
  font-size: 0.94rem;
}

.board-card__resolved-note {
  margin: 0;
  color: var(--site-subtle);
  line-height: 1.65;
}

.inline-note,
.success-note,
.error-panel {
  margin-top: 1rem;
  padding: 0.9rem 1rem;
  border-radius: 1rem;
  line-height: 1.55;
}

.inline-note--success,
.success-note {
  background: var(--site-success-bg);
  color: var(--site-success-text);
}

.inline-note--error,
.error-panel {
  background: var(--site-error-bg);
  color: var(--site-error-text);
}

.board-feed {
  display: grid;
  gap: 1rem;
}

.board-feed__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.85rem;
  color: var(--site-subtle);
  font-size: 0.95rem;
}

.board-feed__meta p {
  margin: 0;
  padding: 0.55rem 0.85rem;
  border-radius: 999px;
  background: var(--site-surface-soft);
  border: 1px solid var(--site-border);
}

.board-feed__list {
  display: grid;
  gap: 1rem;
}

.board-pagination {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.9rem;
  padding: 1rem 0 0.2rem;
}

.board-pagination__summary {
  color: var(--site-subtle);
  font-size: 0.95rem;
}

.board-pagination__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
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

.board-empty a {
  color: var(--site-link);
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

.board-card__header h3 {
  margin: 0.35rem 0 0;
  font-family: 'DM Serif Display', serif;
  font-size: 2rem;
  line-height: 1;
  color: var(--site-text-strong);
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
.submit-button:disabled,
.board-filter:disabled {
  opacity: 0.68;
  cursor: wait;
  transform: none;
}

.secondary-button--dark {
  background: var(--site-button-bg);
  color: var(--site-button-text);
}

.secondary-button--danger {
  border-color: rgba(181, 95, 82, 0.3);
  color: var(--site-error-text);
  background: var(--site-error-bg);
}

.secondary-button--danger:hover,
.secondary-button--danger:focus-visible {
  background: rgba(181, 95, 82, 0.24);
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
.field textarea,
.field select {
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
.field textarea:focus-visible,
.field select:focus-visible {
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

  .hero__poster {
    align-self: start;
    justify-content: center;
  }
}

@media (max-width: 860px) {
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
  .hero__inner {
    min-height: auto;
    gap: 2rem;
  }

  .hero h1 {
    max-width: 100%;
  }

  .board-card {
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
