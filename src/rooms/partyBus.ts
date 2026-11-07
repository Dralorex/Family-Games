import mqtt, { type MqttClient } from 'mqtt'

const BROKER_URLS = [
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://test.mosquitto.org:8081',
]
const PREFIX = 'familygames/v1'

export interface PartyInvite {
  v: 1
  partyId: string
  code: string
  path: string
  /** New game after an ended lobby → players should see Join Game */
  prompt: 'join'
  title?: string
  updatedAt: number
}

export function partyTopic(partyId: string): string {
  const safe = partyId.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 48) || 'party'
  return `${PREFIX}/party/${safe}`
}

function connectOnce(url: string): Promise<MqttClient> {
  return new Promise((resolve, reject) => {
    const client = mqtt.connect(url, {
      clientId: `fg_pty_${Math.random().toString(36).slice(2, 10)}`,
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
      reject(new Error('party bus connect failed'))
    }
    client.on('connect', () => resolve(client))
    client.on('error', fail)
    window.setTimeout(fail, 9000)
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
  throw lastErr instanceof Error ? lastErr : new Error('Could not reach party sync')
}

export async function publishPartyInvite(invite: PartyInvite): Promise<void> {
  const topic = partyTopic(invite.partyId)
  await withBroker(
    (client) =>
      new Promise<void>((resolve, reject) => {
        client.publish(topic, JSON.stringify(invite), { qos: 1, retain: true }, (err) =>
          err ? reject(err) : resolve(),
        )
      }),
  )
}

export async function clearPartyInvite(partyId: string): Promise<void> {
  const topic = partyTopic(partyId)
  await withBroker(
    (client) =>
      new Promise<void>((resolve, reject) => {
        client.publish(topic, '', { qos: 1, retain: true }, (err) =>
          err ? reject(err) : resolve(),
        )
      }),
  )
}

/** One-shot read of retained party invite (or null). */
export async function lookupPartyInvite(partyId: string): Promise<PartyInvite | null> {
  const topic = partyTopic(partyId)
  return withBroker(
    (client) =>
      new Promise<PartyInvite | null>((resolve, reject) => {
        let settled = false
        const done = (value: PartyInvite | null) => {
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
            const data = JSON.parse(raw) as PartyInvite
            if (data?.v === 1 && data.code && data.path) {
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

/** Live listener for party invites (used on Home while waiting to join). */
export function subscribePartyInvite(
  partyId: string,
  onInvite: (invite: PartyInvite | null) => void,
): () => void {
  let closed = false
  let client: MqttClient | null = null
  let brokerIndex = 0
  const topic = partyTopic(partyId)

  const connect = (url: string) => {
    if (closed) return
    const next = mqtt.connect(url, {
      clientId: `fg_pl_${Math.random().toString(36).slice(2, 10)}`,
      clean: true,
      reconnectPeriod: 0,
      connectTimeout: 8000,
    })
    client = next
    const fail = () => {
      if (closed) return
      try {
        next.end(true)
      } catch {
        // ignore
      }
      brokerIndex += 1
      if (brokerIndex < BROKER_URLS.length) connect(BROKER_URLS[brokerIndex]!)
    }
    next.on('connect', () => {
      next.subscribe(topic, { qos: 1 }, (err) => {
        if (err) fail()
      })
    })
    next.on('message', (t, payload) => {
      if (t !== topic || closed) return
      const raw = payload.toString()
      if (!raw) {
        onInvite(null)
        return
      }
      try {
        const data = JSON.parse(raw) as PartyInvite
        if (data?.v === 1 && data.code && data.path) onInvite(data)
      } catch {
        // ignore
      }
    })
    next.on('error', fail)
    next.on('close', () => {
      if (!closed) fail()
    })
  }

  connect(BROKER_URLS[0]!)
  return () => {
    closed = true
    try {
      client?.end(true)
    } catch {
      // ignore
    }
  }
}
