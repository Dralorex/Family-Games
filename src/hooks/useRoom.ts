import { useEffect, useRef, useState } from 'react'
import { connectRoomSync, type RoomSync, type SyncStatus } from '../rooms/mqttSync'
import { normalizeRoom } from '../rooms/normalize'
import type { RoomAction, RoomState } from '../rooms/types'

export function useRoom(opts: {
  code: string
  playerId: string
  isCreator: boolean
  /** Creator display name — used to reclaim host authority from a new browser */
  claimName?: string | null
  initialState?: RoomState
  enabled?: boolean
}) {
  const { code, playerId, isCreator, claimName = null, initialState, enabled = true } = opts
  const seeded = initialState ? normalizeRoom(initialState) : null
  const [room, setRoom] = useState<RoomState | null>(seeded)
  const [status, setStatus] = useState<SyncStatus>('connecting')
  const syncRef = useRef<RoomSync | null>(null)
  const claimNameRef = useRef(claimName)
  claimNameRef.current = claimName

  useEffect(() => {
    if (!enabled || !code) return

    const sync = connectRoomSync({
      code,
      playerId,
      isCreator,
      // Live read so typing a name does not tear down the MQTT socket mid-join
      getClaimName: () => claimNameRef.current,
      initialState: seeded ?? undefined,
      onState: (state) => {
        const normalized = normalizeRoom(state)
        setRoom(normalized)
        try {
          sessionStorage.setItem(`fg_seed_${code}`, JSON.stringify(normalized))
        } catch {
          // ignore quota
        }
      },
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
