const KEY = 'fg_neighborhood_mute'

export function getNeighborhoodMuted(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function setNeighborhoodMuted(muted: boolean): void {
  try {
    localStorage.setItem(KEY, muted ? '1' : '0')
  } catch {
    // ignore
  }
}
