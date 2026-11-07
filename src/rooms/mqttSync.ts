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

const STATUS_RANK: Record<RoomState['status'], number> = {
  lobby: 0,
  playing: 1,
  finished: 2,
  closed: 3,
}

/** Prefer progressed game status so a stale retained lobby cannot overwrite playing. */
function pickRicherState(local: RoomState | null, incoming: RoomState): RoomState {
  if (!local) return incoming
  if (local.createdAt !== incoming.createdAt) {
    return incoming.createdAt >= local.createdAt ? incoming : local
  }
  const localRank = STATUS_RANK[local.status]
  const incomingRank = STATUS_RANK[incoming.status]
  if (incomingRank !== localRank) {
    return incomingRank > localRank ? incoming : local
  }
  const localPlayers = Object.keys(local.players).length
  const incomingPlayers = Object.keys(incoming.players).length
  if (incomingPlayers !== localPlayers) {
    return incomingPlayers > localPlayers ? incoming : local
  }
  // Same shape — keep local to avoid echo thrash
  return local
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

  let isAuthority = Boolean(canForceReclaim(room) || (room && room.hostId === playerId))

  let tickTimer: ReturnType<typeof setInterval> | null = null
  let closed = false
  let mqttConnected = false
  let client: MqttClient | null = null
  let brokerIndex = 0
  let requestedState = false
  /** Last payload we published — MQTT brokers echo publishes back to the publisher. */
  let lastPublishedPayload = ''
  /** Only announce reclaim once per connection (avoid emit→echo→emit loops). */
  let reclaimAnnounced = false
  let ownerPublishTimer: ReturnType<typeof setTimeout> | null = null
  let lastOwnerClaimJson = ''

  const channel =
    typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(`fg-room-${code}`) : null

  onStatus('connecting')

  const scheduleOwnerPublish = (state: RoomState) => {
    const claim =
      state.status === 'closed' ? null : claimFromRoom(state)
    const serialized = claim ? JSON.stringify(claim) : ''
    if (serialized === lastOwnerClaimJson) return
    lastOwnerClaimJson = serialized
    if (ownerPublishTimer) clearTimeout(ownerPublishTimer)
    ownerPublishTimer = setTimeout(() => {
      ownerPublishTimer = null
      if (claim) {
        void publishOwnerClaim(state.creatorName, claim).catch(() => {})
      } else {
        void publishOwnerClaim(state.creatorName, null).catch(() => {})
      }
    }, 400)
  }

  const publishMqttState = (state: RoomState) => {
    if (!client || !mqttConnected) return
    const payload = state.status === 'closed' ? '' : JSON.stringify(state)
    lastPublishedPayload = payload
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
      scheduleOwnerPublish(state)
    }
  }

  const adoptIncoming = (incoming: RoomState) => {
    room = incoming
    setCachedRoom(incoming)
    onState(incoming)

    if (incoming.hostId === playerId || canForceReclaim(incoming)) {
      isAuthority = true
    } else if (isAuthority && incoming.hostId !== playerId) {
      isAuthority = false
    }
  }

  /**
   * Handle remote/retained state without re-publishing our own echoes.
   * Reclaim only republishes once when we actually need to take the host seat.
   */
  const handleIncomingState = (incoming: RoomState, fromBroadcast: boolean) => {
    if (room && incoming.createdAt < room.createdAt) return

    const snapshot = pickRicherState(room, incoming)
    const sameAsLocal = room !== null && snapshot === room

    if (canForceReclaim(incoming) || canForceReclaim(snapshot)) {
      const needsHostTakeover = snapshot.hostId !== playerId
      isAuthority = true

      if (needsHostTakeover && !reclaimAnnounced) {
        reclaimAnnounced = true
        adoptIncoming(snapshot)
        emitState(snapshot)
        return
      }

      // Already host authority: adopt richer remote state locally, never re-emit echoes
      if (!sameAsLocal) {
        adoptIncoming(snapshot)
      }
      return
    }

    if (!isAuthority) {
      if (!sameAsLocal) adoptIncoming(snapshot)
      return
    }

    // Authority: only yield if another browser took the host seat
    if (snapshot.hostId !== playerId) {
      adoptIncoming(snapshot)
      return
    }

    // Ignore BroadcastChannel/MQTT echoes of our own authority state
    if (fromBroadcast || sameAsLocal) return
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
        handleIncomingState(data.state, true)
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
          // Ignore our own publish echoed by the broker (main spazzing cause)
          if (raw === lastPublishedPayload) return
          const incoming = JSON.parse(raw) as RoomState
          if (!(incoming && typeof incoming === 'object' && 'kind' in incoming)) return
          handleIncomingState(incoming, false)
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
      if (ownerPublishTimer) clearTimeout(ownerPublishTimer)
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
