import type { TrayId } from './gameTypes'

export type CinematicTone = 'short' | 'long'

export type NbCinematic =
  | { id: number; kind: 'dice'; faces: [number, number]; trayId: TrayId }
  | { id: number; kind: 'step'; trayId: TrayId; from: number; to: number }
  | {
      id: number
      kind: 'pay'
      fromTrayId: TrayId
      toTrayId: TrayId | 'bank' | 'jackpot'
      amount: number
      tone: CinematicTone
    }
  | {
      id: number
      kind: 'pay-each'
      fromTrayId: TrayId
      toTrayIds: TrayId[]
      amountEach: number
      tone: CinematicTone
    }
  | {
      id: number
      kind: 'collect'
      trayId: TrayId
      amount: number
      tone: CinematicTone
      reason?: string
    }
  | {
      id: number
      kind: 'collect-each'
      trayId: TrayId
      fromTrayIds: TrayId[]
      amountEach: number
      tone: CinematicTone
      reason?: string
    }
  | { id: number; kind: 'buy'; trayId: TrayId; spaceIndex: number }
  | { id: number; kind: 'card'; deck: 'wild' | 'neighbor'; text: string }
  | { id: number; kind: 'jail'; trayId: TrayId }
  | { id: number; kind: 'trade'; fromTrayId: TrayId; toTrayId: TrayId }
  | {
      id: number
      kind: 'toast'
      text: string
      mood: 'paid' | 'collected' | 'info'
    }

export const CINEMATIC_CAP = 24

/** Distributive omit so each cinematic variant keeps its fields. */
export type CinematicInput = NbCinematic extends infer C
  ? C extends NbCinematic
    ? Omit<C, 'id'>
    : never
  : never

export function appendCinematic<T extends { lastEventId: number; cinematics?: NbCinematic[] }>(
  game: T,
  cine: CinematicInput,
): T {
  const id = game.lastEventId + 1
  const entry = { ...cine, id } as NbCinematic
  const cinematics = [entry, ...(game.cinematics ?? [])].slice(0, CINEMATIC_CAP)
  return { ...game, lastEventId: id, cinematics }
}

/** Playable bill denominations (largest first). */
export const BILL_DENOMS = [
  500_000, 100_000, 50_000, 20_000, 10_000, 5_000, 1_000,
] as const

export function breakIntoBills(amount: number): number[] {
  let left = Math.max(0, Math.trunc(amount))
  const out: number[] = []
  for (const d of BILL_DENOMS) {
    while (left >= d) {
      out.push(d)
      left -= d
      if (out.length >= 8) break
    }
    if (out.length >= 8) break
  }
  if (left > 0 && out.length < 8) {
    // remainder as smallest
    out.push(1_000)
  }
  return out
}
