import { randomBytes, randomUUID, scryptSync } from 'node:crypto'
import { resolve } from 'node:path'

import { listJsonDirectory, readJsonFile, removeFileIfExists, resolveDataPath, writeJsonFile } from './data.js'
import { createSessionExpiry, hashSessionToken, readCookieValue, sessionCookieName } from './security.js'
import { AccountValidationError, SubmissionValidationError } from './submissions.js'

const accountDirectory = resolveDataPath('_board', 'accounts')
const sessionDirectory = resolveDataPath('_board', 'sessions')

interface StoredAccount {
  id: string
  createdAt: string
  displayName: string
  email: string
  emailNormalized: string
  passwordHash: string
  passwordSalt: string
  updatedAt: string
}

interface StoredSession {
  createdAt: string
  expiresAt: string
  tokenHash: string
  userId: string
}

export interface ViewerAccount {
  createdAt: string
  displayName: string
  email: string
  id: string
}

export interface AccountSessionResult {
  sessionToken: string
  viewer: ViewerAccount
}

function getAccountFilePath(accountId: string) {
  return resolve(accountDirectory, `${accountId}.json`)
}

function getSessionFilePath(tokenHash: string) {
  return resolve(sessionDirectory, `${tokenHash}.json`)
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

function normalizeDisplayName(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

function validateDisplayName(displayName: string) {
  if (displayName.length < 2)
    throw new AccountValidationError('Display names must be at least 2 characters long.')

  if (displayName.length > 80)
    throw new AccountValidationError('Display names must be 80 characters or fewer.')
}

function validateEmail(email: string) {
  if (!email || email.length > 320 || !email.includes('@'))
    throw new AccountValidationError('A valid email address is required.')
}

function validatePassword(password: string) {
  if (password.length < 10)
    throw new AccountValidationError('Passwords must be at least 10 characters long.')

  if (password.length > 120)
    throw new AccountValidationError('Passwords must be 120 characters or fewer.')
}

function hashPassword(password: string, salt: string) {
  return scryptSync(password, salt, 64).toString('hex')
}

function toViewerAccount(account: StoredAccount): ViewerAccount {
  return {
    id: account.id,
    createdAt: account.createdAt,
    displayName: account.displayName,
    email: account.email,
  }
}

async function listAccounts() {
  return listJsonDirectory<StoredAccount>(accountDirectory)
}

async function findAccountByEmail(email: string) {
  const normalizedEmail = normalizeEmail(email)
  const accounts = await listAccounts()
  return accounts.find(account => account.emailNormalized === normalizedEmail) || null
}

async function getAccountById(accountId: string) {
  return readJsonFile<StoredAccount>(getAccountFilePath(accountId))
}

async function createSession(account: StoredAccount): Promise<AccountSessionResult> {
  const sessionToken = randomBytes(32).toString('hex')
  const tokenHash = hashSessionToken(sessionToken)
  const now = new Date().toISOString()
  const session: StoredSession = {
    createdAt: now,
    expiresAt: createSessionExpiry(),
    tokenHash,
    userId: account.id,
  }

  await writeJsonFile(getSessionFilePath(tokenHash), session)

  return {
    sessionToken,
    viewer: toViewerAccount(account),
  }
}

export async function getViewerFromCookie(cookieHeader: string | undefined) {
  const token = readCookieValue(cookieHeader, sessionCookieName)

  if (!token)
    return null

  const tokenHash = hashSessionToken(token)
  const session = await readJsonFile<StoredSession>(getSessionFilePath(tokenHash))

  if (!session)
    return null

  if (Date.parse(session.expiresAt) <= Date.now()) {
    await removeFileIfExists(getSessionFilePath(tokenHash))
    return null
  }

  const account = await getAccountById(session.userId)

  if (!account) {
    await removeFileIfExists(getSessionFilePath(tokenHash))
    return null
  }

  return toViewerAccount(account)
}

export async function invalidateViewerSession(cookieHeader: string | undefined) {
  const token = readCookieValue(cookieHeader, sessionCookieName)

  if (!token)
    return

  await removeFileIfExists(getSessionFilePath(hashSessionToken(token)))
}

export async function registerBoardAccount(input: { displayName: string, email: string, password: string }) {
  const displayName = normalizeDisplayName(input.displayName)
  const email = input.email.trim()
  const emailNormalized = normalizeEmail(email)
  const password = input.password

  validateDisplayName(displayName)
  validateEmail(emailNormalized)
  validatePassword(password)

  const existingAccount = await findAccountByEmail(emailNormalized)

  if (existingAccount)
    throw new AccountValidationError('An account already exists for that email address.')

  const createdAt = new Date().toISOString()
  const passwordSalt = randomBytes(16).toString('hex')
  const account: StoredAccount = {
    id: randomUUID(),
    createdAt,
    displayName,
    email,
    emailNormalized,
    passwordHash: hashPassword(password, passwordSalt),
    passwordSalt,
    updatedAt: createdAt,
  }

  await writeJsonFile(getAccountFilePath(account.id), account)
  return createSession(account)
}

export async function loginBoardAccount(input: { email: string, password: string }) {
  const email = normalizeEmail(input.email)
  const password = input.password

  validateEmail(email)
  validatePassword(password)

  const account = await findAccountByEmail(email)

  if (!account)
    throw new SubmissionValidationError('That email/password combination was not recognized.')

  const expectedHash = hashPassword(password, account.passwordSalt)

  if (expectedHash !== account.passwordHash)
    throw new SubmissionValidationError('That email/password combination was not recognized.')

  return createSession(account)
}
