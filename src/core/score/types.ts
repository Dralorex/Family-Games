export type WinDirection = 'high' | 'low'
export type EndMode = 'rounds' | 'limit'

export type ScorecardTemplateId =
  | 'play-9'
  | 'uno-golf'
  | 'five-crowns'
  | 'tapped-4'
  | 'flip-7'

export interface ScorecardTemplate {
  id: ScorecardTemplateId
  name: string
  blurb: string
  winDirection: WinDirection
  endMode: EndMode
  totalRounds?: number
  defaultPointLimit?: number
}

export interface Player {
  id: string
  name: string
  joinedAt: number
}

/** playerId -> roundNumber (1-based) -> score */
export type ScoreMap = Record<string, Record<number, number>>

export interface Standing {
  playerId: string
  name: string
  total: number
  place: number
}
