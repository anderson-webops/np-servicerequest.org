import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import process from 'node:process'

import {
  AccountAuthenticationError,
  getViewerFromCookie,
  invalidateViewerSession,
  loginBoardAccount,
  registerBoardAccount,
} from './accounts.js'
import { boardActivityCategories } from './activity.js'
import {
  AdminAuthorizationError,
  AdminConfigurationError,
  adminReviewStatuses,
  AdminSubmissionNotFoundError,
  AdminSubmissionValidationError,
  assertValidAdminSession,
  assertValidAdminKey,
  clearAdminSessionCookie,
  createAdminSessionCookie,
  createAdminSessionToken,
  invalidateAdminSession,
  listAdminSubmissions,
  reviewAdminSubmission,
} from './admin.js'
import {
  BoardAuthorizationError,
  boardItemSortOrders,
  BoardNotFoundError,
  BoardValidationError,
  claimBoardItemManagement,
  createBoardInteraction,
  createBoardInteractionReport,
  createBoardItemFromSubmission,
  createBoardItemReport,
  deleteBoardInteraction,
  deleteBoardItem,
  getPublicBoardItem,
  listBoardItems,
  revealBoardInteractionContact,
  revealBoardItemContact,
  setBoardItemResolution,
} from './board.js'
import { normalizeStructuredContact } from './contact.js'
import {
  sendBoardInteractionNotificationEmail,
  sendBoardItemManagementLinkEmail,
  sendBoardItemNotificationEmail,
  sendBoardOwnerReplyNotificationEmail,
} from './notifications.js'
import {
  assertAllowedUnsafeRequest,
  BotProtectionError,
  clearSessionCookie,
  consumeRateLimit,
  createAntiBotChallenge,
  createSessionCookie,
  hashRateLimitIdentifier,
  isAllowedRequestOrigin,
  RateLimitError,
  RequestOriginError,
  validateAntiBotPayload,
} from './security.js'
import { searchServiceDirectory } from './service-directory.js'
import { resolveReleaseIdentity } from './release-identity.js'
import {
  AccountValidationError,
  attachBoardItemToSubmission,
  isSubmissionKind,
  saveSubmission,
  SubmissionValidationError,
} from './submissions.js'

const startedAt = Date.now()
let pageview = 0

function getRateLimitClientId(request: express.Request) {
  return hashRateLimitIdentifier(
    request.ip || request.socket.remoteAddress || 'unknown',
  )
}

function getInlineScriptHashes(staticDirectory: string | undefined) {
  if (!staticDirectory)
    return []

  const htmlFiles = listHtmlFiles(staticDirectory)
  const hashes = new Set<string>()

  for (const htmlFile of htmlFiles) {
    const html = readFileSync(htmlFile, 'utf8')

    for (const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
      const attributes = match[1]
      const contents = match[2]

      if (
        /\bsrc\s*=/i.test(attributes)
        || /\btype\s*=\s*["']application\/json["']/i.test(attributes)
        || !contents
      ) {
        continue
      }

      hashes.add(`'sha256-${createHash('sha256').update(contents).digest('base64')}'`)
    }
  }

  if (!hashes.size)
    throw new Error('The generated site does not expose the expected inline script hashes.')

  return [...hashes]
}

function listHtmlFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const entryPath = resolve(directory, entry.name)

      if (entry.isDirectory())
        return listHtmlFiles(entryPath)

      return entry.isFile() && entry.name.endsWith('.html') ? [entryPath] : []
    })
}

function getSingleQueryValue(value: unknown): string {
  if (Array.isArray(value))
    return getSingleQueryValue(value[0])

  if (typeof value === 'string')
    return value

  return ''
}

function parsePositiveInt(value: unknown, fallback: number, max: number) {
  const parsedValue = Number.parseInt(getSingleQueryValue(value), 10)

  if (!Number.isFinite(parsedValue) || parsedValue < 1)
    return fallback

  return Math.min(parsedValue, max)
}

function parseMaybeFloat(value: unknown) {
  const parsedValue = Number.parseFloat(getSingleQueryValue(value))

  if (!Number.isFinite(parsedValue))
    return undefined

  return parsedValue
}

function handleApiError(response: express.Response, error: unknown) {
  if (error instanceof AdminSubmissionValidationError) {
    response.status(400).json({
      message: error.message,
    })
    return true
  }

  if (error instanceof AdminAuthorizationError) {
    response.status(401).json({
      message: error.message,
    })
    return true
  }

  if (error instanceof AccountAuthenticationError) {
    response.status(401).json({
      antiBot: createAntiBotChallenge(),
      message: error.message,
    })
    return true
  }

  if (error instanceof AdminConfigurationError) {
    response.status(503).json({
      message: error.message,
    })
    return true
  }

  if (error instanceof AdminSubmissionNotFoundError) {
    response.status(404).json({
      message: error.message,
    })
    return true
  }

  if (error instanceof SubmissionValidationError || error instanceof AccountValidationError || error instanceof BotProtectionError) {
    response.status(400).json({
      antiBot: createAntiBotChallenge(),
      message: error.message,
    })
    return true
  }

  if (error instanceof RateLimitError) {
    response.setHeader('Retry-After', Math.ceil(error.retryAfterMs / 1000))
    response.status(429).json({
      antiBot: createAntiBotChallenge(),
      message: error.message,
    })
    return true
  }

  if (error instanceof RequestOriginError) {
    response.status(403).json({
      message: error.message,
    })
    return true
  }

  if (error instanceof BoardAuthorizationError) {
    response.status(403).json({
      antiBot: createAntiBotChallenge(),
      message: error.message,
    })
    return true
  }

  if (error instanceof BoardNotFoundError) {
    response.status(404).json({
      antiBot: createAntiBotChallenge(),
      message: error.message,
    })
    return true
  }

  if (error instanceof BoardValidationError) {
    response.status(400).json({
      antiBot: createAntiBotChallenge(),
      message: error.message,
    })
    return true
  }

  return false
}

async function assertAdminRequest(request: express.Request) {
  try {
    await assertValidAdminSession(request.get('cookie'))
    return
  }
  catch (sessionError) {
    const adminKey = request.get('x-admin-key') || ''

    if (adminKey && !request.get('origin')) {
      assertValidAdminKey(adminKey)
      return
    }

    throw sessionError
  }
}

export function createApp(options?: { staticDirectory?: string }) {
  const app = express()
  const staticDirectory = options?.staticDirectory
    ? resolve(options.staticDirectory)
    : undefined
  const releaseIdentity = resolveReleaseIdentity(staticDirectory)
  const inlineScriptHashes = getInlineScriptHashes(staticDirectory)

  app.disable('x-powered-by')
  if (process.env.NODE_ENV === 'production' && process.env.TRUST_PROXY_HOPS) {
    const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS)

    if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0 || trustProxyHops > 5)
      throw new Error('TRUST_PROXY_HOPS must be an integer from 0 through 5.')

    if (trustProxyHops > 0)
      app.set('trust proxy', trustProxyHops)
  }

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        'base-uri': ['\'self\''],
        'connect-src': [
          '\'self\'',
          'https://analytics.np-servicerequest.org',
          'https://analytics.jacobdanderson.net',
        ],
        'default-src': ['\'self\''],
        'font-src': ['\'self\'', 'data:'],
        'form-action': ['\'self\''],
        'frame-ancestors': ['\'none\''],
        'frame-src': ['\'none\''],
        'img-src': ['\'self\'', 'data:', 'blob:', 'https:'],
        'media-src': ['\'self\'', 'blob:'],
        'object-src': ['\'none\''],
        'script-src': [
          '\'self\'',
          ...inlineScriptHashes,
          'https://analytics.np-servicerequest.org',
          'https://analytics.jacobdanderson.net',
        ],
        'style-src': ['\'self\'', '\'unsafe-inline\''],
        'worker-src': ['\'self\'', 'blob:'],
      },
    },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: {
      policy: 'strict-origin-when-cross-origin',
    },
  }))
  app.use((_request, response, next) => {
    response.setHeader(
      'Permissions-Policy',
      'accelerometer=(), autoplay=(), camera=(), geolocation=(self), gyroscope=(), microphone=(), payment=(), usb=()',
    )
    next()
  })
  app.use(cors({
    allowedHeaders: ['content-type', 'x-admin-key'],
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'DELETE', 'OPTIONS'],
    origin(origin, callback) {
      callback(null, !origin || isAllowedRequestOrigin(origin))
    },
  }))
  app.use((request, response, next) => {
    try {
      assertAllowedUnsafeRequest({
        method: request.method,
        origin: request.get('origin'),
        secFetchSite: request.get('sec-fetch-site'),
      })
      next()
    }
    catch (error) {
      if (handleApiError(response, error))
        return

      next(error)
    }
  })
  app.use('/api', (_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store')
    next()
  })
  app.use(express.json({ limit: '100kb' }))

  app.get('/api/health', (_request, response) => {
    response.json({
      ok: true,
      revision: releaseIdentity.revision,
      startedAt,
      version: releaseIdentity.version,
    })
  })

  app.get('/api/pageview', (request, response) => {
    try {
      consumeRateLimit(`pageview:${getRateLimitClientId(request)}`, {
        limit: 120,
        windowMs: 1000 * 60,
      })
      response.json({
        pageview: pageview++,
        startAt: startedAt,
      })
    }
    catch (error) {
      if (!handleApiError(response, error))
        response.status(500).json({ message: 'Unable to count that page view right now.' })
    }
  })

  app.get('/api/service-directory/search', async (request, response) => {
    try {
      consumeRateLimit(`service-directory:${getRateLimitClientId(request)}`, {
        limit: 30,
        windowMs: 1000 * 60 * 5,
      })

      response.json(await searchServiceDirectory({
        lat: parseMaybeFloat(request.query.lat),
        lng: parseMaybeFloat(request.query.lng),
        page: parsePositiveInt(request.query.page, 1, 999),
        pageSize: parsePositiveInt(request.query.pageSize, 12, 24),
        provider: getSingleQueryValue(request.query.provider) === 'idealist' ? 'idealist' : 'idealist',
        query: getSingleQueryValue(request.query.query),
        radiusMiles: parsePositiveInt(request.query.radiusMiles, 40, 250),
        refresh: getSingleQueryValue(request.query.refresh) === 'true',
      }))
    }
    catch (error) {
      if (handleApiError(response, error))
        return

      console.error('Failed to search service directory:', error)
      response.status(500).json({
        message: 'Unable to load live service listings right now.',
      })
    }
  })

  app.get('/api/admin/session', async (request, response) => {
    try {
      await assertValidAdminSession(request.get('cookie'))
      response.json({
        authenticated: true,
        ok: true,
      })
    }
    catch (error) {
      if (handleApiError(response, error))
        return

      response.status(500).json({
        message: 'Unable to validate the admin session right now.',
      })
    }
  })

  app.post('/api/admin/session', async (request, response) => {
    try {
      const rawAdminKey = typeof request.body.adminKey === 'string' ? request.body.adminKey : ''
      consumeRateLimit(`admin:session:${getRateLimitClientId(request)}`, {
        limit: 8,
        windowMs: 1000 * 60 * 15,
      })
      consumeRateLimit(`admin:key:${hashRateLimitIdentifier(rawAdminKey)}`, {
        limit: 12,
        windowMs: 1000 * 60 * 60,
      })

      const sessionToken = await createAdminSessionToken(rawAdminKey)
      response.setHeader('Set-Cookie', createAdminSessionCookie(sessionToken))
      response.json({
        authenticated: true,
        ok: true,
      })
    }
    catch (error) {
      if (handleApiError(response, error))
        return

      response.status(500).json({
        message: 'Unable to start an admin session right now.',
      })
    }
  })

  app.delete('/api/admin/session', async (request, response) => {
    try {
      await invalidateAdminSession(request.get('cookie'))
      response.setHeader('Set-Cookie', clearAdminSessionCookie())
      response.json({
        authenticated: false,
        ok: true,
      })
    }
    catch {
      response.status(500).json({
        message: 'Unable to end the admin session right now.',
      })
    }
  })

  app.get('/api/admin/submissions', async (request, response) => {
    try {
      await assertAdminRequest(request)

      const reviewFilter = getSingleQueryValue(request.query.review)
      const kindFilter = getSingleQueryValue(request.query.kind)
      const activityFilter = getSingleQueryValue(request.query.activityCategory)

      response.json({
        ok: true,
        ...await listAdminSubmissions({
          activityCategory: boardActivityCategories.includes(activityFilter as typeof boardActivityCategories[number])
            ? activityFilter as typeof boardActivityCategories[number]
            : 'all',
          activityPage: parsePositiveInt(request.query.activityPage, 1, 999),
          activityPageSize: parsePositiveInt(request.query.activityPageSize, 40, 100),
          kind: isSubmissionKind(kindFilter) ? kindFilter : 'all',
          review: adminReviewStatuses.includes(reviewFilter as typeof adminReviewStatuses[number])
            ? reviewFilter as typeof adminReviewStatuses[number]
            : 'all',
          submissionsPage: parsePositiveInt(request.query.submissionsPage, 1, 999),
          submissionsPageSize: parsePositiveInt(request.query.submissionsPageSize, 20, 100),
        }),
      })
    }
    catch (error) {
      if (handleApiError(response, error))
        return

      console.error('Failed to list admin submissions:', error)
      response.status(500).json({
        message: 'Unable to load admin submissions right now.',
      })
    }
  })

  app.post('/api/admin/submissions/:kind/:id/review', async (request, response) => {
    const { kind, id } = request.params

    if (!isSubmissionKind(kind)) {
      response.status(404).json({
        message: 'Unknown submission type.',
      })
      return
    }

    try {
      await assertAdminRequest(request)

      response.json({
        ok: true,
        submission: await reviewAdminSubmission({
          id,
          kind,
          notes: typeof request.body.notes === 'string' ? request.body.notes : '',
          status: typeof request.body.status === 'string' ? request.body.status : '',
        }),
      })
    }
    catch (error) {
      if (handleApiError(response, error))
        return

      console.error('Failed to review admin submission:', error)
      response.status(500).json({
        message: 'Unable to save that admin review right now.',
      })
    }
  })

  app.get('/api/board/bootstrap', async (request, response) => {
    const viewer = await getViewerFromCookie(request.get('cookie'))

    response.json({
      antiBot: createAntiBotChallenge(),
      viewer,
    })
  })

  app.get('/api/board/items', async (request, response) => {
    const kindFilter = getSingleQueryValue(request.query.kind)
    const sort = getSingleQueryValue(request.query.sort)

    response.json({
      ...await listBoardItems({
        kind: isSubmissionKind(kindFilter) ? kindFilter : 'all',
        lat: parseMaybeFloat(request.query.lat),
        lng: parseMaybeFloat(request.query.lng),
        page: parsePositiveInt(request.query.page, 1, 999),
        pageSize: parsePositiveInt(request.query.pageSize, 12, 50),
        query: getSingleQueryValue(request.query.query),
        sort: boardItemSortOrders.includes(sort as typeof boardItemSortOrders[number])
          ? sort as typeof boardItemSortOrders[number]
          : 'recent-activity',
      }),
    })
  })

  app.get('/api/board/items/:itemId', async (request, response) => {
    try {
      response.json({
        item: await getPublicBoardItem(request.params.itemId),
      })
    }
    catch (error) {
      if (handleApiError(response, error))
        return

      console.error('Failed to load board item:', error)
      response.status(500).json({
        message: 'Unable to load that board item right now.',
      })
    }
  })

  app.post('/api/submissions/:kind', async (request, response) => {
    const { kind } = request.params

    if (!isSubmissionKind(kind)) {
      response.status(404).json({
        message: 'Unknown submission type.',
      })
      return
    }

    try {
      consumeRateLimit(`submission:${kind}:${getRateLimitClientId(request)}`, {
        limit: 6,
        windowMs: 1000 * 60 * 15,
      })
      validateAntiBotPayload(request.body)

      const viewer = await getViewerFromCookie(request.get('cookie'))
      const result = await saveSubmission({
        kind,
        rawPayload: request.body,
      })

      if (!result.accepted) {
        response.status(202).json({
          ok: true,
          id: result.id,
          accepted: false,
          createdAt: result.createdAt,
          antiBot: createAntiBotChallenge(),
        })
        return
      }

      const createdBoardItem = await createBoardItemFromSubmission({
        fields: result.fields,
        kind,
        submissionId: result.id,
        viewer,
      })
      await attachBoardItemToSubmission({
        itemId: createdBoardItem.item.id,
        kind,
        submissionId: result.id,
      })

      void sendBoardItemNotificationEmail({
        authorName: createdBoardItem.item.author.displayName,
        contact: normalizeStructuredContact({
          legacyContact: result.fields.contact,
          method: result.fields.contact_method,
          note: result.fields.contact_note,
          value: result.fields.contact_value,
        }).display,
        context: createdBoardItem.item.attributes,
        createdAt: createdBoardItem.item.createdAt,
        itemId: createdBoardItem.item.id,
        kindLabel: createdBoardItem.item.kindLabel,
        summary: createdBoardItem.item.summary,
        title: createdBoardItem.item.title,
      }).catch((error) => {
        console.error('Failed to send board item notification:', error)
      })

      if (createdBoardItem.managementRecipientEmail && createdBoardItem.managementToken) {
        void sendBoardItemManagementLinkEmail({
          itemId: createdBoardItem.item.id,
          managementToken: createdBoardItem.managementToken,
          recipientEmail: createdBoardItem.managementRecipientEmail,
          title: createdBoardItem.item.title,
        }).catch((error) => {
          console.error('Failed to send board management email:', error)
        })
      }

      response.status(result.accepted ? 201 : 202).json({
        ok: true,
        id: result.id,
        accepted: result.accepted,
        antiBot: createAntiBotChallenge(),
        boardItem: createdBoardItem.item,
        deleteToken: createdBoardItem.deleteToken,
        createdAt: result.createdAt,
      })
    }
    catch (error) {
      if (handleApiError(response, error))
        return

      console.error('Failed to store submission:', error)
      response.status(500).json({
        antiBot: createAntiBotChallenge(),
        message: 'Unable to store your submission right now.',
      })
    }
  })

  app.post('/api/board/items/:itemId/claim-management', async (request, response) => {
    try {
      consumeRateLimit(`claim:item:${getRateLimitClientId(request)}`, {
        limit: 20,
        windowMs: 1000 * 60 * 60,
      })

      const deleteToken = await claimBoardItemManagement({
        itemId: request.params.itemId,
        managementToken: typeof request.body.token === 'string' ? request.body.token : '',
      })

      response.json({
        antiBot: createAntiBotChallenge(),
        deleteToken,
        itemId: request.params.itemId,
        ok: true,
      })
    }
    catch (error) {
      if (handleApiError(response, error))
        return

      console.error('Failed to claim board management link:', error)
      response.status(500).json({
        antiBot: createAntiBotChallenge(),
        message: 'Unable to claim that management link right now.',
      })
    }
  })

  app.post('/api/board/items/:itemId/interactions', async (request, response) => {
    try {
      consumeRateLimit(`interaction:${request.params.itemId}:${getRateLimitClientId(request)}`, {
        limit: 10,
        windowMs: 1000 * 60 * 15,
      })
      validateAntiBotPayload(request.body)

      const viewer = await getViewerFromCookie(request.get('cookie'))
      const interactionResult = await createBoardInteraction({
        contact: typeof request.body.contact === 'string' ? request.body.contact : '',
        contactMethod: typeof request.body.contact_method === 'string' ? request.body.contact_method : '',
        contactNote: typeof request.body.contact_note === 'string' ? request.body.contact_note : '',
        contactValue: typeof request.body.contact_value === 'string' ? request.body.contact_value : '',
        itemId: request.params.itemId,
        message: typeof request.body.message === 'string' ? request.body.message : '',
        name: typeof request.body.name === 'string' ? request.body.name : '',
        viewer,
      })
      const interaction = interactionResult.interaction
      const normalizedReplyContact = normalizeStructuredContact({
        legacyContact: typeof request.body.contact === 'string' ? request.body.contact : viewer?.email || '',
        method: typeof request.body.contact_method === 'string' ? request.body.contact_method : viewer?.email ? 'email' : '',
        note: typeof request.body.contact_note === 'string' ? request.body.contact_note : '',
        value: typeof request.body.contact_value === 'string' ? request.body.contact_value : '',
      }).display

      void sendBoardInteractionNotificationEmail({
        authorName: interaction.author.displayName,
        contact: normalizedReplyContact,
        createdAt: interaction.createdAt,
        itemId: request.params.itemId,
        itemTitle: interactionResult.itemTitle,
        message: interaction.message,
      }).catch((error) => {
        console.error('Failed to send board interaction notification:', error)
      })

      if (interactionResult.itemNotificationPreference === 'email' && interactionResult.itemNotificationEmail) {
        void sendBoardOwnerReplyNotificationEmail({
          authorName: interaction.author.displayName,
          contact: normalizedReplyContact,
          createdAt: interaction.createdAt,
          itemId: request.params.itemId,
          itemTitle: interactionResult.itemTitle,
          message: interaction.message,
          recipientEmail: interactionResult.itemNotificationEmail,
        }).catch((error) => {
          console.error('Failed to send board owner reply notification:', error)
        })
      }

      response.status(201).json({
        antiBot: createAntiBotChallenge(),
        interaction,
        ok: true,
      })
    }
    catch (error) {
      if (handleApiError(response, error))
        return

      console.error('Failed to store board interaction:', error)
      response.status(500).json({
        antiBot: createAntiBotChallenge(),
        message: 'Unable to post that response right now.',
      })
    }
  })

  app.post('/api/board/items/:itemId/contact', async (request, response) => {
    try {
      consumeRateLimit(`contact:item:${getRateLimitClientId(request)}`, {
        limit: 12,
        windowMs: 1000 * 60 * 60,
      })
      validateAntiBotPayload(request.body)

      response.json({
        antiBot: createAntiBotChallenge(),
        contact: await revealBoardItemContact(request.params.itemId),
        ok: true,
      })
    }
    catch (error) {
      if (handleApiError(response, error))
        return

      console.error('Failed to reveal board item contact:', error)
      response.status(500).json({
        antiBot: createAntiBotChallenge(),
        message: 'Unable to reveal that contact right now.',
      })
    }
  })

  app.post('/api/board/items/:itemId/report', async (request, response) => {
    try {
      consumeRateLimit(`report:item:${getRateLimitClientId(request)}`, {
        limit: 8,
        windowMs: 1000 * 60 * 60,
      })
      validateAntiBotPayload(request.body)

      response.status(201).json({
        antiBot: createAntiBotChallenge(),
        ok: true,
        reportId: await createBoardItemReport({
          details: typeof request.body.details === 'string' ? request.body.details : '',
          itemId: request.params.itemId,
          reason: typeof request.body.reason === 'string' ? request.body.reason : '',
          viewer: await getViewerFromCookie(request.get('cookie')),
        }),
      })
    }
    catch (error) {
      if (handleApiError(response, error))
        return

      console.error('Failed to report board item:', error)
      response.status(500).json({
        antiBot: createAntiBotChallenge(),
        message: 'Unable to save that report right now.',
      })
    }
  })

  app.post('/api/board/items/:itemId/resolution', async (request, response) => {
    try {
      consumeRateLimit(`resolution:item:${request.params.itemId}:${getRateLimitClientId(request)}`, {
        limit: 12,
        windowMs: 1000 * 60 * 60,
      })
      validateAntiBotPayload(request.body)

      response.json({
        antiBot: createAntiBotChallenge(),
        item: await setBoardItemResolution({
          deleteToken: typeof request.body.deleteToken === 'string' ? request.body.deleteToken : '',
          itemId: request.params.itemId,
          resolutionStatus: typeof request.body.status === 'string' ? request.body.status : '',
          viewer: await getViewerFromCookie(request.get('cookie')),
        }),
        ok: true,
      })
    }
    catch (error) {
      if (handleApiError(response, error))
        return

      console.error('Failed to update board item resolution:', error)
      response.status(500).json({
        antiBot: createAntiBotChallenge(),
        message: 'Unable to update that board item right now.',
      })
    }
  })

  app.delete('/api/board/items/:itemId', async (request, response) => {
    try {
      consumeRateLimit(`delete:item:${getRateLimitClientId(request)}`, {
        limit: 8,
        windowMs: 1000 * 60 * 60,
      })
      validateAntiBotPayload(request.body)

      await deleteBoardItem({
        deleteToken: typeof request.body.deleteToken === 'string' ? request.body.deleteToken : '',
        itemId: request.params.itemId,
        viewer: await getViewerFromCookie(request.get('cookie')),
      })

      response.json({
        antiBot: createAntiBotChallenge(),
        itemId: request.params.itemId,
        ok: true,
      })
    }
    catch (error) {
      if (handleApiError(response, error))
        return

      console.error('Failed to delete board item:', error)
      response.status(500).json({
        antiBot: createAntiBotChallenge(),
        message: 'Unable to delete that board item right now.',
      })
    }
  })

  app.post('/api/board/items/:itemId/interactions/:interactionId/contact', async (request, response) => {
    try {
      consumeRateLimit(`contact:interaction:${getRateLimitClientId(request)}`, {
        limit: 12,
        windowMs: 1000 * 60 * 60,
      })
      validateAntiBotPayload(request.body)

      response.json({
        antiBot: createAntiBotChallenge(),
        contact: await revealBoardInteractionContact(request.params.itemId, request.params.interactionId),
        ok: true,
      })
    }
    catch (error) {
      if (handleApiError(response, error))
        return

      console.error('Failed to reveal board interaction contact:', error)
      response.status(500).json({
        antiBot: createAntiBotChallenge(),
        message: 'Unable to reveal that contact right now.',
      })
    }
  })

  app.post('/api/board/items/:itemId/interactions/:interactionId/report', async (request, response) => {
    try {
      consumeRateLimit(`report:interaction:${getRateLimitClientId(request)}`, {
        limit: 8,
        windowMs: 1000 * 60 * 60,
      })
      validateAntiBotPayload(request.body)

      response.status(201).json({
        antiBot: createAntiBotChallenge(),
        ok: true,
        reportId: await createBoardInteractionReport({
          details: typeof request.body.details === 'string' ? request.body.details : '',
          interactionId: request.params.interactionId,
          itemId: request.params.itemId,
          reason: typeof request.body.reason === 'string' ? request.body.reason : '',
          viewer: await getViewerFromCookie(request.get('cookie')),
        }),
      })
    }
    catch (error) {
      if (handleApiError(response, error))
        return

      console.error('Failed to report board interaction:', error)
      response.status(500).json({
        antiBot: createAntiBotChallenge(),
        message: 'Unable to save that report right now.',
      })
    }
  })

  app.delete('/api/board/items/:itemId/interactions/:interactionId', async (request, response) => {
    try {
      consumeRateLimit(`delete:interaction:${getRateLimitClientId(request)}`, {
        limit: 12,
        windowMs: 1000 * 60 * 60,
      })
      validateAntiBotPayload(request.body)

      await deleteBoardInteraction({
        interactionId: request.params.interactionId,
        itemId: request.params.itemId,
        viewer: await getViewerFromCookie(request.get('cookie')),
      })

      response.json({
        antiBot: createAntiBotChallenge(),
        interactionId: request.params.interactionId,
        itemId: request.params.itemId,
        ok: true,
      })
    }
    catch (error) {
      if (handleApiError(response, error))
        return

      console.error('Failed to delete board interaction:', error)
      response.status(500).json({
        antiBot: createAntiBotChallenge(),
        message: 'Unable to delete that board response right now.',
      })
    }
  })

  app.post('/api/board/account/register', async (request, response) => {
    try {
      consumeRateLimit(`account:register:${getRateLimitClientId(request)}`, {
        limit: 5,
        windowMs: 1000 * 60 * 15,
      })
      validateAntiBotPayload(request.body)

      const account = await registerBoardAccount({
        displayName: typeof request.body.displayName === 'string' ? request.body.displayName : '',
        email: typeof request.body.email === 'string' ? request.body.email : '',
        password: typeof request.body.password === 'string' ? request.body.password : '',
      })

      await invalidateViewerSession(request.get('cookie'))
      response.setHeader('Set-Cookie', createSessionCookie(account.sessionToken))
      response.status(201).json({
        antiBot: createAntiBotChallenge(),
        ok: true,
        viewer: account.viewer,
      })
    }
    catch (error) {
      if (handleApiError(response, error))
        return

      console.error('Failed to register board account:', error)
      response.status(500).json({
        antiBot: createAntiBotChallenge(),
        message: 'Unable to create an account right now.',
      })
    }
  })

  app.post('/api/board/account/login', async (request, response) => {
    try {
      const loginEmail = typeof request.body.email === 'string' ? request.body.email : ''
      consumeRateLimit(`account:login:${getRateLimitClientId(request)}`, {
        limit: 8,
        windowMs: 1000 * 60 * 15,
      })
      consumeRateLimit(`account:login-email:${hashRateLimitIdentifier(loginEmail)}`, {
        limit: 12,
        windowMs: 1000 * 60 * 60,
      })
      validateAntiBotPayload(request.body)

      const account = await loginBoardAccount({
        email: loginEmail,
        password: typeof request.body.password === 'string' ? request.body.password : '',
      })

      await invalidateViewerSession(request.get('cookie'))
      response.setHeader('Set-Cookie', createSessionCookie(account.sessionToken))
      response.json({
        antiBot: createAntiBotChallenge(),
        ok: true,
        viewer: account.viewer,
      })
    }
    catch (error) {
      if (handleApiError(response, error))
        return

      console.error('Failed to log into board account:', error)
      response.status(500).json({
        antiBot: createAntiBotChallenge(),
        message: 'Unable to sign in right now.',
      })
    }
  })

  app.post('/api/board/account/logout', async (request, response) => {
    await invalidateViewerSession(request.get('cookie'))
    response.setHeader('Set-Cookie', clearSessionCookie())
    response.json({
      antiBot: createAntiBotChallenge(),
      ok: true,
    })
  })

  app.use('/api', (_request, response) => {
    response.status(404).json({
      message: 'That API route does not exist.',
    })
  })

  if (staticDirectory) {
    app.use(express.static(staticDirectory, {
      index: 'index.html',
      setHeaders(response, filePath) {
        const extension = extname(filePath)

        if (extension === '.html' || filePath.endsWith('release.json')) {
          response.setHeader('Cache-Control', 'no-store')
          return
        }

        if (filePath.includes('/_nuxt/'))
          response.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        else
          response.setHeader('Cache-Control', 'public, max-age=3600')
      },
    }))
    app.use((request, response, next) => {
      if (!['GET', 'HEAD'].includes(request.method)) {
        next()
        return
      }

      response.setHeader('Cache-Control', 'no-store')
      response.sendFile('200.html', {
        root: staticDirectory,
      }, (error) => {
        if (error)
          next(error)
      })
    })
  }

  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    if (error instanceof SyntaxError) {
      response.status(400).json({
        message: 'The request body is not valid JSON.',
      })
      return
    }

    console.error('Unhandled API request error:', error)
    response.status(500).json({
      message: 'The server could not complete that request.',
    })
  })

  return app
}
