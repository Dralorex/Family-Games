const NAMES_KEY = 'fg_recent_names'
const MAX_NAMES = 5

export function getRecentNames(): string[] {
  try {
    const raw = localStorage.getItem(NAMES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((n): n is string => typeof n === 'string' && n.trim().length > 0)
  } catch {
    return []
  }
}

export function rememberName(name: string): void {
  const cleaned = name.trim()
  if (!cleaned) return
  const next = [cleaned, ...getRecentNames().filter((n) => n.toLowerCase() !== cleaned.toLowerCase())].slice(
    0,
    MAX_NAMES,
  )
  localStorage.setItem(NAMES_KEY, JSON.stringify(next))
}

export function getLastTimerRange(): { minSec: number; maxSec: number } {
  try {
    const raw = localStorage.getItem('fg_timer_range')
    if (!raw) return { minSec: 30, maxSec: 90 }
    const parsed = JSON.parse(raw) as { minSec?: number; maxSec?: number }
    return {
      minSec: Number(parsed.minSec) || 30,
      maxSec: Number(parsed.maxSec) || 90,
    }
  } catch {
    return { minSec: 30, maxSec: 90 }
  }
}

export function saveTimerRange(minSec: number, maxSec: number): void {
  localStorage.setItem('fg_timer_range', JSON.stringify({ minSec, maxSec }))
}
