import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getActiveParty } from '../lib/party'

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
        const data = event.data as { type?: string; path?: string }
        if (data?.type === 'pull' && data.path) {
          navigate(data.path)
        }
      }
    } catch {
      // ignore
    }
    return () => {
      try {
        ch?.close()
      } catch {
        // ignore
      }
    }
  }, [navigate])

  return null
}
