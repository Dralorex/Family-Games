import mqtt, { type MqttClient } from 'mqtt'
import type { RoomState } from './types'

const BROKER_URLS = [
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://test.mosquitto.org:8081',
]
const PREFIX = 'familygames/v1'

export interface OwnerClaim {
  v: 1
  code: string
  creatorName: string
  title: string
  kind: RoomState['kind']
  status: RoomState['status']
  updatedAt: number
}

export function normalizeOwnerKey(name: string): string {
  return name.trim().toLowerCase()
}

export function ownerTopic(name: string): string {
  const key = normalizeOwnerKey(name)
  // MQTT topic-safe: letters, numbers, dash, underscore
  const safe = key.replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'player'
  return `${PREFIX}/owner/${safe}`
}

export function claimFromRoom(room: RoomState): OwnerClaim {
  return {
    v: 1,
    code: room.code,
    creatorName: room.creatorName,
    title: room.title,
    kind: room.kind,
    status: room.status,
    updatedAt: Date.now(),
  }
}

function connectOnce(url: string): Promise<MqttClient> {
  return new Promise((resolve, reject) => {
    const client = mqtt.connect(url, {
      clientId: `fg_own_${Math.random().toString(36).slice(2, 10)}`,
      clean: true,
      reconnectPeriod: 0,
      connectTimeout: 8000,
    })
    const fail = (err?: Error) => {
      try {
        client.end(true)
      } catch {
        // ignore
      }
      reject(err ?? new Error('owner index connect failed'))
    }
    client.on('connect', () => resolve(client))
    client.on('error', () => fail())
    window.setTimeout(() => fail(new Error('timeout')), 9000)
  })
}

async function withBroker<T>(fn: (client: MqttClient) => Promise<T>): Promise<T> {
  let lastErr: unknown
  for (const url of BROKER_URLS) {
    try {
      const client = await connectOnce(url)
      try {
        return await fn(client)
      } finally {
        try {
          client.end(true)
        } catch {
          // ignore
        }
      }
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Could not reach game sync')
}

/** Publish (or clear) the retained owner → code mapping. */
export async function publishOwnerClaim(
  creatorName: string,
  claim: OwnerClaim | null,
): Promise<void> {
  const topic = ownerTopic(creatorName)
  await withBroker(
    (client) =>
      new Promise<void>((resolve, reject) => {
        client.publish(
          topic,
          claim ? JSON.stringify(claim) : '',
          { qos: 1, retain: true },
          (err) => (err ? reject(err) : resolve()),
        )
      }),
  )
}

/** Look up the active room code owned by this display name. */
export async function lookupOwnerClaim(name: string): Promise<OwnerClaim | null> {
  const topic = ownerTopic(name)
  return withBroker(
    (client) =>
      new Promise<OwnerClaim | null>((resolve, reject) => {
        let settled = false
        const done = (value: OwnerClaim | null) => {
          if (settled) return
          settled = true
          window.clearTimeout(timer)
          resolve(value)
        }
        const timer = window.setTimeout(() => done(null), 4000)
        client.subscribe(topic, { qos: 1 }, (err) => {
          if (err) {
            reject(err)
            return
          }
          // If nothing retained, settle null after a short wait
          window.setTimeout(() => done(null), 1500)
        })
        client.on('message', (t, payload) => {
          if (t !== topic) return
          const raw = payload.toString()
          if (!raw) {
            done(null)
            return
          }
          try {
            const data = JSON.parse(raw) as OwnerClaim
            if (data?.v === 1 && data.code && data.creatorName) {
              if (normalizeOwnerKey(data.creatorName) !== normalizeOwnerKey(name)) {
                done(null)
                return
              }
              if (data.status === 'closed') {
                done(null)
                return
              }
              done(data)
              return
            }
          } catch {
            // ignore
          }
          done(null)
        })
      }),
  )
}
