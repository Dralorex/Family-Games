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
  playerId?: string
  enabled?: boolean
}) {
  const { room, name, playerId, enabled = true } = opts

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
    const isHost = Boolean(playerId && room.hostId === playerId)
    let path = isHost ? `/room/${room.code}?host=1` : `/room/${room.code}`
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

    const write = () => {
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
    }

    write()

    const flush = () => write()
    document.addEventListener('visibilitychange', flush)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', flush)
      window.removeEventListener('pagehide', flush)
    }
  }, [room, name, playerId, enabled])
}
