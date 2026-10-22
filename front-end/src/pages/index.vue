<script setup lang="ts">
import type {
  AntiBotChallenge,
  BoardBootstrapResponse,
  BoardClaimManagementResponse,
  BoardContactResponse,
  BoardItem,
  BoardItemCounts,
  BoardItemsPagination,
  BoardItemsResponse,
  BoardSortOrder,
} from '~/utils/board'
import type { BoardFormErrorState } from '~/utils/boardUi'
import type { SubmissionKind } from '~/utils/submissions'
import {
  isAntiBotChallenge,
  isAntiBotChallengeExpired,
  markAntiBotChallengeObserved,
  waitForAntiBotChallengeMinimumAge,
} from '~/utils/antiBot'
import { withApiQuery } from '~/utils/api'
import { boardSortOptions, getBoardEndpoint, rememberBoardDeleteToken } from '~/utils/board'
import {
  formatBoardDate,
  getBoardApiErrorState,
  getBoardDetailPath,
  getContactActionLabel,
  getRevealKey,
} from '~/utils/boardUi'
import { consumePendingManagementClaim } from '~/utils/managementLink'
import { formatRelativeTime, formatReplyCount, getPostType, postTypeLinks } from '~/utils/postTypes'
import { submissionKinds } from '~/utils/submissions'

type BoardFilter = 'all' | SubmissionKind
const boardOriginStorageKey = 'np_sr_board_origin'
const boardOriginMaxAgeMs = 30 * 60 * 1000

definePageMeta({
  layout: 'home',
})

useSeoMeta({
  title: 'North Point Ward Service Board',
  description:
    'Post service projects, borrow requests, and lending offers on a live community board.',
})

const runtimeConfig = useRuntimeConfig()
const route = useRoute()
const router = useRouter()

const hasHydrated = ref(false)
const antiBotChallenge = ref<AntiBotChallenge | null>(null)
const boardItems = ref<BoardItem[]>([])
const boardLoaded = ref(false)
const boardPending = ref(false)
const boardError = ref<BoardFormErrorState | null>(null)
const securityError = ref<BoardFormErrorState | null>(null)
const boardFilter = ref<BoardFilter>('all')
const boardSearch = ref('')
const boardSearchDraft = ref('')
const boardSort = ref<BoardSortOrder>('recent-activity')
const boardOrigin = ref<{ lat: number, lng: number } | null>(null)
const boardGeoPending = ref(false)
const boardGeoError = ref('')
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

const revealItemContacts = reactive<Record<string, string>>({})
const revealItemContactVisibility = reactive<Record<string, boolean>>({})
const revealErrors = reactive<Record<string, BoardFormErrorState | null>>({})
const revealPending = reactive<Record<string, boolean>>({})

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
const displayBoardCounts = computed<BoardItemCounts>(() =>
  boardUiReady.value && !boardError.value
    ? boardCounts.value
    : placeholderBoardCounts,
)
const boardSummary = computed(() => {
  if (!boardUiReady.value || boardError.value)
    return ''

  const total = boardPagination.value.totalItems
  const noun = total === 1 ? 'post' : 'posts'

  return boardSearch.value
    ? `${total} ${noun} matching “${boardSearch.value}”`
    : `${total} ${noun}`
})

function applyServerContext(payload: unknown) {
  if (!payload || typeof payload !== 'object')
    return

  const record = payload as Record<string, unknown>

  if (isAntiBotChallenge(record.antiBot))
    antiBotChallenge.value = markAntiBotChallengeObserved(record.antiBot)
}

function getQueryValue(value: unknown) {
  if (Array.isArray(value))
    return getQueryValue(value[0])

  return typeof value === 'string' ? value : ''
}

function parseBoardFilter(value: string): BoardFilter {
  return value === submissionKinds.service
    || value === submissionKinds.itemRequest
    || value === submissionKinds.itemLending
    ? value
    : 'all'
}

function parsePositivePage(value: string) {
  const parsedValue = Number.parseInt(value, 10)

  if (!Number.isFinite(parsedValue) || parsedValue < 1)
    return 1

  return parsedValue
}

function normalizeBoardSearch(value: string) {
  return value.trim().slice(0, 120)
}

function parseBoardSort(value: string): BoardSortOrder {
  return boardSortOptions.some(option => option.value === value)
    ? value as BoardSortOrder
    : 'recent-activity'
}

function ensureRevealState(key: string) {
  if (!(key in revealPending))
    revealPending[key] = false

  if (!(key in revealErrors))
    revealErrors[key] = null
}

function isItemContactVisible(itemId: string) {
  return Boolean(
    revealItemContactVisibility[itemId] && revealItemContacts[itemId],
  )
}

function getItemContactActionLabel(item: BoardItem) {
  if (revealPending[item.id])
    return 'Revealing...'

  if (isItemContactVisible(item.id)) {
    return item.kind === submissionKinds.itemLending
      ? 'Hide lender contact'
      : 'Hide contact'
  }

  return getContactActionLabel(item.kind)
}

async function loadBootstrap() {
  const endpoint = getBoardEndpoint(
    runtimeConfig.public.apiBaseUrl,
    'bootstrap',
  )

  try {
    const response = await $fetch<BoardBootstrapResponse>(endpoint, {
      credentials: 'include',
    })

    applyServerContext(response)
    securityError.value = null
  }
  catch (error) {
    securityError.value = getBoardApiErrorState(
      error,
      endpoint,
      'Unable to initialize board security right now.',
      applyServerContext,
    )
  }
}

async function loadBoardItems() {
  const searchParams = new URLSearchParams()
  searchParams.set('kind', boardFilter.value)
  searchParams.set('page', String(boardPagination.value.page))
  searchParams.set('pageSize', String(boardPagination.value.pageSize))
  searchParams.set('sort', boardSort.value)

  if (boardSearch.value)
    searchParams.set('query', boardSearch.value)

  if (boardOrigin.value) {
    searchParams.set('lat', String(boardOrigin.value.lat))
    searchParams.set('lng', String(boardOrigin.value.lng))
  }
  const hasPrivateOrigin = searchParams.has('lat')
  const baseEndpoint = getBoardEndpoint(runtimeConfig.public.apiBaseUrl, 'items')
  const endpoint = hasPrivateOrigin
    ? baseEndpoint
    : withApiQuery(baseEndpoint, searchParams)

  boardPending.value = true
  boardError.value = null

  try {
    const response = await $fetch<BoardItemsResponse>(endpoint, {
      ...(hasPrivateOrigin
        ? { body: Object.fromEntries(searchParams), method: 'POST' as const }
        : {}),
      credentials: 'include',
    })

    if (
      !response
      || !Array.isArray(response.items)
      || !response.counts
      || typeof response.counts !== 'object'
      || !response.pagination
      || typeof response.pagination !== 'object'
    ) {
      throw new TypeError('The board API returned an invalid response.')
    }

    boardCounts.value = response.counts
    boardPagination.value = response.pagination
    boardItems.value = response.items
  }
  catch (error) {
    boardError.value = getBoardApiErrorState(
      error,
      endpoint.toString(),
      'Unable to load the live board right now.',
      applyServerContext,
    )
  }
  finally {
    boardPending.value = false
    boardLoaded.value = true
  }
}

async function ensureAntiBotReady() {
  if (
    !antiBotChallenge.value
    || isAntiBotChallengeExpired(antiBotChallenge.value)
  ) {
    await loadBootstrap()
  }

  if (!antiBotChallenge.value)
    throw new Error('Missing anti-bot challenge.')

  await waitForAntiBotChallengeMinimumAge(antiBotChallenge.value)
}

async function protectedPost<T>(
  endpoint: string,
  body: Record<string, string>,
) {
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

async function claimBoardManagementLink(
  itemId: string,
  managementToken: string,
) {
  const endpoint = getBoardEndpoint(
    runtimeConfig.public.apiBaseUrl,
    `items/${itemId}/claim-management`,
  )
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
    managementNotice.value
      = 'Management access for this post is now saved in this browser. Open the full post to manage or delete it.'
  }
  catch (error) {
    managementError.value = getBoardApiErrorState(
      error,
      endpoint,
      'We could not claim that management link right now.',
      applyServerContext,
    )
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
        page:
          boardPagination.value.page > 1
            ? String(boardPagination.value.page)
            : undefined,
      },
    })
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

  const endpoint = getBoardEndpoint(
    runtimeConfig.public.apiBaseUrl,
    `items/${item.id}/contact`,
  )
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
    revealErrors[key] = getBoardApiErrorState(
      error,
      endpoint,
      'We could not reveal that contact right now.',
      applyServerContext,
    )
  }
  finally {
    revealPending[key] = false
  }
}

function getResolutionBadgeLabel(item: BoardItem) {
  return item.resolutionStatus === 'fulfilled' ? 'Fulfilled' : 'Closed'
}

function syncBoardStateFromRoute() {
  let changed = false
  const nextBoardFilter = parseBoardFilter(getQueryValue(route.query.filter))
  const nextBoardSearch = normalizeBoardSearch(getQueryValue(route.query.q))
  const requestedSort = parseBoardSort(getQueryValue(route.query.sort))
  const nextBoardSort = requestedSort === 'nearby' && !boardOrigin.value
    ? 'recent-activity'
    : requestedSort
  const nextPage = parsePositivePage(getQueryValue(route.query.page))

  if (boardFilter.value !== nextBoardFilter) {
    boardFilter.value = nextBoardFilter
    changed = true
  }

  if (boardSearch.value !== nextBoardSearch) {
    boardSearch.value = nextBoardSearch
    boardSearchDraft.value = nextBoardSearch
    changed = true
  }

  if (boardSort.value !== nextBoardSort) {
    boardSort.value = nextBoardSort
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

function persistBoardOrigin(origin: { lat: number, lng: number } | null) {
  try {
    if (origin) {
      window.sessionStorage.setItem(boardOriginStorageKey, JSON.stringify({
        ...origin,
        savedAt: Date.now(),
      }))
    }
    else {
      window.sessionStorage.removeItem(boardOriginStorageKey)
    }
  }
  catch {
    return
  }
}

function restoreBoardOrigin() {
  try {
    const rawOrigin = window.sessionStorage.getItem(boardOriginStorageKey)

    if (!rawOrigin)
      return

    const storedOrigin = JSON.parse(rawOrigin) as {
      lat?: unknown
      lng?: unknown
      savedAt?: unknown
    }
    const ageMs = Date.now() - Number(storedOrigin.savedAt)

    if (
      typeof storedOrigin.lat === 'number'
      && Number.isFinite(storedOrigin.lat)
      && Math.abs(storedOrigin.lat) <= 90
      && typeof storedOrigin.lng === 'number'
      && Number.isFinite(storedOrigin.lng)
      && Math.abs(storedOrigin.lng) <= 180
      && Number.isFinite(ageMs)
      && ageMs >= -30_000
      && ageMs <= boardOriginMaxAgeMs
    ) {
      boardOrigin.value = { lat: storedOrigin.lat, lng: storedOrigin.lng }
      return
    }

    persistBoardOrigin(null)
  }
  catch {
    persistBoardOrigin(null)
  }
}

function scrubPrivateBoardRoute() {
  const unusableNearby = route.query.sort === 'nearby' && !boardOrigin.value

  if (route.query.lat == null && route.query.lng == null && !unusableNearby)
    return

  void router.replace({
    hash: route.hash,
    path: route.path,
    query: {
      ...route.query,
      lat: undefined,
      lng: undefined,
      sort: unusableNearby ? undefined : route.query.sort,
    },
  })
}

async function pushBoardRouteState(nextState?: {
  filter?: BoardFilter
  page?: number
  query?: string
  sort?: BoardSortOrder
}) {
  const nextFilter = nextState?.filter ?? boardFilter.value
  const nextPage = Math.max(nextState?.page ?? boardPagination.value.page, 1)
  const nextQuery = normalizeBoardSearch(nextState?.query ?? boardSearch.value)
  const nextSort = nextState?.sort ?? boardSort.value

  await router.push({
    hash: route.hash,
    path: route.path,
    query: {
      ...route.query,
      filter: nextFilter === 'all' ? undefined : nextFilter,
      lat: undefined,
      lng: undefined,
      page: nextPage > 1 ? String(nextPage) : undefined,
      q: nextQuery || undefined,
      sort: nextSort === 'recent-activity' ? undefined : nextSort,
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
  const normalizedPage = Math.min(
    Math.max(nextPage, 1),
    boardPagination.value.totalPages,
  )

  if (normalizedPage === boardPagination.value.page)
    return

  void pushBoardRouteState({
    page: normalizedPage,
  })
}

function submitBoardSearch() {
  const nextQuery = normalizeBoardSearch(boardSearchDraft.value)

  if (boardSearch.value === nextQuery && boardPagination.value.page === 1)
    return

  void pushBoardRouteState({
    page: 1,
    query: nextQuery,
  })
}

function clearBoardSearch() {
  if (!boardSearch.value && !boardSearchDraft.value)
    return

  boardSearchDraft.value = ''
  void pushBoardRouteState({
    page: 1,
    query: '',
  })
}

async function enableBoardNearbySort() {
  if (!import.meta.client || !navigator.geolocation) {
    boardGeoError.value = 'Browser geolocation is not available here.'
    return
  }

  boardGeoPending.value = true
  boardGeoError.value = ''

  try {
    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: false,
        maximumAge: boardOrigin.value ? 0 : 5 * 60 * 1000,
        timeout: 10 * 1000,
      })
    })

    const routeAlreadyNearby = parseBoardSort(getQueryValue(route.query.sort)) === 'nearby'
      && boardPagination.value.page === 1
    boardOrigin.value = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
    }
    persistBoardOrigin(boardOrigin.value)

    await pushBoardRouteState({
      page: 1,
      sort: 'nearby',
    })

    if (routeAlreadyNearby)
      await loadBoardItems()
  }
  catch {
    boardGeoError.value = 'Could not read your current location. Nearby sorting needs browser location access.'
  }
  finally {
    boardGeoPending.value = false
  }
}

function clearBoardOrigin() {
  boardOrigin.value = null
  boardGeoError.value = ''
  persistBoardOrigin(null)

  void pushBoardRouteState({
    page: 1,
    sort: boardSort.value === 'nearby' ? 'recent-activity' : boardSort.value,
  })
}

function setBoardSort(nextSort: BoardSortOrder) {
  if (nextSort === 'nearby' && !boardOrigin.value) {
    void enableBoardNearbySort()
    return
  }

  const currentRouteSort = parseBoardSort(getQueryValue(route.query.sort))

  if (currentRouteSort === nextSort && boardPagination.value.page === 1)
    return

  void pushBoardRouteState({
    page: 1,
    sort: nextSort,
  })
}

function handleBoardSortChange(event: Event) {
  const select = event.target

  if (!(select instanceof HTMLSelectElement))
    return

  const nextSort = parseBoardSort(select.value)
  select.value = boardSort.value
  setBoardSort(nextSort)
}

onMounted(() => {
  hasHydrated.value = true
  restoreBoardOrigin()
  syncBoardStateFromRoute()
  scrubPrivateBoardRoute()
  const pendingManagementClaim = consumePendingManagementClaim()
  const manageItem = pendingManagementClaim?.itemId || getQueryValue(route.query.manageItem)
  const manageToken = pendingManagementClaim?.managementToken || getQueryValue(route.query.manageToken)

  if (manageItem && manageToken)
    void claimBoardManagementLink(manageItem, manageToken)

  void Promise.allSettled([loadBootstrap(), loadBoardItems()])
})

watch(
  () => [
    getQueryValue(route.query.filter),
    getQueryValue(route.query.page),
    getQueryValue(route.query.q),
    getQueryValue(route.query.sort),
    getQueryValue(route.query.lat),
    getQueryValue(route.query.lng),
  ],
  () => {
    if (!hasHydrated.value)
      return

    const changed = syncBoardStateFromRoute()
    scrubPrivateBoardRoute()

    if (changed)
      void loadBoardItems()
  },
)
</script>

<template>
  <div class="home-page container">
    <section class="home-hero" aria-labelledby="home-title-heading">
      <h1 id="home-title-heading">
        North Point Ward Service Board
      </h1>

      <ul class="home-hero__tiles" aria-label="New post">
        <li v-for="postType in postTypeLinks" :key="postType.to">
          <NuxtLink
            class="post-tile"
            :class="postType.tone"
            prefetch-on="interaction"
            :to="postType.to"
          >
            <span aria-hidden="true" class="post-tile__icon"><span :class="postType.icon" /></span>
            <span class="post-tile__label">{{ postType.label }}</span>
            <span aria-hidden="true" class="post-tile__label-short">{{ postType.shortLabel }}</span>
            <span aria-hidden="true" class="i-carbon-arrow-right post-tile__arrow" />
          </NuxtLink>
        </li>
      </ul>
    </section>

    <section id="live-board" class="live-board" aria-labelledby="live-board-heading">
      <div class="live-board__heading">
        <h2 id="live-board-heading" class="section-title">
          Live board
        </h2>
        <p class="live-board__summary" aria-live="polite">
          {{ boardSummary }}
          <span v-if="managementPending"> · Claiming management access...</span>
          <span v-else-if="boardPending && boardUiReady"> · Refreshing...</span>
        </p>
      </div>

      <div class="board-toolbar">
        <form class="board-search" role="search" @submit.prevent="submitBoardSearch">
          <label class="board-search__field">
            <span class="sr-only">Search the live board</span>
            <span aria-hidden="true" class="i-carbon-search board-search__icon" />
            <input
              v-model="boardSearchDraft"
              autocomplete="off"
              class="input"
              name="board_search"
              placeholder="Search posts"
              type="search"
            >
          </label>
          <button class="button button--secondary" type="submit">
            Search
          </button>
          <button
            v-if="boardSearch || boardSearchDraft"
            class="button button--quiet"
            type="button"
            @click="clearBoardSearch"
          >
            Clear
          </button>
        </form>

        <div class="board-toolbar__options">
          <label class="board-sort">
            <span>Sort</span>
            <select
              class="input"
              :value="boardSort"
              name="board_sort"
              @change="handleBoardSortChange"
            >
              <option
                v-for="option in boardSortOptions"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
          </label>

          <div class="board-location">
            <button
              class="button button--quiet"
              :disabled="boardGeoPending"
              type="button"
              @click="enableBoardNearbySort"
            >
              <span aria-hidden="true" :class="boardOrigin ? 'i-carbon-location-filled' : 'i-carbon-location'" />
              {{ boardGeoPending ? "Locating..." : boardOrigin ? "Refresh location" : "Use my location" }}
            </button>
            <button
              v-if="boardOrigin"
              class="button button--quiet"
              type="button"
              @click="clearBoardOrigin"
            >
              Clear location
            </button>
          </div>
        </div>
      </div>

      <div
        class="board-filters"
        role="group"
        aria-label="Board filters"
      >
        <button
          v-for="filter in boardFilters"
          :key="filter.key"
          :aria-pressed="boardFilter === filter.key"
          :disabled="boardPending"
          class="board-filter"
          type="button"
          @click="setBoardFilter(filter.key)"
        >
          <span>{{ filter.label }}</span>
          <span class="board-filter__count">{{ displayBoardCounts[filter.key] }}</span>
        </button>
      </div>

      <div class="board-notices">
        <p
          v-if="boardGeoError"
          class="inline-note inline-note--error"
          role="alert"
        >
          {{ boardGeoError }}
        </p>
        <p
          v-if="securityError"
          class="inline-note inline-note--error"
          role="alert"
        >
          {{ securityError.message }} {{ securityError.detail }}
        </p>
        <p
          v-if="managementNotice"
          class="inline-note inline-note--success"
          role="status"
        >
          {{ managementNotice }}
        </p>
        <p
          v-if="managementError"
          class="inline-note inline-note--error"
          role="alert"
        >
          {{ managementError.message }} {{ managementError.detail }}
        </p>
      </div>

      <div v-if="!boardUiReady" class="board-grid" role="status">
        <span class="sr-only">Loading the live board...</span>
        <div v-for="index in 4" :key="index" aria-hidden="true" class="board-card board-card--skeleton">
          <span class="skeleton skeleton--short" />
          <span class="skeleton skeleton--title" />
          <span class="skeleton" />
          <span class="skeleton" />
        </div>
      </div>

      <div
        v-else-if="boardError"
        class="board-empty inline-note--error"
        role="alert"
      >
        <p>{{ boardError.message }}</p>
        <p>{{ boardError.detail }}</p>
      </div>

      <div v-else-if="!boardItems.length" class="board-empty">
        <p>
          {{
            boardSearch
              ? 'No posts match this search yet.'
              : 'No posts match this filter yet.'
          }}
        </p>
        <button
          v-if="boardSearch"
          class="button button--secondary"
          type="button"
          @click="clearBoardSearch"
        >
          Clear search
        </button>
      </div>

      <div v-else class="board-grid">
        <article
          v-for="item in boardItems"
          :key="item.id"
          class="board-card"
          :class="[getPostType(item.kind).tone, { 'board-card--resolved': item.resolutionStatus !== 'open' }]"
        >
          <div class="board-card__top">
            <span class="badge badge--kind">
              <span aria-hidden="true" :class="getPostType(item.kind).icon" />
              {{ item.kindLabel }}
            </span>
            <span
              v-if="item.resolutionStatus !== 'open'"
              class="badge"
              :class="item.resolutionStatus === 'fulfilled' ? 'badge--success' : 'badge--muted'"
            >{{ getResolutionBadgeLabel(item) }}</span>
            <time
              class="board-card__time"
              :datetime="item.createdAt"
              :title="formatBoardDate(item.createdAt)"
            >{{ formatRelativeTime(item.createdAt) }}</time>
          </div>

          <h3 class="board-card__title">
            <NuxtLink prefetch-on="interaction" :to="getBoardDetailPath(item.id)">
              {{ item.title }}
            </NuxtLink>
          </h3>

          <p class="board-card__byline">
            <span>{{ item.author.displayName }}</span>
            <span v-if="item.author.hasAccount" class="badge badge--muted">Member</span>
            <span aria-hidden="true">·</span>
            <span>{{ formatReplyCount(item.interactionCount) }}</span>
            <template v-if="item.distanceMiles != null">
              <span aria-hidden="true">·</span>
              <span>{{ item.distanceMiles.toFixed(1) }} mi away</span>
            </template>
          </p>

          <p class="board-card__summary">
            <span class="sr-only">{{ item.summaryLabel }}: </span>{{ item.summary }}
          </p>

          <dl v-if="item.attributes.length" class="board-card__facts">
            <div
              v-for="attribute in item.attributes"
              :key="`${item.id}-${attribute.label}`"
            >
              <dt>{{ attribute.label }}</dt>
              <dd>{{ attribute.value }}</dd>
            </div>
          </dl>

          <div class="board-card__actions">
            <NuxtLink
              class="button button--secondary button--small"
              prefetch-on="interaction"
              :to="getBoardDetailPath(item.id)"
            >
              Open post
            </NuxtLink>
            <button
              class="button button--quiet button--small"
              :disabled="revealPending[item.id]"
              type="button"
              @click="revealItemContact(item)"
            >
              {{ getItemContactActionLabel(item) }}
            </button>
          </div>
          <p
            v-if="revealErrors[item.id]"
            class="inline-note inline-note--error"
            role="alert"
          >
            {{ revealErrors[item.id]?.message }}
            {{ revealErrors[item.id]?.detail }}
          </p>
          <p
            v-if="isItemContactVisible(item.id)"
            class="inline-note inline-note--success"
            role="status"
          >
            Contact: {{ revealItemContacts[item.id] }}
          </p>
        </article>
      </div>

      <nav
        v-if="boardUiReady && !boardError && boardPagination.totalPages > 1"
        aria-label="Board pages"
        class="board-pagination"
      >
        <button
          class="button button--secondary"
          :disabled="boardPending || !boardPagination.hasPreviousPage"
          type="button"
          @click="changeBoardPage(boardPagination.page - 1)"
        >
          <span aria-hidden="true" class="i-carbon-chevron-left" />
          Previous page
        </button>
        <p class="board-pagination__summary">
          Page {{ boardPagination.page }} of {{ boardPagination.totalPages }}
        </p>
        <button
          class="button button--secondary"
          :disabled="boardPending || !boardPagination.hasNextPage"
          type="button"
          @click="changeBoardPage(boardPagination.page + 1)"
        >
          Next page
          <span aria-hidden="true" class="i-carbon-chevron-right" />
        </button>
      </nav>
    </section>
  </div>
</template>

<style scoped>
.home-page {
  display: grid;
  gap: clamp(1.75rem, 3.5vw, 2.75rem);
}

/* Hero ---------------------------------------------------------------- */

.home-hero {
  display: grid;
  gap: 1.25rem;
  padding-top: clamp(1.75rem, 4vw, 3rem);
}

.home-hero h1 {
  font-family: var(--font-serif);
  font-size: clamp(2.2rem, 4.6vw, 3.6rem);
  font-weight: 400;
  letter-spacing: -0.03em;
  line-height: 1;
}

.home-hero__tiles {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.post-tile {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  height: 100%;
  padding: 0.9rem 1rem;
  border: 1px solid var(--card-border);
  border-radius: var(--radius-lg);
  background: var(--site-surface-strong);
  color: var(--site-heading);
  font-weight: 700;
  text-decoration: none;
  transition:
    border-color 160ms ease,
    box-shadow 160ms ease;
}

.post-tile:hover,
.post-tile:focus-visible {
  border-color: var(--kind);
  box-shadow: var(--site-shadow);
  color: var(--site-heading);
}

.post-tile__icon {
  flex: none;
  display: inline-grid;
  place-items: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--kind) 14%, transparent);
  color: var(--kind);
  font-size: 1.15rem;
}

.post-tile__label {
  flex: 1;
  line-height: 1.3;
}

.post-tile__label-short {
  display: none;
}

.post-tile__arrow {
  flex: none;
  color: var(--site-subtle);
  transition: transform 160ms ease;
}

.post-tile:hover .post-tile__arrow {
  transform: translateX(3px);
}

/* Board --------------------------------------------------------------- */

.live-board {
  display: grid;
  gap: 1rem;
}

.live-board__heading {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.25rem 1rem;
}

.live-board__summary {
  color: var(--site-subtle);
  font-size: var(--text-sm);
}

.board-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem 1.25rem;
}

.board-search {
  display: flex;
  flex: 1 1 26rem;
  gap: 0.5rem;
}

.board-search__field {
  position: relative;
  flex: 1;
  min-width: 0;
}

.board-search__icon {
  position: absolute;
  top: 50%;
  left: 0.85rem;
  color: var(--site-subtle);
  transform: translateY(-50%);
  pointer-events: none;
}

.board-search__field .input {
  padding-left: 2.5rem;
}

.board-toolbar__options {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1rem;
}

.board-sort {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--site-subtle);
  font-size: var(--text-sm);
  font-weight: 700;
}

.board-sort .input {
  width: auto;
  min-width: 11rem;
}

.board-location {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.board-filters {
  display: flex;
  gap: 0.5rem;
  overflow-x: auto;
  scrollbar-width: none;
}

.board-filters::-webkit-scrollbar {
  display: none;
}

.board-filter {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 0.5rem;
  min-height: 2.5rem;
  padding: 0.45rem 0.6rem 0.45rem 0.9rem;
  border: 1px solid var(--card-border);
  border-radius: 999px;
  background: transparent;
  color: var(--site-text);
  font: inherit;
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
  touch-action: manipulation;
}

.board-filter:hover:not(:disabled) {
  border-color: var(--field-border);
  color: var(--site-heading);
}

.board-filter[aria-pressed='true'] {
  border-color: var(--site-button-bg);
  background: var(--site-button-bg);
  color: var(--site-button-text);
}

.board-filter:disabled {
  cursor: wait;
}

.board-filter__count {
  min-width: 1.6rem;
  padding: 0.05rem 0.45rem;
  border-radius: 999px;
  background: color-mix(in srgb, currentColor 14%, transparent);
  font-size: var(--text-xs);
  font-weight: 700;
  text-align: center;
}

.board-notices {
  display: grid;
  gap: 0.6rem;
}

.board-notices:empty {
  display: none;
}

.board-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 22rem), 1fr));
  gap: 1rem;
  align-items: start;
}

.board-card {
  display: grid;
  gap: 0.6rem;
  min-width: 0;
  padding: 1.1rem 1.2rem 1rem;
  border: 1px solid var(--card-border);
  border-top: 3px solid var(--kind, var(--card-border));
  border-radius: var(--radius-lg);
  background: var(--site-surface-strong);
  transition: box-shadow 160ms ease;
}

.board-card:hover {
  box-shadow: var(--site-shadow);
}

.board-card--resolved {
  border-top-color: var(--card-border);
}

.board-card__top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
}

.board-card__time {
  margin-left: auto;
  color: var(--site-subtle);
  font-size: var(--text-xs);
}

.board-card__title {
  font-size: var(--text-lg);
  font-weight: 700;
  line-height: 1.3;
  overflow-wrap: anywhere;
}

.board-card__title a {
  color: var(--site-heading);
  text-decoration: none;
}

.board-card__title a:hover,
.board-card__title a:focus-visible {
  text-decoration: underline;
}

.board-card__byline {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.2rem 0.45rem;
  color: var(--site-subtle);
  font-size: var(--text-sm);
}

.board-card__summary {
  display: -webkit-box;
  overflow: hidden;
  color: var(--site-text);
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  overflow-wrap: anywhere;
}

.board-card__facts {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 1.25rem;
  margin: 0;
  padding-top: 0.6rem;
  border-top: 1px solid var(--divider);
  font-size: var(--text-sm);
}

.board-card__facts div {
  min-width: 0;
}

.board-card__facts dt {
  color: var(--site-subtle);
  font-size: var(--text-xs);
  font-weight: 600;
}

.board-card__facts dd {
  margin: 0;
  color: var(--site-heading);
  font-weight: 600;
  overflow-wrap: anywhere;
}

.board-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 0.2rem;
}

.board-card--skeleton {
  gap: 0.75rem;
  border-top-color: var(--card-border);
}

.skeleton {
  display: block;
  height: 0.9rem;
  border-radius: 0.4rem;
  background: color-mix(in srgb, var(--site-text) 10%, transparent);
  animation: skeleton-pulse 1.4s ease-in-out infinite;
}

.skeleton--short {
  width: 35%;
}

.skeleton--title {
  width: 70%;
  height: 1.3rem;
}

.board-empty {
  display: grid;
  justify-items: start;
  gap: 0.75rem;
  padding: 1.5rem;
  border: 1px dashed var(--field-border);
  border-radius: var(--radius-lg);
  color: var(--site-subtle);
}

.board-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding-top: 0.5rem;
}

.board-pagination__summary {
  color: var(--site-subtle);
  font-size: var(--text-sm);
}

@keyframes skeleton-pulse {
  50% {
    opacity: 0.5;
  }
}

@media (max-width: 760px) {
  .home-hero {
    gap: 1rem;
  }

  .home-hero__tiles {
    gap: 0.5rem;
  }

  .post-tile {
    flex-direction: column;
    gap: 0.4rem;
    padding: 0.75rem 0.4rem;
    font-size: var(--text-sm);
    text-align: center;
  }

  .post-tile {
    position: relative;
  }

  /* Keep the full label as the link's accessible name. */
  .post-tile__label {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
  }

  .post-tile__arrow {
    display: none;
  }

  .post-tile__label-short {
    display: block;
    line-height: 1.25;
  }

  .board-search {
    flex-basis: 100%;
  }

  .board-toolbar__options {
    width: 100%;
    justify-content: space-between;
  }

  .board-sort .input {
    min-width: 0;
  }
}

@media (max-width: 420px) {
  .board-pagination .button {
    padding-inline: 0.75rem;
  }

  .board-pagination__summary {
    font-size: var(--text-xs);
  }
}
</style>
