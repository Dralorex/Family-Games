import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { AuthDisabledBanner } from '../components/AuthDisabledBanner'
import { useAuth } from '../auth/AuthContext'
import { AuthLockedError, AuthNotConfiguredError } from '../auth/types'
import { formatRemaining, isLocked } from '../auth/lockout'

type Mode = 'signin' | 'signup' | 'verify'

function friendlyError(err: unknown): string {
  if (err instanceof AuthNotConfiguredError) {
    return err.message
  }
  if (err instanceof AuthLockedError) {
    return `Too many attempts. Try again in ${formatRemaining(err.lockedUntil - Date.now())}.`
  }
  if (err && typeof err === 'object' && 'code' in err) {
    const code = String((err as { code?: string }).code || '')
    if (code.includes('email-already-in-use')) return 'That email is already registered.'
    if (code.includes('wrong-password') || code.includes('invalid-credential')) {
      return 'Wrong username/email or password.'
    }
    if (code.includes('user-not-found')) return 'No account found for that sign-in.'
    if (code.includes('weak-password')) return 'Password is too weak.'
  }
  if (err instanceof Error) return err.message
  return 'Something went wrong.'
}

export function AccountPage() {
  const auth = useAuth()
  const [mode, setMode] = useState<Mode>('signin')
  const [username, setUsername] = useState('')
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)
  const [lockMsg, setLockMsg] = useState('')
  const [noEmailAck, setNoEmailAck] = useState(false)

  useEffect(() => {
    const key = (mode === 'signin' ? identifier : email || username).trim().toLowerCase()
    if (!key) {
      setLockMsg('')
      return
    }
    const kind = mode === 'verify' ? 'email-code' : 'login'
    const tick = () => {
      const { locked, remainingMs, state } = isLocked(kind, key)
      if (locked) {
        setLockMsg(
          `Locked after failed attempts (level ${state.lockLevel}). Try again in ${formatRemaining(remainingMs)}.`,
        )
      } else if (state.failedAttempts > 0) {
        const left = 3 - (state.failedAttempts % 3)
        setLockMsg(`${state.failedAttempts} failed attempt(s). ${left} left before a delay lock.`)
      } else {
        setLockMsg('')
      }
    }
    tick()
    const id = window.setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [mode, identifier, email, username])

  const onSignIn = async () => {
    setError('')
    setInfo('')
    setBusy(true)
    try {
      await auth.signIn({ identifier, password })
      setInfo('Signed in.')
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  const onSignUp = async () => {
    setError('')
    setInfo('')
    if (!email.trim() && !noEmailAck) {
      setError('Check the box to confirm you understand accounts without email cannot be recovered.')
      return
    }
    setBusy(true)
    try {
      await auth.signUp({
        username,
        password,
        email: email.trim() || undefined,
      })
      if (email.trim()) {
        setMode('verify')
        setInfo('Account created. Enter the 6-digit code we email you (after Functions are live).')
      } else {
        setInfo('Account created without email. This login cannot be recovered if you forget the password.')
      }
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  const onSendCode = async () => {
    setError('')
    setInfo('')
    setBusy(true)
    try {
      await auth.requestEmailCode(email.trim() || auth.user?.email || '')
      setInfo('Code sent (when email Functions are configured).')
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  const onVerifyCode = async () => {
    setError('')
    setInfo('')
    setBusy(true)
    try {
      await auth.verifyEmailCode(email.trim() || auth.user?.email || '', code)
      setInfo('Email verified.')
      setMode('signin')
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="page narrow account-page">
      <Link to="/" className="back">
        Home
      </Link>
      <div className="panel">
        <h1>Account</h1>
        <AuthDisabledBanner />

        {auth.user ? (
          <div className="bubble">
            <p>
              Signed in as <strong>{auth.user.username}</strong>
              {auth.user.email ? ` · ${auth.user.email}` : ' · no email on file'}
            </p>
            {!auth.user.email ? (
              <p className="warn">
                No email saved. If you forget this password, this account cannot be recovered.
              </p>
            ) : null}
            <button type="button" className="btn secondary" onClick={() => void auth.signOut()}>
              Sign out
            </button>
            {auth.user.email && !auth.user.emailVerified ? (
              <button type="button" className="btn primary" onClick={() => setMode('verify')}>
                Verify email
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="chip-row account-tabs">
          <button
            type="button"
            className={`chip ${mode === 'signin' ? 'selected' : ''}`}
            onClick={() => {
              setMode('signin')
              setError('')
              setInfo('')
            }}
          >
            Sign in
          </button>
          <button
            type="button"
            className={`chip ${mode === 'signup' ? 'selected' : ''}`}
            onClick={() => {
              setMode('signup')
              setError('')
              setInfo('')
            }}
          >
            Sign up
          </button>
          <button
            type="button"
            className={`chip ${mode === 'verify' ? 'selected' : ''}`}
            onClick={() => {
              setMode('verify')
              setError('')
              setInfo('')
            }}
          >
            Email code
          </button>
        </div>

        {mode === 'signin' ? (
          <div className="auth-form">
            <label className="field">
              <span>Username or email</span>
              <input
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                autoComplete="username"
              />
            </label>
            <label className="field">
              <span>Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </label>
            <button
              type="button"
              className="btn primary"
              disabled={busy || !auth.configured}
              onClick={() => void onSignIn()}
            >
              Sign in
            </button>
          </div>
        ) : null}

        {mode === 'signup' ? (
          <div className="auth-form">
            <label className="field">
              <span>Username</span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                maxLength={18}
              />
            </label>
            <label className="field">
              <span>Password (8+ characters)</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </label>
            <label className="field">
              <span>Email (optional)</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="Leave blank if you prefer"
              />
            </label>
            <p className="muted">
              Email is optional. Without an email, a forgotten password means this account is gone
              forever — it cannot be recovered or reused.
            </p>
            {!email.trim() ? (
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={noEmailAck}
                  onChange={(e) => setNoEmailAck(e.target.checked)}
                />
                <span>I understand there is no password recovery without an email.</span>
              </label>
            ) : null}
            <button
              type="button"
              className="btn primary"
              disabled={busy || !auth.configured}
              onClick={() => void onSignUp()}
            >
              Create account
            </button>
          </div>
        ) : null}

        {mode === 'verify' ? (
          <div className="auth-form">
            <p className="muted">
              6-digit codes are emailed by Cloud Functions (not generated in the browser). Lockout:
              3 bad codes → 1 min, then 5, 10, 30, 60… minutes.
            </p>
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                value={email || auth.user?.email || ''}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="btn secondary"
              disabled={busy || !auth.configured}
              onClick={() => void onSendCode()}
            >
              Send code
            </button>
            <label className="field">
              <span>6-digit code</span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                maxLength={6}
              />
            </label>
            <button
              type="button"
              className="btn primary"
              disabled={busy || !auth.configured}
              onClick={() => void onVerifyCode()}
            >
              Verify code
            </button>
          </div>
        ) : null}

        {lockMsg ? <p className="warn">{lockMsg}</p> : null}
        {error ? <p className="error">{error}</p> : null}
        {info ? <p className="ok">{info}</p> : null}
      </div>
    </main>
  )
}
