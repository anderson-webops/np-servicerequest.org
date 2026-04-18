import cors from 'cors'
import express from 'express'
import helmet from 'helmet'

import {
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
  assertValidAdminKey,
  listAdminSubmissions,
  reviewAdminSubmission,
} from './admin.js'
import {
  BoardAuthorizationError,
  BoardNotFoundError,
  BoardValidationError,
  claimBoardItemManagement,
  createBoardInteraction,
  createBoardItemFromSubmission,
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
} from './notifications.js'
import {
  BotProtectionError,
  clearSessionCookie,
  consumeRateLimit,
  createAntiBotChallenge,
  createSessionCookie,
  RateLimitError,
  validateAntiBotPayload,
} from './security.js'
import {
  AccountValidationError,
  attachBoardItemToSubmission,
  isSubmissionKind,
  saveSubmission,
  SubmissionValidationError,
} from './submissions.js'

const startedAt = Date.now()
let pageview = 0

function getRequestIp(request: express.Request) {
  return request.ip || request.socket.remoteAddress || 'unknown'
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

export function createApp() {
  const app = express()

  app.disable('x-powered-by')
  app.use(helmet({ contentSecurityPolicy: false }))
  app.use(cors({ origin: true, credentials: true }))
  app.use('/api', (_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store')
    next()
  })
  app.use(express.json({ limit: '100kb' }))

  app.get('/api/health', (_request, response) => {
    response.json({
      ok: true,
      startedAt,
    })
  })

  app.get('/api/pageview', (_request, response) => {
    response.json({
      pageview: pageview++,
      startAt: startedAt,
    })
  })

  app.get('/api/admin/submissions', async (request, response) => {
    try {
      assertValidAdminKey(request.get('x-admin-key') || '')

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
      assertValidAdminKey(request.get('x-admin-key') || '')

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

    response.json({
      ...await listBoardItems({
        kind: isSubmissionKind(kindFilter) ? kindFilter : 'all',
        page: parsePositiveInt(request.query.page, 1, 999),
        pageSize: parsePositiveInt(request.query.pageSize, 12, 50),
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
      consumeRateLimit(`submission:${kind}:${getRequestIp(request)}`, {
        limit: 6,
        windowMs: 1000 * 60 * 15,
      })
      validateAntiBotPayload(request.body)

      const viewer = await getViewerFromCookie(request.get('cookie'))
      const result = await saveSubmission({
        kind,
        rawPayload: request.body,
        ip: request.ip,
        userAgent: request.get('user-agent'),
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
      consumeRateLimit(`claim:item:${getRequestIp(request)}`, {
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
      consumeRateLimit(`interaction:${request.params.itemId}:${getRequestIp(request)}`, {
        limit: 10,
        windowMs: 1000 * 60 * 15,
      })
      validateAntiBotPayload(request.body)

      const viewer = await getViewerFromCookie(request.get('cookie'))
      const interaction = await createBoardInteraction({
        contact: typeof request.body.contact === 'string' ? request.body.contact : '',
        contactMethod: typeof request.body.contact_method === 'string' ? request.body.contact_method : '',
        contactNote: typeof request.body.contact_note === 'string' ? request.body.contact_note : '',
        contactValue: typeof request.body.contact_value === 'string' ? request.body.contact_value : '',
        itemId: request.params.itemId,
        message: typeof request.body.message === 'string' ? request.body.message : '',
        name: typeof request.body.name === 'string' ? request.body.name : '',
        viewer,
      })

      void sendBoardInteractionNotificationEmail({
        authorName: interaction.author.displayName,
        contact: normalizeStructuredContact({
          legacyContact: typeof request.body.contact === 'string' ? request.body.contact : viewer?.email || '',
          method: typeof request.body.contact_method === 'string' ? request.body.contact_method : viewer?.email ? 'email' : '',
          note: typeof request.body.contact_note === 'string' ? request.body.contact_note : '',
          value: typeof request.body.contact_value === 'string' ? request.body.contact_value : '',
        }).display,
        createdAt: interaction.createdAt,
        itemId: request.params.itemId,
        itemTitle: typeof request.body.itemTitle === 'string' ? request.body.itemTitle : 'Board item',
        message: interaction.message,
      }).catch((error) => {
        console.error('Failed to send board interaction notification:', error)
      })

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
      consumeRateLimit(`contact:item:${getRequestIp(request)}`, {
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

  app.post('/api/board/items/:itemId/resolution', async (request, response) => {
    try {
      consumeRateLimit(`resolution:item:${request.params.itemId}:${getRequestIp(request)}`, {
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
      consumeRateLimit(`delete:item:${getRequestIp(request)}`, {
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
      consumeRateLimit(`contact:interaction:${getRequestIp(request)}`, {
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

  app.delete('/api/board/items/:itemId/interactions/:interactionId', async (request, response) => {
    try {
      consumeRateLimit(`delete:interaction:${getRequestIp(request)}`, {
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
      consumeRateLimit(`account:register:${getRequestIp(request)}`, {
        limit: 5,
        windowMs: 1000 * 60 * 15,
      })
      validateAntiBotPayload(request.body)

      const account = await registerBoardAccount({
        displayName: typeof request.body.displayName === 'string' ? request.body.displayName : '',
        email: typeof request.body.email === 'string' ? request.body.email : '',
        password: typeof request.body.password === 'string' ? request.body.password : '',
      })

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
      consumeRateLimit(`account:login:${getRequestIp(request)}`, {
        limit: 8,
        windowMs: 1000 * 60 * 15,
      })
      validateAntiBotPayload(request.body)

      const account = await loginBoardAccount({
        email: typeof request.body.email === 'string' ? request.body.email : '',
        password: typeof request.body.password === 'string' ? request.body.password : '',
      })

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

  return app
}
