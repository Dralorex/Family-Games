import { useEffect, useRef, useState } from 'react'
import { connectRoomSync, type RoomSync, type SyncStatus } from '../rooms/mqttSync'
import type { RoomAction, RoomState } from '../rooms/types'

export function useRoom(opts: {
  code: string
  playerId: string
  isCreator: boolean
  initialState?: RoomState
  enabled?: boolean
}) {
  const { code, playerId, isCreator, initialState, enabled = true } = opts
  const [room, setRoom] = useState<RoomState | null>(initialState ?? null)
  const [status, setStatus] = useState<SyncStatus>('connecting')
  const syncRef = useRef<RoomSync | null>(null)

  useEffect(() => {
    if (!enabled || !code) return

    const sync = connectRoomSync({
      code,
      playerId,
      isCreator,
      initialState,
      onState: setRoom,
      onStatus: setStatus,
    })
    syncRef.current = sync

    return () => {
      sync.close()
      syncRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- connect once per code/player
  }, [code, playerId, isCreator, enabled])

  const send = (action: RoomAction) => {
    syncRef.current?.publishAction(action)
  }

  return { room, status, send }
}
