export type TimerMode = 'fixed' | 'range'
export type TimerStatus = 'idle' | 'running' | 'ended'

export interface TimerState {
  mode: TimerMode
  /** Used for fixed mode */
  durationMs: number
  /** Used for range mode */
  minMs: number
  maxMs: number
  status: TimerStatus
  /** Server/host authoritative end timestamp (ms since epoch) */
  endsAt: number | null
  startedAt: number | null
}

export function defaultRangeTimer(minSec = 30, maxSec = 90): TimerState {
  return {
    mode: 'range',
    durationMs: 0,
    minMs: minSec * 1000,
    maxMs: maxSec * 1000,
    status: 'idle',
    endsAt: null,
    startedAt: null,
  }
}
