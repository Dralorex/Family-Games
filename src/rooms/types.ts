import type { NeighborhoodGame } from '../core/neighborhood/gameTypes'
import type {
  NeighborhoodPieceId,
  NeighborhoodRules,
} from '../core/neighborhood/types'
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
  /** Host backgrounded / closed the app — used for auto handoff */
  hostAwayAt?: number | null
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

/**
 * Neighborhood under Games.
 * Slice A: lobby/rules. Slice B: board, dice, buy/rent, jail, wallets.
 */
export interface NeighborhoodRoom extends RoomBase {
  kind: 'neighborhood'
  rules: NeighborhoodRules
  /** Locked when the host starts — never change mid-room */
  rulesLocked: boolean
  /** playerId → chosen piece (unique across trays / solo seats) */
  pieces: Record<string, NeighborhoodPieceId>
  /**
   * Shared: tray id "1"…"8". Alliance: group "A"…. Off: omitted / unused.
   * playerId → team key
   */
  teamOf: Record<string, string>
  /** True once opening rolls / play state exists */
  boardReady: boolean
  /** Live board — set when the host starts */
  game: NeighborhoodGame | null
}

export type RoomState = HotPotatoRoom | ScorecardRoom | NeighborhoodRoom

export type RoomAction =
  | { type: 'hello'; fromId: string }
  /** Any peer with room state may republish so a reclaiming host can catch up */
  | { type: 'request-state'; fromId: string }
  | { type: 'join'; player: RoomPlayer; reclaimHost?: boolean }
  | { type: 'rejoin'; name: string; playerId: string; sessionId: string; reclaimHost?: boolean }
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
  | { type: 'host-away'; fromId: string }
  | { type: 'host-back'; fromId: string }
  /** Next-in-line takes over after host-away timeout or finished-with-host-away */
  | { type: 'claim-host'; fromId: string }
  /** Same Players: back to lobby, drop inactive seats, keep active names */
  | { type: 'restart-same-players'; fromId: string }
  | {
      type: 'set-neighborhood-piece'
      fromId: string
      pieceId: NeighborhoodPieceId
    }
  | { type: 'set-neighborhood-team'; fromId: string; teamId: string }
  | { type: 'start-neighborhood'; fromId: string }
  | { type: 'nb-opening-roll'; fromId: string }
  | { type: 'nb-roll'; fromId: string }
  | { type: 'nb-buy'; fromId: string }
  | { type: 'nb-decline-buy'; fromId: string }
  | { type: 'nb-tax'; fromId: string; choice: 'flat' | 'percent' }
  | { type: 'nb-ack-card'; fromId: string }
  | { type: 'nb-jail'; fromId: string; choice: 'pay' | 'card' | 'roll' }
  | { type: 'nb-auction-raise'; fromId: string }
  | { type: 'nb-auction-pass'; fromId: string }
  | { type: 'nb-debt-bankrupt'; fromId: string }
  | { type: 'nb-end-turn'; fromId: string }
