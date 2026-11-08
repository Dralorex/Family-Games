import type { NeighborhoodPieceId } from './types'

export type TrayId = string

export interface TrayState {
  id: TrayId
  /** Phones that may tap for this tray (Shared = 1–2) */
  memberIds: string[]
  pieceId: NeighborhoodPieceId
  /** Alliance group when applicable */
  allianceId?: string
  cash: number
  position: number
  inJail: boolean
  jailTurns: number
  jailFreeWild: number
  jailFreeNeighbor: number
  bankrupt: boolean
  /** Spectating after bankrupt / leave */
  spectating: boolean
}

export interface DeedState {
  ownerTrayId: TrayId | null
  houses: number
  hotel: boolean
  mortgaged: boolean
}

export type NbPrompt =
  | { type: 'buy'; spaceIndex: number; price: number }
  | { type: 'tax'; spaceIndex: number; flat: number; percentAmount: number }
  | {
      type: 'jail'
      canUseCard: boolean
      mustPay: boolean
    }
  | {
      type: 'card'
      deck: 'wild' | 'neighbor'
      cardIndex: number
      text: string
    }
  | {
      type: 'auction'
      spaceIndex: number
      price: number
      highTrayId: TrayId | null
      turnTrayId: TrayId
      step: number
    }
  | {
      type: 'debt'
      amount: number
      toTrayId: TrayId | 'bank' | 'jackpot'
      reason: string
    }

export type NbPhase = 'opening' | 'playing' | 'finished'

export interface NeighborhoodGame {
  phase: NbPhase
  trays: Record<TrayId, TrayState>
  /** Clockwise tray order after opening */
  turnOrder: TrayId[]
  turnIndex: number
  /** Opening: trayId → best roll (null = not rolled / needs reroll) */
  openingRolls: Record<TrayId, number | null>
  openingNeeds: TrayId[]
  doublesCount: number
  lastDice: [number, number] | null
  /** Left jail with doubles this turn — no extra roll */
  usedJailDoubles: boolean
  prompt: NbPrompt | null
  deeds: Record<number, DeedState>
  jackpot: number
  wildDeck: number[]
  neighborDeck: number[]
  lastEventId: number
  /** Recent public log lines */
  log: string[]
  winnerTrayIds: TrayId[]
}

export function emptyDeed(): DeedState {
  return { ownerTrayId: null, houses: 0, hotel: false, mortgaged: false }
}
