import type { TimerState } from './types'

export function pickRandomDurationMs(minMs: number, maxMs: number): number {
  const lo = Math.min(minMs, maxMs)
  const hi = Math.max(minMs, maxMs)
  return Math.floor(lo + Math.random() * (hi - lo + 1))
}

export function startTimer(timer: TimerState, now = Date.now()): TimerState {
  let durationMs = timer.durationMs
  if (timer.mode === 'range') {
    durationMs = pickRandomDurationMs(timer.minMs, timer.maxMs)
  }
  return {
    ...timer,
    durationMs,
    status: 'running',
    startedAt: now,
    endsAt: now + durationMs,
  }
}

export function endTimer(timer: TimerState): TimerState {
  return { ...timer, status: 'ended', endsAt: timer.endsAt ?? Date.now() }
}

export function resetTimer(timer: TimerState): TimerState {
  return {
    ...timer,
    status: 'idle',
    endsAt: null,
    startedAt: null,
    durationMs: timer.mode === 'fixed' ? timer.durationMs : 0,
  }
}

export function remainingMs(timer: TimerState, now = Date.now()): number {
  if (timer.status !== 'running' || !timer.endsAt) return 0
  return Math.max(0, timer.endsAt - now)
}

export function isExpired(timer: TimerState, now = Date.now()): boolean {
  return timer.status === 'running' && timer.endsAt !== null && now >= timer.endsAt
}
