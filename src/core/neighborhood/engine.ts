import {
  BOARD,
  COLOR_GROUPS,
  isDeedSpace,
  LINE_INDEXES,
  LINE_RENTS,
  spaceAt,
  WORKS_INDEXES,
  type ColorGroup,
  type PropertyDef,
} from './board'
import { NEIGHBOR_TEXTS, WILD_TEXTS } from './cards'
import { appendCinematic } from './cinematics'
import {
  emptyDeed,
  type NeighborhoodGame,
  type NbPrompt,
  type TrayId,
  type TrayState,
} from './gameTypes'
import { ceilToThousand, formatCash } from './money'
import { freshDeck, rollTwoDice } from './rng'
import { trayEquity } from './economy'
import { dealStartingDeeds } from './startingDeeds'
import { availableCash, reservedForTray } from './tradeReserve'
import {
  endsOnFirstBankruptcy,
  STARTING_CASH,
  type NeighborhoodPieceId,
  type NeighborhoodRules,
} from './types'

const HOME_SALARY = 200_000
const JAIL_FEE = 50_000
const LOG_MAX = 40

export interface SeatInput {
  playerId: string
  pieceId: NeighborhoodPieceId
  teamId?: string
}

function pushLog(game: NeighborhoodGame, line: string): NeighborhoodGame {
  const log = [line, ...game.log].slice(0, LOG_MAX)
  return { ...game, log, lastEventId: game.lastEventId + 1 }
}

function withMovie(
  game: NeighborhoodGame,
  cine: Parameters<typeof appendCinematic>[1],
  line?: string,
): NeighborhoodGame {
  let next = appendCinematic(game, cine)
  if (line) {
    next = {
      ...next,
      log: [line, ...next.log].slice(0, LOG_MAX),
    }
  }
  return next
}

function trayName(game: NeighborhoodGame, trayId: TrayId, names: Record<string, string>): string {
  const t = game.trays[trayId]
  if (!t) return 'Seat'
  if (t.memberIds.length === 1) return names[t.memberIds[0]!] ?? 'Player'
  return t.memberIds.map((id) => names[id] ?? '?').join(' & ')
}

export function trayIdForPlayer(
  rules: NeighborhoodRules,
  playerId: string,
  teamOf: Record<string, string>,
): TrayId {
  if (rules.teamStyle === 'shared') return teamOf[playerId] ?? playerId
  return playerId
}

export function canTapTray(game: NeighborhoodGame, playerId: string, trayId: TrayId): boolean {
  const t = game.trays[trayId]
  return Boolean(t && !t.bankrupt && !t.spectating && t.memberIds.includes(playerId))
}

export function currentTrayId(game: NeighborhoodGame): TrayId | null {
  if (game.phase !== 'playing' || game.turnOrder.length === 0) return null
  return game.turnOrder[game.turnIndex % game.turnOrder.length] ?? null
}

function aliveTrays(game: NeighborhoodGame): TrayState[] {
  return Object.values(game.trays).filter((t) => !t.bankrupt && !t.spectating)
}

function allied(rules: NeighborhoodRules, a: TrayState, b: TrayState): boolean {
  if (rules.teamStyle !== 'alliance') return false
  return Boolean(a.allianceId && a.allianceId === b.allianceId)
}

function credit(
  game: NeighborhoodGame,
  trayId: TrayId,
  amount: number,
  jackpotSink?: boolean,
): NeighborhoodGame {
  if (amount <= 0) return game
  const t = game.trays[trayId]
  if (!t) return game
  let jackpot = game.jackpot
  if (jackpotSink) jackpot += amount
  return {
    ...game,
    jackpot,
    trays: {
      ...game.trays,
      [trayId]: { ...t, cash: t.cash + amount },
    },
  }
}

function tryDebit(
  game: NeighborhoodGame,
  trayId: TrayId,
  amount: number,
  to: TrayId | 'bank' | 'jackpot',
  reason: string,
  rules: NeighborhoodRules,
  opts?: { silent?: boolean },
): { game: NeighborhoodGame; paid: boolean } {
  if (amount <= 0) return { game, paid: true }
  const t = game.trays[trayId]
  if (!t) return { game, paid: true }
  if (availableCash(game, trayId) >= amount) {
    let next: NeighborhoodGame = {
      ...game,
      trays: {
        ...game.trays,
        [trayId]: { ...t, cash: t.cash - amount },
      },
    }
    if (to === 'jackpot' || (to === 'bank' && rules.jackpot)) {
      next = { ...next, jackpot: next.jackpot + amount }
    } else if (to !== 'bank') {
      next = credit(next, to, amount)
    }
    if (!opts?.silent) {
      const tone = /rent/i.test(reason) ? 'short' : 'long'
      next = withMovie(next, {
        kind: 'pay',
        fromTrayId: trayId,
        toTrayId: to === 'bank' && rules.jackpot ? 'jackpot' : to,
        amount,
        tone,
      })
    }
    return { game: next, paid: true }
  }
  // Slice B: open debt prompt (full mortgage/sell UI in Slice C)
  return {
    game: {
      ...game,
      prompt: {
        type: 'debt',
        amount,
        toTrayId: to,
        reason,
        selectedDeeds: [],
        cashOffer: 0,
      },
    },
    paid: false,
  }
}

function ownsGroup(
  game: NeighborhoodGame,
  trayId: TrayId,
  group: ColorGroup,
): boolean {
  const indexes = COLOR_GROUPS[group]
  return indexes.every((i) => game.deeds[i]?.ownerTrayId === trayId && !game.deeds[i]?.mortgaged)
}

function propertyRent(game: NeighborhoodGame, space: PropertyDef, owner: TrayState): number {
  const deed = game.deeds[space.index]!
  if (deed.mortgaged) return 0
  if (deed.hotel) return space.rents[5]!
  if (deed.houses > 0) return space.rents[deed.houses]!
  if (ownsGroup(game, owner.id, space.group)) return space.rents[1]!
  return space.rents[0]!
}

function lineRent(game: NeighborhoodGame, ownerId: TrayId): number {
  const count = LINE_INDEXES.filter((i) => game.deeds[i]?.ownerTrayId === ownerId).length
  return LINE_RENTS[Math.max(0, Math.min(3, count - 1))] ?? 25_000
}

function worksRent(game: NeighborhoodGame, ownerId: TrayId, diceTotal: number): number {
  const count = WORKS_INDEXES.filter((i) => game.deeds[i]?.ownerTrayId === ownerId).length
  const mult = count >= 2 ? 10 : 4
  return mult * diceTotal * 1000
}

function sendToJail(game: NeighborhoodGame, trayId: TrayId): NeighborhoodGame {
  const t = game.trays[trayId]
  if (!t) return game
  let next: NeighborhoodGame = {
    ...game,
    doublesCount: 0,
    usedJailDoubles: false,
    trays: {
      ...game.trays,
      [trayId]: {
        ...t,
        position: 10,
        inJail: true,
        jailTurns: 0,
      },
    },
    prompt: null,
  }
  return withMovie(next, { kind: 'jail', trayId })
}

/** Move forward `steps`, paying Home salary when passing/landing per rules. */
function moveForward(
  game: NeighborhoodGame,
  trayId: TrayId,
  steps: number,
  rules: NeighborhoodRules,
  payHomeOnLand: boolean,
): NeighborhoodGame {
  const t = game.trays[trayId]
  if (!t || steps <= 0) return game
  const from = t.position
  const raw = from + steps
  const dest = raw % 40
  const passedOrLandedHome = raw >= 40
  let cash = t.cash
  let next: NeighborhoodGame = game
  let homeCollect = 0
  if (passedOrLandedHome) {
    if (dest === 0 && rules.landHomeDouble) {
      homeCollect = 400_000
      cash += homeCollect
      next = pushLog(next, `Landed on Home · collected ${formatCash(homeCollect)}.`)
    } else if (dest === 0 && payHomeOnLand) {
      homeCollect = HOME_SALARY
      cash += homeCollect
      next = pushLog(next, `Landed on Home · collected ${formatCash(homeCollect)}.`)
    } else if (dest !== 0) {
      homeCollect = HOME_SALARY
      cash += homeCollect
      next = pushLog(next, `Passed Home · collected ${formatCash(homeCollect)}.`)
    } else {
      homeCollect = HOME_SALARY
      cash += homeCollect
      next = pushLog(next, `Landed on Home · collected ${formatCash(homeCollect)}.`)
    }
  }
  next = {
    ...next,
    trays: {
      ...next.trays,
      [trayId]: { ...t, position: dest, cash },
    },
  }
  // One cinematic per space so clients can step the piece
  for (let i = 1; i <= steps; i++) {
    const a = (from + i - 1) % 40
    const b = (from + i) % 40
    next = withMovie(next, { kind: 'step', trayId, from: a, to: b })
  }
  if (homeCollect > 0) {
    next = withMovie(next, {
      kind: 'collect',
      trayId,
      amount: homeCollect,
      tone: 'long',
      reason: 'Home',
    })
  }
  return next
}

function moveBack(game: NeighborhoodGame, trayId: TrayId, steps: number): NeighborhoodGame {
  const t = game.trays[trayId]
  if (!t) return game
  const dest = (t.position - steps + 40) % 40
  return {
    ...game,
    trays: { ...game.trays, [trayId]: { ...t, position: dest } },
  }
}

function buildingRepairCost(
  game: NeighborhoodGame,
  trayId: TrayId,
  perHouse: number,
  perHotel: number,
): number {
  let total = 0
  for (const [idx, deed] of Object.entries(game.deeds)) {
    if (deed.ownerTrayId !== trayId) continue
    if (deed.hotel) total += perHotel
    else total += deed.houses * perHouse
    void idx
  }
  return total
}

function drawCard(
  game: NeighborhoodGame,
  deck: 'wild' | 'neighbor',
): { game: NeighborhoodGame; cardIndex: number } {
  const key = deck === 'wild' ? 'wildDeck' : 'neighborDeck'
  let pile = [...game[key]]
  if (pile.length === 0) pile = freshDeck(16)
  const cardIndex = pile[0]!
  pile = pile.slice(1)
  // jail-free stays out; others return to bottom after resolve — for Slice B return non-jail-free now after apply
  return { game: { ...game, [key]: pile }, cardIndex }
}

function returnCard(game: NeighborhoodGame, deck: 'wild' | 'neighbor', cardIndex: number): NeighborhoodGame {
  // jail-free 7 wild / 4 neighbor stay out
  if (deck === 'wild' && cardIndex === 7) return game
  if (deck === 'neighbor' && cardIndex === 4) return game
  const key = deck === 'wild' ? 'wildDeck' : 'neighborDeck'
  return { ...game, [key]: [...game[key], cardIndex] }
}

function nearestIndex(from: number, candidates: number[], forward = true): number {
  let best = candidates[0]!
  let bestDist = 99
  for (const c of candidates) {
    const dist = forward ? (c - from + 40) % 40 : (from - c + 40) % 40
    if (dist === 0) continue
    if (dist < bestDist) {
      bestDist = dist
      best = c
    }
  }
  // if sitting on one, go to next
  if (candidates.includes(from)) {
    const ordered = [...candidates].sort((a, b) => a - b)
    const i = ordered.indexOf(from)
    return ordered[(i + 1) % ordered.length]!
  }
  return best
}

export function initNeighborhoodGame(
  seats: SeatInput[],
  rules: NeighborhoodRules,
): NeighborhoodGame {
  const trays: Record<TrayId, TrayState> = {}
  if (rules.teamStyle === 'shared') {
    const byTray = new Map<string, SeatInput[]>()
    for (const s of seats) {
      const tid = s.teamId ?? s.playerId
      const list = byTray.get(tid) ?? []
      list.push(s)
      byTray.set(tid, list)
    }
    for (const [tid, members] of byTray) {
      trays[tid] = {
        id: tid,
        memberIds: members.map((m) => m.playerId),
        pieceId: members[0]!.pieceId,
        cash: STARTING_CASH,
        position: 0,
        inJail: false,
        jailTurns: 0,
        jailFreeWild: 0,
        jailFreeNeighbor: 0,
        bankrupt: false,
        spectating: false,
      }
    }
  } else {
    for (const s of seats) {
      trays[s.playerId] = {
        id: s.playerId,
        memberIds: [s.playerId],
        pieceId: s.pieceId,
        allianceId: rules.teamStyle === 'alliance' ? s.teamId : undefined,
        cash: STARTING_CASH,
        position: 0,
        inJail: false,
        jailTurns: 0,
        jailFreeWild: 0,
        jailFreeNeighbor: 0,
        bankrupt: false,
        spectating: false,
      }
    }
  }

  const deeds: Record<number, ReturnType<typeof emptyDeed>> = {}
  for (const s of BOARD) {
    if (isDeedSpace(s)) deeds[s.index] = emptyDeed()
  }

  const trayIds = Object.keys(trays)
  return {
    phase: 'opening',
    trays,
    turnOrder: [],
    turnIndex: 0,
    openingRolls: Object.fromEntries(trayIds.map((id) => [id, null])),
    openingNeeds: [...trayIds],
    doublesCount: 0,
    lastDice: null,
    usedJailDoubles: false,
    prompt: null,
    deeds,
    jackpot: 0,
    wildDeck: freshDeck(16),
    neighborDeck: freshDeck(16),
    lastEventId: 0,
    log: ['Opening rolls — highest goes first.'],
    cinematics: [],
    winnerTrayIds: [],
    turnsTaken: 0,
    awayAt: {},
    joinRequests: [],
  }
}

/** Rank remaining seats by equity (cash + deeds + builds). Highest wins. */
export function winnersByEquity(game: NeighborhoodGame): TrayId[] {
  const alive = aliveTrays(game)
  if (alive.length === 0) return []
  const scored = alive.map((t) => ({ id: t.id, eq: trayEquity(game, t.id) }))
  const best = Math.max(...scored.map((s) => s.eq))
  return scored.filter((s) => s.eq === best).map((s) => s.id)
}

function finishIfNeeded(game: NeighborhoodGame, rules: NeighborhoodRules): NeighborhoodGame {
  const alive = aliveTrays(game)
  if (alive.length <= 1) {
    return {
      ...game,
      phase: 'finished',
      prompt: null,
      winnerTrayIds: alive.map((t) => t.id),
    }
  }
  void rules
  return game
}

function finishOnFirstBankruptcy(game: NeighborhoodGame): NeighborhoodGame {
  return {
    ...game,
    phase: 'finished',
    prompt: null,
    winnerTrayIds: winnersByEquity(game),
  }
}

function endTurn(game: NeighborhoodGame): NeighborhoodGame {
  const alive = game.turnOrder.filter((id) => {
    const t = game.trays[id]
    return t && !t.bankrupt && !t.spectating
  })
  if (alive.length === 0) return { ...game, phase: 'finished', prompt: null }
  let idx = game.turnIndex
  for (let i = 0; i < alive.length; i++) {
    idx = (idx + 1) % game.turnOrder.length
    const cand = game.turnOrder[idx]!
    if (alive.includes(cand)) {
      return {
        ...game,
        turnIndex: idx,
        doublesCount: 0,
        usedJailDoubles: false,
        lastDice: null,
        prompt: null,
        turnsTaken: (game.turnsTaken ?? 0) + 1,
      }
    }
  }
  return game
}

/** Open seat claim until opening finishes and every tray has had one turn. */
export function isOpenJoin(game: NeighborhoodGame): boolean {
  if (game.phase === 'opening') return true
  if (game.phase !== 'playing') return false
  return (game.turnsTaken ?? 0) < Math.max(1, game.turnOrder.length)
}

function afterRollContinue(
  game: NeighborhoodGame,
  doubles: boolean,
): NeighborhoodGame {
  if (game.usedJailDoubles) return endTurn(game)
  if (doubles) {
    return { ...game, prompt: null, lastDice: null }
  }
  return endTurn(game)
}

/** After settling a mid-turn prompt (debt), resume doubles or end turn. */
export function continueAfterResolve(game: NeighborhoodGame): NeighborhoodGame {
  const doubles = Boolean(
    game.lastDice && game.lastDice[0] === game.lastDice[1] && !game.usedJailDoubles,
  )
  return afterRollContinue({ ...game, prompt: null }, doubles)
}

function resolveSpace(
  game: NeighborhoodGame,
  trayId: TrayId,
  rules: NeighborhoodRules,
  names: Record<string, string>,
  diceTotal: number,
  rentMult = 1,
): NeighborhoodGame {
  const t = game.trays[trayId]!
  const space = spaceAt(t.position)
  const label = trayName(game, trayId, names)

  if (space.kind === 'home') {
    return pushLog({ ...game, prompt: null }, `${label} is on Home.`)
  }
  if (space.kind === 'jail') {
    return pushLog({ ...game, prompt: null }, `${label} is visiting Jail.`)
  }
  if (space.kind === 'town-square') {
    if (rules.jackpot && game.jackpot > 0) {
      const pot = game.jackpot
      let next = credit({ ...game, jackpot: 0 }, trayId, pot)
      next = withMovie(
        next,
        { kind: 'collect', trayId, amount: pot, tone: 'long', reason: 'Jackpot' },
        `${label} collected the jackpot ${formatCash(pot)}.`,
      )
      return { ...next, prompt: null }
    }
    return pushLog({ ...game, prompt: null }, `${label} landed on Town Square.`)
  }
  if (space.kind === 'goto-jail') {
    let next = sendToJail(game, trayId)
    next = pushLog(next, `${label} was sent to Jail.`)
    return { ...next, prompt: null }
  }
  if (space.kind === 'fee') {
    const amount = space.amount ?? 100_000
    const { game: paid, paid: ok } = tryDebit(game, trayId, amount, rules.jackpot ? 'jackpot' : 'bank', 'Showcase Fee', rules)
    if (!ok) return paid
    return pushLog({ ...paid, prompt: null }, `${label} paid Showcase Fee ${formatCash(amount)}.`)
  }
  if (space.kind === 'tax') {
    const flat = 200_000
    const percentAmount = ceilToThousand(t.cash * 0.1)
    return {
      ...game,
      prompt: { type: 'tax', spaceIndex: 4, flat, percentAmount },
    }
  }
  if (space.kind === 'neighbor' || space.kind === 'wild') {
    const deck = space.kind === 'wild' ? 'wild' : 'neighbor'
    const drawn = drawCard(game, deck)
    const text = (deck === 'wild' ? WILD_TEXTS : NEIGHBOR_TEXTS)[drawn.cardIndex]!
    let next = withMovie(drawn.game, { kind: 'card', deck, text })
    return {
      ...next,
      prompt: { type: 'card', deck, cardIndex: drawn.cardIndex, text },
    }
  }
  if (isDeedSpace(space)) {
    const deed = game.deeds[space.index]!
    if (!deed.ownerTrayId) {
      return {
        ...game,
        prompt: { type: 'buy', spaceIndex: space.index, price: space.price },
      }
    }
    if (deed.ownerTrayId === trayId) {
      return pushLog({ ...game, prompt: null }, `${label} owns ${space.name}.`)
    }
    const owner = game.trays[deed.ownerTrayId]!
    if (rules.jailBlock && owner.inJail) {
      return pushLog({ ...game, prompt: null }, `${space.name}: owner in jail (Jail Block) — no rent.`)
    }
    if (allied(rules, t, owner)) {
      return pushLog({ ...game, prompt: null }, `${label} landed on ally ${space.name} — no rent.`)
    }
    if (deed.mortgaged) {
      return pushLog({ ...game, prompt: null }, `${space.name} is mortgaged — no rent.`)
    }
    let rent = 0
    if (space.kind === 'property') rent = propertyRent(game, space, owner)
    else if (space.kind === 'line') rent = lineRent(game, owner.id) * rentMult
    else rent = worksRent(game, owner.id, diceTotal)
    const ownerLabel = trayName(game, owner.id, names)
    const { game: after, paid } = tryDebit(game, trayId, rent, owner.id, `Rent for ${space.name}`, rules)
    if (!paid) return after
    let next = pushLog(after, `${label} paid ${ownerLabel} ${formatCash(rent)}.`)
    return { ...next, prompt: null }
  }
  return { ...game, prompt: null }
}

function applyCardEffect(
  game: NeighborhoodGame,
  trayId: TrayId,
  deck: 'wild' | 'neighbor',
  cardIndex: number,
  rules: NeighborhoodRules,
  names: Record<string, string>,
): NeighborhoodGame {
  const label = trayName(game, trayId, names)
  let next = { ...game, prompt: null as NbPrompt | null }

  const payBank = (amount: number, reason: string) => {
    const r = tryDebit(next, trayId, amount, rules.jackpot ? 'jackpot' : 'bank', reason, rules)
    next = r.game
    return r.paid
  }

  if (deck === 'wild') {
    switch (cardIndex) {
      case 0: {
        next = moveForward(next, trayId, (40 - next.trays[trayId]!.position) % 40 || 40, rules, true)
        break
      }
      case 1:
        next = moveForward(next, trayId, (24 - next.trays[trayId]!.position + 40) % 40, rules, true)
        next = resolveSpace(next, trayId, rules, names, next.lastDice ? next.lastDice[0] + next.lastDice[1] : 0)
        return returnCard(next, deck, cardIndex)
      case 2:
        next = moveForward(next, trayId, (11 - next.trays[trayId]!.position + 40) % 40, rules, true)
        next = resolveSpace(next, trayId, rules, names, 0)
        return returnCard(next, deck, cardIndex)
      case 3: {
        const dest = nearestIndex(next.trays[trayId]!.position, WORKS_INDEXES)
        next = moveForward(next, trayId, (dest - next.trays[trayId]!.position + 40) % 40, rules, true)
        const deed = next.deeds[dest]!
        if (deed.ownerTrayId && deed.ownerTrayId !== trayId) {
          const [a, b] = rollTwoDice()
          const rent = 10 * (a + b) * 1000
          next = { ...next, lastDice: [a, b] }
          const r = tryDebit(next, trayId, rent, deed.ownerTrayId, 'Works card rent', rules)
          next = r.paid ? pushLog(r.game, `${label} paid works card rent ${formatCash(rent)}.`) : r.game
          if (r.paid) next = { ...next, prompt: null }
          return returnCard(next, deck, cardIndex)
        }
        next = resolveSpace(next, trayId, rules, names, 0)
        return returnCard(next, deck, cardIndex)
      }
      case 4:
      case 5: {
        const dest = nearestIndex(next.trays[trayId]!.position, LINE_INDEXES)
        next = moveForward(next, trayId, (dest - next.trays[trayId]!.position + 40) % 40, rules, true)
        next = resolveSpace(next, trayId, rules, names, 0, 2)
        return returnCard(next, deck, cardIndex)
      }
      case 6:
        next = credit(next, trayId, 50_000)
        next = pushLog(next, `${label} collected ${formatCash(50_000)}.`)
        break
      case 7: {
        const t = next.trays[trayId]!
        next = {
          ...next,
          trays: { ...next.trays, [trayId]: { ...t, jailFreeWild: t.jailFreeWild + 1 } },
        }
        next = pushLog(next, `${label} kept a jail-free note.`)
        return next // stay out of deck
      }
      case 8:
        next = moveBack(next, trayId, 3)
        next = resolveSpace(next, trayId, rules, names, 0)
        return returnCard(next, deck, cardIndex)
      case 9:
        next = sendToJail(next, trayId)
        next = pushLog(next, `${label} goes to Jail.`)
        break
      case 10: {
        const cost = buildingRepairCost(next, trayId, 25_000, 100_000)
        if (!payBank(cost, 'Storm repairs')) return returnCard(next, deck, cardIndex)
        next = pushLog(next, `${label} paid repairs ${formatCash(cost)}.`)
        break
      }
      case 11:
        if (!payBank(15_000, 'Fine')) return returnCard(next, deck, cardIndex)
        next = pushLog(next, `${label} paid ${formatCash(15_000)}.`)
        break
      case 12:
        next = moveForward(next, trayId, (5 - next.trays[trayId]!.position + 40) % 40, rules, true)
        next = resolveSpace(next, trayId, rules, names, 0)
        return returnCard(next, deck, cardIndex)
      case 13:
        next = moveForward(next, trayId, (39 - next.trays[trayId]!.position + 40) % 40, rules, true)
        next = resolveSpace(next, trayId, rules, names, 0)
        return returnCard(next, deck, cardIndex)
      case 14: {
        const others = aliveTrays(next).filter((o) => o.id !== trayId && !allied(rules, next.trays[trayId]!, o))
        for (const o of others) {
          const r = tryDebit(next, trayId, 50_000, o.id, 'Treat the table', rules, {
            silent: true,
          })
          next = r.game
          if (!r.paid) return returnCard(next, deck, cardIndex)
        }
        if (others.length > 0) {
          next = withMovie(next, {
            kind: 'pay-each',
            fromTrayId: trayId,
            toTrayIds: others.map((o) => o.id),
            amountEach: 50_000,
            tone: 'long',
          })
        }
        next = pushLog(next, `${label} treated the table.`)
        break
      }
      case 15:
        next = credit(next, trayId, 150_000)
        next = pushLog(next, `${label} collected ${formatCash(150_000)}.`)
        break
    }
  } else {
    switch (cardIndex) {
      case 0:
      case 1:
        next = credit(next, trayId, 200_000)
        break
      case 2:
        if (!payBank(50_000, 'Clinic')) return returnCard(next, deck, cardIndex)
        break
      case 3:
        next = credit(next, trayId, 50_000)
        break
      case 4: {
        const t = next.trays[trayId]!
        next = {
          ...next,
          trays: { ...next.trays, [trayId]: { ...t, jailFreeNeighbor: t.jailFreeNeighbor + 1 } },
        }
        next = pushLog(next, `${label} kept a jail-free note.`)
        return next
      }
      case 5:
        next = sendToJail(next, trayId)
        break
      case 6:
        next = credit(next, trayId, 100_000)
        break
      case 7:
        next = credit(next, trayId, 20_000)
        break
      case 8: {
        const others = aliveTrays(next).filter((o) => o.id !== trayId && !allied(rules, next.trays[trayId]!, o))
        for (const o of others) {
          const r = tryDebit(next, o.id, 10_000, trayId, 'Your day', rules, { silent: true })
          next = r.game
          if (!r.paid) {
            // if payer can't, leave debt on them — rare in opening
            return returnCard(next, deck, cardIndex)
          }
        }
        if (others.length > 0) {
          next = withMovie(next, {
            kind: 'collect-each',
            trayId,
            fromTrayIds: others.map((o) => o.id),
            amountEach: 10_000,
            tone: 'long',
            reason: 'Your day',
          })
        }
        break
      }
      case 9:
        next = credit(next, trayId, 100_000)
        break
      case 10:
        if (!payBank(100_000, 'Fence')) return returnCard(next, deck, cardIndex)
        break
      case 11:
        if (!payBank(50_000, 'School')) return returnCard(next, deck, cardIndex)
        break
      case 12:
        next = credit(next, trayId, 25_000)
        break
      case 13: {
        const cost = buildingRepairCost(next, trayId, 40_000, 115_000)
        if (!payBank(cost, 'Road work')) return returnCard(next, deck, cardIndex)
        break
      }
      case 14:
        next = credit(next, trayId, 10_000)
        break
      case 15:
        next = credit(next, trayId, 100_000)
        break
    }
    next = pushLog(next, `${label}: ${NEIGHBOR_TEXTS[cardIndex]}`)
  }

  next = returnCard(next, deck, cardIndex)
  if (next.prompt) return next
  // After card, if doubles pending handled by caller
  return next
}

function auctionStep(price: number): number {
  return Math.max(1000, Math.round(price * 0.1 / 1000) * 1000)
}

function nextAuctionTray(game: NeighborhoodGame, from: TrayId): TrayId {
  const alive = game.turnOrder.filter((id) => {
    const t = game.trays[id]
    return t && !t.bankrupt && !t.spectating
  })
  const i = alive.indexOf(from)
  return alive[(i + 1) % alive.length]!
}

export function applyNeighborhoodGameAction(
  game: NeighborhoodGame,
  rules: NeighborhoodRules,
  names: Record<string, string>,
  action:
    | { type: 'opening-roll'; fromId: string; trayId: TrayId }
    | { type: 'roll'; fromId: string; trayId: TrayId }
    | { type: 'buy'; fromId: string; trayId: TrayId }
    | { type: 'decline-buy'; fromId: string; trayId: TrayId }
    | { type: 'tax'; fromId: string; trayId: TrayId; choice: 'flat' | 'percent' }
    | { type: 'ack-card'; fromId: string; trayId: TrayId }
    | { type: 'jail'; fromId: string; trayId: TrayId; choice: 'pay' | 'card' | 'roll' }
    | { type: 'auction-raise'; fromId: string; trayId: TrayId }
    | { type: 'auction-pass'; fromId: string; trayId: TrayId }
    | { type: 'debt-bankrupt'; fromId: string; trayId: TrayId }
    | { type: 'end-turn'; fromId: string; trayId: TrayId },
): NeighborhoodGame {
  if (!canTapTray(game, action.fromId, action.trayId)) return game

  if (action.type === 'opening-roll') {
    if (game.phase !== 'opening') return game
    if (!game.openingNeeds.includes(action.trayId)) return game
    const [a, b] = rollTwoDice()
    const total = a + b
    let next: NeighborhoodGame = {
      ...game,
      lastDice: [a, b],
      openingRolls: { ...game.openingRolls, [action.trayId]: total },
      openingNeeds: game.openingNeeds.filter((id) => id !== action.trayId),
    }
    next = withMovie(
      next,
      { kind: 'dice', faces: [a, b], trayId: action.trayId },
      `${trayName(next, action.trayId, names)} rolled ${a}+${b}=${total}.`,
    )
    if (next.openingNeeds.length > 0) return next

    // resolve winners / ties
    const totals = Object.entries(next.openingRolls).map(([id, v]) => ({ id, v: v ?? 0 }))
    const max = Math.max(...totals.map((t) => t.v))
    const leaders = totals.filter((t) => t.v === max).map((t) => t.id)
    if (leaders.length > 1) {
      return {
        ...next,
        openingNeeds: leaders,
        openingRolls: {
          ...Object.fromEntries(Object.keys(next.trays).map((id) => [id, next.openingRolls[id] ?? null])),
          ...Object.fromEntries(leaders.map((id) => [id, null])),
        },
        log: [`Tie at ${max} — leaders reroll.`, ...next.log].slice(0, LOG_MAX),
      }
    }
    const start = leaders[0]!
    // Clockwise from starter by join order of turnOrder keys
    const order = Object.keys(next.trays)
    const startIdx = order.indexOf(start)
    const turnOrder = [...order.slice(startIdx), ...order.slice(0, startIdx)]
    let playing: NeighborhoodGame = {
      ...next,
      phase: 'playing',
      turnOrder,
      turnIndex: 0,
      openingNeeds: [],
      lastDice: null,
    }
    playing = dealStartingDeeds(playing, rules, names)
    return pushLog(playing, `${trayName(playing, start, names)} goes first.`)
  }

  if (game.phase !== 'playing') return game
  const turn = currentTrayId(game)
  if (!turn) return game

  // Debt can be acted by the indebted tray even mid-prompt
  if (action.type === 'debt-bankrupt') {
    if (game.prompt?.type !== 'debt') return game
    if (action.trayId !== turn && game.prompt) {
      // allow the debtor tray — find who owes: current turn usually
    }
    if (action.trayId !== turn) return game
    let next = bankruptTray(game, action.trayId, game.prompt.toTrayId, rules, names)
    next = finishIfNeeded(next, rules)
    if (next.phase === 'finished') return next
    return endTurn(next)
  }

  if (game.prompt?.type === 'auction') {
    if (action.trayId !== game.prompt.turnTrayId) return game
    if (action.type === 'auction-raise') {
      const step = game.prompt.step
      const newPrice = game.prompt.highTrayId == null ? step : game.prompt.price + step
      const t = game.trays[action.trayId]!
      if (t.cash < newPrice) return game
      return {
        ...game,
        prompt: {
          ...game.prompt,
          price: newPrice,
          highTrayId: action.trayId,
          turnTrayId: nextAuctionTray(game, action.trayId),
        },
      }
    }
    if (action.type === 'auction-pass') {
      const prompt = game.prompt
      const nextTurn = nextAuctionTray(game, action.trayId)
      // full round of passes after a bid: if next is high bidder, sell
      if (prompt.highTrayId && nextTurn === prompt.highTrayId) {
        return buyDeed(game, prompt.highTrayId, prompt.spaceIndex, prompt.price, names, true)
      }
      if (!prompt.highTrayId && nextTurn === turn) {
        // everyone passed with no bid
        let next = pushLog({ ...game, prompt: null }, `${spaceAt(prompt.spaceIndex).name} stays with the bank.`)
        return afterRollContinue(next, Boolean(game.lastDice && game.lastDice[0] === game.lastDice[1] && !game.usedJailDoubles))
      }
      return {
        ...game,
        prompt: { ...prompt, turnTrayId: nextTurn },
      }
    }
    return game
  }

  if (game.prompt) {
    if (action.trayId !== turn) return game
    if (action.type === 'buy' && game.prompt.type === 'buy') {
      return buyDeed(game, turn, game.prompt.spaceIndex, game.prompt.price, names, false)
    }
    if (action.type === 'decline-buy' && game.prompt.type === 'buy') {
      if (rules.noAuctions) {
        let next = pushLog({ ...game, prompt: null }, `${spaceAt(game.prompt.spaceIndex).name} stays with the bank.`)
        const doubles = Boolean(game.lastDice && game.lastDice[0] === game.lastDice[1])
        return afterRollContinue(next, doubles && !game.usedJailDoubles)
      }
      const step = auctionStep(game.prompt.price)
      const first = nextAuctionTray(game, turn)
      return {
        ...game,
        prompt: {
          type: 'auction',
          spaceIndex: game.prompt.spaceIndex,
          price: 0,
          highTrayId: null,
          turnTrayId: first,
          step,
        },
      }
    }
    if (action.type === 'tax' && game.prompt.type === 'tax') {
      const amount = action.choice === 'flat' ? game.prompt.flat : game.prompt.percentAmount
      const { game: paid, paid: ok } = tryDebit(
        game,
        turn,
        amount,
        rules.jackpot ? 'jackpot' : 'bank',
        'Town Tax',
        rules,
      )
      if (!ok) return paid
      let next = pushLog({ ...paid, prompt: null }, `${trayName(paid, turn, names)} paid Town Tax ${formatCash(amount)}.`)
      const doubles = Boolean(game.lastDice && game.lastDice[0] === game.lastDice[1])
      return afterRollContinue(next, doubles && !game.usedJailDoubles)
    }
    if (action.type === 'ack-card' && game.prompt.type === 'card') {
      let next = applyCardEffect(game, turn, game.prompt.deck, game.prompt.cardIndex, rules, names)
      if (next.prompt) return next
      if (next.trays[turn]?.inJail) return endTurn(next)
      const doubles = Boolean(next.lastDice && next.lastDice[0] === next.lastDice[1])
      return afterRollContinue(next, doubles && !next.usedJailDoubles)
    }
    if (action.type === 'jail' && game.prompt.type === 'jail') {
      return handleJailChoice(game, turn, action.choice, rules, names)
    }
    return game
  }

  // Jail before roll
  const tray = game.trays[turn]!
  if (tray.inJail && action.type === 'roll') {
    const canUseCard = tray.jailFreeWild + tray.jailFreeNeighbor > 0
    const mustPay = tray.jailTurns >= 2
    return {
      ...game,
      prompt: { type: 'jail', canUseCard, mustPay },
    }
  }

  if (action.type === 'jail' && tray.inJail) {
    return handleJailChoice(game, turn, action.choice, rules, names)
  }

  if (action.type === 'roll') {
    if (action.trayId !== turn) return game
    if (tray.inJail) {
      return {
        ...game,
        prompt: {
          type: 'jail',
          canUseCard: tray.jailFreeWild + tray.jailFreeNeighbor > 0,
          mustPay: tray.jailTurns >= 2,
        },
      }
    }
    const [a, b] = rollTwoDice()
    const doubles = a === b
    let doublesCount = doubles ? game.doublesCount + 1 : 0
    let next: NeighborhoodGame = {
      ...game,
      lastDice: [a, b],
      doublesCount,
    }
    next = withMovie(
      next,
      { kind: 'dice', faces: [a, b], trayId: turn },
      `${trayName(next, turn, names)} rolled ${a}+${b}.`,
    )
    if (doublesCount >= 3) {
      next = sendToJail(next, turn)
      next = pushLog(next, `${trayName(next, turn, names)} rolled three doubles — Jail.`)
      return endTurn(next)
    }
    next = moveForward(next, turn, a + b, rules, true)
    next = resolveSpace(next, turn, rules, names, a + b)
    if (next.prompt) return next
    return afterRollContinue(next, doubles)
  }

  if (action.type === 'end-turn') {
    if (action.trayId !== turn) return game
    return endTurn(game)
  }

  return game
}

function buyDeed(
  game: NeighborhoodGame,
  trayId: TrayId,
  spaceIndex: number,
  price: number,
  names: Record<string, string>,
  fromAuction: boolean,
): NeighborhoodGame {
  const t = game.trays[trayId]!
  if (t.cash < price) return game
  const space = spaceAt(spaceIndex)
  let next: NeighborhoodGame = {
    ...game,
    prompt: null,
    trays: {
      ...game.trays,
      [trayId]: { ...t, cash: t.cash - price },
    },
    deeds: {
      ...game.deeds,
      [spaceIndex]: { ...game.deeds[spaceIndex]!, ownerTrayId: trayId, mortgaged: false },
    },
  }
  next = withMovie(
    next,
    { kind: 'buy', trayId, spaceIndex },
    `${trayName(next, trayId, names)} bought ${space.name} for ${formatCash(price)}${fromAuction ? ' (auction)' : ''}.`,
  )
  const doubles = Boolean(
    game.lastDice && game.lastDice[0] === game.lastDice[1] && !game.usedJailDoubles,
  )
  return afterRollContinue(next, doubles)
}

function handleJailChoice(
  game: NeighborhoodGame,
  trayId: TrayId,
  choice: 'pay' | 'card' | 'roll',
  rules: NeighborhoodRules,
  names: Record<string, string>,
): NeighborhoodGame {
  const t = game.trays[trayId]!
  if (!t.inJail) return game
  const label = trayName(game, trayId, names)

  if (choice === 'card') {
    const reserved = reservedForTray(game, trayId)
    const freeWild = t.jailFreeWild - reserved.jailFreeWild
    const freeNeighbor = t.jailFreeNeighbor - reserved.jailFreeNeighbor
    if (freeWild + freeNeighbor <= 0) return game
    let trays = { ...game.trays }
    let wildDeck = game.wildDeck
    let neighborDeck = game.neighborDeck
    if (freeWild > 0) {
      trays[trayId] = { ...t, jailFreeWild: t.jailFreeWild - 1, inJail: false, jailTurns: 0 }
      wildDeck = [...wildDeck, 7]
    } else {
      trays[trayId] = { ...t, jailFreeNeighbor: t.jailFreeNeighbor - 1, inJail: false, jailTurns: 0 }
      neighborDeck = [...neighborDeck, 4]
    }
    let next: NeighborhoodGame = { ...game, prompt: null, trays, wildDeck, neighborDeck }
    next = pushLog(next, `${label} used a jail-free note.`)
    // must still roll to move
    const [a, b] = rollTwoDice()
    next = { ...next, lastDice: [a, b], doublesCount: 0, usedJailDoubles: a === b }
    next = moveForward(next, trayId, a + b, rules, true)
    next = resolveSpace(next, trayId, rules, names, a + b)
    if (next.prompt) return next
    // doubles from leaving jail do not grant another roll
    return endTurn(next)
  }

  if (choice === 'pay' || (choice === 'roll' && t.jailTurns >= 2)) {
    const { game: paid, paid: ok } = tryDebit(game, trayId, JAIL_FEE, rules.jackpot ? 'jackpot' : 'bank', 'Jail fee', rules)
    if (!ok) return paid
    let next: NeighborhoodGame = {
      ...paid,
      prompt: null,
      trays: {
        ...paid.trays,
        [trayId]: { ...paid.trays[trayId]!, inJail: false, jailTurns: 0 },
      },
    }
    next = pushLog(next, `${label} paid ${formatCash(JAIL_FEE)} to leave Jail.`)
    const [a, b] = rollTwoDice()
    next = { ...next, lastDice: [a, b], usedJailDoubles: a === b }
    next = moveForward(next, trayId, a + b, rules, true)
    next = resolveSpace(next, trayId, rules, names, a + b)
    if (next.prompt) return next
    return endTurn(next)
  }

  // try doubles
  const [a, b] = rollTwoDice()
  let next: NeighborhoodGame = { ...game, lastDice: [a, b], prompt: null }
  next = pushLog(next, `${label} rolled ${a}+${b} in Jail.`)
  if (a === b) {
    next = {
      ...next,
      trays: {
        ...next.trays,
        [trayId]: { ...next.trays[trayId]!, inJail: false, jailTurns: 0 },
      },
      usedJailDoubles: true,
    }
    next = moveForward(next, trayId, a + b, rules, true)
    next = resolveSpace(next, trayId, rules, names, a + b)
    if (next.prompt) return next
    return endTurn(next)
  }
  const turns = t.jailTurns + 1
  next = {
    ...next,
    trays: { ...next.trays, [trayId]: { ...t, jailTurns: turns } },
  }
  if (turns >= 3) {
    // must pay — recursive
    return handleJailChoice(next, trayId, 'pay', rules, names)
  }
  return endTurn(next)
}

function bankruptTray(
  game: NeighborhoodGame,
  trayId: TrayId,
  to: TrayId | 'bank' | 'jackpot',
  rules: NeighborhoodRules,
  names: Record<string, string>,
): NeighborhoodGame {
  const t = game.trays[trayId]!
  let next = game
  const cash = t.cash
  if (cash > 0) {
    if (to === 'jackpot' || (to === 'bank' && rules.jackpot)) {
      next = { ...next, jackpot: next.jackpot + cash }
    } else if (to !== 'bank') {
      next = credit(next, to, cash)
    }
  }
  const deeds = { ...next.deeds }
  for (const [idx, d] of Object.entries(deeds)) {
    if (d.ownerTrayId !== trayId) continue
    if (to !== 'bank' && to !== 'jackpot') {
      deeds[Number(idx)] = { ...d, ownerTrayId: to }
    } else {
      deeds[Number(idx)] = emptyDeed()
    }
  }
  let wildDeck = next.wildDeck
  let neighborDeck = next.neighborDeck
  for (let i = 0; i < t.jailFreeWild; i++) wildDeck = [...wildDeck, 7]
  for (let i = 0; i < t.jailFreeNeighbor; i++) neighborDeck = [...neighborDeck, 4]
  next = {
    ...next,
    prompt: null,
    deeds,
    wildDeck,
    neighborDeck,
    trays: {
      ...next.trays,
      [trayId]: {
        ...t,
        cash: 0,
        jailFreeWild: 0,
        jailFreeNeighbor: 0,
        bankrupt: true,
        spectating: true,
        inJail: false,
        position: t.position,
      },
    },
  }
  next = pushLog(next, `${trayName(next, trayId, names)} is out.`)
  if (endsOnFirstBankruptcy(rules)) {
    return finishOnFirstBankruptcy(next)
  }
  return finishIfNeeded(next, rules)
}
