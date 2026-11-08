/** Neighborhood — original property-trading game (not a licensed title). */

export const NEIGHBORHOOD_PIECES = [
  'fox',
  'owl',
  'turtle',
  'kite',
  'sailboat',
  'lantern',
  'acorn',
  'moon',
] as const

export type NeighborhoodPieceId = (typeof NEIGHBORHOOD_PIECES)[number]

export const PIECE_LABELS: Record<NeighborhoodPieceId, string> = {
  fox: 'Fox',
  owl: 'Owl',
  turtle: 'Turtle',
  kite: 'Kite',
  sailboat: 'Sailboat',
  lantern: 'Lantern',
  acorn: 'Acorn',
  moon: 'Moon',
}

export type TeamStyle = 'off' | 'shared' | 'alliance'

export type AlliancePreset = '2v2v2v2' | '3v3' | '4v4'

export type BuildingSupply = 'standard' | 'scarce' | 'plentiful' | 'unlimited'

/** Last Alive = play until one tray remains. First Bankruptcy = end on first out, score equity. */
export type WinMode = 'last-alive' | 'first-bankruptcy'

export interface NeighborhoodRules {
  teamStyle: TeamStyle
  /** Required when teamStyle === 'alliance' */
  alliancePreset?: AlliancePreset
  noAuctions: boolean
  jackpot: boolean
  landHomeDouble: boolean
  startingDeeds: 0 | 1 | 2
  jailBlock: boolean
  buildingSupply: BuildingSupply
  /** Booklet fee — starts on */
  unmortgageTenPercent: boolean
  /** @deprecated prefer winMode; kept for older rooms */
  stopAtFirstBankruptcy: boolean
  /** Default last-alive */
  winMode: WinMode
  /** Disconnect grace before owner may Remove (ms) */
  disconnectGraceMs: number
}

export const STARTING_CASH = 1_500_000

export const DEFAULT_DISCONNECT_GRACE_MS = 5 * 60 * 1000

export function defaultNeighborhoodRules(
  partial?: Partial<NeighborhoodRules> & Pick<NeighborhoodRules, 'teamStyle'>,
): NeighborhoodRules {
  const teamStyle = partial?.teamStyle ?? 'off'
  return {
    teamStyle,
    alliancePreset:
      teamStyle === 'alliance'
        ? partial?.alliancePreset ?? '2v2v2v2'
        : undefined,
    noAuctions: partial?.noAuctions ?? false,
    jackpot: partial?.jackpot ?? false,
    landHomeDouble: partial?.landHomeDouble ?? false,
    startingDeeds: partial?.startingDeeds ?? 0,
    jailBlock: partial?.jailBlock ?? false,
    buildingSupply: partial?.buildingSupply ?? 'standard',
    unmortgageTenPercent: partial?.unmortgageTenPercent ?? true,
    winMode:
      partial?.winMode ??
      (partial?.stopAtFirstBankruptcy ? 'first-bankruptcy' : 'last-alive'),
    stopAtFirstBankruptcy:
      (partial?.winMode ??
        (partial?.stopAtFirstBankruptcy ? 'first-bankruptcy' : 'last-alive')) ===
      'first-bankruptcy',
    disconnectGraceMs: partial?.disconnectGraceMs ?? DEFAULT_DISCONNECT_GRACE_MS,
  }
}

export function endsOnFirstBankruptcy(rules: NeighborhoodRules): boolean {
  return rules.winMode === 'first-bankruptcy' || rules.stopAtFirstBankruptcy === true
}

export function maxPhonesForRules(rules: NeighborhoodRules): number {
  if (rules.teamStyle === 'off') return 8
  if (rules.teamStyle === 'shared') return 16
  switch (rules.alliancePreset) {
    case '3v3':
      return 6
    case '4v4':
    case '2v2v2v2':
    default:
      return 8
  }
}

export function allianceGroupCount(preset: AlliancePreset): number {
  switch (preset) {
    case '3v3':
      return 2
    case '4v4':
      return 2
    case '2v2v2v2':
      return 4
  }
}

export function allianceGroupSize(preset: AlliancePreset): number {
  switch (preset) {
    case '3v3':
      return 3
    case '4v4':
      return 4
    case '2v2v2v2':
      return 2
  }
}

/** Shared trays are labeled Tray 1…8 */
export const SHARED_TRAY_IDS = ['1', '2', '3', '4', '5', '6', '7', '8'] as const

export function allianceGroupIds(preset: AlliancePreset): string[] {
  const n = allianceGroupCount(preset)
  return Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i))
}
