const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generateCode(length = 5): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  let out = ''
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i]! % ALPHABET.length]
  }
  return out
}

export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function createPlayerId(): string {
  const existing = localStorage.getItem('fg_player_id')
  if (existing) return existing
  const id = crypto.randomUUID()
  localStorage.setItem('fg_player_id', id)
  return id
}

/**
 * Per-device session for a room. Stored in localStorage so leaving the
 * browser or app does not look like a different phone and drop the seat.
 */
export function createSessionId(code: string): string {
  const key = `fg_sess_${code}`
  const fromLocal = localStorage.getItem(key)
  if (fromLocal) return fromLocal
  const fromSession = sessionStorage.getItem(key)
  if (fromSession) {
    localStorage.setItem(key, fromSession)
    return fromSession
  }
  const id = crypto.randomUUID()
  localStorage.setItem(key, id)
  return id
}
