<script setup lang="ts">
import type {
  AdminActivityCounts,
  AdminActivityEntry,
  AdminKindCounts,
  AdminPagination,
  AdminReviewResponse,
  AdminReviewStatus,
  AdminSubmissionCounts,
  AdminSubmissionRecord,
  AdminSubmissionsResponse,
} from '~/utils/admin'
import type { SubmissionKind } from '~/utils/submissions'
import {
  clearStoredAdminKey,
  getAdminEndpoint,
  readStoredAdminKey,
  writeStoredAdminKey,
} from '~/utils/admin'

interface FormErrorState {
  detail: string
  message: string
}

type ReviewFilter = 'all' | AdminReviewStatus
type KindFilter = 'all' | SubmissionKind
type ActivityFilter = 'all' | AdminActivityEntry['category']

const emptyCounts: AdminSubmissionCounts = {
  approved: 0,
  needsFollowUp: 0,
  pending: 0,
  rejected: 0,
  total: 0,
}

const emptyKindCounts: AdminKindCounts = {
  'all': 0,
  'item-lending': 0,
  'item-request': 0,
  'service-request': 0,
}

const emptyActivityCounts: AdminActivityCounts = {
  deletions: 0,
  moderation: 0,
  posts: 0,
  reports: 0,
  replies: 0,
  total: 0,
}

const emptyPagination: AdminPagination = {
  hasNextPage: false,
  hasPreviousPage: false,
  page: 1,
  pageSize: 1,
  totalItems: 0,
  totalPages: 1,
}

const reviewStatusLabels: Record<AdminReviewStatus, string> = {
  'pending': 'Pending',
  'approved': 'Approved',
  'needs-follow-up': 'Needs Follow-Up',
  'rejected': 'Rejected',
}

const reviewActionOptions = [
  { status: 'approved' as const, label: 'Approve' },
  { status: 'needs-follow-up' as const, label: 'Needs Follow-Up' },
  { status: 'rejected' as const, label: 'Reject + hide' },
  { status: 'pending' as const, label: 'Reset / restore' },
]

const kindLabels: Record<SubmissionKind, string> = {
  'service-request': 'Service projects',
  'item-request': 'Borrow requests',
  'item-lending': 'Lending offers',
}

definePageMeta({
  layout: 'home',
})

useSeoMeta({
  title: 'Admin review',
  description:
    'Review stored submissions with an admin key. This page is separate from normal board user accounts.',
})

const runtimeConfig = useRuntimeConfig()
const route = useRoute()
const router = useRouter()

const hasHydrated = ref(false)
const adminKeyInput = ref('')
const activeAdminKey = ref('')
const authPending = ref(false)
const loadPending = ref(false)
const refreshPending = ref(false)
const authError = ref<FormErrorState | null>(null)
const dataError = ref<FormErrorState | null>(null)
const authNotice = ref('')
const submissions = ref<AdminSubmissionRecord[]>([])
const activityEntries = ref<AdminActivityEntry[]>([])
const counts = ref<AdminSubmissionCounts>({ ...emptyCounts })
const kindCounts = ref<AdminKindCounts>({ ...emptyKindCounts })
const activityCounts = ref<AdminActivityCounts>({ ...emptyActivityCounts })
const submissionsPagination = ref<AdminPagination>({
  ...emptyPagination,
  pageSize: 20,
})
const activityPagination = ref<AdminPagination>({
  ...emptyPagination,
  pageSize: 40,
})
const reviewFilter = ref<ReviewFilter>('pending')
const kindFilter = ref<KindFilter>('all')
const activityFilter = ref<ActivityFilter>('all')
const adminKeyField = ref<HTMLInputElement | null>(null)

const reviewPending = reactive<Record<string, boolean>>({})
const reviewErrors = reactive<Record<string, FormErrorState | null>>({})
const reviewNotices = reactive<Record<string, string>>({})
const notesDrafts = reactive<Record<string, string>>({})

const isAuthenticated = computed(() => Boolean(activeAdminKey.value))
const visibleSubmissions = computed(() => submissions.value)

const statusFilters = computed(() => [
  { key: 'all' as const, label: 'All', count: counts.value.total },
  { key: 'pending' as const, label: 'Pending', count: counts.value.pending },
  { key: 'approved' as const, label: 'Approved', count: counts.value.approved },
  {
    key: 'needs-follow-up' as const,
    label: 'Needs Follow-Up',
    count: counts.value.needsFollowUp,
  },
  { key: 'rejected' as const, label: 'Rejected', count: counts.value.rejected },
])

const kindFilters = computed(() => [
  { key: 'all' as const, label: 'All kinds', count: kindCounts.value.all },
  {
    key: 'service-request' as const,
    label: kindLabels['service-request'],
    count: kindCounts.value['service-request'],
  },
  {
    key: 'item-request' as const,
    label: kindLabels['item-request'],
    count: kindCounts.value['item-request'],
  },
  {
    key: 'item-lending' as const,
    label: kindLabels['item-lending'],
    count: kindCounts.value['item-lending'],
  },
])

const activityCategoryLabels: Record<Exclude<ActivityFilter, 'all'>, string> = {
  posts: 'Posts',
  replies: 'Replies',
  moderation: 'Moderation',
  deletions: 'Deletions',
  reports: 'Reports',
}

const filteredActivityEntries = computed(() => activityEntries.value)

const activityFilters = computed(() => {
  return [
    {
      key: 'all' as const,
      label: 'All activity',
      count: activityCounts.value.total,
    },
    ...Object.entries(activityCategoryLabels).map(([key, label]) => ({
      key: key as Exclude<ActivityFilter, 'all'>,
      label,
      count: activityCounts.value[key as Exclude<ActivityFilter, 'all'>],
    })),
  ]
})

function getQueryValue(value: unknown) {
  if (Array.isArray(value))
    return getQueryValue(value[0])

  return typeof value === 'string' ? value : ''
}

function parseReviewFilter(value: string): ReviewFilter {
  if (!value)
    return 'pending'

  if (value === 'all')
    return 'all'

  return reviewStatusLabels[value as AdminReviewStatus]
    ? (value as AdminReviewStatus)
    : 'pending'
}

function parseKindFilter(value: string): KindFilter {
  return kindLabels[value as SubmissionKind]
    ? (value as SubmissionKind)
    : 'all'
}

function parseActivityFilter(value: string): ActivityFilter {
  return activityCategoryLabels[value as Exclude<ActivityFilter, 'all'>]
    ? (value as Exclude<ActivityFilter, 'all'>)
    : 'all'
}

function parsePositivePage(value: string) {
  const parsedValue = Number.parseInt(value, 10)

  if (!Number.isFinite(parsedValue) || parsedValue < 1)
    return 1

  return parsedValue
}

function syncAdminStateFromRoute() {
  let changed = false
  const nextReviewFilter = parseReviewFilter(getQueryValue(route.query.review))
  const nextKindFilter = parseKindFilter(getQueryValue(route.query.kind))
  const nextActivityFilter = parseActivityFilter(
    getQueryValue(route.query.activity),
  )
  const nextSubmissionsPage = parsePositivePage(
    getQueryValue(route.query.submissionsPage),
  )
  const nextActivityPage = parsePositivePage(
    getQueryValue(route.query.activityPage),
  )

  if (reviewFilter.value !== nextReviewFilter) {
    reviewFilter.value = nextReviewFilter
    changed = true
  }

  if (kindFilter.value !== nextKindFilter) {
    kindFilter.value = nextKindFilter
    changed = true
  }

  if (activityFilter.value !== nextActivityFilter) {
    activityFilter.value = nextActivityFilter
    changed = true
  }

  if (submissionsPagination.value.page !== nextSubmissionsPage) {
    submissionsPagination.value = {
      ...submissionsPagination.value,
      page: nextSubmissionsPage,
    }
    changed = true
  }

  if (activityPagination.value.page !== nextActivityPage) {
    activityPagination.value = {
      ...activityPagination.value,
      page: nextActivityPage,
    }
    changed = true
  }

  return changed
}

async function pushAdminRouteState(nextState: {
  activityFilter?: ActivityFilter
  activityPage?: number
  kindFilter?: KindFilter
  reviewFilter?: ReviewFilter
  submissionsPage?: number
}) {
  const nextReviewFilter = nextState.reviewFilter ?? reviewFilter.value
  const nextKindFilter = nextState.kindFilter ?? kindFilter.value
  const nextActivityFilter = nextState.activityFilter ?? activityFilter.value
  const nextSubmissionsPage = Math.max(
    nextState.submissionsPage ?? submissionsPagination.value.page,
    1,
  )
  const nextActivityPage = Math.max(
    nextState.activityPage ?? activityPagination.value.page,
    1,
  )

  await router.push({
    hash: route.hash,
    path: route.path,
    query: {
      ...route.query,
      activity: nextActivityFilter === 'all' ? undefined : nextActivityFilter,
      activityPage: nextActivityPage > 1 ? String(nextActivityPage) : undefined,
      kind: nextKindFilter === 'all' ? undefined : nextKindFilter,
      review: nextReviewFilter === 'pending' ? undefined : nextReviewFilter,
      submissionsPage:
        nextSubmissionsPage > 1 ? String(nextSubmissionsPage) : undefined,
    },
  })
}

function formatSubmissionDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function formatStatusLabel(status: AdminReviewStatus) {
  return reviewStatusLabels[status]
}

function formatActivityCategory(category: AdminActivityEntry['category']) {
  return activityCategoryLabels[category]
}

function formatActivityAction(action: string) {
  if (action === 'board_item_created')
    return 'Post created'

  if (action === 'board_interaction_created')
    return 'Reply posted'

  if (action === 'submission_reviewed')
    return 'Review saved'

  if (action === 'board_item_hidden_by_admin')
    return 'Hidden from public board'

  if (action === 'board_item_restored_to_public')
    return 'Restored to public board'

  if (action === 'board_item_deleted')
    return 'Post deleted'

  if (action === 'board_interaction_deleted')
    return 'Reply deleted'

  if (action === 'board_item_reported')
    return 'Post reported'

  if (action === 'board_interaction_reported')
    return 'Reply reported'

  return action.replaceAll('_', ' ')
}

function getReviewButtonLabel(submissionId: string, baseLabel: string) {
  return reviewPending[submissionId] ? 'Saving…' : baseLabel
}

function clearAdminSession() {
  clearStoredAdminKey()
  activeAdminKey.value = ''
  counts.value = { ...emptyCounts }
  kindCounts.value = { ...emptyKindCounts }
  activityCounts.value = { ...emptyActivityCounts }
  submissionsPagination.value = {
    ...emptyPagination,
    pageSize: submissionsPagination.value.pageSize,
  }
  activityPagination.value = {
    ...emptyPagination,
    pageSize: activityPagination.value.pageSize,
  }
  activityEntries.value = []
  submissions.value = []
}

function seedReviewState(nextSubmissions: AdminSubmissionRecord[]) {
  for (const submission of nextSubmissions) {
    if (!(submission.id in reviewPending))
      reviewPending[submission.id] = false

    if (!(submission.id in reviewErrors))
      reviewErrors[submission.id] = null

    notesDrafts[submission.id] = submission.review.notes

    if (!(submission.id in reviewNotices))
      reviewNotices[submission.id] = ''
  }
}

function getApiErrorState(
  error: unknown,
  endpoint: string,
  fallbackMessage: string,
): FormErrorState {
  const fallbackDetail = `Request URL: ${endpoint}. Please try again in a moment.`
  let statusCode: number | null = null
  let serverMessage = ''

  if (error && typeof error === 'object') {
    if ('status' in error && typeof error.status === 'number')
      statusCode = error.status

    if ('data' in error) {
      const data = (error as { data?: unknown }).data

      if (
        data
        && typeof data === 'object'
        && 'message' in data
        && typeof data.message === 'string'
      ) {
        serverMessage = data.message
      }
    }
  }

  if (statusCode === 401 || statusCode === 403) {
    return {
      message: serverMessage || 'The admin key was missing or invalid.',
      detail:
        'Re-enter a valid admin key to continue. This admin access path is separate from normal board user accounts.',
    }
  }

  if (statusCode === 404) {
    return {
      message:
        serverMessage || 'The admin review API is not available at this URL.',
      detail: `Request URL: ${endpoint}.`,
    }
  }

  if (statusCode === 503) {
    return {
      message:
        serverMessage || 'Admin review is not configured on this server.',
      detail: `Request URL: ${endpoint}.`,
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

async function loadAdminSubmissions(
  candidateKey = activeAdminKey.value,
  options?: {
    authAttempt?: boolean
    background?: boolean
    showSessionNotice?: boolean
  },
) {
  const endpoint = new URL(
    getAdminEndpoint(runtimeConfig.public.apiBaseUrl, 'submissions'),
  )
  endpoint.searchParams.set('review', reviewFilter.value)
  endpoint.searchParams.set('kind', kindFilter.value)
  endpoint.searchParams.set('activityCategory', activityFilter.value)
  endpoint.searchParams.set(
    'submissionsPage',
    String(submissionsPagination.value.page),
  )
  endpoint.searchParams.set(
    'submissionsPageSize',
    String(submissionsPagination.value.pageSize),
  )
  endpoint.searchParams.set(
    'activityPage',
    String(activityPagination.value.page),
  )
  endpoint.searchParams.set(
    'activityPageSize',
    String(activityPagination.value.pageSize),
  )
  const normalizedKey = candidateKey.trim()

  if (!normalizedKey) {
    const nextError = {
      message: 'Enter an admin key to continue.',
      detail: 'This page does not use the normal board account sign-in.',
    }

    if (options?.authAttempt)
      authError.value = nextError

    return
  }

  const useBackgroundRefresh = Boolean(options?.background)

  if (useBackgroundRefresh)
    refreshPending.value = true
  else loadPending.value = true

  dataError.value = null

  try {
    const response = await $fetch<AdminSubmissionsResponse>(
      endpoint.toString(),
      {
        headers: {
          'x-admin-key': normalizedKey,
        },
      },
    )

    activeAdminKey.value = normalizedKey
    writeStoredAdminKey(normalizedKey)
    counts.value = response.counts
    kindCounts.value = response.kindCounts
    activityEntries.value = response.activity
    activityCounts.value = response.activityCounts
    activityPagination.value = response.activityPagination
    submissions.value = response.submissions
    submissionsPagination.value = response.submissionsPagination
    seedReviewState(response.submissions)
    adminKeyInput.value = ''
    authError.value = null
    if (options?.showSessionNotice !== false) {
      authNotice.value
        = 'Admin key accepted. It is stored only in this browser session.'
    }
  }
  catch (error) {
    const errorState = getApiErrorState(
      error,
      endpoint.toString(),
      'Unable to load admin submissions right now.',
    )

    if (
      (error as { status?: number })?.status === 401
      || (error as { status?: number })?.status === 403
    ) {
      clearAdminSession()
      authError.value = errorState
      authNotice.value = ''
      adminKeyInput.value = ''
      await nextTick()
      adminKeyField.value?.focus()
      return
    }

    if (options?.authAttempt)
      authError.value = errorState
    else dataError.value = errorState
  }
  finally {
    if (useBackgroundRefresh)
      refreshPending.value = false
    else loadPending.value = false
  }
}

async function submitAdminKey() {
  authPending.value = true
  authNotice.value = ''
  authError.value = null

  try {
    await loadAdminSubmissions(adminKeyInput.value, { authAttempt: true })
  }
  finally {
    authPending.value = false
  }
}

function signOutAdmin() {
  clearAdminSession()
  adminKeyInput.value = ''
  authNotice.value = ''
  dataError.value = null
  authError.value = null
}

function setReviewFilter(nextFilter: ReviewFilter) {
  if (
    reviewFilter.value === nextFilter
    && submissionsPagination.value.page === 1
  ) {
    return
  }

  void pushAdminRouteState({
    reviewFilter: nextFilter,
    submissionsPage: 1,
  })
}

function setKindFilter(nextFilter: KindFilter) {
  if (kindFilter.value === nextFilter && submissionsPagination.value.page === 1)
    return

  void pushAdminRouteState({
    kindFilter: nextFilter,
    submissionsPage: 1,
  })
}

function setActivityFilter(nextFilter: ActivityFilter) {
  if (
    activityFilter.value === nextFilter
    && activityPagination.value.page === 1
  ) {
    return
  }

  void pushAdminRouteState({
    activityFilter: nextFilter,
    activityPage: 1,
  })
}

function changeSubmissionsPage(nextPage: number) {
  const normalizedPage = Math.min(
    Math.max(nextPage, 1),
    submissionsPagination.value.totalPages,
  )

  if (normalizedPage === submissionsPagination.value.page)
    return

  void pushAdminRouteState({
    submissionsPage: normalizedPage,
  })
}

function changeActivityPage(nextPage: number) {
  const normalizedPage = Math.min(
    Math.max(nextPage, 1),
    activityPagination.value.totalPages,
  )

  if (normalizedPage === activityPagination.value.page)
    return

  void pushAdminRouteState({
    activityPage: normalizedPage,
  })
}

async function saveReview(
  submission: AdminSubmissionRecord,
  status: AdminReviewStatus,
) {
  const endpoint = getAdminEndpoint(
    runtimeConfig.public.apiBaseUrl,
    `submissions/${submission.kind}/${submission.id}/review`,
  )
  const previousScrollY = import.meta.client ? window.scrollY : 0
  reviewPending[submission.id] = true
  reviewErrors[submission.id] = null
  reviewNotices[submission.id] = ''

  try {
    const response = await $fetch<AdminReviewResponse>(endpoint, {
      body: {
        notes: notesDrafts[submission.id] || '',
        status,
      },
      headers: {
        'x-admin-key': activeAdminKey.value,
      },
      method: 'POST',
    })

    await loadAdminSubmissions(activeAdminKey.value, {
      background: true,
      showSessionNotice: false,
    })
    await nextTick()

    if (import.meta.client) {
      const maxScrollTop = Math.max(
        document.documentElement.scrollHeight - window.innerHeight,
        0,
      )
      window.scrollTo({
        top: Math.min(previousScrollY, maxScrollTop),
      })
    }

    reviewNotices[submission.id]
      = status === 'rejected'
        ? response.submission.board.publicState === 'hidden_by_admin'
          ? 'Rejected and hidden from the public board.'
          : 'Rejected. No linked public board item was hidden.'
        : status === 'pending'
          ? 'Review reset. Hidden item restored if it had only been hidden by rejection.'
          : `Saved as ${formatStatusLabel(status).toLowerCase()}.`
  }
  catch (error) {
    const errorState = getApiErrorState(
      error,
      endpoint,
      'Unable to save that review right now.',
    )

    if (
      (error as { status?: number })?.status === 401
      || (error as { status?: number })?.status === 403
    ) {
      clearAdminSession()
      authError.value = errorState
      dataError.value = null
      authNotice.value = ''
      return
    }

    reviewErrors[submission.id] = errorState
  }
  finally {
    reviewPending[submission.id] = false
  }
}

onMounted(() => {
  hasHydrated.value = true
  syncAdminStateFromRoute()

  const storedAdminKey = readStoredAdminKey()

  if (!storedAdminKey) {
    adminKeyField.value?.focus()
    return
  }

  void loadAdminSubmissions(storedAdminKey, { showSessionNotice: false })
})

watch(
  () => [
    getQueryValue(route.query.review),
    getQueryValue(route.query.kind),
    getQueryValue(route.query.activity),
    getQueryValue(route.query.submissionsPage),
    getQueryValue(route.query.activityPage),
  ],
  () => {
    if (!hasHydrated.value)
      return

    const changed = syncAdminStateFromRoute()

    if (changed && isAuthenticated.value) {
      void loadAdminSubmissions(activeAdminKey.value, {
        background: true,
        showSessionNotice: false,
      })
    }
  },
)
</script>

<template>
  <div class="admin-page">
    <section class="admin-page__hero">
      <NuxtLink
        class="admin-page__back"
        prefetch-on="interaction"
        to="/#live-board"
      >
        Back to live board
      </NuxtLink>

      <p class="eyebrow">
        Admin review
      </p>
      <h1>Review board submissions.</h1>
      <p class="admin-page__lede">
        This page is separate from the normal board account flow. Use the admin
        key here when you need moderation and review access.
      </p>
    </section>

    <section class="admin-page__panel">
      <div class="admin-page__copy">
        <p class="eyebrow">
          Separate access path
        </p>
        <h2>This is not the optional account sign-in.</h2>
        <ul class="admin-page__list">
          <li>Use the admin key here, not the public account login.</li>
          <li>The key stays only for the current browser session.</li>
          <li>Sign out here when you are done reviewing.</li>
        </ul>
      </div>

      <div class="admin-panel">
        <p
          v-if="authNotice"
          class="inline-note inline-note--success"
          role="status"
        >
          {{ authNotice }}
        </p>
        <p v-if="authError" class="inline-note inline-note--error" role="alert">
          {{ authError.message }} {{ authError.detail }}
        </p>
        <p v-if="dataError" class="inline-note inline-note--error" role="alert">
          {{ dataError.message }} {{ dataError.detail }}
        </p>

        <form
          v-if="hasHydrated && !isAuthenticated"
          class="admin-form"
          @submit.prevent="submitAdminKey"
        >
          <label class="field">
            <span>Admin key</span>
            <input
              ref="adminKeyField"
              v-model="adminKeyInput"
              autocomplete="off"
              name="admin_key"
              placeholder="Enter the admin key"
              required
              spellcheck="false"
              type="password"
            >
          </label>

          <button class="submit-button" :disabled="authPending" type="submit">
            {{ authPending ? "Checking key…" : "Sign in with admin key" }}
          </button>
        </form>

        <div v-else-if="hasHydrated" class="admin-panel__session">
          <div>
            <p class="admin-panel__label">
              Admin session
            </p>
            <strong>Key accepted</strong>
            <small>Stored only for this browser session.</small>
          </div>

          <button class="secondary-button" type="button" @click="signOutAdmin">
            Sign out
          </button>
        </div>
        <p v-else class="inline-note" role="status">
          Loading admin tools…
        </p>
      </div>
    </section>

    <section v-if="isAuthenticated" class="admin-review">
      <div class="section-heading">
        <p class="eyebrow">
          Review queue
        </p>
        <h2>Review stored submissions and record an admin decision.</h2>
        <p class="section-copy">
          Rejecting a submission hides its linked board item from public view
          while keeping the internal record here for review history.
        </p>
      </div>

      <div class="admin-review__filters">
        <div
          class="filter-strip"
          role="tablist"
          aria-label="Review status filters"
        >
          <button
            v-for="filter in statusFilters"
            :key="filter.key"
            :aria-selected="reviewFilter === filter.key"
            class="filter-chip"
            :class="{ 'filter-chip--active': reviewFilter === filter.key }"
            type="button"
            @click="setReviewFilter(filter.key)"
          >
            <span>{{ filter.label }}</span>
            <strong>{{ filter.count }}</strong>
          </button>
        </div>

        <div
          class="filter-strip"
          role="tablist"
          aria-label="Submission type filters"
        >
          <button
            v-for="filter in kindFilters"
            :key="filter.key"
            :aria-selected="kindFilter === filter.key"
            class="filter-chip"
            :class="{ 'filter-chip--active': kindFilter === filter.key }"
            type="button"
            @click="setKindFilter(filter.key)"
          >
            <span>{{ filter.label }}</span>
            <strong>{{ filter.count }}</strong>
          </button>
        </div>
      </div>

      <p v-if="refreshPending" class="inline-note" role="status">
        Refreshing admin review results…
      </p>
      <div
        v-if="loadPending && !visibleSubmissions.length"
        class="admin-empty"
        role="status"
      >
        Loading admin submissions…
      </div>
      <div v-else-if="!visibleSubmissions.length" class="admin-empty">
        No submissions match the current filters.
      </div>
      <div v-else class="admin-review__list">
        <div class="admin-pagination admin-pagination--summary">
          <span>Page {{ submissionsPagination.page }} of
            {{ submissionsPagination.totalPages }}</span>
          <span>{{ submissionsPagination.totalItems }} submissions match the
            current queue filters.</span>
        </div>
        <article
          v-for="submission in visibleSubmissions"
          :key="submission.id"
          class="admin-card"
        >
          <header class="admin-card__header">
            <div>
              <p class="admin-card__kind">
                {{ submission.kindLabel }}
              </p>
              <h3>{{ submission.title }}</h3>
            </div>

            <div class="admin-card__meta">
              <span>{{ formatSubmissionDate(submission.createdAt) }}</span>
              <span
                class="admin-card__status"
                :data-status="submission.review.status"
              >
                {{ formatStatusLabel(submission.review.status) }}
              </span>
              <span
                class="admin-card__status admin-card__status--board"
                :data-status="submission.board.publicState"
              >
                {{ submission.board.publicStateLabel }}
              </span>
            </div>
          </header>

          <p class="admin-card__summary">
            {{ submission.summary || "No summary available." }}
          </p>

          <p class="admin-card__board-note">
            {{ submission.board.visibilityNote }}
            <span v-if="submission.board.itemId">
              Item ID: <code>{{ submission.board.itemId }}</code>
            </span>
          </p>

          <dl class="admin-card__fields">
            <div
              v-for="entry in submission.fieldEntries"
              :key="`${submission.id}-${entry.label}`"
            >
              <dt>{{ entry.label }}</dt>
              <dd>{{ entry.value }}</dd>
            </div>
          </dl>

          <div
            v-if="submission.meta.ip || submission.meta.userAgent"
            class="admin-card__meta-note"
          >
            <span v-if="submission.meta.ip">IP: {{ submission.meta.ip }}</span>
            <span v-if="submission.meta.userAgent">User agent: {{ submission.meta.userAgent }}</span>
          </div>

          <label class="field field--wide">
            <span>Admin notes</span>
            <textarea
              v-model="notesDrafts[submission.id]"
              placeholder="Add context for the review decision or next step."
              rows="4"
            />
          </label>

          <div class="admin-card__actions">
            <p class="admin-card__action-note">
              Reject + hide removes the linked board item from public listings
              without deleting this stored submission.
            </p>
            <button
              v-for="action in reviewActionOptions"
              :key="`${submission.id}-${action.status}`"
              class="secondary-button"
              :class="{
                'secondary-button--dark':
                  action.status === submission.review.status,
                'secondary-button--danger': action.status === 'rejected',
              }"
              :disabled="reviewPending[submission.id] || refreshPending"
              type="button"
              @click="saveReview(submission, action.status)"
            >
              {{ getReviewButtonLabel(submission.id, action.label) }}
            </button>
          </div>

          <p
            v-if="submission.review.reviewedAt"
            class="admin-card__reviewed-at"
          >
            Last reviewed
            {{ formatSubmissionDate(submission.review.reviewedAt) }}
          </p>
          <p
            v-if="reviewNotices[submission.id]"
            class="inline-note inline-note--success"
            role="status"
          >
            {{ reviewNotices[submission.id] }}
          </p>
          <p
            v-if="reviewErrors[submission.id]"
            class="inline-note inline-note--error"
            role="alert"
          >
            {{ reviewErrors[submission.id]?.message }}
            {{ reviewErrors[submission.id]?.detail }}
          </p>
        </article>
        <div class="admin-pagination">
          <button
            class="secondary-button"
            :disabled="
              loadPending
                || refreshPending
                || !submissionsPagination.hasPreviousPage
            "
            type="button"
            @click="changeSubmissionsPage(submissionsPagination.page - 1)"
          >
            Newer submissions
          </button>
          <button
            class="secondary-button secondary-button--dark"
            :disabled="
              loadPending
                || refreshPending
                || !submissionsPagination.hasNextPage
            "
            type="button"
            @click="changeSubmissionsPage(submissionsPagination.page + 1)"
          >
            Older submissions
          </button>
        </div>
      </div>
    </section>

    <section v-if="isAuthenticated" class="admin-review admin-review--activity">
      <div class="section-heading">
        <p class="eyebrow">
          Activity log
        </p>
        <h2>
          Track posts, replies, reports, moderation actions, and deletions.
        </h2>
        <p class="section-copy">
          This log keeps the internal moderation trail even when a post is
          hidden from the public board.
        </p>
      </div>

      <div class="admin-review__filters">
        <div class="filter-strip" role="tablist" aria-label="Activity filters">
          <button
            v-for="filter in activityFilters"
            :key="filter.key"
            :aria-selected="activityFilter === filter.key"
            class="filter-chip"
            :class="{ 'filter-chip--active': activityFilter === filter.key }"
            type="button"
            @click="setActivityFilter(filter.key)"
          >
            <span>{{ filter.label }}</span>
            <strong>{{ filter.count }}</strong>
          </button>
        </div>
      </div>

      <p v-if="refreshPending" class="inline-note" role="status">
        Refreshing activity log…
      </p>

      <div
        v-if="loadPending && !filteredActivityEntries.length"
        class="admin-empty"
        role="status"
      >
        Loading admin activity…
      </div>

      <div v-else-if="!filteredActivityEntries.length" class="admin-empty">
        No activity has been recorded for the current filters yet.
      </div>

      <div v-else class="admin-activity">
        <div class="admin-pagination admin-pagination--summary">
          <span>Page {{ activityPagination.page }} of
            {{ activityPagination.totalPages }}</span>
          <span>{{ activityPagination.totalItems }} activity entries match the
            current filter.</span>
        </div>
        <article
          v-for="entry in filteredActivityEntries"
          :key="entry.id"
          class="admin-activity__entry"
        >
          <div class="admin-activity__meta">
            <span class="admin-activity__category">{{
              formatActivityCategory(entry.category)
            }}</span>
            <span>{{ formatSubmissionDate(entry.createdAt) }}</span>
          </div>
          <div class="admin-activity__content">
            <p class="admin-activity__title">
              {{ formatActivityAction(entry.action) }}: {{ entry.title }}
            </p>
            <p class="admin-activity__detail">
              {{ entry.detail }}
            </p>
            <p class="admin-activity__actor">
              Actor: {{ entry.actor.label }}
              <span v-if="entry.kind">
                · Kind: {{ kindLabels[entry.kind] }}</span>
              <span v-if="entry.visibilityState">
                · State: {{ entry.visibilityState }}</span>
              <span v-if="entry.submissionId">
                · Submission: <code>{{ entry.submissionId }}</code></span>
              <span v-if="entry.itemId">
                · Item: <code>{{ entry.itemId }}</code></span>
              <span v-if="entry.interactionId">
                · Reply: <code>{{ entry.interactionId }}</code></span>
            </p>
          </div>
        </article>
        <div class="admin-pagination">
          <button
            class="secondary-button"
            :disabled="
              loadPending
                || refreshPending
                || !activityPagination.hasPreviousPage
            "
            type="button"
            @click="changeActivityPage(activityPagination.page - 1)"
          >
            Newer activity
          </button>
          <button
            class="secondary-button secondary-button--dark"
            :disabled="
              loadPending || refreshPending || !activityPagination.hasNextPage
            "
            type="button"
            @click="changeActivityPage(activityPagination.page + 1)"
          >
            Older activity
          </button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.admin-page {
  display: grid;
  gap: var(--page-section-gap);
  padding-top: 0;
  padding-right: var(--page-inline-end);
  padding-bottom: 2.75rem;
  padding-left: var(--page-inline-start);
}

.admin-page__hero,
.admin-review {
  display: grid;
  gap: 1rem;
}

.admin-page__hero {
  min-width: 0;
  max-width: var(--page-hero-max);
  padding-block: var(--page-hero-space);
  gap: var(--page-hero-gap);
}

.admin-page__back {
  width: fit-content;
  color: var(--site-link);
  font-weight: 700;
  text-decoration: none;
}

.admin-page__back:hover,
.admin-page__back:focus-visible {
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

.admin-page h1,
.admin-page h2,
.admin-card h3 {
  margin: 0;
  font-family: 'DM Serif Display', serif;
  font-weight: 400;
  letter-spacing: -0.03em;
  color: var(--site-heading);
}

.admin-page h1 {
  max-width: var(--page-hero-title-max);
  font-size: var(--page-hero-title-size);
  line-height: 0.92;
  overflow-wrap: anywhere;
  text-wrap: balance;
}

.admin-page__lede,
.section-copy,
.admin-card__summary,
.admin-page__list {
  color: var(--site-text);
  line-height: 1.7;
}

.admin-page__lede {
  max-width: var(--page-hero-copy-max);
  margin: 0;
  font-size: 1.02rem;
}

.section-heading {
  max-width: var(--page-hero-copy-max);
}

.section-copy {
  margin: 0;
}

.admin-page__lede code,
.admin-page__list code {
  padding: 0.15rem 0.4rem;
  border-radius: 0.55rem;
  background: var(--site-elevated);
  font-size: 0.95em;
}

.admin-page__panel {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  gap: 1.2rem;
  align-items: start;
}

.admin-page__copy,
.admin-panel,
.admin-card {
  min-width: 0;
  padding: var(--page-surface-padding);
  border-radius: var(--page-surface-radius);
  background: var(--site-surface);
  border: 1px solid var(--site-border);
  box-shadow: var(--site-shadow);
}

.admin-page__copy,
.admin-panel,
.admin-review__list {
  display: grid;
  gap: 1rem;
}

.admin-page__list {
  margin: 0;
  padding-left: 1.15rem;
}

.admin-form {
  display: grid;
  gap: 0.9rem;
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
  min-height: 6rem;
}

.field input:focus-visible,
.field textarea:focus-visible {
  outline: none;
  border-color: var(--site-focus);
  box-shadow: 0 0 0 4px var(--site-focus-ring);
  background: var(--site-elevated-strong);
}

.submit-button,
.secondary-button,
.filter-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2.95rem;
  padding: 0.88rem 1.2rem;
  border: 0;
  border-radius: 1rem;
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

.secondary-button,
.filter-chip {
  background: transparent;
  color: var(--site-heading);
  border: 1px solid var(--site-border-strong);
}

.secondary-button:hover,
.secondary-button:focus-visible,
.filter-chip:hover,
.filter-chip:focus-visible,
.filter-chip--active {
  transform: translateY(-1px);
  background: var(--site-elevated-strong);
  border-color: var(--site-accent-soft-strong);
}

.secondary-button--danger {
  background: var(--site-error-bg);
  color: var(--site-error-text);
  border-color: rgba(181, 95, 82, 0.3);
}

.secondary-button--danger:hover,
.secondary-button--danger:focus-visible {
  background: rgba(181, 95, 82, 0.24);
}

.submit-button:disabled,
.secondary-button:disabled {
  opacity: 0.68;
  cursor: wait;
  transform: none;
}

.admin-panel__session {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem;
  border-radius: 1.2rem;
  background: var(--site-elevated);
}

.admin-panel__label {
  margin: 0 0 0.2rem;
  font-size: 0.74rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--site-muted);
}

.admin-panel__session strong,
.admin-panel__session small {
  display: block;
  overflow-wrap: anywhere;
}

.admin-panel__session small {
  margin-top: 0.2rem;
  color: var(--site-subtle);
}

.inline-note,
.admin-empty {
  margin: 0;
  padding: 0.9rem 1rem;
  border-radius: 1rem;
  line-height: 1.55;
}

.inline-note {
  background: var(--site-surface-soft);
  color: var(--site-subtle);
}

.inline-note--success {
  background: var(--site-success-bg);
  color: var(--site-success-text);
}

.inline-note--error {
  background: var(--site-error-bg);
  color: var(--site-error-text);
}

.admin-review__filters {
  display: grid;
  gap: 0.75rem;
}

.filter-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.filter-chip {
  gap: 0.5rem;
  min-width: fit-content;
}

.filter-chip strong {
  font-size: 0.84rem;
  color: var(--site-subtle);
}

.admin-review__list {
  gap: 1rem;
}

.admin-pagination {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.85rem;
}

.admin-pagination--summary {
  color: var(--site-subtle);
  font-size: 0.94rem;
}

.admin-card {
  display: grid;
  gap: 1rem;
}

.admin-card__header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
}

.admin-card__header > div,
.admin-card__meta-note {
  min-width: 0;
}

.admin-card__kind {
  margin: 0;
  font-size: 0.76rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--site-muted);
}

.admin-card h3 {
  margin-top: 0.35rem;
  font-size: 2rem;
  line-height: 1;
  overflow-wrap: anywhere;
  text-wrap: balance;
}

.admin-card__meta {
  display: grid;
  gap: 0.35rem;
  justify-items: end;
  color: var(--site-subtle);
  font-size: 0.88rem;
}

.admin-card__status {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.28rem 0.55rem;
  border-radius: 0.78rem;
  background: var(--site-accent-soft);
  color: var(--site-link);
  font-size: 0.76rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.admin-card__status[data-status='approved'] {
  background: var(--site-success-bg);
  color: var(--site-success-text);
}

.admin-card__status[data-status='rejected'] {
  background: var(--site-error-bg);
  color: var(--site-error-text);
}

.admin-card__summary,
.admin-card__reviewed-at,
.admin-card__meta-note {
  margin: 0;
}

.admin-card__board-note,
.admin-card__action-note,
.admin-card__summary,
.admin-card__meta-note,
.admin-card__reviewed-at {
  overflow-wrap: anywhere;
}

.admin-card__board-note,
.admin-card__action-note,
.admin-activity__detail,
.admin-activity__actor,
.admin-activity__title {
  margin: 0;
}

.admin-card__board-note,
.admin-card__action-note {
  color: var(--site-subtle);
  line-height: 1.6;
}

.admin-card__board-note code,
.admin-activity__actor code {
  padding: 0.14rem 0.42rem;
  border-radius: 0.55rem;
  background: var(--site-elevated);
  font-size: 0.92em;
}

.admin-card__fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 0.8rem;
  margin: 0;
}

.admin-card__fields div {
  padding: 0.9rem 0.95rem;
  border-radius: 1rem;
  background: var(--site-elevated);
}

.admin-card__fields dt {
  margin: 0;
  font-size: 0.75rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--site-muted);
}

.admin-card__fields dd {
  margin: 0.4rem 0 0;
  color: var(--site-heading);
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.admin-card__meta-note {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  color: var(--site-subtle);
  font-size: 0.9rem;
}

.admin-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.admin-card__status--board[data-status='visible'] {
  background: var(--site-success-bg);
  color: var(--site-success-text);
}

.admin-card__status--board[data-status='hidden_by_admin'] {
  background: var(--site-error-bg);
  color: var(--site-error-text);
}

.admin-card__status--board[data-status='deleted_by_owner'],
.admin-card__status--board[data-status='deleted_by_admin'] {
  background: var(--site-surface-soft);
  color: var(--site-subtle);
}

.admin-review--activity {
  gap: 1rem;
}

.admin-activity {
  display: grid;
  gap: 1rem;
}

.admin-activity__entry {
  display: grid;
  gap: 0.9rem;
  padding: 1.25rem 1.35rem;
  border-radius: 1.35rem;
  background: var(--site-surface);
  border: 1px solid var(--site-border);
  box-shadow: var(--site-shadow);
}

.admin-activity__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  color: var(--site-subtle);
  font-size: 0.86rem;
}

.admin-activity__category {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.24rem 0.52rem;
  border-radius: 999px;
  background: var(--site-accent-soft);
  color: var(--site-link);
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.admin-activity__content {
  display: grid;
  gap: 0.45rem;
}

.admin-activity__title {
  color: var(--site-heading);
  font-weight: 700;
  line-height: 1.4;
}

.admin-activity__detail,
.admin-activity__actor {
  color: var(--site-subtle);
  line-height: 1.6;
}

@media (max-width: 1080px) {
  .admin-page__panel {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .admin-page h1 {
    max-width: 100%;
  }

  .admin-page__copy,
  .admin-panel,
  .admin-card {
    padding: 1.2rem;
  }

  .admin-panel__session,
  .admin-card__header {
    align-items: flex-start;
    flex-direction: column;
  }

  .admin-card__meta {
    justify-items: start;
  }

  .admin-card__actions,
  .secondary-button,
  .submit-button {
    width: 100%;
  }

  .admin-activity__meta {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
