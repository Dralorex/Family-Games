import type { NeighborhoodGame, TrayId } from './gameTypes'

/** Assets locked in a frozen (sent) trade offer — cannot spend/use until resolved. */
export function reservedForTray(
  game: NeighborhoodGame,
  trayId: TrayId,
): { cash: number; deeds: Set<number>; jailFreeWild: number; jailFreeNeighbor: number } {
  const empty = {
    cash: 0,
    deeds: new Set<number>(),
    jailFreeWild: 0,
    jailFreeNeighbor: 0,
  }
  const p = game.prompt
  if (!p || p.type !== 'trade' || !p.frozen) return empty

  if (trayId === p.fromTrayId) {
    return {
      cash: p.offerCash,
      deeds: new Set(p.offerDeeds),
      jailFreeWild: p.offerJailFreeWild,
      jailFreeNeighbor: p.offerJailFreeNeighbor,
    }
  }
  if (trayId === p.toTrayId) {
    // Counterparty's asked items are reserved from them once the offer is frozen
    return {
      cash: p.askCash,
      deeds: new Set(p.askDeeds),
      jailFreeWild: p.askJailFreeWild,
      jailFreeNeighbor: p.askJailFreeNeighbor,
    }
  }
  return empty
}

export function availableCash(game: NeighborhoodGame, trayId: TrayId): number {
  const tray = game.trays[trayId]
  if (!tray) return 0
  return Math.max(0, tray.cash - reservedForTray(game, trayId).cash)
}

export function isDeedReserved(game: NeighborhoodGame, trayId: TrayId, spaceIndex: number): boolean {
  return reservedForTray(game, trayId).deeds.has(spaceIndex)
}
