import {
  COLOR_GROUPS,
  LINE_INDEXES,
  LINE_RENTS,
  WORKS_INDEXES,
  isDeedSpace,
  spaceAt,
  type ColorGroup,
  type SpaceDef,
} from './board'
import type { DeedState, NeighborhoodGame, TrayId } from './gameTypes'
import { formatCash } from './money'

export const COLOR_GROUP_LABELS: Record<ColorGroup, string> = {
  pebble: 'Pebble',
  creek: 'Creek',
  garden: 'Garden',
  market: 'Market',
  harbor: 'Harbor',
  meadow: 'Meadow',
  forest: 'Forest',
  crown: 'Crown',
}

export type RentRow = {
  label: string
  amount: number
  current?: boolean
}

export function trayDisplayName(
  game: NeighborhoodGame,
  trayId: TrayId,
  names: Record<string, string>,
): string {
  const t = game.trays[trayId]
  if (!t) return 'Seat'
  if (t.memberIds.length === 1) return names[t.memberIds[0]!] ?? 'Player'
  return t.memberIds.map((id) => names[id] ?? '?').join(' & ')
}

export function buildingLabel(deed: DeedState): string {
  if (deed.hotel) return 'Hotel'
  if (deed.houses <= 0) return 'Vacant'
  return `${deed.houses} house${deed.houses === 1 ? '' : 's'}`
}

export function currentRentAmount(game: NeighborhoodGame, spaceIndex: number): number | null {
  const space = spaceAt(spaceIndex)
  const deed = game.deeds[spaceIndex]
  if (!deed || !deed.ownerTrayId || deed.mortgaged) return null
  if (space.kind === 'property') {
    if (deed.hotel) return space.rents[5]!
    if (deed.houses > 0) return space.rents[deed.houses]!
    const ownsSet = COLOR_GROUPS[space.group].every(
      (i) => game.deeds[i]?.ownerTrayId === deed.ownerTrayId && !game.deeds[i]?.mortgaged,
    )
    return ownsSet ? space.rents[1]! : space.rents[0]!
  }
  if (space.kind === 'line') {
    const count = LINE_INDEXES.filter((i) => game.deeds[i]?.ownerTrayId === deed.ownerTrayId).length
    return LINE_RENTS[Math.max(0, Math.min(3, count - 1))]!
  }
  if (space.kind === 'works') {
    const count = WORKS_INDEXES.filter((i) => game.deeds[i]?.ownerTrayId === deed.ownerTrayId).length
    // Nominal band for display; cash paid is dice × multiplier × $1,000
    return count >= 2 ? 100_000 : 40_000
  }
  return null
}

/** Rent ladder matching PropertyDef + engine: [base, set/1h, 2h, 3h, 4h, hotel]. */
export function propertyRentRows(
  space: Extract<SpaceDef, { kind: 'property' }>,
  deed: DeedState | undefined,
  ownsUnmortgagedSet: boolean,
): RentRow[] {
  const currentIdx =
    !deed || deed.mortgaged || !deed.ownerTrayId
      ? -1
      : deed.hotel
        ? 5
        : deed.houses > 0
          ? Math.min(5, deed.houses)
          : ownsUnmortgagedSet
            ? 1
            : 0
  const labels = ['Rent', 'Color set', '2 houses', '3 houses', '4 houses', 'Hotel']
  // Index 1 is both “color set” (0 houses) and 1-house rent in the engine.
  const adjusted = [...labels]
  adjusted[1] = 'Color set / 1 house'
  return adjusted.map((label, i) => ({
    label,
    amount: space.rents[i]!,
    current: currentIdx === i,
  }))
}

export function rentRowsForSpace(game: NeighborhoodGame, spaceIndex: number): RentRow[] {
  const space = spaceAt(spaceIndex)
  const deed = game.deeds[spaceIndex]
  if (space.kind === 'property') {
    const ownsSet = Boolean(
      deed?.ownerTrayId &&
        COLOR_GROUPS[space.group].every(
          (i) => game.deeds[i]?.ownerTrayId === deed.ownerTrayId && !game.deeds[i]?.mortgaged,
        ),
    )
    return propertyRentRows(space, deed, ownsSet)
  }
  if (space.kind === 'line') {
    const count = deed?.ownerTrayId
      ? LINE_INDEXES.filter((i) => game.deeds[i]?.ownerTrayId === deed.ownerTrayId).length
      : 0
    return LINE_RENTS.map((amount, i) => ({
      label: `${i + 1} line${i === 0 ? '' : 's'}`,
      amount,
      current: Boolean(deed && !deed.mortgaged && count === i + 1),
    }))
  }
  if (space.kind === 'works') {
    const count = deed?.ownerTrayId
      ? WORKS_INDEXES.filter((i) => game.deeds[i]?.ownerTrayId === deed.ownerTrayId).length
      : 0
    return [
      {
        label: '1 works · 4× dice × $1,000',
        amount: 40_000,
        current: Boolean(deed && !deed.mortgaged && count === 1),
      },
      {
        label: '2 works · 10× dice × $1,000',
        amount: 100_000,
        current: Boolean(deed && !deed.mortgaged && count === 2),
      },
    ]
  }
  return []
}

export function formatDeedPriceLine(space: SpaceDef): string {
  if (!isDeedSpace(space)) return ''
  return `Price ${formatCash(space.price)} · Mortgage ${formatCash(space.mortgage)}`
}

export function groupOwnershipLines(
  game: NeighborhoodGame,
  spaceIndex: number,
  names: Record<string, string>,
  myTrayId?: TrayId,
): { title: string; lines: string[] } | null {
  const space = spaceAt(spaceIndex)
  if (space.kind === 'property') {
    const idxs = COLOR_GROUPS[space.group]
    const lines = idxs.map((i) => {
      const s = spaceAt(i)
      const d = game.deeds[i]!
      const owner = d.ownerTrayId ? trayDisplayName(game, d.ownerTrayId, names) : 'Unowned'
      const mine = myTrayId && d.ownerTrayId === myTrayId ? ' (you)' : ''
      const build = d.hotel ? ' · hotel' : d.houses > 0 ? ` · ${d.houses}h` : ''
      const mort = d.mortgaged ? ' · mortgaged' : ''
      return `${s.name}: ${owner}${mine}${build}${mort}`
    })
    return { title: `${COLOR_GROUP_LABELS[space.group]} set`, lines }
  }
  if (space.kind === 'line') {
    const lines = LINE_INDEXES.map((i) => {
      const s = spaceAt(i)
      const d = game.deeds[i]!
      const owner = d.ownerTrayId ? trayDisplayName(game, d.ownerTrayId, names) : 'Unowned'
      const mine = myTrayId && d.ownerTrayId === myTrayId ? ' (you)' : ''
      return `${s.name}: ${owner}${mine}`
    })
    return { title: 'Lines', lines }
  }
  if (space.kind === 'works') {
    const lines = WORKS_INDEXES.map((i) => {
      const s = spaceAt(i)
      const d = game.deeds[i]!
      const owner = d.ownerTrayId ? trayDisplayName(game, d.ownerTrayId, names) : 'Unowned'
      const mine = myTrayId && d.ownerTrayId === myTrayId ? ' (you)' : ''
      return `${s.name}: ${owner}${mine}`
    })
    return { title: 'Works', lines }
  }
  return null
}
