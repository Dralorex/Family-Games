export interface AuthUser {
  uid: string
  username: string
  email: string | null
  emailVerified: boolean
}

export interface SignUpInput {
  username: string
  password: string
  email?: string
}

export interface SignInInput {
  /** Username or email */
  identifier: string
  password: string
}

export type AuthLockKind = 'login' | 'email-code'

export interface LockoutState {
  kind: AuthLockKind
  key: string
  failedAttempts: number
  lockLevel: number
  lockedUntil: number | null
}

export class AuthNotConfiguredError extends Error {
  constructor(message = 'Accounts are disabled until Firebase / backend env is configured.') {
    super(message)
    this.name = 'AuthNotConfiguredError'
  }
}

export class AuthLockedError extends Error {
  lockedUntil: number
  constructor(lockedUntil: number) {
    super('Too many attempts. Try again later.')
    this.name = 'AuthLockedError'
    this.lockedUntil = lockedUntil
  }
}
