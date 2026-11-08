/**
 * Neighborhood rule-fix smoke (starting deeds, closest cover, hotel sell-back,
 * straight hotel, equity / winMode).
 * Run: npx --yes tsx scripts/test-neighborhood-rules-f.mjs
 */
import assert from 'node:assert/strict'
import {
  applyBuild,
  applySellBuilding,
  buildingSupplyLeft,
  buildCost,
  canBuildOn,
  sellBuildingRefund,
  trayEquity,
} from '../src/core/neighborhood/economy.ts'
import { findClosestCover } from '../src/core/neighborhood/closestCover.ts'
import {
  defaultNeighborhoodRules,
  endsOnFirstBankruptcy,
} from '../src/core/neighborhood/types.ts'
import { dealStartingDeeds } from '../src/core/neighborhood/startingDeeds.ts'
import { initNeighborhoodGame } from '../src/core/neighborhood/engine.ts'
import { createNeighborhoodRoom } from '../src/rooms/factory.ts'
import { applyAction } from '../src/rooms/reducer.ts'

const rules = defaultNeighborhoodRules({
  teamStyle: 'off',
  buildingSupply: 'scarce',
  startingDeeds: 2,
  winMode: 'first-bankruptcy',
})

assert.equal(rules.winMode, 'first-bankruptcy')
assert.equal(endsOnFirstBankruptcy(rules), true)
assert.equal(endsOnFirstBankruptcy(defaultNeighborhoodRules({ teamStyle: 'off' })), false)

function blankGame(overrides = {}) {
  return {
    phase: 'playing',
    trays: {
      a: {
        id: 'a',
        memberIds: ['a'],
        pieceId: 'fox',
        cash: 1_000_000,
        position: 0,
        inJail: false,
        jailTurns: 0,
        jailFreeWild: 0,
        jailFreeNeighbor: 0,
        bankrupt: false,
        spectating: false,
      },
    },
    turnOrder: ['a'],
    turnIndex: 0,
    openingRolls: {},
    openingNeeds: [],
    doublesCount: 0,
    lastDice: null,
    usedJailDoubles: false,
    prompt: null,
    deeds: {
      1: { ownerTrayId: 'a', houses: 0, hotel: true, mortgaged: false },
      3: { ownerTrayId: 'a', houses: 0, hotel: false, mortgaged: false },
    },
    jackpot: 0,
    wildDeck: [],
    neighborDeck: [],
    lastEventId: 0,
    log: [],
    cinematics: [],
    winnerTrayIds: [],
    turnsTaken: 0,
    awayAt: {},
    joinRequests: [],
    ...overrides,
  }
}

{
  const deeds = {
    1: { ownerTrayId: 'a', houses: 0, hotel: true, mortgaged: false },
    3: { ownerTrayId: 'a', houses: 0, hotel: false, mortgaged: false },
    6: { ownerTrayId: 'a', houses: 4, hotel: false, mortgaged: false },
    8: { ownerTrayId: 'a', houses: 4, hotel: false, mortgaged: false },
    9: { ownerTrayId: 'a', houses: 4, hotel: false, mortgaged: false },
    11: { ownerTrayId: 'a', houses: 2, hotel: false, mortgaged: false },
  }
  const g = blankGame({ deeds })
  assert.equal(buildingSupplyLeft(g, rules).houses, 2)
  const refund = sellBuildingRefund(g, 1, rules)
  const sold = applySellBuilding(g, 'a', 1, rules)
  assert.ok(sold)
  assert.equal(sold.deeds[1].hotel, false)
  assert.equal(sold.deeds[1].houses, 2)
  assert.equal(sold.trays.a.cash - g.trays.a.cash, refund)
  // half of 50k × 3 steps = 75k
  assert.equal(refund, 75_000)
  console.log('hotel sell-back OK')
}

{
  const deeds = {
    6: { ownerTrayId: 'b', houses: 4, hotel: false, mortgaged: false },
    8: { ownerTrayId: 'b', houses: 4, hotel: false, mortgaged: false },
    9: { ownerTrayId: 'b', houses: 4, hotel: false, mortgaged: false },
    11: { ownerTrayId: 'b', houses: 4, hotel: false, mortgaged: false },
    1: { ownerTrayId: 'a', houses: 0, hotel: false, mortgaged: false },
    3: { ownerTrayId: 'a', houses: 0, hotel: false, mortgaged: false },
  }
  const g = blankGame({
    deeds,
    trays: {
      a: blankGame().trays.a,
      b: { ...blankGame().trays.a, id: 'b', memberIds: ['b'], pieceId: 'owl', cash: 0 },
    },
  })
  assert.equal(buildingSupplyLeft(g, rules).houses, 0)
  assert.ok(buildingSupplyLeft(g, rules).hotels > 0)
  assert.equal(canBuildOn(g, 'a', 1, rules), true)
  const cost = buildCost(g, 1, rules)
  assert.equal(cost, 250_000) // 5 × 50k
  const built = applyBuild(g, 'a', 1, rules)
  assert.ok(built)
  assert.equal(built.deeds[1].hotel, true)
  assert.equal(built.deeds[1].houses, 0)
  console.log('straight hotel OK')
}

{
  // Include full color sets so bareDeedIndexes accepts them; plus lines (always bare)
  const deeds = {
    1: { ownerTrayId: 'a', houses: 0, hotel: false, mortgaged: false },
    3: { ownerTrayId: 'a', houses: 0, hotel: false, mortgaged: false },
    5: { ownerTrayId: 'a', houses: 0, hotel: false, mortgaged: false }, // South Line 200k
    6: { ownerTrayId: 'a', houses: 0, hotel: false, mortgaged: false },
    8: { ownerTrayId: 'a', houses: 0, hotel: false, mortgaged: false },
    9: { ownerTrayId: 'a', houses: 0, hotel: false, mortgaged: false },
  }
  const g = blankGame({
    trays: { a: { ...blankGame().trays.a, cash: 100_000 } },
    deeds,
  })
  // Exact 160k: 120k deed + 40k cash (1 deed, less cash) beats 60k+100k cash
  const plan = findClosestCover(g, 'a', 160_000)
  assert.equal(plan.stillShort, false)
  assert.equal(plan.total, 160_000)
  assert.equal(plan.deeds.length, 1)
  assert.equal(plan.cash, 40_000)
  // Exact cash alone beats a matching deed (fewer deeds)
  const cashOnly = findClosestCover(g, 'a', 100_000)
  assert.equal(cashOnly.stillShort, false)
  assert.equal(cashOnly.total, 100_000)
  assert.equal(cashOnly.deeds.length, 0)
  assert.equal(cashOnly.cash, 100_000)
  // Without cash, exact 100k light-blue deed
  const g2 = blankGame({
    trays: { a: { ...blankGame().trays.a, cash: 0 } },
    deeds,
  })
  const deedOnly = findClosestCover(g2, 'a', 100_000)
  assert.equal(deedOnly.cash, 0)
  assert.equal(deedOnly.deeds.length, 1)
  assert.equal(deedOnly.total, 100_000)
  console.log('closest cover OK')
}

{
  const g = initNeighborhoodGame(
    [
      { playerId: 'p1', pieceId: 'fox' },
      { playerId: 'p2', pieceId: 'owl' },
    ],
    rules,
  )
  const dealt = dealStartingDeeds(g, rules, { p1: 'Ann', p2: 'Bob' })
  const owned = Object.values(dealt.deeds).filter((d) => d.ownerTrayId).length
  assert.equal(owned, 4)
  assert.ok(dealt.trays.p1.cash < 1_500_000)
  assert.ok(dealt.trays.p2.cash < 1_500_000)
  console.log('starting deeds OK')
}

{
  const g = blankGame()
  assert.ok(trayEquity(g, 'a') > g.trays.a.cash)
  console.log('equity OK')
}

{
  const host = { id: 'h1', name: 'Host', joinedAt: 1, sessionId: 's1' }
  let room = createNeighborhoodRoom({
    code: 'FFFFF',
    host,
    rules,
  })
  room = applyAction(room, {
    type: 'join',
    player: { id: 'p2', name: 'Kid', joinedAt: 2, sessionId: 's2' },
  })
  room = applyAction(room, { type: 'set-neighborhood-piece', fromId: 'h1', pieceId: 'fox' })
  room = applyAction(room, { type: 'set-neighborhood-piece', fromId: 'p2', pieceId: 'owl' })
  room = applyAction(room, { type: 'start-neighborhood', fromId: 'h1' })
  let guard = 0
  while (room.game.phase === 'opening' && guard < 20) {
    for (const tid of room.game.openingNeeds) {
      const member = room.game.trays[tid].memberIds[0]
      room = applyAction(room, { type: 'nb-opening-roll', fromId: member })
    }
    guard++
  }
  assert.equal(room.game.phase, 'playing')
  const owned = Object.values(room.game.deeds).filter((d) => d.ownerTrayId).length
  assert.equal(owned, 4)
  assert.equal(room.rules.winMode, 'first-bankruptcy')
  console.log('opening deal via room OK')
}

console.log('OK neighborhood rule fixes')
