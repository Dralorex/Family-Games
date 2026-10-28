import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { isAuthBackendConfigured } from './config'
import * as authService from './service'
import type { AuthUser, SignInInput, SignUpInput } from './types'

interface AuthContextValue {
  configured: boolean
  user: AuthUser | null
  loading: boolean
  signUp: (input: SignUpInput) => Promise<AuthUser>
  signIn: (input: SignInInput) => Promise<AuthUser>
  signOut: () => Promise<void>
  requestEmailCode: (email: string) => Promise<void>
  verifyEmailCode: (email: string, code: string) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isAuthBackendConfigured()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(configured)

  useEffect(() => {
    if (!configured) {
      setLoading(false)
      setUser(null)
      return
    }
    setLoading(true)
    const unsub = authService.watchAuth((u) => {
      setUser(u)
      setLoading(false)
    })
    return unsub
  }, [configured])

  const value = useMemo<AuthContextValue>(
    () => ({
      configured,
      user,
      loading,
      signUp: (input) => authService.signUp(input),
      signIn: (input) => authService.signIn(input),
      signOut: () => authService.signOut(),
      requestEmailCode: async (email) => {
        await authService.requestEmailCode(email)
      },
      verifyEmailCode: async (email, code) => {
        await authService.verifyEmailCode(email, code)
      },
    }),
    [configured, user, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
