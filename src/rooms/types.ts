import type { EndMode, ScoreMap, ScorecardTemplateId, WinDirection } from '../core/score/types'
import type { TimerState } from '../core/timer/types'

export interface RoomPlayer {
  id: string
  name: string
  joinedAt: number
  /** Soft-left; still on the card, auto-scored as worst each round */
  left?: boolean
  /** Device player id that enters scores for this seat (add-another-player) */
  controlledBy?: string
}

export type EndVote = 'new-game' | 'change-names' | 'same-players' | 'leave'

export interface HotPotatoRoom {
  v: 1
  kind: 'hot-potato'
  code: string
  title: string
  hostId: string
  partyId: string
  createdAt: number
  players: Record<string, RoomPlayer>
  status: 'lobby' | 'playing' | 'finished' | 'closed'
  timer: TimerState
  aliveIds: string[]
  placements: { playerId: string; place: number }[]
  endVotes?: Record<string, EndVote>
  finishedAt?: number
  /** Host is regrouping — clients should go home and stay in party */
  regrouping?: boolean
  /** Pull everyone into a new room */
  pullTo?: { code: string; path: string }
}

export interface ScorecardRoom {
  v: 1
  kind: 'scorecard'
  code: string
  title: string
  hostId: string
  partyId: string
  createdAt: number
  templateId: ScorecardTemplateId
  templateName: string
  players: Record<string, RoomPlayer>
  status: 'lobby' | 'playing' | 'finished' | 'closed'
  currentRound: number
  completedRounds: number
  scores: ScoreMap
  winDirection: WinDirection
  endMode: EndMode
  totalRounds?: number
  pointLimit?: number
  endVotes?: Record<string, EndVote>
  finishedAt?: number
  regrouping?: boolean
  pullTo?: { code: string; path: string }
}

export type RoomState = HotPotatoRoom | ScorecardRoom

export type RoomAction =
  | { type: 'hello'; fromId: string }
  | { type: 'join'; player: RoomPlayer }
  | { type: 'rejoin'; name: string; playerId: string }
  | { type: 'leave'; playerId: string }
  | { type: 'add-player'; fromId: string; player: RoomPlayer }
  | { type: 'set-timer-range'; minMs: number; maxMs: number; fromId: string }
  | { type: 'start-hot-potato'; fromId: string }
  | { type: 'explode'; fromId: string }
  | { type: 'restart-fuse'; fromId: string }
  | { type: 'set-score'; fromId: string; targetPlayerId: string; round: number; value: number }
  | { type: 'start-scorecard'; fromId: string }
  | { type: 'next-round'; fromId: string }
  | { type: 'set-point-limit'; fromId: string; pointLimit: number }
  | { type: 'set-title'; fromId: string; title: string }
  | { type: 'cast-end-vote'; fromId: string; vote: EndVote }
  | { type: 'host-new-game'; fromId: string }
  | { type: 'pull-party'; fromId: string; code: string; path: string }
  | { type: 'close-room'; fromId: string }
