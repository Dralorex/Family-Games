const KEY = 'fg_updates_last_seen'

export function getLastSeenUpdate(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function setLastSeenUpdate(version: string): void {
  try {
    localStorage.setItem(KEY, version)
  } catch {
    // ignore quota / private mode
  }
}
