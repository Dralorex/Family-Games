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
  /** Browser/tab session currently holding this seat */
  sessionId?: string
}

export type EndVote = 'new-game' | 'change-names' | 'same-players' | 'leave'

export interface HostReturnRequest {
  playerId: string
  name: string
}

interface RoomBase {
  v: 1
  code: string
  title: string
  hostId: string
  /** Original creator's display name — used for ownership-return prompts */
  creatorName: string
  partyId: string
  createdAt: number
  players: Record<string, RoomPlayer>
  status: 'lobby' | 'playing' | 'finished' | 'closed'
  endVotes?: Record<string, EndVote>
  finishedAt?: number
  regrouping?: boolean
  pullTo?: { code: string; path: string }
  /** Former creator rejoined; current host can restore ownership */
  pendingHostReturn?: HostReturnRequest | null
}

export interface HotPotatoRoom extends RoomBase {
  kind: 'hot-potato'
  timer: TimerState
  aliveIds: string[]
  placements: { playerId: string; place: number }[]
}

export interface ScorecardRoom extends RoomBase {
  kind: 'scorecard'
  templateId: ScorecardTemplateId
  templateName: string
  currentRound: number
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
  | { type: 'rejoin'; name: string; playerId: string; sessionId: string }
  | { type: 'leave'; playerId: string; newHostId?: string }
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
  | { type: 'respond-host-return'; fromId: string; accept: boolean }
