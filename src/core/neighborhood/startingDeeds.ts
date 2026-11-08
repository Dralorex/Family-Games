import { BOARD, isDeedSpace, spaceAt } from './board'
import { emptyDeed, type NeighborhoodGame, type TrayId } from './gameTypes'
import { formatCash } from './money'
import { shuffleInPlace } from './rng'
import type { NeighborhoodRules } from './types'

/**
 * Deal `rules.startingDeeds` random bare deeds per tray at printed price.
 * Redraw if the tray cannot afford the price.
 */
export function dealStartingDeeds(
  game: NeighborhoodGame,
  rules: NeighborhoodRules,
  names: Record<string, string>,
): NeighborhoodGame {
  const count = rules.startingDeeds
  if (count <= 0) return game

  const pool = shuffleInPlace(
    BOARD.filter(isDeedSpace).map((s) => s.index),
  )
  let next = game
  const trays = Object.keys(next.trays) as TrayId[]
  const lines: string[] = []

  for (const trayId of trays) {
    let dealt = 0
    let attempts = 0
    while (dealt < count && pool.length > 0 && attempts < pool.length + 8) {
      attempts += 1
      const spaceIndex = pool.shift()!
      const space = spaceAt(spaceIndex)
      if (!isDeedSpace(space)) continue
      const tray = next.trays[trayId]!
      if (tray.cash < space.price) {
        // unaffordable — put back at end and try another
        pool.push(spaceIndex)
        continue
      }
      next = {
        ...next,
        trays: {
          ...next.trays,
          [trayId]: { ...tray, cash: tray.cash - space.price },
        },
        deeds: {
          ...next.deeds,
          [spaceIndex]: { ...emptyDeed(), ownerTrayId: trayId },
        },
      }
      dealt += 1
      const who =
        tray.memberIds.map((id) => names[id] ?? '?').join(' & ') || trayId
      lines.push(`${who} starts with ${space.name} (−${formatCash(space.price)}).`)
    }
  }

  if (lines.length === 0) return next
  return {
    ...next,
    log: [...lines.reverse(), ...next.log].slice(0, 40),
    lastEventId: next.lastEventId + 1,
  }
}
