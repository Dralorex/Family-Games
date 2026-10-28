import type { EndMode, ScoreMap, ScorecardTemplateId, WinDirection } from '../core/score/types'
import type { TimerState } from '../core/timer/types'

export interface RoomPlayer {
  id: string
  name: string
  joinedAt: number
}

export interface HotPotatoRoom {
  v: 1
  kind: 'hot-potato'
  code: string
  hostId: string
  createdAt: number
  players: Record<string, RoomPlayer>
  status: 'lobby' | 'playing' | 'finished'
  timer: TimerState
  /** Players still in the game, order irrelevant */
  aliveIds: string[]
  /** Elimination placements: first eliminated = last place */
  placements: { playerId: string; place: number }[]
}

export interface ScorecardRoom {
  v: 1
  kind: 'scorecard'
  code: string
  hostId: string
  createdAt: number
  templateId: ScorecardTemplateId
  templateName: string
  players: Record<string, RoomPlayer>
  status: 'lobby' | 'playing' | 'finished'
  currentRound: number
  /** Highest round that has been fully completed (all scores in + advanced or ended) */
  completedRounds: number
  scores: ScoreMap
  winDirection: WinDirection
  endMode: EndMode
  totalRounds?: number
  pointLimit?: number
}

export type RoomState = HotPotatoRoom | ScorecardRoom

export type RoomAction =
  | { type: 'hello'; fromId: string }
  | { type: 'join'; player: RoomPlayer }
  | { type: 'leave'; playerId: string }
  | { type: 'set-timer-range'; minMs: number; maxMs: number; fromId: string }
  | { type: 'start-hot-potato'; fromId: string }
  | { type: 'explode'; fromId: string }
  | { type: 'restart-fuse'; fromId: string }
  | { type: 'set-score'; fromId: string; round: number; value: number }
  | { type: 'start-scorecard'; fromId: string }
  | { type: 'next-round'; fromId: string }
  | { type: 'set-point-limit'; fromId: string; pointLimit: number }
