import { emptyDeed, type NeighborhoodGame, type TrayId } from './gameTypes'
import {
  applyBuild,
  applyMortgage,
  applySellBuilding,
  applyUnmortgage,
  bareDeedIndexes,
  deedCreditValue,
  sellAllBuildingsForTray,
} from './economy'
import { formatCash } from './money'
import { STARTING_CASH, type NeighborhoodPieceId, type NeighborhoodRules } from './types'
import { spaceAt } from './board'
import { canTapTray, continueAfterResolve, currentTrayId, isOpenJoin } from './engine'

function pushLog(game: NeighborhoodGame, line: string): NeighborhoodGame {
  return {
    ...game,
    log: [line, ...game.log].slice(0, 40),
    lastEventId: game.lastEventId + 1,
  }
}

function trayName(game: NeighborhoodGame, trayId: TrayId, names: Record<string, string>): string {
  const t = game.trays[trayId]
  if (!t) return 'Seat'
  if (t.memberIds.length === 1) return names[t.memberIds[0]!] ?? 'Player'
  return t.memberIds.map((id) => names[id] ?? '?').join(' & ')
}

function debtCoverage(
  game: NeighborhoodGame,
  trayId: TrayId,
  selectedDeeds: number[],
  cashOffer: number,
): number {
  let total = 0
  for (const i of selectedDeeds) {
    const d = game.deeds[i]
    if (!d || d.ownerTrayId !== trayId) continue
    total += deedCreditValue(d, i)
  }
  return total + Math.max(0, cashOffer)
}

export type SliceCAction =
  | { type: 'build'; fromId: string; trayId: TrayId; spaceIndex: number }
  | { type: 'sell-building'; fromId: string; trayId: TrayId; spaceIndex: number }
  | { type: 'mortgage'; fromId: string; trayId: TrayId; spaceIndex: number }
  | { type: 'unmortgage'; fromId: string; trayId: TrayId; spaceIndex: number }
  | { type: 'debt-select'; fromId: string; trayId: TrayId; selectedDeeds: number[]; cashOffer: number }
  | { type: 'debt-pay'; fromId: string; trayId: TrayId }
  | { type: 'debt-bankrupt'; fromId: string; trayId: TrayId }
  | {
      type: 'trade-open'
      fromId: string
      trayId: TrayId
      toTrayId: TrayId
    }
  | {
      type: 'trade-draft'
      fromId: string
      trayId: TrayId
      offerCash: number
      offerDeeds: number[]
      offerJailFreeWild: number
      offerJailFreeNeighbor: number
      askCash: number
      askDeeds: number[]
      askJailFreeWild: number
      askJailFreeNeighbor: number
    }
  | { type: 'trade-send'; fromId: string; trayId: TrayId }
  | { type: 'trade-accept'; fromId: string; trayId: TrayId }
  | { type: 'trade-decline'; fromId: string; trayId: TrayId }
  | { type: 'trade-counter'; fromId: string; trayId: TrayId }
  | {
      type: 'leave-game'
      fromId: string
      trayId: TrayId
      giftTo: TrayId | 'bank'
      spectate: boolean
    }
  | { type: 'player-away'; fromId: string; at: number }
  | { type: 'player-back'; fromId: string }
  | { type: 'remove-player'; fromId: string; targetPlayerId: string; now: number }
  | {
      type: 'accept-join'
      fromId: string
      playerId: string
      pieceId: NeighborhoodPieceId
      teamId?: string
    }
  | { type: 'decline-join'; fromId: string; playerId: string }

export function applySliceCAction(
  game: NeighborhoodGame,
  rules: NeighborhoodRules,
  names: Record<string, string>,
  hostId: string,
  action: SliceCAction,
): NeighborhoodGame {
  const ensureTurns = (g: NeighborhoodGame): NeighborhoodGame => ({
    ...g,
    turnsTaken: g.turnsTaken ?? 0,
    awayAt: g.awayAt ?? {},
    joinRequests: g.joinRequests ?? [],
  })
  let g = ensureTurns(game)

  if (action.type === 'player-away') {
    return {
      ...g,
      awayAt: { ...g.awayAt, [action.fromId]: action.at },
    }
  }
  if (action.type === 'player-back') {
    return {
      ...g,
      awayAt: { ...g.awayAt, [action.fromId]: null },
    }
  }

  if (action.type === 'remove-player') {
    if (action.fromId !== hostId) return g
    const away = g.awayAt[action.targetPlayerId]
    if (away == null) return g
    if (action.now - away < rules.disconnectGraceMs) return g
    // Find tray and remove member / spectate tray if last
    return removePlayerFromGame(g, action.targetPlayerId, names, rules)
  }

  if (action.type === 'decline-join') {
    if (action.fromId !== hostId) return g
    return {
      ...g,
      joinRequests: g.joinRequests.filter((r) => r.playerId !== action.playerId),
    }
  }

  if (action.type === 'accept-join') {
    if (action.fromId !== hostId) return g
    const req = g.joinRequests.find((r) => r.playerId === action.playerId)
    if (!req) return g
    return acceptLateJoin(g, rules, req, action.pieceId, action.teamId, names)
  }

  if (!canTapTray(g, action.fromId, action.trayId) && action.type !== 'leave-game') {
    // leave checked separately
  }

  const turn = currentTrayId(g)

  if (action.type === 'build' || action.type === 'sell-building' || action.type === 'mortgage' || action.type === 'unmortgage') {
    if (!canTapTray(g, action.fromId, action.trayId)) return g
    // Own turn, no blocking prompt (debt allows sell/mortgage)
    const debtOk = g.prompt?.type === 'debt'
    if (!debtOk && (g.phase !== 'playing' || action.trayId !== turn || g.prompt)) return g
    if (debtOk && g.prompt?.type === 'debt') {
      // debtor tray only
      if (action.trayId !== turn) return g
    }
    let next: NeighborhoodGame | null = null
    if (action.type === 'build') next = applyBuild(g, action.trayId, action.spaceIndex, rules)
    if (action.type === 'sell-building') next = applySellBuilding(g, action.trayId, action.spaceIndex)
    if (action.type === 'mortgage') next = applyMortgage(g, action.trayId, action.spaceIndex)
    if (action.type === 'unmortgage') next = applyUnmortgage(g, action.trayId, action.spaceIndex, rules)
    if (!next) return g
    const verb =
      action.type === 'build'
        ? 'built on'
        : action.type === 'sell-building'
          ? 'sold building on'
          : action.type === 'mortgage'
            ? 'mortgaged'
            : 'unmortgaged'
    return pushLog(next, `${trayName(next, action.trayId, names)} ${verb} ${spaceAt(action.spaceIndex).name}.`)
  }

  if (action.type === 'debt-select') {
    if (g.prompt?.type !== 'debt') return g
    if (!canTapTray(g, action.fromId, action.trayId)) return g
    if (action.trayId !== turn) return g
    const tray = g.trays[action.trayId]!
    const bare = new Set(bareDeedIndexes(g, action.trayId))
    const selectedDeeds = action.selectedDeeds.filter((i) => bare.has(i))
    const deedTotal = selectedDeeds.reduce((sum, i) => sum + deedCreditValue(g.deeds[i]!, i), 0)
    const gap = Math.max(0, g.prompt.amount - deedTotal)
    const cashOffer = Math.max(0, Math.min(action.cashOffer, tray.cash, gap))
    return {
      ...g,
      prompt: { ...g.prompt, selectedDeeds, cashOffer },
    }
  }

  if (action.type === 'debt-pay') {
    if (g.prompt?.type !== 'debt') return g
    if (!canTapTray(g, action.fromId, action.trayId)) return g
    if (action.trayId !== turn) return g
    const prompt = g.prompt
    const cover = debtCoverage(g, action.trayId, prompt.selectedDeeds, prompt.cashOffer)
    if (cover < prompt.amount) return g
    return settleDebt(g, action.trayId, prompt, names, rules)
  }

  if (action.type === 'debt-bankrupt') {
    if (g.prompt?.type !== 'debt') return g
    if (!canTapTray(g, action.fromId, action.trayId)) return g
    if (action.trayId !== turn) return g
    return forceBankrupt(g, action.trayId, g.prompt.toTrayId, names, rules)
  }

  if (action.type === 'trade-open') {
    if (!canTapTray(g, action.fromId, action.trayId)) return g
    if (action.trayId !== turn || g.prompt) return g
    if (!g.trays[action.toTrayId] || g.trays[action.toTrayId]!.spectating) return g
    return {
      ...g,
      prompt: {
        type: 'trade',
        fromTrayId: action.trayId,
        toTrayId: action.toTrayId,
        awaitingTrayId: null,
        offerCash: 0,
        offerDeeds: [],
        offerJailFreeWild: 0,
        offerJailFreeNeighbor: 0,
        askCash: 0,
        askDeeds: [],
        askJailFreeWild: 0,
        askJailFreeNeighbor: 0,
        frozen: false,
      },
    }
  }

  if (action.type === 'trade-draft') {
    if (g.prompt?.type !== 'trade' || g.prompt.frozen) return g
    if (!canTapTray(g, action.fromId, action.trayId)) return g
    // Drafter is fromTray when awaiting null, or the counterparty when countering (awaiting is from)
    const p = g.prompt
    const drafting =
      (!p.frozen && p.awaitingTrayId == null && action.trayId === p.fromTrayId) ||
      (!p.frozen && p.awaitingTrayId === p.fromTrayId && action.trayId === p.toTrayId)
    if (!drafting) return g
    return {
      ...g,
      prompt: {
        ...p,
        offerCash: Math.max(0, action.offerCash),
        offerDeeds: action.offerDeeds,
        offerJailFreeWild: Math.max(0, action.offerJailFreeWild),
        offerJailFreeNeighbor: Math.max(0, action.offerJailFreeNeighbor),
        askCash: Math.max(0, action.askCash),
        askDeeds: action.askDeeds,
        askJailFreeWild: Math.max(0, action.askJailFreeWild),
        askJailFreeNeighbor: Math.max(0, action.askJailFreeNeighbor),
      },
    }
  }

  if (action.type === 'trade-send') {
    if (g.prompt?.type !== 'trade' || g.prompt.frozen) return g
    if (!canTapTray(g, action.fromId, action.trayId)) return g
    const p = g.prompt
    if (p.awaitingTrayId == null && action.trayId !== p.fromTrayId) return g
    if (p.awaitingTrayId === p.fromTrayId && action.trayId !== p.toTrayId) return g
    const nextAwait = action.trayId === p.fromTrayId ? p.toTrayId : p.fromTrayId
    return {
      ...g,
      prompt: { ...p, frozen: true, awaitingTrayId: nextAwait },
    }
  }

  if (action.type === 'trade-decline') {
    if (g.prompt?.type !== 'trade') return g
    if (!canTapTray(g, action.fromId, action.trayId)) return g
    return pushLog({ ...g, prompt: null }, 'Trade declined.')
  }

  if (action.type === 'trade-counter') {
    if (g.prompt?.type !== 'trade' || !g.prompt.frozen) return g
    if (!canTapTray(g, action.fromId, action.trayId)) return g
    if (action.trayId !== g.prompt.awaitingTrayId) return g
    // Swap perspective for counter: swap offer/ask and swap from/to roles for drafting
    const p = g.prompt
    return {
      ...g,
      prompt: {
        type: 'trade',
        fromTrayId: p.toTrayId,
        toTrayId: p.fromTrayId,
        awaitingTrayId: null,
        offerCash: p.askCash,
        offerDeeds: p.askDeeds,
        offerJailFreeWild: p.askJailFreeWild,
        offerJailFreeNeighbor: p.askJailFreeNeighbor,
        askCash: p.offerCash,
        askDeeds: p.offerDeeds,
        askJailFreeWild: p.offerJailFreeWild,
        askJailFreeNeighbor: p.offerJailFreeNeighbor,
        frozen: false,
      },
    }
  }

  if (action.type === 'trade-accept') {
    if (g.prompt?.type !== 'trade' || !g.prompt.frozen) return g
    if (!canTapTray(g, action.fromId, action.trayId)) return g
    if (action.trayId !== g.prompt.awaitingTrayId) return g
    return executeTrade(g, g.prompt, names)
  }

  if (action.type === 'leave-game') {
    if (!canTapTray(g, action.fromId, action.trayId) && !g.trays[action.trayId]?.memberIds.includes(action.fromId)) {
      return g
    }
    return intentionalLeave(g, action.trayId, action.giftTo, action.spectate, names, rules)
  }

  return g
}

function settleDebt(
  game: NeighborhoodGame,
  trayId: TrayId,
  prompt: Extract<NeighborhoodGame['prompt'], { type: 'debt' }>,
  names: Record<string, string>,
  rules: NeighborhoodRules,
): NeighborhoodGame {
  if (!prompt) return game
  let next = game
  const tray = next.trays[trayId]!
  const cashPay = Math.min(prompt.cashOffer, tray.cash)
  next = {
    ...next,
    trays: {
      ...next.trays,
      [trayId]: { ...tray, cash: tray.cash - cashPay },
    },
  }
  if (prompt.toTrayId !== 'bank' && prompt.toTrayId !== 'jackpot') {
    const o = next.trays[prompt.toTrayId]!
    next = {
      ...next,
      trays: {
        ...next.trays,
        [prompt.toTrayId]: { ...o, cash: o.cash + cashPay },
      },
    }
  } else if (prompt.toTrayId === 'jackpot' || (prompt.toTrayId === 'bank' && rules.jackpot)) {
    next = { ...next, jackpot: next.jackpot + cashPay }
  }

  const deeds = { ...next.deeds }
  for (const i of prompt.selectedDeeds) {
    const d = deeds[i]
    if (!d || d.ownerTrayId !== trayId) continue
    if (prompt.toTrayId === 'bank' || prompt.toTrayId === 'jackpot') {
      deeds[i] = emptyDeed()
    } else {
      deeds[i] = { ...d, ownerTrayId: prompt.toTrayId }
    }
  }
  next = {
    ...next,
    deeds,
    prompt: null,
  }
  next = pushLog(
    next,
    `${trayName(next, trayId, names)} settled ${formatCash(prompt.amount)} (${prompt.reason}).`,
  )
  return continueAfterResolve(next)
}

function forceBankrupt(
  game: NeighborhoodGame,
  trayId: TrayId,
  to: TrayId | 'bank' | 'jackpot',
  names: Record<string, string>,
  rules: NeighborhoodRules,
): NeighborhoodGame {
  let next = sellAllBuildingsForTray(game, trayId)
  const tray = next.trays[trayId]!
  const cash = tray.cash
  if (to !== 'bank' && to !== 'jackpot') {
    const o = next.trays[to]!
    next = {
      ...next,
      trays: {
        ...next.trays,
        [trayId]: { ...tray, cash: 0 },
        [to]: { ...o, cash: o.cash + cash },
      },
    }
    const deeds = { ...next.deeds }
    for (const [idx, d] of Object.entries(deeds)) {
      if (d.ownerTrayId === trayId) deeds[Number(idx)] = { ...d, ownerTrayId: to }
    }
    next = { ...next, deeds }
  } else {
    next = {
      ...next,
      jackpot: rules.jackpot || to === 'jackpot' ? next.jackpot + cash : next.jackpot,
      trays: { ...next.trays, [trayId]: { ...tray, cash: 0 } },
    }
    const deeds = { ...next.deeds }
    for (const [idx, d] of Object.entries(deeds)) {
      if (d.ownerTrayId === trayId) deeds[Number(idx)] = emptyDeed()
    }
    next = { ...next, deeds }
  }
  // Return jail-free to decks
  let wildDeck = next.wildDeck
  let neighborDeck = next.neighborDeck
  const t2 = next.trays[trayId]!
  for (let i = 0; i < t2.jailFreeWild; i++) wildDeck = [...wildDeck, 7]
  for (let i = 0; i < t2.jailFreeNeighbor; i++) neighborDeck = [...neighborDeck, 4]
  next = {
    ...next,
    wildDeck,
    neighborDeck,
    prompt: null,
    trays: {
      ...next.trays,
      [trayId]: {
        ...t2,
        jailFreeWild: 0,
        jailFreeNeighbor: 0,
        bankrupt: true,
        spectating: true,
      },
    },
  }
  next = pushLog(next, `${trayName(next, trayId, names)} is out.`)
  if (rules.stopAtFirstBankruptcy) {
    const alive = Object.values(next.trays).filter((t) => !t.bankrupt && !t.spectating)
    return {
      ...next,
      phase: 'finished',
      winnerTrayIds: alive.map((t) => t.id),
    }
  }
  const alive = Object.values(next.trays).filter((t) => !t.bankrupt && !t.spectating)
  if (alive.length <= 1) {
    return { ...next, phase: 'finished', winnerTrayIds: alive.map((t) => t.id) }
  }
  return next
}

function executeTrade(
  game: NeighborhoodGame,
  prompt: Extract<NeighborhoodGame['prompt'], { type: 'trade' }>,
  names: Record<string, string>,
): NeighborhoodGame {
  if (!prompt) return game
  const a = game.trays[prompt.fromTrayId]!
  const b = game.trays[prompt.toTrayId]!
  if (a.cash < prompt.offerCash || b.cash < prompt.askCash) return { ...game, prompt: null }
  let next: NeighborhoodGame = {
    ...game,
    trays: {
      ...game.trays,
      [prompt.fromTrayId]: {
        ...a,
        cash: a.cash - prompt.offerCash + prompt.askCash,
        jailFreeWild: a.jailFreeWild - prompt.offerJailFreeWild + prompt.askJailFreeWild,
        jailFreeNeighbor:
          a.jailFreeNeighbor - prompt.offerJailFreeNeighbor + prompt.askJailFreeNeighbor,
      },
      [prompt.toTrayId]: {
        ...b,
        cash: b.cash - prompt.askCash + prompt.offerCash,
        jailFreeWild: b.jailFreeWild - prompt.askJailFreeWild + prompt.offerJailFreeWild,
        jailFreeNeighbor:
          b.jailFreeNeighbor - prompt.askJailFreeNeighbor + prompt.offerJailFreeNeighbor,
      },
    },
    prompt: null,
  }
  const deeds = { ...next.deeds }
  for (const i of prompt.offerDeeds) {
    if (deeds[i]?.ownerTrayId === prompt.fromTrayId) {
      deeds[i] = { ...deeds[i]!, ownerTrayId: prompt.toTrayId }
    }
  }
  for (const i of prompt.askDeeds) {
    if (deeds[i]?.ownerTrayId === prompt.toTrayId) {
      deeds[i] = { ...deeds[i]!, ownerTrayId: prompt.fromTrayId }
    }
  }
  next = { ...next, deeds }
  return pushLog(
    next,
    `Trade: ${trayName(next, prompt.fromTrayId, names)} ↔ ${trayName(next, prompt.toTrayId, names)}.`,
  )
}

function intentionalLeave(
  game: NeighborhoodGame,
  trayId: TrayId,
  giftTo: TrayId | 'bank',
  spectate: boolean,
  names: Record<string, string>,
  rules: NeighborhoodRules,
): NeighborhoodGame {
  let next = sellAllBuildingsForTray(game, trayId)
  // If debt prompt to a seat, settle closest cover first is Slice C lite: force bankrupt path to creditor
  if (next.prompt?.type === 'debt' && next.prompt.toTrayId !== 'bank' && next.prompt.toTrayId !== 'jackpot') {
    next = forceBankrupt(next, trayId, next.prompt.toTrayId, names, rules)
    return next
  }
  if (next.prompt?.type === 'debt') {
    next = forceBankrupt(next, trayId, next.prompt.toTrayId, names, rules)
    return next
  }

  const tray = next.trays[trayId]!
  const cash = tray.cash
  if (giftTo === 'bank') {
    next = { ...next, trays: { ...next.trays, [trayId]: { ...tray, cash: 0 } } }
    const deeds = { ...next.deeds }
    for (const [idx, d] of Object.entries(deeds)) {
      if (d.ownerTrayId === trayId) deeds[Number(idx)] = emptyDeed()
    }
    let wildDeck = next.wildDeck
    let neighborDeck = next.neighborDeck
    for (let i = 0; i < tray.jailFreeWild; i++) wildDeck = [...wildDeck, 7]
    for (let i = 0; i < tray.jailFreeNeighbor; i++) neighborDeck = [...neighborDeck, 4]
    next = { ...next, deeds, wildDeck, neighborDeck }
  } else {
    const o = next.trays[giftTo]!
    next = {
      ...next,
      trays: {
        ...next.trays,
        [trayId]: { ...tray, cash: 0, jailFreeWild: 0, jailFreeNeighbor: 0 },
        [giftTo]: {
          ...o,
          cash: o.cash + cash,
          jailFreeWild: o.jailFreeWild + tray.jailFreeWild,
          jailFreeNeighbor: o.jailFreeNeighbor + tray.jailFreeNeighbor,
        },
      },
    }
    const deeds = { ...next.deeds }
    for (const [idx, d] of Object.entries(deeds)) {
      if (d.ownerTrayId === trayId) deeds[Number(idx)] = { ...d, ownerTrayId: giftTo }
    }
    next = { ...next, deeds }
  }

  next = {
    ...next,
    prompt: null,
    trays: {
      ...next.trays,
      [trayId]: {
        ...next.trays[trayId]!,
        spectating: spectate || true,
        bankrupt: !spectate ? true : next.trays[trayId]!.bankrupt,
      },
    },
  }
  // Always spectate for leave mid-game (Home is client navigate)
  next = {
    ...next,
    trays: {
      ...next.trays,
      [trayId]: {
        ...next.trays[trayId]!,
        spectating: true,
        bankrupt: true,
      },
    },
  }
  next = pushLog(next, `${trayName(next, trayId, names)} left the game.`)
  const alive = Object.values(next.trays).filter((t) => !t.bankrupt && !t.spectating)
  if (alive.length <= 1) {
    return { ...next, phase: 'finished', winnerTrayIds: alive.map((t) => t.id) }
  }
  // If it was their turn, clear prompt already — turn advances on next end; force skip if current
  const cur = currentTrayId(next)
  if (cur === trayId) {
    const order = next.turnOrder.filter((id) => next.trays[id] && !next.trays[id]!.spectating)
    if (order.length) {
      const idx = next.turnOrder.indexOf(order[0]!)
      next = { ...next, turnIndex: idx >= 0 ? idx : next.turnIndex }
    }
  }
  void rules
  return next
}

function removePlayerFromGame(
  game: NeighborhoodGame,
  playerId: string,
  names: Record<string, string>,
  rules: NeighborhoodRules,
): NeighborhoodGame {
  // Find tray containing player
  const tray = Object.values(game.trays).find((t) => t.memberIds.includes(playerId))
  if (!tray) {
    return {
      ...game,
      awayAt: { ...game.awayAt, [playerId]: null },
      joinRequests: game.joinRequests.filter((r) => r.playerId !== playerId),
    }
  }
  if (tray.memberIds.length > 1) {
    // Shared: remove member only
    const members = tray.memberIds.filter((id) => id !== playerId)
    let next: NeighborhoodGame = {
      ...game,
      trays: {
        ...game.trays,
        [tray.id]: { ...tray, memberIds: members },
      },
      awayAt: { ...game.awayAt, [playerId]: null },
    }
    next = pushLog(next, `${names[playerId] ?? 'Player'} removed from shared tray.`)
    return next
  }
  return intentionalLeave(game, tray.id, 'bank', true, names, rules)
}

function acceptLateJoin(
  game: NeighborhoodGame,
  rules: NeighborhoodRules,
  req: { playerId: string; name: string },
  pieceId: NeighborhoodPieceId,
  teamId: string | undefined,
  names: Record<string, string>,
): NeighborhoodGame {
  // Piece unique check
  const used = new Set(Object.values(game.trays).map((t) => t.pieceId))
  if (used.has(pieceId) && rules.teamStyle !== 'shared') return game

  const lowestCash = Math.min(...Object.values(game.trays).map((t) => t.cash), STARTING_CASH)
  const cash = Math.min(STARTING_CASH, lowestCash)

  let trays = { ...game.trays }
  let turnOrder = [...game.turnOrder]

  if (rules.teamStyle === 'shared' && teamId) {
    const existing = trays[teamId]
    if (existing) {
      if (existing.memberIds.length >= 2) return game
      trays[teamId] = {
        ...existing,
        memberIds: [...existing.memberIds, req.playerId],
      }
    } else {
      if (used.has(pieceId)) return game
      trays[teamId] = {
        id: teamId,
        memberIds: [req.playerId],
        pieceId,
        cash,
        position: 0,
        inJail: false,
        jailTurns: 0,
        jailFreeWild: 0,
        jailFreeNeighbor: 0,
        bankrupt: false,
        spectating: false,
      }
      turnOrder = [...turnOrder, teamId]
    }
  } else {
    trays[req.playerId] = {
      id: req.playerId,
      memberIds: [req.playerId],
      pieceId,
      allianceId: rules.teamStyle === 'alliance' ? teamId : undefined,
      cash,
      position: 0,
      inJail: false,
      jailTurns: 0,
      jailFreeWild: 0,
      jailFreeNeighbor: 0,
      bankrupt: false,
      spectating: false,
    }
    turnOrder = [...turnOrder, req.playerId]
  }

  let next: NeighborhoodGame = {
    ...game,
    trays,
    turnOrder,
    joinRequests: game.joinRequests.filter((r) => r.playerId !== req.playerId),
  }
  next = pushLog(
    next,
    `${req.name} joined with ${formatCash(cash)} (late).`,
  )
  void names
  return next
}

export { isOpenJoin }
