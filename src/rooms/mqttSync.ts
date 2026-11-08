import mqtt, { type MqttClient } from 'mqtt'
import { claimFromRoom, publishOwnerClaim } from './ownerIndex'
import { getCachedRoom, setCachedRoom } from './roomCache'
import { applyAction, shouldAutoClaimHost, tickHotPotato } from './reducer'
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

function scorecardProgress(state: RoomState): number {
  if (state.kind === 'hot-potato') {
    return (
      STATUS_RANK[state.status] * 1_000_000 +
      state.placements.length * 100 +
      (50 - state.aliveIds.length)
    )
  }
  if (state.kind === 'neighborhood') {
    const game = state.game
    const eventId = game?.lastEventId ?? 0
    const turns = game?.turnsTaken ?? 0
    const trays = game ? Object.keys(game.trays).length : 0
    return STATUS_RANK[state.status] * 1_000_000 + turns * 10_000 + eventId * 10 + trays
  }
  let scoreCells = 0
  for (const roundMap of Object.values(state.scores)) {
    scoreCells += Object.keys(roundMap).length
  }
  return (
    STATUS_RANK[state.status] * 1_000_000 +
    state.completedRounds * 10_000 +
    state.currentRound * 100 +
    scoreCells
  )
}

/** Prefer progressed game so a stale retained lobby cannot overwrite playing / next round. */
function pickRicherState(local: RoomState | null, incoming: RoomState): RoomState {
  if (!local) return incoming
  if (local.createdAt !== incoming.createdAt) {
    return incoming.createdAt >= local.createdAt ? incoming : local
  }
  const localSeq = local.syncSeq ?? 0
  const incomingSeq = incoming.syncSeq ?? 0
  if (incomingSeq !== localSeq) {
    return incomingSeq > localSeq ? incoming : local
  }
  const localProg = scorecardProgress(local)
  const incomingProg = scorecardProgress(incoming)
  if (incomingProg !== localProg) {
    return incomingProg > localProg ? incoming : local
  }
  const localPlayers = Object.keys(local.players).length
  const incomingPlayers = Object.keys(incoming.players).length
  if (incomingPlayers !== localPlayers) {
    return incomingPlayers > localPlayers ? incoming : local
  }
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
  /** Prefer live getter so name entry does not reconnect MQTT */
  getClaimName?: () => string | null | undefined
  initialState?: RoomState
  onState: (state: RoomState) => void
  onStatus: (status: SyncStatus) => void
}): RoomSync {
  const { code, playerId, isCreator, initialState, onState, onStatus } = opts
  const readClaimName = () =>
    opts.getClaimName ? opts.getClaimName() ?? null : opts.claimName ?? null

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
    const claimName = readClaimName()
    if (claimName && !namesMatch(state.creatorName, claimName)) return false
    return true
  }

  let isAuthority = Boolean(canForceReclaim(room) || (room && room.hostId === playerId))

  let tickTimer: ReturnType<typeof setInterval> | null = null
  let retryTimer: ReturnType<typeof setInterval> | null = null
  let closed = false
  let mqttConnected = false
  let client: MqttClient | null = null
  let brokerIndex = 0
  let requestedState = false
  /** Actions published before the socket is up — flush on connect. */
  const pendingActions: RoomAction[] = []
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
    // qos 1 so next-round / score updates are less likely to vanish on public brokers
    client.publish(stateTopic(code), payload, { qos: 1, retain: true })
  }

  const emitState = (state: RoomState) => {
    const stamped: RoomState = {
      ...state,
      syncSeq: Math.max((room?.syncSeq ?? 0) + 1, (state.syncSeq ?? 0) + 1, Date.now()),
    }
    room = stamped
    setCachedRoom(stamped)
    onState(stamped)
    try {
      channel?.postMessage({ kind: 'state', state: stamped })
    } catch {
      // ignore
    }
    publishMqttState(stamped)
    if (isAuthority) {
      scheduleOwnerPublish(stamped)
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
   * Non-authority clients treat host publishes as source of truth (incl. next round).
   */
  const handleIncomingState = (incoming: RoomState, fromBroadcast: boolean) => {
    if (room && incoming.createdAt < room.createdAt) return

    // Peers must always take host updates — pickRicherState used to keep local when
    // status + player count matched, which skipped next-round / score syncs.
    if (!isAuthority && !canForceReclaim(incoming)) {
      if (room && (incoming.syncSeq ?? 0) < (room.syncSeq ?? 0)) return
      if (room && (incoming.syncSeq ?? 0) === (room.syncSeq ?? 0)) {
        const richer = pickRicherState(room, incoming)
        if (richer === room) return
        adoptIncoming(richer)
        return
      }
      adoptIncoming(incoming)
      return
    }

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

      if (!sameAsLocal) {
        adoptIncoming(snapshot)
      }
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

  const publishActionToBus = (action: RoomAction) => {
    try {
      channel?.postMessage({ kind: 'action', action })
    } catch {
      // ignore
    }
    if (client && mqttConnected) {
      client.publish(actionTopic(code), JSON.stringify(action), { qos: 0 })
      return
    }
    // Don't drop joins/hellos that fire before the socket is ready
    pendingActions.push(action)
  }

  const flushPendingActions = () => {
    if (!client || !mqttConnected || pendingActions.length === 0) return
    const queued = pendingActions.splice(0, pendingActions.length)
    for (const action of queued) {
      client.publish(actionTopic(code), JSON.stringify(action), { qos: 0 })
    }
  }

  const askForState = (force = false) => {
    if (room) return
    if (requestedState && !force) return
    requestedState = true
    const action: RoomAction = { type: 'request-state', fromId: playerId }
    publishActionToBus(action)
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
        flushPendingActions()
        if (isAuthority && room) {
          emitState(room)
        } else if (!room) {
          askForState(true)
          publishActionToBus({ type: 'hello', fromId: playerId })
        } else {
          publishActionToBus({ type: 'hello', fromId: playerId })
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

  // Keep poking the host until we actually have room state (covers lost early joins)
  retryTimer = setInterval(() => {
    if (closed || !mqttConnected) return
    if (!room) {
      askForState(true)
      publishActionToBus({ type: 'hello', fromId: playerId })
      return
    }
    if (shouldAutoClaimHost(room, playerId) && !isAuthority) {
      isAuthority = true
      handleAction({ type: 'claim-host', fromId: playerId })
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
        publishActionToBus(action)
        return
      }
      if (room && canForceReclaim(room) && !isAuthority) {
        isAuthority = true
      }
      // Next-in-line can take authority to claim-host after host-away
      if (
        room &&
        !isAuthority &&
        (action.type === 'claim-host' || action.type === 'host-away' || action.type === 'host-back') &&
        (action.type !== 'claim-host' || shouldAutoClaimHost(room, playerId))
      ) {
        if (action.type === 'claim-host' && shouldAutoClaimHost(room, playerId)) {
          isAuthority = true
        }
        // Host marking away/back must still apply even if we're the host authority
        if (action.type === 'host-away' || action.type === 'host-back') {
          if (room.hostId === playerId) isAuthority = true
        }
      }
      if (isAuthority && room) {
        handleAction(action)
        return
      }
      publishActionToBus(action)
    },
    publishState: emitState,
    close: () => {
      closed = true
      if (tickTimer) clearInterval(tickTimer)
      if (retryTimer) clearInterval(retryTimer)
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
