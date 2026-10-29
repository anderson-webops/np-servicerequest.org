<script setup lang="ts">
import type {
  AntiBotChallenge,
  BoardBootstrapResponse,
  BoardClaimManagementResponse,
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
  markAntiBotChallengeObserved,
} from '~/utils/antiBot'
import { withApiQuery } from '~/utils/api'
import { boardSortOptions, getBoardEndpoint, rememberBoardDeleteToken } from '~/utils/board'
import {
  getBoardApiErrorState,
  getBoardDetailPath,
} from '~/utils/boardUi'
import { consumePendingManagementClaim } from '~/utils/managementLink'
import { formatRelativeTime, getPostType } from '~/utils/postTypes'
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
const boardOptionsPanelId = useId()
const boardOptionsDialog = ref<HTMLDialogElement | null>(null)
const boardOptionsTrigger = ref<HTMLButtonElement | null>(null)
const boardOptionsOpen = ref(false)
const boardOptionsPosition = ref({ left: '1rem', top: '6rem' })

const hasHydrated = ref(false)
const antiBotChallenge = ref<AntiBotChallenge | null>(null)
const boardItems = ref<BoardItem[]>([])
const boardLoaded = ref(false)
const boardPending = ref(false)
const boardError = ref<BoardFormErrorState | null>(null)
const securityError = ref<BoardFormErrorState | null>(null)
const boardFilter = ref<BoardFilter>('all')
const boardSearch = ref('')
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
  pageSize: 6,
  totalItems: 0,
  totalPages: 1,
})
const managementNotice = ref('')
const managementPending = ref(false)
const managementError = ref<BoardFormErrorState | null>(null)


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

function getResolutionBadgeLabel(item: BoardItem) {
  return item.resolutionStatus === 'fulfilled' ? 'Fulfilled' : 'Closed'
}

// A card shows at most four things: title, type, place, and age or status.
function getItemPlace(item: BoardItem) {
  if (item.distanceMiles != null)
    return `${item.distanceMiles.toFixed(1)} mi away`

  return item.attributes.find(attribute => attribute.label === 'Where' || attribute.label === 'Neighborhood')?.value || ''
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

function clearBoardSearch() {
  if (!boardSearch.value)
    return

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

function positionBoardOptions() {
  if (!boardOptionsDialog.value?.open || !boardOptionsTrigger.value)
    return

  const trigger = boardOptionsTrigger.value.getBoundingClientRect()
  const panel = boardOptionsDialog.value.getBoundingClientRect()
  const gutter = 16
  boardOptionsPosition.value = {
    left: `${Math.max(gutter, Math.min(trigger.right - panel.width, window.innerWidth - panel.width - gutter))}px`,
    top: `${Math.max(gutter, Math.min(trigger.bottom + 8, window.innerHeight - panel.height - gutter))}px`,
  }
}

function openBoardOptions() {
  boardOptionsDialog.value?.showModal()
  boardOptionsOpen.value = true
  positionBoardOptions()
  boardOptionsDialog.value?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus({ preventScroll: true })
}

function closeBoardOptions() {
  boardOptionsDialog.value?.close()
}

function handleBoardOptionsBackdrop(event: MouseEvent) {
  if (!boardOptionsDialog.value || event.target !== boardOptionsDialog.value)
    return

  const panel = boardOptionsDialog.value.getBoundingClientRect()
  if (event.clientX < panel.left || event.clientX > panel.right || event.clientY < panel.top || event.clientY > panel.bottom)
    closeBoardOptions()
}

function handleBoardOptionsKeydown(event: KeyboardEvent) {
  if (event.key !== 'Tab')
    return

  const controls = boardOptionsDialog.value?.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled)')
  const first = controls?.[0]
  const last = controls?.[controls.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last?.focus()
  }
  else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first?.focus()
  }
}

useEventListener('resize', positionBoardOptions)
useEventListener('scroll', positionBoardOptions, { capture: true, passive: true })

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
    <section id="live-board" class="live-board" aria-labelledby="live-board-heading">
      <div class="live-board__heading">
        <div class="live-board__identity">
          <h1 id="live-board-heading" tabindex="-1">North Point Ward Service Board</h1>
          <p class="live-board__summary" aria-live="polite">
            {{ boardSummary }}
            <span v-if="managementPending"> · Claiming management access...</span>
            <span v-else-if="boardPending && boardUiReady"> · Refreshing...</span>
          </p>
        </div>
        <div class="board-options">
          <button
            ref="boardOptionsTrigger"
            class="button button--quiet board-options__trigger"
            type="button"
            aria-haspopup="dialog"
            :aria-controls="boardOptionsPanelId"
            :aria-expanded="boardOptionsOpen"
            @click="openBoardOptions"
          >
            <span class="i-carbon-filter" aria-hidden="true" />
            Filter and sort
          </button>
          <dialog
            :id="boardOptionsPanelId"
            ref="boardOptionsDialog"
            class="board-options__dialog"
            :aria-labelledby="`${boardOptionsPanelId}-heading`"
            :style="boardOptionsPosition"
            @click="handleBoardOptionsBackdrop"
            @close="boardOptionsOpen = false"
            @keydown="handleBoardOptionsKeydown"
          >
            <div class="board-options__header">
              <h2 :id="`${boardOptionsPanelId}-heading`">Filter and sort</h2>
              <button class="button button--quiet board-options__close" type="button" aria-label="Close filters" @click="closeBoardOptions">
                <span class="i-carbon-close" aria-hidden="true" />
              </button>
            </div>
            <div class="board-options__panel">
              <div
                class="board-filters"
                role="group"
                aria-label="Post type"
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
                  <span class="board-filter__check i-carbon-checkmark" :class="{ 'board-filter__check--hidden': boardFilter !== filter.key }" aria-hidden="true" />
                  <span>{{ filter.label }}</span>
                  <span class="board-filter__count">{{ displayBoardCounts[filter.key] }}</span>
                </button>
              </div>

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
                <p v-if="boardGeoError" class="inline-note inline-note--error board-options__error" role="alert">
                  {{ boardGeoError }}
                </p>
              </div>
            </div>
          </dialog>
        </div>
      </div>

      <button v-if="boardSearch" class="board-query button button--quiet" type="button" @click="clearBoardSearch">
        Clear search: {{ boardSearch }}
        <span class="i-carbon-close" aria-hidden="true" />
      </button>

      <div class="board-notices">
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

      <div v-if="!boardUiReady" class="board-list" role="status">
        <span class="sr-only">Loading the live board...</span>
        <div v-for="index in 6" :key="index" aria-hidden="true" class="board-row board-row--skeleton">
          <span class="skeleton skeleton--title" />
          <span class="skeleton skeleton--short" />
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

      <ul v-else class="board-list">
        <li v-for="item in boardItems" :key="item.id">
          <NuxtLink
            class="board-row"
            :class="[getPostType(item.kind).tone, { 'board-row--resolved': item.resolutionStatus !== 'open' }]"
            prefetch-on="interaction"
            :to="getBoardDetailPath(item.id)"
          >
            <span class="board-row__title">{{ item.title }}</span>
            <span class="board-row__meta">
              <span class="board-row__type">{{ getPostType(item.kind).tag }}</span>
              <span v-if="getItemPlace(item)" class="board-row__place">{{ getItemPlace(item) }}</span>
              <span v-if="item.resolutionStatus !== 'open'">{{ getResolutionBadgeLabel(item) }}</span>
              <time v-else :datetime="item.createdAt">{{ formatRelativeTime(item.createdAt) }}</time>
            </span>
            <span aria-hidden="true" class="i-carbon-chevron-right board-row__chevron" />
          </NuxtLink>
        </li>
      </ul>

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
  padding-top: 1rem;
}

.live-board {
  display: grid;
  gap: 0.75rem;
  scroll-margin-top: 8rem;
}

.live-board__heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem 1rem;
}

.live-board__identity {
  min-width: 0;
}

.live-board h1 {
  margin: 0;
  font-family: var(--font-serif);
  font-size: clamp(1.25rem, 2.3vw, 1.75rem);
  font-weight: 400;
  line-height: 1.2;
}

.live-board__summary {
  color: var(--site-subtle);
  font-size: var(--text-sm);
}

.board-options {
  flex: none;
}

.board-options__trigger {
  min-height: 2.25rem;
  padding: 0.4rem 0.6rem;
  border-color: var(--card-border);
  border-radius: var(--radius-sm);
  font-weight: 600;
}

.board-options__dialog {
  position: fixed;
  width: min(20rem, calc(100% - 2rem));
  max-width: none;
  max-height: calc(100dvh - 2rem);
  margin: 0;
  padding: 0.75rem;
  overflow: auto;
  border: 1px solid var(--field-border);
  border-radius: var(--radius-md);
  background: linear-gradient(var(--site-surface-strong), var(--site-surface-strong)), var(--site-bg-start);
  color: var(--site-text);
  box-shadow: var(--site-shadow);
}

.board-options__dialog::backdrop {
  background: rgb(0 0 0 / 10%);
}

.board-options__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
}

.board-options__header h2 {
  font: inherit;
  font-size: var(--text-sm);
  font-weight: 700;
}

.board-options__close {
  min-height: 2rem;
  width: 2rem;
  padding: 0;
  border-radius: var(--radius-sm);
}

.board-options__panel {
  display: grid;
  gap: 0.625rem;
}

.board-filters {
  display: grid;
  gap: 0.125rem;
}

.board-location {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.25rem;
}

.board-location .button {
  min-height: 2.25rem;
  padding: 0.35rem 0.4rem;
  font-weight: 600;
}

.board-toolbar__options {
  display: grid;
  gap: 0.5rem;
  padding-top: 0.625rem;
  border-top: 1px solid var(--divider);
}

.board-sort {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  font-size: var(--text-sm);
  font-weight: 600;
}

.board-sort .input {
  min-width: 0;
  min-height: 2.25rem;
  padding: 0.35rem 0.5rem;
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  font-weight: 400;
}

.board-filter {
  display: grid;
  grid-template-columns: 1rem minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.5rem;
  min-height: 2.25rem;
  padding: 0.3rem 0.5rem;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--site-text);
  font: inherit;
  font-size: var(--text-sm);
  text-align: left;
  cursor: pointer;
}

.board-filter:hover:not(:disabled),
.board-filter:focus-visible,
.board-filter[aria-pressed='true'] {
  background: var(--site-accent-soft);
  color: var(--site-heading);
}

.board-filter[aria-pressed='true'] {
  font-weight: 700;
}

.board-filter:disabled {
  opacity: 0.6;
  cursor: wait;
}

.board-filter__check--hidden {
  visibility: hidden;
}

.board-filter__count {
  color: var(--site-subtle);
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
}

.board-options__error {
  font-size: var(--text-sm);
}

.board-query {
  justify-self: start;
  max-width: 100%;
  overflow-wrap: anywhere;
  white-space: normal;
}

.board-notices {
  display: grid;
  gap: 0.6rem;
}

.board-notices:empty {
  display: none;
}

.board-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 21rem), 1fr));
  gap: 0.6rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.board-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.2rem 0.75rem;
  height: 100%;
  padding: 0.85rem 0.9rem 0.85rem 1rem;
  border: 1px solid var(--card-border);
  border-left: 4px solid var(--kind, var(--card-border));
  border-radius: var(--radius-md);
  background: var(--site-surface-strong);
  color: var(--site-heading);
  text-decoration: none;
  transition:
    border-color 160ms ease,
    box-shadow 160ms ease;
}

a.board-row:hover,
a.board-row:focus-visible {
  border-color: var(--field-border);
  border-left-color: var(--kind);
  box-shadow: var(--site-shadow);
  color: var(--site-heading);
}

.board-row--resolved {
  border-left-color: var(--card-border);
}

.board-row__title {
  font-weight: 700;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.board-row__meta {
  display: flex;
  flex-wrap: wrap;
  grid-column: 1;
  gap: 0 0.4rem;
  min-width: 0;
  color: var(--site-subtle);
  font-size: var(--text-sm);
}

.board-row__meta > * + *::before {
  content: '·';
  margin-right: 0.4rem;
}

.board-row__meta > * {
  flex: none;
}

.board-row__meta > .board-row__place {
  flex: 0 1 auto;
  overflow-wrap: anywhere;
}

.board-row__type {
  color: var(--kind);
  font-weight: 700;
}

.board-row__chevron {
  grid-column: 2;
  grid-row: 1 / span 2;
  color: var(--site-subtle);
}

.board-row--skeleton {
  gap: 0.6rem;
  grid-template-columns: 1fr;
}

.skeleton {
  display: block;
  height: 0.9rem;
  border-radius: 0.4rem;
  background: color-mix(in srgb, var(--site-text) 10%, transparent);
  animation: skeleton-pulse 1.4s ease-in-out infinite;
}

.skeleton--short {
  width: 45%;
}

.skeleton--title {
  width: 75%;
  height: 1.1rem;
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

@media (max-width: 640px) {
  .live-board__heading {
    flex-wrap: wrap;
  }

  .board-options {
    margin-left: auto;
  }

  .board-row__meta {
    font-size: var(--text-xs);
  }
}
</style>
