/** 40-space Neighborhood board (indexes 0–39). Original names only. */

export type ColorGroup =
  | 'pebble'
  | 'creek'
  | 'garden'
  | 'market'
  | 'harbor'
  | 'meadow'
  | 'forest'
  | 'crown'

export type SpaceKind =
  | 'home'
  | 'property'
  | 'line'
  | 'works'
  | 'tax'
  | 'neighbor'
  | 'wild'
  | 'jail'
  | 'town-square'
  | 'goto-jail'
  | 'fee'

export interface PropertyDef {
  kind: 'property'
  index: number
  name: string
  group: ColorGroup
  price: number
  houseCost: number
  mortgage: number
  /** base, set, 1h, 2h, 3h, 4h, hotel */
  rents: [number, number, number, number, number, number]
}

export interface LineDef {
  kind: 'line'
  index: number
  name: string
  price: number
  mortgage: number
}

export interface WorksDef {
  kind: 'works'
  index: number
  name: string
  price: number
  mortgage: number
}

export interface SimpleSpace {
  kind: Exclude<SpaceKind, 'property' | 'line' | 'works'>
  index: number
  name: string
  amount?: number
}

export type SpaceDef = PropertyDef | LineDef | WorksDef | SimpleSpace

const LINE_PRICE = 200_000
const LINE_MORT = 100_000
const WORKS_PRICE = 150_000
const WORKS_MORT = 75_000

export const LINE_RENTS = [25_000, 50_000, 100_000, 200_000] as const

export const BOARD: SpaceDef[] = [
  { kind: 'home', index: 0, name: 'Home' },
  {
    kind: 'property',
    index: 1,
    name: 'Pebble Lane',
    group: 'pebble',
    price: 60_000,
    houseCost: 50_000,
    mortgage: 30_000,
    rents: [2_000, 10_000, 30_000, 90_000, 160_000, 250_000],
  },
  { kind: 'neighbor', index: 2, name: 'Neighbor Notes' },
  {
    kind: 'property',
    index: 3,
    name: 'Sandy Lane',
    group: 'pebble',
    price: 60_000,
    houseCost: 50_000,
    mortgage: 30_000,
    rents: [4_000, 20_000, 60_000, 180_000, 320_000, 450_000],
  },
  { kind: 'tax', index: 4, name: 'Town Tax' },
  { kind: 'line', index: 5, name: 'North Line', price: LINE_PRICE, mortgage: LINE_MORT },
  {
    kind: 'property',
    index: 6,
    name: 'Brook Street',
    group: 'creek',
    price: 100_000,
    houseCost: 50_000,
    mortgage: 50_000,
    rents: [6_000, 30_000, 90_000, 270_000, 400_000, 550_000],
  },
  { kind: 'wild', index: 7, name: 'Wild Card' },
  {
    kind: 'property',
    index: 8,
    name: 'Mill Street',
    group: 'creek',
    price: 100_000,
    houseCost: 50_000,
    mortgage: 50_000,
    rents: [6_000, 30_000, 90_000, 270_000, 400_000, 550_000],
  },
  {
    kind: 'property',
    index: 9,
    name: 'Pond Street',
    group: 'creek',
    price: 120_000,
    houseCost: 50_000,
    mortgage: 60_000,
    rents: [8_000, 40_000, 100_000, 300_000, 450_000, 600_000],
  },
  { kind: 'jail', index: 10, name: 'Jail' },
  {
    kind: 'property',
    index: 11,
    name: 'Rose Court',
    group: 'garden',
    price: 140_000,
    houseCost: 100_000,
    mortgage: 70_000,
    rents: [10_000, 50_000, 150_000, 450_000, 625_000, 750_000],
  },
  { kind: 'works', index: 12, name: 'Lampworks', price: WORKS_PRICE, mortgage: WORKS_MORT },
  {
    kind: 'property',
    index: 13,
    name: 'Ivy Court',
    group: 'garden',
    price: 140_000,
    houseCost: 100_000,
    mortgage: 70_000,
    rents: [10_000, 50_000, 150_000, 450_000, 625_000, 750_000],
  },
  {
    kind: 'property',
    index: 14,
    name: 'Clover Court',
    group: 'garden',
    price: 160_000,
    houseCost: 100_000,
    mortgage: 80_000,
    rents: [12_000, 60_000, 180_000, 500_000, 700_000, 900_000],
  },
  { kind: 'line', index: 15, name: 'East Line', price: LINE_PRICE, mortgage: LINE_MORT },
  {
    kind: 'property',
    index: 16,
    name: 'Copper Row',
    group: 'market',
    price: 180_000,
    houseCost: 100_000,
    mortgage: 90_000,
    rents: [14_000, 70_000, 200_000, 550_000, 750_000, 950_000],
  },
  { kind: 'neighbor', index: 17, name: 'Neighbor Notes' },
  {
    kind: 'property',
    index: 18,
    name: 'Brick Row',
    group: 'market',
    price: 180_000,
    houseCost: 100_000,
    mortgage: 90_000,
    rents: [14_000, 70_000, 200_000, 550_000, 750_000, 950_000],
  },
  {
    kind: 'property',
    index: 19,
    name: 'Lantern Row',
    group: 'market',
    price: 200_000,
    houseCost: 100_000,
    mortgage: 100_000,
    rents: [16_000, 80_000, 220_000, 600_000, 800_000, 1_000_000],
  },
  { kind: 'town-square', index: 20, name: 'Town Square' },
  {
    kind: 'property',
    index: 21,
    name: 'Cherry Way',
    group: 'harbor',
    price: 220_000,
    houseCost: 150_000,
    mortgage: 110_000,
    rents: [18_000, 90_000, 250_000, 700_000, 875_000, 1_050_000],
  },
  { kind: 'wild', index: 22, name: 'Wild Card' },
  {
    kind: 'property',
    index: 23,
    name: 'Maple Way',
    group: 'harbor',
    price: 220_000,
    houseCost: 150_000,
    mortgage: 110_000,
    rents: [18_000, 90_000, 250_000, 700_000, 875_000, 1_050_000],
  },
  {
    kind: 'property',
    index: 24,
    name: 'Willow Way',
    group: 'harbor',
    price: 240_000,
    houseCost: 150_000,
    mortgage: 120_000,
    rents: [20_000, 100_000, 300_000, 750_000, 925_000, 1_100_000],
  },
  { kind: 'line', index: 25, name: 'South Line', price: LINE_PRICE, mortgage: LINE_MORT },
  {
    kind: 'property',
    index: 26,
    name: 'Goldfield',
    group: 'meadow',
    price: 260_000,
    houseCost: 150_000,
    mortgage: 130_000,
    rents: [22_000, 110_000, 330_000, 800_000, 975_000, 1_150_000],
  },
  {
    kind: 'property',
    index: 27,
    name: 'Sunfield',
    group: 'meadow',
    price: 260_000,
    houseCost: 150_000,
    mortgage: 130_000,
    rents: [22_000, 110_000, 330_000, 800_000, 975_000, 1_150_000],
  },
  { kind: 'works', index: 28, name: 'Waterworks', price: WORKS_PRICE, mortgage: WORKS_MORT },
  {
    kind: 'property',
    index: 29,
    name: 'Elmfield',
    group: 'meadow',
    price: 280_000,
    houseCost: 150_000,
    mortgage: 140_000,
    rents: [24_000, 120_000, 360_000, 850_000, 1_025_000, 1_200_000],
  },
  { kind: 'goto-jail', index: 30, name: 'Sent to Jail' },
  {
    kind: 'property',
    index: 31,
    name: 'Pine Hill',
    group: 'forest',
    price: 300_000,
    houseCost: 200_000,
    mortgage: 150_000,
    rents: [26_000, 130_000, 390_000, 900_000, 1_100_000, 1_275_000],
  },
  {
    kind: 'property',
    index: 32,
    name: 'Cedar Hill',
    group: 'forest',
    price: 300_000,
    houseCost: 200_000,
    mortgage: 150_000,
    rents: [26_000, 130_000, 390_000, 900_000, 1_100_000, 1_275_000],
  },
  { kind: 'neighbor', index: 33, name: 'Neighbor Notes' },
  {
    kind: 'property',
    index: 34,
    name: 'Oak Hill',
    group: 'forest',
    price: 320_000,
    houseCost: 200_000,
    mortgage: 160_000,
    rents: [28_000, 150_000, 450_000, 1_000_000, 1_200_000, 1_400_000],
  },
  { kind: 'line', index: 35, name: 'West Line', price: LINE_PRICE, mortgage: LINE_MORT },
  { kind: 'wild', index: 36, name: 'Wild Card' },
  {
    kind: 'property',
    index: 37,
    name: 'Castle Court',
    group: 'crown',
    price: 350_000,
    houseCost: 200_000,
    mortgage: 175_000,
    rents: [35_000, 175_000, 500_000, 1_100_000, 1_300_000, 1_500_000],
  },
  { kind: 'fee', index: 38, name: 'Showcase Fee', amount: 100_000 },
  {
    kind: 'property',
    index: 39,
    name: 'Grand Castle',
    group: 'crown',
    price: 400_000,
    houseCost: 200_000,
    mortgage: 200_000,
    rents: [50_000, 200_000, 600_000, 1_400_000, 1_700_000, 2_000_000],
  },
]

export const COLOR_GROUPS: Record<ColorGroup, number[]> = {
  pebble: [1, 3],
  creek: [6, 8, 9],
  garden: [11, 13, 14],
  market: [16, 18, 19],
  harbor: [21, 23, 24],
  meadow: [26, 27, 29],
  forest: [31, 32, 34],
  crown: [37, 39],
}

export const LINE_INDEXES = [5, 15, 25, 35]
export const WORKS_INDEXES = [12, 28]

export function spaceAt(index: number): SpaceDef {
  return BOARD[((index % 40) + 40) % 40]!
}

export function isDeedSpace(s: SpaceDef): s is PropertyDef | LineDef | WorksDef {
  return s.kind === 'property' || s.kind === 'line' || s.kind === 'works'
}
