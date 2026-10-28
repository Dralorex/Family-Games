import type { EndMode, Player, ScoreMap, Standing, WinDirection } from './types'

export function playerTotal(scores: ScoreMap, playerId: string, throughRound?: number): number {
  const rounds = scores[playerId] ?? {}
  return Object.entries(rounds).reduce((sum, [round, value]) => {
    const r = Number(round)
    if (throughRound !== undefined && r > throughRound) return sum
    return sum + (Number.isFinite(value) ? value : 0)
  }, 0)
}

export function computeStandings(
  players: Player[],
  scores: ScoreMap,
  winDirection: WinDirection,
  throughRound?: number,
): Standing[] {
  const rows = players.map((p) => ({
    playerId: p.id,
    name: p.name,
    total: playerTotal(scores, p.id, throughRound),
  }))

  rows.sort((a, b) => {
    if (a.total === b.total) return a.name.localeCompare(b.name)
    return winDirection === 'low' ? a.total - b.total : b.total - a.total
  })

  const standings: Standing[] = []
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!
    let place = i + 1
    if (i > 0 && rows[i - 1]!.total === row.total) {
      place = standings[i - 1]!.place
    }
    standings.push({ ...row, place })
  }
  return standings
}

export function activePlayers<T extends { left?: boolean }>(players: T[]): T[] {
  return players.filter((p) => !p.left)
}

export function missingScorePlayerIds(
  players: { id: string; left?: boolean }[],
  scores: ScoreMap,
  round: number,
): string[] {
  return activePlayers(players)
    .filter((p) => scores[p.id]?.[round] === undefined)
    .map((p) => p.id)
}

export function allScoresEntered(
  players: { id: string; left?: boolean }[],
  scores: ScoreMap,
  round: number,
): boolean {
  return missingScorePlayerIds(players, scores, round).length === 0
}

/** Hero total shows as soon as round 1 has any scores / after R1. */
export function shouldShowHeroTotal(completedRounds: number, hasAnyScore: boolean): boolean {
  return completedRounds >= 1 || hasAnyScore
}

/** Place / 1st bubble once we have at least round 1 scores in. */
export function shouldShowPlace(completedRounds: number, hasRound1Scores: boolean): boolean {
  return completedRounds >= 1 || hasRound1Scores
}

/** Running sum rows in the transposed table after round 2. */
export function shouldShowRunningSums(completedRounds: number): boolean {
  return completedRounds >= 2
}

export function limitReached(players: Player[], scores: ScoreMap, pointLimit: number): boolean {
  return players.some((p) => playerTotal(scores, p.id) >= pointLimit)
}

export function shouldEndGame(opts: {
  endMode: EndMode
  currentRound: number
  totalRounds?: number
  pointLimit?: number
  players: Player[]
  scores: ScoreMap
  roundComplete: boolean
}): boolean {
  if (!opts.roundComplete) return false
  if (opts.endMode === 'rounds') {
    return Boolean(opts.totalRounds && opts.currentRound >= opts.totalRounds)
  }
  if (opts.endMode === 'limit' && opts.pointLimit !== undefined) {
    return limitReached(opts.players, opts.scores, opts.pointLimit)
  }
  return false
}

export function topThree(standings: Standing[]): Standing[] {
  if (standings.length === 0) return []
  const thirdPlace =
    standings.find((s) => s.place === 3)?.place ?? standings[standings.length - 1]!.place
  const cutoff = Math.min(3, thirdPlace)
  return standings.filter((s) => s.place <= cutoff)
}

/** Worst score for a round given win direction (used for leavers). */
export function worstScoreForRound(
  scores: ScoreMap,
  playerIds: string[],
  round: number,
  winDirection: WinDirection,
): number {
  const values = playerIds
    .map((id) => scores[id]?.[round])
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  if (values.length === 0) return 0
  return winDirection === 'low' ? Math.max(...values) : Math.min(...values)
}

export function lastPlacePlayerId(
  players: Player[],
  scores: ScoreMap,
  winDirection: WinDirection,
  throughRound?: number,
): string | null {
  const standings = computeStandings(players, scores, winDirection, throughRound)
  if (standings.length === 0) return null
  return standings[standings.length - 1]!.playerId
}

export function nameTaken(
  players: Record<string, { id?: string; name: string; left?: boolean }>,
  name: string,
  exceptId?: string,
): boolean {
  const needle = name.trim().toLowerCase()
  return Object.entries(players).some(([id, p]) => {
    const playerId = p.id ?? id
    return playerId !== exceptId && p.name.trim().toLowerCase() === needle
  })
}
