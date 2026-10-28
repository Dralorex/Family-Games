import { AuthLockedError, type AuthLockKind, type LockoutState } from './types'

/** Delays after every 3 failed attempts (minutes): 1 → 5 → 10 → 30 → 60 → 120 → … */
export const LOCKOUT_DELAYS_MIN = [1, 5, 10, 30, 60, 120, 240, 480, 960, 1440] as const

const STORAGE_PREFIX = 'fg_auth_lock_'

function storageKey(kind: AuthLockKind, key: string) {
  return `${STORAGE_PREFIX}${kind}_${key.trim().toLowerCase()}`
}

export function delayMinutesForLevel(level: number): number {
  if (level <= 0) return 0
  const idx = Math.min(level - 1, LOCKOUT_DELAYS_MIN.length - 1)
  if (level <= LOCKOUT_DELAYS_MIN.length) return LOCKOUT_DELAYS_MIN[idx]!
  const last = LOCKOUT_DELAYS_MIN[LOCKOUT_DELAYS_MIN.length - 1]!
  const extra = level - LOCKOUT_DELAYS_MIN.length
  return last * 2 ** extra
}

export function readLockout(kind: AuthLockKind, key: string): LockoutState {
  const empty: LockoutState = {
    kind,
    key: key.trim().toLowerCase(),
    failedAttempts: 0,
    lockLevel: 0,
    lockedUntil: null,
  }
  try {
    const raw = localStorage.getItem(storageKey(kind, key))
    if (!raw) return empty
    const parsed = JSON.parse(raw) as LockoutState
    return {
      ...empty,
      ...parsed,
      kind,
      key: empty.key,
    }
  } catch {
    return empty
  }
}

function writeLockout(state: LockoutState): void {
  localStorage.setItem(storageKey(state.kind, state.key), JSON.stringify(state))
}

export function clearLockout(kind: AuthLockKind, key: string): void {
  localStorage.removeItem(storageKey(kind, key))
}

export function getLockRemainingMs(state: LockoutState, now = Date.now()): number {
  if (!state.lockedUntil) return 0
  return Math.max(0, state.lockedUntil - now)
}

export function isLocked(
  kind: AuthLockKind,
  key: string,
  now = Date.now(),
): { locked: boolean; remainingMs: number; state: LockoutState } {
  const state = readLockout(kind, key)
  const remainingMs = getLockRemainingMs(state, now)
  return { locked: remainingMs > 0, remainingMs, state }
}

export function assertNotLocked(kind: AuthLockKind, key: string, now = Date.now()): void {
  const { locked, state } = isLocked(kind, key, now)
  if (locked && state.lockedUntil) {
    throw new AuthLockedError(state.lockedUntil)
  }
}

export function recordAuthFailure(kind: AuthLockKind, key: string, now = Date.now()): LockoutState {
  const prev = readLockout(kind, key)
  if (getLockRemainingMs(prev, now) > 0) return prev

  const failedAttempts = prev.failedAttempts + 1
  let lockLevel = prev.lockLevel
  let lockedUntil: number | null = null

  if (failedAttempts % 3 === 0) {
    lockLevel = prev.lockLevel + 1
    lockedUntil = now + delayMinutesForLevel(lockLevel) * 60_000
  }

  const next: LockoutState = {
    kind,
    key: key.trim().toLowerCase(),
    failedAttempts,
    lockLevel,
    lockedUntil,
  }
  writeLockout(next)
  return next
}

export function recordAuthSuccess(kind: AuthLockKind, key: string): void {
  clearLockout(kind, key)
}

export function formatRemaining(ms: number): string {
  const totalSec = Math.ceil(ms / 1000)
  if (totalSec < 60) return `${totalSec}s`
  const min = Math.ceil(totalSec / 60)
  if (min < 60) return `${min} min`
  const hr = Math.floor(min / 60)
  const rem = min % 60
  return rem ? `${hr}h ${rem}m` : `${hr}h`
}
