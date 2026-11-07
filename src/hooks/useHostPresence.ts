import { useEffect } from 'react'
import { HOST_AWAY_MS, shouldAutoClaimHost } from '../rooms/reducer'
import type { RoomAction, RoomState } from '../rooms/types'

/**
 * Host swipe-out → host-away. Return → host-back.
 * Next-in-line auto claim-host after 5 min, or immediately if the game already finished.
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

    const onHide = () => {
      if (document.visibilityState === 'hidden' && room.hostId === playerId) {
        send({ type: 'host-away', fromId: playerId })
      }
    }
    const onShow = () => {
      if (document.visibilityState === 'visible' && room.hostId === playerId && room.hostAwayAt) {
        send({ type: 'host-back', fromId: playerId })
      }
    }
    const onPageHide = () => {
      if (room.hostId === playerId) {
        send({ type: 'host-away', fromId: playerId })
      }
    }

    document.addEventListener('visibilitychange', onHide)
    document.addEventListener('visibilitychange', onShow)
    window.addEventListener('pagehide', onPageHide)

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
      document.removeEventListener('visibilitychange', onHide)
      document.removeEventListener('visibilitychange', onShow)
      window.removeEventListener('pagehide', onPageHide)
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
