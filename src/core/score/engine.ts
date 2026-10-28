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

export function missingScorePlayerIds(
  players: Player[],
  scores: ScoreMap,
  round: number,
): string[] {
  return players.filter((p) => scores[p.id]?.[round] === undefined).map((p) => p.id)
}

export function allScoresEntered(players: Player[], scores: ScoreMap, round: number): boolean {
  return missingScorePlayerIds(players, scores, round).length === 0
}

/** Place is shown from round 2 onward (skip between round 1 and 2). */
export function shouldShowPlace(currentRound: number, scoresSubmittedForRound: number): boolean {
  // After round 2 scores exist / when viewing round >= 2
  return scoresSubmittedForRound >= 2 || currentRound > 2
}

export function shouldShowRunningTotals(completedRounds: number): boolean {
  // No totals interstitial between round 1 and 2
  return completedRounds >= 2
}

export function limitReached(
  players: Player[],
  scores: ScoreMap,
  pointLimit: number,
): boolean {
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
  const thirdPlace = standings.find((s) => s.place === 3)?.place ?? standings[standings.length - 1]!.place
  const cutoff = Math.min(3, thirdPlace)
  return standings.filter((s) => s.place <= cutoff)
}
