import mqtt, { type MqttClient } from 'mqtt'
import { getCachedRoom, setCachedRoom } from './roomCache'
import { applyAction, tickHotPotato } from './reducer'
import type { RoomAction, RoomState } from './types'

const BROKER_URLS = [
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://test.mosquitto.org:8081',
]
const PREFIX = 'familygames/v1'

function stateTopic(code: string) {
  return `${PREFIX}/room/${code}/state`
}

function actionTopic(code: string) {
  return `${PREFIX}/room/${code}/action`
}

export type SyncStatus = 'connecting' | 'connected' | 'local' | 'error' | 'closed'

export interface RoomSync {
  publishAction: (action: RoomAction) => void
  publishState: (state: RoomState) => void
  close: () => void
}

/**
 * Local-first room sync.
 * - Host applies actions immediately.
 * - BroadcastChannel for same-browser tabs.
 * - MQTT with retained room state so joiners get the room instantly on subscribe.
 */
export function connectRoomSync(opts: {
  code: string
  playerId: string
  isCreator: boolean
  initialState?: RoomState
  onState: (state: RoomState) => void
  onStatus: (status: SyncStatus) => void
}): RoomSync {
  const { code, playerId, isCreator, initialState, onState, onStatus } = opts

  const cached = getCachedRoom(code)
  let room: RoomState | null = cached ?? initialState ?? null
  if (room) {
    setCachedRoom(room)
    onState(room)
  }

  let isAuthority = Boolean(isCreator || (room && room.hostId === playerId))
  let tickTimer: ReturnType<typeof setInterval> | null = null
  let closed = false
  let mqttConnected = false
  let client: MqttClient | null = null
  let brokerIndex = 0
  const pendingActions: RoomAction[] = []

  const channel =
    typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(`fg-room-${code}`) : null

  onStatus('connecting')

  const emitState = (state: RoomState) => {
    room = state
    setCachedRoom(state)
    onState(state)
    try {
      channel?.postMessage({ kind: 'state', state })
    } catch {
      // ignore
    }
    if (client && mqttConnected) {
      // Retained so anyone who joins later gets the room immediately
      client.publish(stateTopic(code), JSON.stringify(state), { qos: 0, retain: true })
    }
  }

  const handleAction = (action: RoomAction) => {
    if (!room || !isAuthority) return
    let next = applyAction(room, action)
    if (next.kind === 'hot-potato') {
      next = tickHotPotato(next)
    }
    if (action.type === 'hello' || next !== room) {
      emitState(next)
    }
  }

  const flushPending = () => {
    if (!pendingActions.length) return
    const queued = pendingActions.splice(0, pendingActions.length)
    for (const action of queued) {
      publishActionInner(action)
    }
  }

  const publishActionInner = (action: RoomAction) => {
    if (isAuthority && room) {
      handleAction(action)
      return
    }
    try {
      channel?.postMessage({ kind: 'action', action })
    } catch {
      // ignore
    }
    if (client && mqttConnected) {
      client.publish(actionTopic(code), JSON.stringify(action), { qos: 0 })
      return
    }
    // Not connected yet — queue so join isn't dropped
    pendingActions.push(action)
  }

  if (channel) {
    channel.onmessage = (event: MessageEvent) => {
      if (closed) return
      const data = event.data as { kind: string; state?: RoomState; action?: RoomAction }
      if (data.kind === 'state' && data.state) {
        if (!isAuthority || !room) {
          room = data.state
          setCachedRoom(data.state)
          onState(data.state)
        }
        return
      }
      if (data.kind === 'hello' && isAuthority && room) {
        emitState(room)
        return
      }
      if (data.kind === 'action' && data.action && isAuthority) {
        handleAction(data.action)
      }
    }
    // Ask any existing host tab for state immediately
    if (!isAuthority) {
      try {
        channel.postMessage({ kind: 'hello' })
      } catch {
        // ignore
      }
    }
  }

  const connectMqtt = (url: string) => {
    if (closed) return
    const nextClient: MqttClient = mqtt.connect(url, {
      clientId: `fg_${playerId.replace(/-/g, '').slice(0, 16)}_${Math.random().toString(36).slice(2, 8)}`,
      clean: true,
      reconnectPeriod: 1500,
      connectTimeout: 6000,
    })
    client = nextClient

    const failToNext = () => {
      if (closed || mqttConnected) return
      try {
        nextClient.end(true)
      } catch {
        // ignore
      }
      brokerIndex += 1
      if (brokerIndex < BROKER_URLS.length) {
        connectMqtt(BROKER_URLS[brokerIndex]!)
      } else {
        onStatus('local')
        isAuthority = Boolean(isCreator || (room && room.hostId === playerId))
        flushPending()
      }
    }

    nextClient.on('connect', () => {
      if (closed) return
      mqttConnected = true
      onStatus('connected')
      nextClient.subscribe([stateTopic(code), actionTopic(code)], (err) => {
        if (err) {
          failToNext()
          return
        }
        if (isAuthority && room) {
          emitState(room)
        } else {
          // Retained state arrives via subscribe; also nudge host
          nextClient.publish(
            actionTopic(code),
            JSON.stringify({ type: 'hello', fromId: playerId } satisfies RoomAction),
          )
        }
        flushPending()
      })
    })

    nextClient.on('message', (topic, payload) => {
      if (closed) return
      try {
        const data = JSON.parse(payload.toString()) as RoomState | RoomAction
        if (topic === stateTopic(code) && data && typeof data === 'object' && 'kind' in data) {
          const incoming = data as RoomState
          if (room && incoming.createdAt === room.createdAt) {
            if (!isAuthority) {
              room = incoming
              setCachedRoom(incoming)
              onState(incoming)
            }
          } else if (!room || incoming.createdAt >= room.createdAt) {
            if (!isAuthority || !room) {
              room = incoming
              setCachedRoom(incoming)
              onState(incoming)
              if (incoming.hostId === playerId) isAuthority = true
            }
          }
          return
        }
        if (topic === actionTopic(code) && data && typeof data === 'object' && 'type' in data) {
          handleAction(data as RoomAction)
        }
      } catch {
        // ignore malformed
      }
    })

    nextClient.on('error', () => {
      if (!mqttConnected) failToNext()
    })
    nextClient.on('close', () => {
      if (!closed && !mqttConnected) failToNext()
    })

    window.setTimeout(() => {
      if (!mqttConnected && client === nextClient) failToNext()
    }, 5000)
  }

  connectMqtt(BROKER_URLS[0]!)

  // Surface local quickly so the UI never blocks join on broker latency
  window.setTimeout(() => {
    if (!closed && !mqttConnected) {
      onStatus(room ? 'local' : 'connecting')
    }
  }, 400)

  tickTimer = setInterval(() => {
    if (!isAuthority || !room || room.kind !== 'hot-potato') return
    const next = tickHotPotato(room)
    if (next.timer.status !== room.timer.status) {
      emitState(next)
    }
  }, 250)

  return {
    publishAction: (action: RoomAction) => {
      publishActionInner(action)
    },
    publishState: emitState,
    close: () => {
      closed = true
      if (tickTimer) clearInterval(tickTimer)
      try {
        channel?.close()
      } catch {
        // ignore
      }
      try {
        // Clear retained state if host closes while finished/closed
        if (client && mqttConnected && isAuthority && room?.status === 'closed') {
          client.publish(stateTopic(code), '', { qos: 0, retain: true })
        }
        client?.end(true)
      } catch {
        // ignore
      }
    },
  }
}
