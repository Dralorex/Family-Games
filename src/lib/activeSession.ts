const KEY = 'fg_resume_session'

export type ResumePrompt = 'continue' | 'join'

export interface ActiveSession {
  code: string
  name: string
  title: string
  kind: 'hot-potato' | 'scorecard'
  partyId: string
  prompt: ResumePrompt
  /** Route to open, e.g. /room/ABCDE */
  path: string
  updatedAt: number
}

export function getActiveSession(): ActiveSession | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ActiveSession
    if (!parsed?.partyId && !parsed?.code) return null
    return parsed
  } catch {
    return null
  }
}

export function setActiveSession(session: ActiveSession | null): void {
  if (!session) {
    localStorage.removeItem(KEY)
    return
  }
  localStorage.setItem(KEY, JSON.stringify({ ...session, updatedAt: Date.now() }))
}

export function clearActiveSession(): void {
  localStorage.removeItem(KEY)
}

export function patchActiveSession(patch: Partial<ActiveSession>): ActiveSession | null {
  const current = getActiveSession()
  if (!current) return null
  const next = { ...current, ...patch, updatedAt: Date.now() }
  setActiveSession(next)
  return next
}
