import {
  BOARD,
  COLOR_GROUPS,
  isDeedSpace,
  spaceAt,
  type ColorGroup,
  type PropertyDef,
} from './board'
import type { DeedState, NeighborhoodGame, TrayId } from './gameTypes'
import { ceilToThousand } from './money'
import type { NeighborhoodRules } from './types'

export function colorOfSpace(index: number): ColorGroup | null {
  const s = spaceAt(index)
  return s.kind === 'property' ? s.group : null
}

export function groupIndexes(group: ColorGroup): number[] {
  return COLOR_GROUPS[group]
}

export function colorIsBare(game: NeighborhoodGame, group: ColorGroup): boolean {
  return groupIndexes(group).every((i) => {
    const d = game.deeds[i]
    return d && !d.hotel && d.houses === 0
  })
}

export function ownsEntireColor(
  game: NeighborhoodGame,
  trayId: TrayId,
  group: ColorGroup,
): boolean {
  return groupIndexes(group).every((i) => game.deeds[i]?.ownerTrayId === trayId)
}

export function anyMortgagedInColor(
  game: NeighborhoodGame,
  group: ColorGroup,
): boolean {
  return groupIndexes(group).some((i) => game.deeds[i]?.mortgaged)
}

export function houseCountOnColor(game: NeighborhoodGame, group: ColorGroup): number[] {
  return groupIndexes(group).map((i) => {
    const d = game.deeds[i]!
    if (d.hotel) return 5
    return d.houses
  })
}

/** Even-build: can add one house/hotel step on this lot. */
export function canBuildOn(
  game: NeighborhoodGame,
  trayId: TrayId,
  spaceIndex: number,
  rules: NeighborhoodRules,
): boolean {
  const space = spaceAt(spaceIndex)
  if (space.kind !== 'property') return false
  if (!ownsEntireColor(game, trayId, space.group)) return false
  if (anyMortgagedInColor(game, space.group)) return false
  const deed = game.deeds[spaceIndex]!
  if (deed.ownerTrayId !== trayId || deed.mortgaged) return false
  if (deed.hotel) return false

  const counts = houseCountOnColor(game, space.group)
  const mine = deed.hotel ? 5 : deed.houses
  const min = Math.min(...counts)
  if (mine > min) return false // uneven
  if (mine >= 5) return false

  const supply = buildingSupplyLeft(game, rules)
  if (mine === 4) {
    // hotel: need hotel available (or unlimited)
    if (supply.hotels !== null && supply.hotels <= 0) return false
  } else if (supply.houses !== null && supply.houses <= 0) {
    return false
  }

  const cost = space.houseCost
  return (game.trays[trayId]?.cash ?? 0) >= cost
}

export function canSellBuilding(
  game: NeighborhoodGame,
  trayId: TrayId,
  spaceIndex: number,
): boolean {
  const space = spaceAt(spaceIndex)
  if (space.kind !== 'property') return false
  const deed = game.deeds[spaceIndex]!
  if (deed.ownerTrayId !== trayId) return false
  if (!deed.hotel && deed.houses <= 0) return false
  const counts = houseCountOnColor(game, space.group)
  const mine = deed.hotel ? 5 : deed.houses
  const max = Math.max(...counts)
  return mine >= max // sell from highest first (even reverse)
}

export function buildingSupplyLeft(
  game: NeighborhoodGame,
  rules: NeighborhoodRules,
): { houses: number | null; hotels: number | null } {
  if (rules.buildingSupply === 'unlimited') return { houses: null, hotels: null }
  let capH = 32
  let capHot = 12
  if (rules.buildingSupply === 'scarce') {
    capH = 16
    capHot = 6
  } else if (rules.buildingSupply === 'plentiful') {
    capH = 48
    capHot = 18
  }
  let usedH = 0
  let usedHot = 0
  for (const d of Object.values(game.deeds)) {
    if (d.hotel) usedHot += 1
    else usedH += d.houses
  }
  return { houses: capH - usedH, hotels: capHot - usedHot }
}

export function mortgageValue(spaceIndex: number): number {
  const s = spaceAt(spaceIndex)
  if (!isDeedSpace(s)) return 0
  return s.mortgage
}

export function printedPrice(spaceIndex: number): number {
  const s = spaceAt(spaceIndex)
  if (!isDeedSpace(s)) return 0
  return s.price
}

export function unmortgageCost(spaceIndex: number, rules: NeighborhoodRules): number {
  const m = mortgageValue(spaceIndex)
  if (!rules.unmortgageTenPercent) return m
  return m + ceilToThousand(m * 0.1)
}

export function canMortgage(
  game: NeighborhoodGame,
  trayId: TrayId,
  spaceIndex: number,
): boolean {
  const group = colorOfSpace(spaceIndex)
  if (group && !colorIsBare(game, group)) return false
  const deed = game.deeds[spaceIndex]
  return Boolean(deed && deed.ownerTrayId === trayId && !deed.mortgaged)
}

export function canUnmortgage(
  game: NeighborhoodGame,
  trayId: TrayId,
  spaceIndex: number,
  rules: NeighborhoodRules,
): boolean {
  const deed = game.deeds[spaceIndex]
  if (!deed || deed.ownerTrayId !== trayId || !deed.mortgaged) return false
  return (game.trays[trayId]?.cash ?? 0) >= unmortgageCost(spaceIndex, rules)
}

export function deedCreditValue(deed: DeedState, spaceIndex: number): number {
  if (!deed.ownerTrayId) return 0
  if (deed.mortgaged) return mortgageValue(spaceIndex)
  return printedPrice(spaceIndex)
}

/** Properties owned by tray that are bare (tradeable / debt-selectable). */
export function bareDeedIndexes(game: NeighborhoodGame, trayId: TrayId): number[] {
  return Object.entries(game.deeds)
    .filter(([, d]) => d.ownerTrayId === trayId)
    .map(([i]) => Number(i))
    .filter((i) => {
      const g = colorOfSpace(i)
      if (!g) return true // line/works always "bare" of houses
      return colorIsBare(game, g)
    })
}

export function propertyHouseCost(spaceIndex: number): number {
  const s = spaceAt(spaceIndex)
  return s.kind === 'property' ? s.houseCost : 0
}

export function applyBuild(
  game: NeighborhoodGame,
  trayId: TrayId,
  spaceIndex: number,
  rules: NeighborhoodRules,
): NeighborhoodGame | null {
  if (!canBuildOn(game, trayId, spaceIndex, rules)) return null
  const space = spaceAt(spaceIndex) as PropertyDef
  const deed = game.deeds[spaceIndex]!
  const tray = game.trays[trayId]!
  const cost = space.houseCost
  let houses = deed.houses
  let hotel = deed.hotel
  if (houses >= 4) {
    houses = 0
    hotel = true
  } else {
    houses += 1
  }
  return {
    ...game,
    trays: {
      ...game.trays,
      [trayId]: { ...tray, cash: tray.cash - cost },
    },
    deeds: {
      ...game.deeds,
      [spaceIndex]: { ...deed, houses, hotel },
    },
  }
}

export function applySellBuilding(
  game: NeighborhoodGame,
  trayId: TrayId,
  spaceIndex: number,
): NeighborhoodGame | null {
  if (!canSellBuilding(game, trayId, spaceIndex)) return null
  const space = spaceAt(spaceIndex) as PropertyDef
  const deed = game.deeds[spaceIndex]!
  const tray = game.trays[trayId]!
  const refund = Math.floor(space.houseCost / 2)
  let houses = deed.houses
  let hotel = deed.hotel
  if (hotel) {
    hotel = false
    houses = 4
  } else {
    houses -= 1
  }
  return {
    ...game,
    trays: {
      ...game.trays,
      [trayId]: { ...tray, cash: tray.cash + refund },
    },
    deeds: {
      ...game.deeds,
      [spaceIndex]: { ...deed, houses, hotel },
    },
  }
}

export function applyMortgage(
  game: NeighborhoodGame,
  trayId: TrayId,
  spaceIndex: number,
): NeighborhoodGame | null {
  if (!canMortgage(game, trayId, spaceIndex)) return null
  const deed = game.deeds[spaceIndex]!
  const tray = game.trays[trayId]!
  const gain = mortgageValue(spaceIndex)
  return {
    ...game,
    trays: {
      ...game.trays,
      [trayId]: { ...tray, cash: tray.cash + gain },
    },
    deeds: {
      ...game.deeds,
      [spaceIndex]: { ...deed, mortgaged: true },
    },
  }
}

export function applyUnmortgage(
  game: NeighborhoodGame,
  trayId: TrayId,
  spaceIndex: number,
  rules: NeighborhoodRules,
): NeighborhoodGame | null {
  if (!canUnmortgage(game, trayId, spaceIndex, rules)) return null
  const deed = game.deeds[spaceIndex]!
  const tray = game.trays[trayId]!
  const cost = unmortgageCost(spaceIndex, rules)
  return {
    ...game,
    trays: {
      ...game.trays,
      [trayId]: { ...tray, cash: tray.cash - cost },
    },
    deeds: {
      ...game.deeds,
      [spaceIndex]: { ...deed, mortgaged: false },
    },
  }
}

/** Sell all buildings on a color at half (for leave / debt prep). */
export function sellAllBuildingsOnColor(
  game: NeighborhoodGame,
  trayId: TrayId,
  group: ColorGroup,
): NeighborhoodGame {
  let next = game
  // Keep selling highest until bare
  let guard = 0
  while (guard++ < 40) {
    const idxs = groupIndexes(group).filter((i) => {
      const d = next.deeds[i]!
      return d.ownerTrayId === trayId && (d.hotel || d.houses > 0)
    })
    if (idxs.length === 0) break
    const counts = idxs.map((i) => {
      const d = next.deeds[i]!
      return { i, n: d.hotel ? 5 : d.houses }
    })
    counts.sort((a, b) => b.n - a.n)
    const target = counts[0]!.i
    const sold = applySellBuilding(next, trayId, target)
    if (!sold) break
    next = sold
  }
  return next
}

export function sellAllBuildingsForTray(
  game: NeighborhoodGame,
  trayId: TrayId,
): NeighborhoodGame {
  let next = game
  for (const group of Object.keys(COLOR_GROUPS) as ColorGroup[]) {
    if (ownsEntireColor(next, trayId, group) || groupIndexes(group).some((i) => next.deeds[i]?.ownerTrayId === trayId)) {
      next = sellAllBuildingsOnColor(next, trayId, group)
    }
  }
  // Also sell orphans
  for (const [idx, d] of Object.entries(next.deeds)) {
    if (d.ownerTrayId !== trayId) continue
    while (d.hotel || d.houses > 0) {
      const sold = applySellBuilding(next, trayId, Number(idx))
      if (!sold) break
      next = sold
      d.hotel = next.deeds[Number(idx)]!.hotel
      d.houses = next.deeds[Number(idx)]!.houses
    }
  }
  return next
}

void BOARD
