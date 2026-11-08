import { formatCash } from './money'

/** Costume faces for the Town Square jackpot display (not playable bills above $500k except $1M face). */
export const JACKPOT_FACES = [
  1_000, 5_000, 10_000, 20_000, 50_000, 100_000, 500_000, 1_000_000,
] as const

/**
 * Largest face that does not exceed the pot.
 * Empty pot → null. Above $1,000,000 → keep $1M face; digits still climb.
 */
export function jackpotCostumeFace(pot: number): number | null {
  if (pot <= 0) return null
  let face: number = JACKPOT_FACES[0]!
  for (const f of JACKPOT_FACES) {
    if (f <= pot) face = f
  }
  return face
}

export function jackpotFaceLabel(pot: number): { face: number | null; digits: string } {
  const face = jackpotCostumeFace(pot)
  return { face, digits: formatCash(pot) }
}
