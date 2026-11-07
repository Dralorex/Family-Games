import mqtt, { type MqttClient } from 'mqtt'
import type { RoomState } from './types'

const BROKER_URLS = [
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://test.mosquitto.org:8081',
]
const PREFIX = 'familygames/v1'

function stateTopic(code: string) {
  return `${PREFIX}/room/${code}/state`
}

function connectOnce(url: string): Promise<MqttClient> {
  return new Promise((resolve, reject) => {
    const client = mqtt.connect(url, {
      clientId: `fg_prb_${Math.random().toString(36).slice(2, 10)}`,
      clean: true,
      reconnectPeriod: 0,
      connectTimeout: 8000,
    })
    const fail = () => {
      try {
        client.end(true)
      } catch {
        // ignore
      }
      reject(new Error('room probe connect failed'))
    }
    client.on('connect', () => resolve(client))
    client.on('error', fail)
    window.setTimeout(fail, 9000)
  })
}

/** Read retained room state for a code (or null if missing/closed empty retain). */
export async function probeRoomState(code: string): Promise<RoomState | null> {
  const topic = stateTopic(code)
  let lastErr: unknown
  for (const url of BROKER_URLS) {
    try {
      const client = await connectOnce(url)
      try {
        return await new Promise<RoomState | null>((resolve, reject) => {
          let settled = false
          const done = (value: RoomState | null) => {
            if (settled) return
            settled = true
            window.clearTimeout(timer)
            resolve(value)
          }
          const timer = window.setTimeout(() => done(null), 4000)
          client.subscribe(topic, { qos: 0 }, (err) => {
            if (err) {
              reject(err)
              return
            }
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
              const data = JSON.parse(raw) as RoomState
              if (data && typeof data === 'object' && 'kind' in data) {
                done(data)
                return
              }
            } catch {
              // ignore
            }
            done(null)
          })
        })
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
  void lastErr
  return null
}

export function roomHasActivePlayers(room: RoomState): boolean {
  return Object.values(room.players).some((p) => !p.left)
}

/** Whether Home should offer a resume button for this room snapshot. */
export function shouldOfferResume(room: RoomState | null): boolean {
  if (!room) return false
  if (room.status === 'closed') return false
  if (room.status === 'finished' && !roomHasActivePlayers(room)) return false
  return true
}
