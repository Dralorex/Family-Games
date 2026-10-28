import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  updateProfile,
  type User,
} from 'firebase/auth'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import {
  assertNotLocked,
  recordAuthFailure,
  recordAuthSuccess,
} from './lockout'
import { isAuthBackendConfigured, readAuthFunctionsBase } from './config'
import { getFirebaseAuth, getFirebaseDb } from './firebaseApp'
import {
  AuthLockedError,
  AuthNotConfiguredError,
  type AuthUser,
  type SignInInput,
  type SignUpInput,
} from './types'
import {
  isEmailIdentifier,
  isValidEmail,
  isValidPassword,
  isValidUsername,
  normalizeUsername,
  syntheticEmailForUsername,
} from './validate'

function requireConfigured() {
  if (!isAuthBackendConfigured()) {
    throw new AuthNotConfiguredError()
  }
}

function toAuthUser(user: User, username: string, email: string | null): AuthUser {
  return {
    uid: user.uid,
    username,
    email,
    emailVerified: Boolean(email && user.emailVerified),
  }
}

async function lookupUsernameEmail(username: string): Promise<string | null> {
  const db = getFirebaseDb()
  if (!db) return null
  const snap = await getDoc(doc(db, 'usernames', username.toLowerCase()))
  if (!snap.exists()) return null
  const data = snap.data() as { email?: string }
  return data.email ?? syntheticEmailForUsername(username)
}

async function resolveLoginEmail(identifier: string): Promise<string> {
  const raw = identifier.trim()
  if (isEmailIdentifier(raw)) {
    if (!isValidEmail(raw)) throw new Error('Enter a valid email.')
    return raw.toLowerCase()
  }
  if (!isValidUsername(raw)) throw new Error('Enter a valid username or email.')
  const mapped = await lookupUsernameEmail(raw)
  if (mapped) return mapped
  // Fallback synthetic mapping used at signup when profiles collection isn't ready
  return syntheticEmailForUsername(raw)
}

export async function getProfileUsername(uid: string): Promise<string | null> {
  const db = getFirebaseDb()
  if (!db) return null
  const snap = await getDoc(doc(db, 'profiles', uid))
  if (!snap.exists()) return null
  return (snap.data() as { username?: string }).username ?? null
}

export function watchAuth(cb: (user: AuthUser | null) => void): () => void {
  if (!isAuthBackendConfigured()) {
    cb(null)
    return () => {}
  }
  const auth = getFirebaseAuth()
  if (!auth) {
    cb(null)
    return () => {}
  }
  return onAuthStateChanged(auth, (user) => {
    void (async () => {
      if (!user) {
        cb(null)
        return
      }
      const username =
        (await getProfileUsername(user.uid)) ||
        user.displayName ||
        user.email?.split('@')[0] ||
        'player'
      const email =
        user.email && !user.email.endsWith('@users.family-games.local')
          ? user.email
          : null
      cb(toAuthUser(user, username, email))
    })()
  })
}

export async function signUp(input: SignUpInput): Promise<AuthUser> {
  requireConfigured()
  const username = normalizeUsername(input.username)
  if (!isValidUsername(username)) {
    throw new Error('Username must be 3–18 letters, numbers, or underscores.')
  }
  if (!isValidPassword(input.password)) {
    throw new Error('Password must be at least 8 characters.')
  }
  const emailOptional = input.email?.trim() || ''
  if (emailOptional && !isValidEmail(emailOptional)) {
    throw new Error('Enter a valid email, or leave it blank.')
  }

  const auth = getFirebaseAuth()
  const db = getFirebaseDb()
  if (!auth || !db) throw new AuthNotConfiguredError()

  // Reserve username
  const unameRef = doc(db, 'usernames', username.toLowerCase())
  const existing = await getDoc(unameRef)
  if (existing.exists()) throw new Error('That username is taken.')

  const authEmail = emailOptional.toLowerCase() || syntheticEmailForUsername(username)
  const cred = await createUserWithEmailAndPassword(auth, authEmail, input.password)
  await updateProfile(cred.user, { displayName: username })
  await setDoc(unameRef, {
    uid: cred.user.uid,
    username,
    email: emailOptional ? emailOptional.toLowerCase() : null,
    createdAt: Date.now(),
  })
  await setDoc(doc(db, 'profiles', cred.user.uid), {
    username,
    email: emailOptional ? emailOptional.toLowerCase() : null,
    createdAt: Date.now(),
  })

  return toAuthUser(cred.user, username, emailOptional ? emailOptional.toLowerCase() : null)
}

export async function signIn(input: SignInInput): Promise<AuthUser> {
  requireConfigured()
  const key = input.identifier.trim().toLowerCase()
  assertNotLocked('login', key)

  const auth = getFirebaseAuth()
  if (!auth) throw new AuthNotConfiguredError()

  try {
    const email = await resolveLoginEmail(input.identifier)
    const cred = await signInWithEmailAndPassword(auth, email, input.password)
    recordAuthSuccess('login', key)
    const username =
      (await getProfileUsername(cred.user.uid)) ||
      cred.user.displayName ||
      input.identifier.trim()
    const profileEmail =
      cred.user.email && !cred.user.email.endsWith('@users.family-games.local')
        ? cred.user.email
        : null
    return toAuthUser(cred.user, username, profileEmail)
  } catch (err) {
    const state = recordAuthFailure('login', key)
    if (state.lockedUntil) {
      throw new AuthLockedError(state.lockedUntil)
    }
    throw err instanceof Error ? err : new Error('Sign in failed.')
  }
}

export async function signOut(): Promise<void> {
  const auth = getFirebaseAuth()
  if (!auth) return
  await fbSignOut(auth)
}

/**
 * Request a 6-digit email code.
 * Requires Cloud Functions (VITE_AUTH_FUNCTIONS_URL) — not safe to mint codes in the browser.
 */
export async function requestEmailCode(email: string): Promise<{ sent: true }> {
  requireConfigured()
  if (!isValidEmail(email)) throw new Error('Enter a valid email.')
  const key = email.trim().toLowerCase()
  assertNotLocked('email-code', key)

  const base = readAuthFunctionsBase()
  if (!base) {
    throw new Error(
      'Email codes need Cloud Functions. Set VITE_AUTH_FUNCTIONS_URL after you deploy sendEmailCode.',
    )
  }

  const res = await fetch(`${base}/sendEmailCode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: key }),
  })
  if (!res.ok) {
    const state = recordAuthFailure('email-code', key)
    if (state.lockedUntil) {
      throw new AuthLockedError(state.lockedUntil)
    }
    throw new Error('Could not send code. Try again later.')
  }
  return { sent: true }
}

export async function verifyEmailCode(email: string, code: string): Promise<{ ok: true }> {
  requireConfigured()
  const key = email.trim().toLowerCase()
  assertNotLocked('email-code', key)

  if (!/^\d{6}$/.test(code.trim())) {
    throw new Error('Enter the 6-digit code.')
  }

  const base = readAuthFunctionsBase()
  if (!base) {
    throw new Error(
      'Email verification needs Cloud Functions. Set VITE_AUTH_FUNCTIONS_URL after you deploy verifyEmailCode.',
    )
  }

  const res = await fetch(`${base}/verifyEmailCode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: key, code: code.trim() }),
  })
  if (!res.ok) {
    const state = recordAuthFailure('email-code', key)
    if (state.lockedUntil) {
      throw new AuthLockedError(state.lockedUntil)
    }
    throw new Error('That code is incorrect or expired.')
  }
  recordAuthSuccess('email-code', key)
  return { ok: true }
}
