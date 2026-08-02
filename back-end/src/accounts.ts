import { Buffer } from 'node:buffer'
import { randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

import {
  ensurePrivateDirectory,
  listJsonDirectory,
  readJsonFile,
  removeFileIfExists,
  removePathIfExists,
  resolveDataPath,
  writeJsonFile,
} from './data.js'
import { createSessionExpiry, hashSessionToken, readCookieValue, sessionCookieName } from './security.js'
import { AccountValidationError } from './submissions.js'

const accountDirectory = resolveDataPath('_board', 'accounts')
const accountLockDirectory = resolveDataPath('_board', 'account-locks')
const sessionDirectory = resolveDataPath('_board', 'sessions')
const sessionAbsoluteDurationMs = 1000 * 60 * 60 * 24 * 7
const sessionIdleDurationMs = 1000 * 60 * 60 * 12
const sessionTouchIntervalMs = 1000 * 60 * 5
const currentPasswordAlgorithm = 'scrypt-v2'
let accountRegistrationQueue = Promise.resolve()

async function wait(milliseconds: number) {
  await new Promise(resolveWait => setTimeout(resolveWait, milliseconds))
}

async function withAccountMutationLock<T>(accountId: string, task: () => Promise<T>) {
  getAccountFilePath(accountId)
  const lockPath = resolve(accountLockDirectory, `${accountId}.lock`)
  const deadline = Date.now() + 10_000
  await ensurePrivateDirectory(accountLockDirectory)

  while (true) {
    try {
      await mkdir(lockPath, { mode: 0o700 })
      break
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST')
        throw error
      if (Date.now() >= deadline)
        throw new Error('The account is temporarily locked for a security-sensitive update.')
      await wait(50)
    }
  }

  try {
    return await task()
  }
  finally {
    await removePathIfExists(lockPath)
  }
}

interface StoredAccount {
  id: string
  createdAt: string
  displayName: string
  email: string
  emailNormalized: string
  passwordAlgorithm?: 'scrypt-v1' | 'scrypt-v2'
  passwordHash: string
  passwordSalt: string
  role?: 'admin' | 'member'
  roleVersion?: number
  updatedAt: string
}

interface StoredSession {
  createdAt: string
  expiresAt: string
  lastSeenAt?: string
  roleVersion?: number
  tokenHash: string
  userId: string
}

export interface ViewerAccount {
  createdAt: string
  displayName: string
  email: string
  id: string
  isAdmin: boolean
}

export interface AccountSessionResult {
  sessionToken: string
  viewer: ViewerAccount
}

function getAccountFilePath(accountId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(accountId))
    throw new Error('Refusing to resolve an invalid account id.')

  return resolve(accountDirectory, `${accountId}.json`)
}

function getSessionFilePath(tokenHash: string) {
  if (!/^[0-9a-f]{64}$/.test(tokenHash))
    throw new Error('Refusing to resolve an invalid session token hash.')

  return resolve(sessionDirectory, `${tokenHash}.json`)
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

export class AccountAuthenticationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AccountAuthenticationError'
  }
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
  if (
    !email
    || email.length > 320
    || /\s/.test(email)
    || /[\u0000-\u001f\u007f-\u009f]/u.test(email)
    || !/^[^@]+@[^@]+\.[^@]+$/.test(email)
  ) {
    throw new AccountValidationError('A valid email address is required.')
  }
}

function validateLoginPassword(password: string) {
  if (!password)
    throw new AccountValidationError('A password is required.')
  if (password.length > 120)
    throw new AccountValidationError('Passwords must be 120 characters or fewer.')
}

function validateRegistrationPassword(password: string) {
  validateLoginPassword(password)

  if (password.length < 12)
    throw new AccountValidationError('Passwords must be at least 12 characters long.')
}

function derivePassword(
  password: string,
  salt: string,
  algorithm: 'scrypt-v1' | 'scrypt-v2',
) {
  const options = algorithm === 'scrypt-v2'
    ? {
        N: 2 ** 15,
        maxmem: 64 * 1024 * 1024,
        p: 1,
        r: 8,
      }
    : undefined

  return new Promise<Buffer>((resolvePassword, reject) => {
    scrypt(password, salt, 64, options || {}, (error, derivedKey) => {
      if (error) {
        reject(error)
        return
      }

      resolvePassword(derivedKey)
    })
  })
}

function isMatchingPasswordHash(candidate: Buffer, storedHash: string) {
  const stored = Buffer.from(storedHash, 'hex')
  return stored.length === candidate.length && timingSafeEqual(stored, candidate)
}

function toViewerAccount(account: StoredAccount): ViewerAccount {
  return {
    id: account.id,
    createdAt: account.createdAt,
    displayName: account.displayName,
    email: account.email,
    isAdmin: account.role === 'admin',
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
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(accountId))
    return null

  return readJsonFile<StoredAccount>(getAccountFilePath(accountId))
}

async function createSession(account: StoredAccount): Promise<AccountSessionResult> {
  const sessionToken = randomBytes(32).toString('hex')
  const tokenHash = hashSessionToken(sessionToken)
  const now = new Date().toISOString()
  const session: StoredSession = {
    createdAt: now,
    expiresAt: createSessionExpiry(),
    lastSeenAt: now,
    roleVersion: Number.isSafeInteger(account.roleVersion) ? account.roleVersion : 0,
    tokenHash,
    userId: account.id,
  }

  await writeJsonFile(getSessionFilePath(tokenHash), session)

  return {
    sessionToken,
    viewer: toViewerAccount(account),
  }
}

async function withAccountRegistrationLock<T>(task: () => Promise<T>) {
  const previousTask = accountRegistrationQueue
  let releaseLock = () => {}
  accountRegistrationQueue = new Promise<void>((resolveLock) => {
    releaseLock = resolveLock
  })

  await previousTask

  try {
    return await task()
  }
  finally {
    releaseLock()
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

  const createdAt = Date.parse(session.createdAt)

  if (
    !Number.isFinite(createdAt)
    || Date.parse(session.expiresAt) <= Date.now()
    || createdAt <= Date.now() - sessionAbsoluteDurationMs
  ) {
    await removeFileIfExists(getSessionFilePath(tokenHash))
    return null
  }

  const lastSeenAt = Date.parse(session.lastSeenAt || session.createdAt)

  if (!Number.isFinite(lastSeenAt) || lastSeenAt <= Date.now() - sessionIdleDurationMs) {
    await removeFileIfExists(getSessionFilePath(tokenHash))
    return null
  }

  const account = await getAccountById(session.userId)

  if (!account) {
    await removeFileIfExists(getSessionFilePath(tokenHash))
    return null
  }

  const accountRoleVersion = Number.isSafeInteger(account.roleVersion) ? account.roleVersion : 0
  const sessionRoleVersion = Number.isSafeInteger(session.roleVersion) ? session.roleVersion : 0

  if (sessionRoleVersion !== accountRoleVersion) {
    await removeFileIfExists(getSessionFilePath(tokenHash))
    return null
  }

  if (Date.now() - lastSeenAt >= sessionTouchIntervalMs) {
    await writeJsonFile(getSessionFilePath(tokenHash), {
      ...session,
      lastSeenAt: new Date().toISOString(),
    })
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
  validateRegistrationPassword(password)

  return withAccountRegistrationLock(async () => {
    const existingAccount = await findAccountByEmail(emailNormalized)

    if (existingAccount)
      throw new AccountValidationError('An account already exists for that email address.')

    const createdAt = new Date().toISOString()
    const passwordSalt = randomBytes(16).toString('hex')
    const passwordHash = await derivePassword(password, passwordSalt, currentPasswordAlgorithm)
    const account: StoredAccount = {
      id: randomUUID(),
      createdAt,
      displayName,
      email,
      emailNormalized,
      passwordAlgorithm: currentPasswordAlgorithm,
      passwordHash: passwordHash.toString('hex'),
      passwordSalt,
      role: 'member',
      roleVersion: 0,
      updatedAt: createdAt,
    }

    await writeJsonFile(getAccountFilePath(account.id), account)
    return createSession(account)
  })
}

export async function loginBoardAccount(input: { email: string, password: string }) {
  const email = normalizeEmail(input.email)
  const password = input.password

  validateEmail(email)
  validateLoginPassword(password)

  const account = await findAccountByEmail(email)
  const passwordAlgorithm = account?.passwordAlgorithm || currentPasswordAlgorithm
  const passwordSalt = account?.passwordSalt || 'np-servicerequest-dummy-password-salt'
  const expectedHash = await derivePassword(password, passwordSalt, passwordAlgorithm)

  if (!account || !isMatchingPasswordHash(expectedHash, account.passwordHash))
    throw new AccountAuthenticationError('That email/password combination was not recognized.')

  let accountForSession = account

  if (passwordAlgorithm !== currentPasswordAlgorithm) {
    accountForSession = await withAccountMutationLock(account.id, async () => {
      const latestAccount = await getAccountById(account.id)

      if (!latestAccount)
        throw new AccountAuthenticationError('That email/password combination was not recognized.')

      const latestAlgorithm = latestAccount.passwordAlgorithm || currentPasswordAlgorithm
      const latestHash = await derivePassword(password, latestAccount.passwordSalt, latestAlgorithm)

      if (!isMatchingPasswordHash(latestHash, latestAccount.passwordHash))
        throw new AccountAuthenticationError('That email/password combination was not recognized.')

      if (latestAlgorithm === currentPasswordAlgorithm)
        return latestAccount

      const nextSalt = randomBytes(16).toString('hex')
      const nextHash = await derivePassword(password, nextSalt, currentPasswordAlgorithm)
      const upgradedAccount: StoredAccount = {
        ...latestAccount,
        passwordAlgorithm: currentPasswordAlgorithm,
        passwordHash: nextHash.toString('hex'),
        passwordSalt: nextSalt,
        updatedAt: new Date().toISOString(),
      }
      await writeJsonFile(getAccountFilePath(account.id), upgradedAccount)
      return upgradedAccount
    })
  }

  return createSession(accountForSession)
}
