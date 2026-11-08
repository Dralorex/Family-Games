import { bareDeedIndexes, deedCreditValue } from './economy'
import type { NeighborhoodGame, TrayId } from './gameTypes'

export interface CoverPlan {
  deeds: number[]
  cash: number
  total: number
  /** True when even giving everything is still short */
  stillShort: boolean
}

/**
 * Closest cover for a debt: minimize overshoot, then fewer deeds, then less cash.
 * Exact preferred. If estate < debt, return everything (stillShort).
 */
export function findClosestCover(
  game: NeighborhoodGame,
  trayId: TrayId,
  debt: number,
): CoverPlan {
  const tray = game.trays[trayId]!
  const cashHeld = tray.cash
  const deedIds = bareDeedIndexes(game, trayId)
  const values = deedIds.map((i) => ({ i, v: deedCreditValue(game.deeds[i]!, i) }))
  const allDeedValue = values.reduce((s, x) => s + x.v, 0)

  if (cashHeld + allDeedValue < debt) {
    return {
      deeds: deedIds,
      cash: cashHeld,
      total: cashHeld + allDeedValue,
      stillShort: true,
    }
  }

  let best: CoverPlan | null = null
  // Cap exhaustive search — beyond 16 bare deeds use greedy by largest-under-debt
  const n = Math.min(values.length, 16)
  const search = values.slice(0, n)
  const limit = 1 << n
  for (let mask = 0; mask < limit; mask++) {
    const deedVals = search
    const deeds: number[] = []
    let deedSum = 0
    for (let b = 0; b < n; b++) {
      if (mask & (1 << b)) {
        deeds.push(deedVals[b]!.i)
        deedSum += deedVals[b]!.v
      }
    }
    // cash from 0..held such that deedSum+cash >= debt; pick minimal cash that works
    const needCash = Math.max(0, debt - deedSum)
    if (needCash > cashHeld) continue
    const cash = needCash
    const total = deedSum + cash
    const overshoot = total - debt
    const candidate: CoverPlan = { deeds, cash, total, stillShort: false }
    if (
      !best ||
      overshoot < best.total - debt ||
      (overshoot === best.total - debt && deeds.length < best.deeds.length) ||
      (overshoot === best.total - debt &&
        deeds.length === best.deeds.length &&
        cash < best.cash)
    ) {
      best = candidate
    }
  }

  return (
    best ?? {
      deeds: deedIds,
      cash: cashHeld,
      total: cashHeld + allDeedValue,
      stillShort: true,
    }
  )
}
