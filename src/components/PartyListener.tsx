import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { setActiveSession, getActiveSession } from '../lib/activeSession'
import { getActiveParty } from '../lib/party'
import { subscribePartyInvite } from '../rooms/partyBus'

/** When the host starts a new game after end-game "New Game", pull party members along. */
export function PartyListener() {
  const navigate = useNavigate()

  useEffect(() => {
    const party = getActiveParty()
    if (!party) return

    let ch: BroadcastChannel | null = null
    try {
      ch = new BroadcastChannel(`fg-party-${party.partyId}`)
      ch.onmessage = (event) => {
        const data = event.data as { type?: string; path?: string; prompt?: string }
        if (data?.type === 'pull' && data.path) {
          const code = data.path.split('/').pop() || party.code
          const prev = getActiveSession()
          setActiveSession({
            code,
            name: prev?.name || '',
            title: prev?.title || 'New game',
            kind: prev?.kind || 'scorecard',
            partyId: party.partyId,
            prompt: 'join',
            path: data.path,
            updatedAt: Date.now(),
          })
          navigate(data.path)
        }
      }
    } catch {
      // ignore
    }

    const unsub = subscribePartyInvite(party.partyId, (invite) => {
      if (!invite) return
      const prev = getActiveSession()
      setActiveSession({
        code: invite.code,
        name: prev?.name || '',
        title: invite.title || prev?.title || 'New game',
        kind: prev?.kind || 'scorecard',
        partyId: party.partyId,
        prompt: 'join',
        path: invite.path,
        updatedAt: Date.now(),
      })
      // Stay on Home so ResumePrompt shows “Join Game?” — don’t auto-navigate away
    })

    return () => {
      unsub()
      try {
        ch?.close()
      } catch {
        // ignore
      }
    }
  }, [navigate])

  return null
}
