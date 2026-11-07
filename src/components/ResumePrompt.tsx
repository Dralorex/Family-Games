import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  clearActiveSession,
  getActiveSession,
  setActiveSession,
  type ActiveSession,
} from '../lib/activeSession'
import { setActiveParty } from '../lib/party'
import { lookupPartyInvite, subscribePartyInvite } from '../rooms/partyBus'
import { probeRoomState, shouldOfferResume } from '../rooms/roomProbe'

export function ResumePrompt() {
  const navigate = useNavigate()
  const [session, setSession] = useState<ActiveSession | null>(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    let cancelled = false
    const initial = getActiveSession()

    const resolve = async () => {
      if (!initial) {
        if (!cancelled) {
          setSession(null)
          setChecking(false)
        }
        return
      }

      // Prefer a fresh party invite (host started a new game)
      try {
        const invite = await lookupPartyInvite(initial.partyId)
        if (invite && !cancelled) {
          const next: ActiveSession = {
            ...initial,
            code: invite.code,
            path: invite.path,
            title: invite.title || initial.title,
            prompt: 'join',
            updatedAt: Date.now(),
          }
          setActiveSession(next)
          setActiveParty({
            partyId: next.partyId,
            hostId: '',
            code: next.code,
          })
          setSession(next)
          setChecking(false)
          return
        }
      } catch {
        // fall through to room probe
      }

      if (!initial.code) {
        // Waiting for host to pick the next game
        if (!cancelled) {
          setSession({ ...initial, prompt: 'join' })
          setChecking(false)
        }
        return
      }

      try {
        const room = await probeRoomState(initial.code)
        if (cancelled) return
        if (!shouldOfferResume(room)) {
          clearActiveSession()
          setSession(null)
          setChecking(false)
          return
        }
        if (room?.pullTo) {
          const next: ActiveSession = {
            ...initial,
            code: room.pullTo.code,
            path: room.pullTo.path,
            prompt: 'join',
          }
          setActiveSession(next)
          setSession(next)
        } else if (room?.regrouping) {
          setSession({ ...initial, prompt: 'join' })
        } else {
          setSession(initial)
        }
      } catch {
        if (!cancelled) setSession(initial)
      } finally {
        if (!cancelled) setChecking(false)
      }
    }

    void resolve()

    const unsub =
      initial?.partyId
        ? subscribePartyInvite(initial.partyId, (invite) => {
            if (!invite) return
            const base = getActiveSession() || initial
            const next: ActiveSession = {
              ...base,
              code: invite.code,
              path: invite.path,
              title: invite.title || base.title,
              prompt: 'join',
              updatedAt: Date.now(),
            }
            setActiveSession(next)
            setActiveParty({ partyId: next.partyId, hostId: '', code: next.code })
            setSession(next)
            setChecking(false)
          })
        : () => {}

    return () => {
      cancelled = true
      unsub()
    }
  }, [])

  if (checking || !session) return null

  // Still waiting for host to create the next game — no code yet
  if (session.prompt === 'join' && !session.code) {
    return (
      <div className="resume-banner">
        <p>
          Waiting for the host to start the next game…
        </p>
        <button
          type="button"
          className="btn secondary"
          onClick={() => {
            clearActiveSession()
            setSession(null)
          }}
        >
          Dismiss
        </button>
      </div>
    )
  }

  const label = session.prompt === 'join' ? 'Join Game?' : 'Continue Game'
  const detail =
    session.prompt === 'join'
      ? `Host started a new game${session.title ? ` · ${session.title}` : ''}`
      : `Resume ${session.title || 'your game'} as ${session.name}`

  return (
    <div className="resume-banner">
      <p>{detail}</p>
      <div className="resume-actions">
        <Link
          className="btn primary"
          to={session.path}
          onClick={() => {
            sessionStorage.setItem(`fg_name_${session.code}`, session.name)
            if (session.prompt === 'join') {
              // Joining a brand-new lobby after an ended game
              clearActiveSession()
            }
          }}
        >
          {label}
        </Link>
        <button
          type="button"
          className="btn secondary"
          onClick={() => {
            clearActiveSession()
            setSession(null)
            navigate('/')
          }}
        >
          Not now
        </button>
      </div>
    </div>
  )
}
