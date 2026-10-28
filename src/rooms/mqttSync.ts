import mqtt, { type MqttClient } from 'mqtt'
import { applyAction, tickHotPotato } from './reducer'
import type { RoomAction, RoomState } from './types'

const BROKER_URL = 'wss://broker.hivemq.com:8884/mqtt'
const PREFIX = 'familygames/v1'

function stateTopic(code: string) {
  return `${PREFIX}/room/${code}/state`
}

function actionTopic(code: string) {
  return `${PREFIX}/room/${code}/action`
}

export type SyncStatus = 'connecting' | 'connected' | 'error' | 'closed'

export interface RoomSync {
  publishAction: (action: RoomAction) => void
  /** Host (or creator seeding) publishes authoritative state */
  publishState: (state: RoomState) => void
  close: () => void
}

export function connectRoomSync(opts: {
  code: string
  playerId: string
  isCreator: boolean
  initialState?: RoomState
  onState: (state: RoomState) => void
  onStatus: (status: SyncStatus) => void
}): RoomSync {
  const { code, playerId, isCreator, initialState, onState, onStatus } = opts

  let room: RoomState | null = initialState ?? null
  let isAuthority = isCreator
  let tickTimer: ReturnType<typeof setInterval> | null = null
  let closed = false

  onStatus('connecting')

  const client: MqttClient = mqtt.connect(BROKER_URL, {
    clientId: `fg_${playerId.replace(/-/g, '').slice(0, 16)}_${Math.random().toString(36).slice(2, 8)}`,
    clean: true,
    reconnectPeriod: 2000,
    connectTimeout: 10000,
  })

  const becomeAuthorityIfNeeded = (state: RoomState) => {
    // Creator stays authority; if creator gone, earliest joiner takes over
    if (state.hostId === playerId) {
      isAuthority = true
    }
  }

  const publishState = (state: RoomState) => {
    room = state
    client.publish(stateTopic(code), JSON.stringify(state), { qos: 0, retain: false })
    onState(state)
  }

  const handleAction = (action: RoomAction) => {
    if (!room || !isAuthority) return
    let next = applyAction(room, action)
    if (next.kind === 'hot-potato') {
      next = tickHotPotato(next)
    }
    // hello / join should always rebroadcast so late joiners get state
    if (action.type === 'hello' || next !== room) {
      publishState(next)
    }
  }

  client.on('connect', () => {
    if (closed) return
    onStatus('connected')
    client.subscribe([stateTopic(code), actionTopic(code)], (err) => {
      if (err) {
        onStatus('error')
        return
      }
      if (isCreator && initialState) {
        publishState(initialState)
      } else {
        // Ask host to rebroadcast
        client.publish(actionTopic(code), JSON.stringify({ type: 'hello', fromId: playerId } satisfies RoomAction))
      }
    })

    tickTimer = setInterval(() => {
      if (!isAuthority || !room || room.kind !== 'hot-potato') return
      const next = tickHotPotato(room)
      if (next.timer.status !== room.timer.status) {
        publishState(next)
      }
    }, 250)
  })

  client.on('message', (topic, payload) => {
    if (closed) return
    try {
      const data = JSON.parse(payload.toString()) as RoomState | RoomAction
      if (topic === stateTopic(code) && data && typeof data === 'object' && 'kind' in data) {
        room = data as RoomState
        becomeAuthorityIfNeeded(room)
        onState(room)
        return
      }
      if (topic === actionTopic(code) && data && typeof data === 'object' && 'type' in data) {
        const action = data as RoomAction
        // Apply locally if we are authority
        handleAction(action)
      }
    } catch {
      // ignore malformed
    }
  })

  client.on('error', () => {
    if (!closed) onStatus('error')
  })

  client.on('close', () => {
    if (!closed) onStatus('closed')
  })

  return {
    publishAction: (action: RoomAction) => {
      // Host applies locally and broadcasts state (skip action echo to avoid double-apply).
      // Guests publish actions for the host to process.
      if (isAuthority && room) {
        handleAction(action)
        return
      }
      client.publish(actionTopic(code), JSON.stringify(action), { qos: 0 })
    },
    publishState,
    close: () => {
      closed = true
      if (tickTimer) clearInterval(tickTimer)
      client.end(true)
    },
  }
}
