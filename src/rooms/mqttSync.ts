import mqtt, { type MqttClient } from 'mqtt'
import { claimFromRoom, publishOwnerClaim } from './ownerIndex'
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

function namesMatch(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/**
 * Local-first room sync.
 * - Host applies actions immediately (works even if MQTT is blocked).
 * - BroadcastChannel keeps same-browser tabs in sync.
 * - MQTT relays across devices when the broker is reachable.
 * - Room state is retained so a host reclaiming from a new browser can resume.
 */
export function connectRoomSync(opts: {
  code: string
  playerId: string
  isCreator: boolean
  /** When set with isCreator, must match room.creatorName to reclaim */
  claimName?: string | null
  initialState?: RoomState
  onState: (state: RoomState) => void
  onStatus: (status: SyncStatus) => void
}): RoomSync {
  const { code, playerId, isCreator, claimName = null, initialState, onState, onStatus } = opts

  const cached = getCachedRoom(code)
  let room: RoomState | null = cached ?? initialState ?? null
  if (room) {
    setCachedRoom(room)
    onState(room)
  }

  /** Forceful host reclaim from Continue-as-host / create (?host=1). */
  const canForceReclaim = (state: RoomState | null) => {
    if (!isCreator) return false
    if (!state) return true
    if (claimName && !namesMatch(state.creatorName, claimName)) return false
    return true
  }

  let isAuthority = Boolean(
    canForceReclaim(room) || (room && room.hostId === playerId),
  )

  let tickTimer: ReturnType<typeof setInterval> | null = null
  let closed = false
  let mqttConnected = false
  let client: MqttClient | null = null
  let brokerIndex = 0
  let requestedState = false

  const channel =
    typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(`fg-room-${code}`) : null

  onStatus('connecting')

  const publishOwner = (state: RoomState) => {
    if (state.status === 'closed') {
      void publishOwnerClaim(state.creatorName, null).catch(() => {})
      return
    }
    void publishOwnerClaim(state.creatorName, claimFromRoom(state)).catch(() => {})
  }

  const publishMqttState = (state: RoomState) => {
    if (!client || !mqttConnected) return
    const payload = state.status === 'closed' ? '' : JSON.stringify(state)
    client.publish(stateTopic(code), payload, { qos: 0, retain: true })
  }

  const emitState = (state: RoomState) => {
    room = state
    setCachedRoom(state)
    onState(state)
    try {
      channel?.postMessage({ kind: 'state', state })
    } catch {
      // ignore
    }
    publishMqttState(state)
    if (isAuthority) {
      publishOwner(state)
    }
  }

  const adoptIncoming = (incoming: RoomState) => {
    room = incoming
    setCachedRoom(incoming)
    onState(incoming)

    if (incoming.hostId === playerId || canForceReclaim(incoming)) {
      isAuthority = true
    } else if (isAuthority && incoming.hostId !== playerId) {
      // Another browser took the host seat — stop applying actions here
      isAuthority = false
    }
  }

  const handleAction = (action: RoomAction) => {
    if (action.type === 'request-state') {
      if (room && client && mqttConnected) {
        publishMqttState(room)
        try {
          channel?.postMessage({ kind: 'state', state: room })
        } catch {
          // ignore
        }
      }
      return
    }

    if (!room || !isAuthority) return
    let next = applyAction(room, action)
    if (next.kind === 'hot-potato') {
      next = tickHotPotato(next)
    }
    if (action.type === 'hello' || next !== room) {
      emitState(next)
    }
  }

  const askForState = () => {
    if (requestedState || room) return
    requestedState = true
    const action: RoomAction = { type: 'request-state', fromId: playerId }
    try {
      channel?.postMessage({ kind: 'action', action })
    } catch {
      // ignore
    }
    if (client && mqttConnected) {
      client.publish(actionTopic(code), JSON.stringify(action), { qos: 0 })
    }
  }

  if (channel) {
    channel.onmessage = (event: MessageEvent) => {
      if (closed) return
      const data = event.data as { kind: string; state?: RoomState; action?: RoomAction }
      if (data.kind === 'state' && data.state) {
        if (!isAuthority || !room || canForceReclaim(data.state)) {
          const wasAuthority = isAuthority
          adoptIncoming(data.state)
          if (canForceReclaim(data.state) && (!wasAuthority || data.state.hostId !== playerId)) {
            // New host browser: republish so connected phones refresh onto this authority
            isAuthority = true
            emitState(data.state)
          }
        }
        return
      }
      if (data.kind === 'action' && data.action) {
        if (data.action.type === 'request-state') {
          handleAction(data.action)
          return
        }
        if (isAuthority) handleAction(data.action)
      }
    }
  }

  const connectMqtt = (url: string) => {
    if (closed) return
    const nextClient: MqttClient = mqtt.connect(url, {
      clientId: `fg_${playerId.replace(/-/g, '').slice(0, 16)}_${Math.random().toString(36).slice(2, 8)}`,
      clean: true,
      reconnectPeriod: 0,
      connectTimeout: 8000,
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
        isAuthority = Boolean(canForceReclaim(room) || (room && room.hostId === playerId))
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
        } else if (!room) {
          askForState()
          nextClient.publish(
            actionTopic(code),
            JSON.stringify({ type: 'hello', fromId: playerId } satisfies RoomAction),
          )
        } else {
          nextClient.publish(
            actionTopic(code),
            JSON.stringify({ type: 'hello', fromId: playerId } satisfies RoomAction),
          )
        }
      })
    })

    nextClient.on('message', (topic, payload) => {
      if (closed) return
      try {
        const raw = payload.toString()
        if (topic === stateTopic(code)) {
          if (!raw) return
          const incoming = JSON.parse(raw) as RoomState
          if (!(incoming && typeof incoming === 'object' && 'kind' in incoming)) return

          if (room && incoming.createdAt === room.createdAt) {
            if (canForceReclaim(incoming)) {
              const previous = room
              const preferIncoming =
                !previous ||
                Object.keys(incoming.players).length >= Object.keys(previous.players).length
              const snapshot = preferIncoming ? incoming : previous
              adoptIncoming(snapshot)
              isAuthority = true
              emitState(snapshot)
            } else if (!isAuthority) {
              adoptIncoming(incoming)
            } else if (incoming.hostId !== playerId) {
              adoptIncoming(incoming)
            }
          } else if (!room || incoming.createdAt >= room.createdAt) {
            if (!isAuthority || !room || canForceReclaim(incoming)) {
              adoptIncoming(incoming)
              if (canForceReclaim(incoming)) {
                isAuthority = true
                emitState(incoming)
              }
            }
          }
          return
        }
        if (topic === actionTopic(code) && raw) {
          const data = JSON.parse(raw) as RoomAction
          if (data && typeof data === 'object' && 'type' in data) {
            handleAction(data)
          }
        }
      } catch {
        // ignore malformed
      }
    })

    nextClient.on('error', failToNext)
    nextClient.on('close', () => {
      if (!closed && !mqttConnected) failToNext()
    })

    window.setTimeout(() => {
      if (!mqttConnected && client === nextClient) failToNext()
    }, 9000)
  }

  connectMqtt(BROKER_URLS[0]!)

  window.setTimeout(() => {
    if (!closed && !mqttConnected && room) {
      onStatus('local')
    }
  }, 2500)

  tickTimer = setInterval(() => {
    if (!isAuthority || !room || room.kind !== 'hot-potato') return
    const next = tickHotPotato(room)
    if (next.timer.status !== room.timer.status) {
      emitState(next)
    }
  }, 250)

  return {
    publishAction: (action: RoomAction) => {
      if (action.type === 'request-state') {
        handleAction(action)
        if (client && mqttConnected) {
          client.publish(actionTopic(code), JSON.stringify(action), { qos: 0 })
        }
        return
      }
      if (room && canForceReclaim(room) && !isAuthority) {
        isAuthority = true
      }
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
      }
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
        client?.end(true)
      } catch {
        // ignore
      }
    },
  }
}
