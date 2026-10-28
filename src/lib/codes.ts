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

/** Per-tab session for a room — used to kick the previous browser on same-name claim. */
export function createSessionId(code: string): string {
  const key = `fg_sess_${code}`
  const existing = sessionStorage.getItem(key)
  if (existing) return existing
  const id = crypto.randomUUID()
  sessionStorage.setItem(key, id)
  return id
}
