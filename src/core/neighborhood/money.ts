/** Digit wallet formatting (cash is not inventory). */

export function formatCash(n: number): string {
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(Math.trunc(n))
  return `${sign}$${abs.toLocaleString('en-US')}`
}

export function ceilToThousand(n: number): number {
  if (n <= 0) return 0
  return Math.ceil(n / 1000) * 1000
}
