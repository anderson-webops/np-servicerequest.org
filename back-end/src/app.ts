import cors from 'cors'
import express from 'express'
import helmet from 'helmet'

import {
  getViewerFromCookie,
  invalidateViewerSession,
  loginBoardAccount,
  registerBoardAccount,
} from './accounts.js'
import {
  BoardNotFoundError,
  createBoardInteraction,
  createBoardItemFromSubmission,
  listBoardItems,
  revealBoardInteractionContact,
  revealBoardItemContact,
} from './board.js'
import {
  sendBoardInteractionNotificationEmail,
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
  isSubmissionKind,
  saveSubmission,
  SubmissionValidationError,
} from './submissions.js'

const startedAt = Date.now()
let pageview = 0

function getRequestIp(request: express.Request) {
  return request.ip || request.socket.remoteAddress || 'unknown'
}

function handleApiError(response: express.Response, error: unknown) {
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

  if (error instanceof BoardNotFoundError) {
    response.status(404).json({
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

  app.get('/api/board/bootstrap', async (request, response) => {
    const viewer = await getViewerFromCookie(request.get('cookie'))

    response.json({
      antiBot: createAntiBotChallenge(),
      viewer,
    })
  })

  app.get('/api/board/items', async (_request, response) => {
    response.json({
      items: await listBoardItems(),
    })
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

      const item = await createBoardItemFromSubmission({
        fields: result.fields,
        kind,
        viewer,
      })

      void sendBoardItemNotificationEmail({
        authorName: item.author.displayName,
        contact: result.fields.contact || '',
        context: item.attributes,
        createdAt: item.createdAt,
        itemId: item.id,
        kindLabel: item.kindLabel,
        summary: item.summary,
        title: item.title,
      }).catch((error) => {
        console.error('Failed to send board item notification:', error)
      })

      response.status(result.accepted ? 201 : 202).json({
        ok: true,
        id: result.id,
        accepted: result.accepted,
        antiBot: createAntiBotChallenge(),
        boardItem: item,
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
        itemId: request.params.itemId,
        message: typeof request.body.message === 'string' ? request.body.message : '',
        name: typeof request.body.name === 'string' ? request.body.name : '',
        viewer,
      })

      void sendBoardInteractionNotificationEmail({
        authorName: interaction.author.displayName,
        contact: typeof request.body.contact === 'string' ? request.body.contact : viewer?.email || '',
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
