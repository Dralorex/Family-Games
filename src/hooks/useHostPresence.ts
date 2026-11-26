import { useEffect } from 'react'
import { HOST_AWAY_MS, shouldAutoClaimHost } from '../rooms/reducer'
import type { RoomAction, RoomState } from '../rooms/types'

/**
 * Leaving the site or app does not mark the host away.
 * If an older session already flagged them away, coming back clears it.
 * Next-in-line can still claim after a real host-away timeout.
 */
export function useHostPresence(opts: {
  room: RoomState | null
  playerId: string
  send: (action: RoomAction) => void
}) {
  const { room, playerId, send } = opts

  useEffect(() => {
    if (!room || room.status === 'closed') return
    const isHost = room.hostId === playerId

    const markBack = () => {
      if (document.visibilityState !== 'visible') return
      if (room.hostId === playerId && room.hostAwayAt) {
        send({ type: 'host-back', fromId: playerId })
      }
    }

    markBack()
    document.addEventListener('visibilitychange', markBack)

    const tick = window.setInterval(() => {
      if (!room.hostAwayAt) return
      if (isHost) return
      if (shouldAutoClaimHost(room, playerId)) {
        send({ type: 'claim-host', fromId: playerId })
      }
    }, 5000)

    // Finished while host is away → claim immediately if we're next
    if (room.status === 'finished' && shouldAutoClaimHost(room, playerId)) {
      send({ type: 'claim-host', fromId: playerId })
    }

    return () => {
      document.removeEventListener('visibilitychange', markBack)
      window.clearInterval(tick)
    }
  }, [
    room,
    room?.hostId,
    room?.hostAwayAt,
    room?.status,
    playerId,
    send,
  ])

  return { hostAwayMs: HOST_AWAY_MS }
}
