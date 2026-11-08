/** Cryptographic helpers for Neighborhood (host-only). */

export function cryptoUniform(maxExclusive: number): number {
  if (maxExclusive <= 0) throw new Error('maxExclusive must be > 0')
  const limit = Math.floor(0x100000000 / maxExclusive) * maxExclusive
  const buf = new Uint32Array(1)
  let x = 0
  do {
    crypto.getRandomValues(buf)
    x = buf[0]!
  } while (x >= limit)
  return x % maxExclusive
}

/** Fair d6 via rejection sampling. */
export function rollDie(): number {
  return cryptoUniform(6) + 1
}

export function rollTwoDice(): [number, number] {
  return [rollDie(), rollDie()]
}

/** Fisher–Yates with crypto. */
export function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = cryptoUniform(i + 1)
    const tmp = arr[i]!
    arr[i] = arr[j]!
    arr[j] = tmp
  }
  return arr
}

export function freshDeck(size: number): number[] {
  return shuffleInPlace(Array.from({ length: size }, (_, i) => i))
}
