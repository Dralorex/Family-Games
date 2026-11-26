import { spaceAt } from './board'
import { formatCash } from './money'

export type TradeSideBits = {
  cash: number
  deeds: number[]
  jailFreeWild: number
  jailFreeNeighbor: number
}

/** Human-readable trade side, omitting empty cash / empty lists. */
export function formatTradeSide(bits: TradeSideBits): string {
  const parts: string[] = []
  if (bits.cash > 0) parts.push(formatCash(bits.cash))
  for (const i of bits.deeds) parts.push(spaceAt(i).name)
  const jail = bits.jailFreeWild + bits.jailFreeNeighbor
  if (jail > 0) {
    const kinds: string[] = []
    if (bits.jailFreeWild > 0) kinds.push(`Wild×${bits.jailFreeWild}`)
    if (bits.jailFreeNeighbor > 0) kinds.push(`Notes×${bits.jailFreeNeighbor}`)
    parts.push(`jail-free (${kinds.join(', ')})`)
  }
  return parts.length > 0 ? parts.join(' + ') : 'nothing'
}

export function formatTradeExchange(opts: {
  fromName: string
  toName: string
  offer: TradeSideBits
  ask: TradeSideBits
}): string {
  const offer = formatTradeSide(opts.offer)
  const ask = formatTradeSide(opts.ask)
  if (offer === 'nothing' && ask === 'nothing') {
    return `Trade: ${opts.fromName} ↔ ${opts.toName}.`
  }
  if (ask === 'nothing') {
    return `${opts.fromName} gave ${offer}.`
  }
  if (offer === 'nothing') {
    return `${opts.toName} gave ${ask}.`
  }
  return `${opts.fromName} gave ${offer} · ${opts.toName} gave ${ask}.`
}
