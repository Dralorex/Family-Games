import { useEffect } from 'react'
import {
  clearActiveSession,
  setActiveSession,
  type ActiveSession,
} from '../lib/activeSession'
import type { RoomState } from '../rooms/types'

/** Keep a swipe-out-safe resume bookmark while this device is in a live room. */
export function useTrackActiveSession(opts: {
  room: RoomState | null
  name: string | null
  enabled?: boolean
}) {
  const { room, name, enabled = true } = opts

  useEffect(() => {
    if (!enabled || !room || !name) return

    if (room.status === 'closed') {
      clearActiveSession()
      return
    }

    const activePlayers = Object.values(room.players).filter((p) => !p.left)
    if (room.status === 'finished' && activePlayers.length === 0) {
      clearActiveSession()
      return
    }

    let prompt: ActiveSession['prompt'] = 'continue'
    let code = room.code
    let path = `/room/${room.code}`
    let title = room.title

    if (room.pullTo) {
      prompt = 'join'
      code = room.pullTo.code
      path = room.pullTo.path.startsWith('/')
        ? room.pullTo.path
        : `/room/${room.pullTo.code}`
      title = room.title
    } else if (room.regrouping) {
      prompt = 'join'
    }

    const session: ActiveSession = {
      code,
      name,
      title,
      kind: room.kind,
      partyId: room.partyId,
      prompt,
      path,
      updatedAt: Date.now(),
    }
    setActiveSession(session)

    const flush = () => setActiveSession(session)
    document.addEventListener('visibilitychange', flush)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', flush)
      window.removeEventListener('pagehide', flush)
    }
  }, [room, name, enabled])
}
