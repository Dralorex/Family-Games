/**
 * Neighborhood Slice A+B smoke via tsx.
 * Run: npx --yes tsx scripts/test-neighborhood-lobby.mjs
 */
import assert from 'node:assert/strict'
import { createNeighborhoodRoom } from '../src/rooms/factory.ts'
import { applyAction, neighborhoodLobbyReady } from '../src/rooms/reducer.ts'
import { defaultNeighborhoodRules } from '../src/core/neighborhood/types.ts'

const host = { id: 'h1', name: 'Host', joinedAt: 1, sessionId: 's1' }
let room = createNeighborhoodRoom({
  code: 'ABCDE',
  host,
  rules: defaultNeighborhoodRules({ teamStyle: 'off' }),
})
assert.equal(room.kind, 'neighborhood')
assert.equal(room.rulesLocked, false)

room = applyAction(room, {
  type: 'join',
  player: { id: 'p2', name: 'Kid', joinedAt: 2, sessionId: 's2' },
})
assert.equal(Object.keys(room.players).length, 2)

room = applyAction(room, { type: 'set-neighborhood-piece', fromId: 'h1', pieceId: 'fox' })
room = applyAction(room, { type: 'set-neighborhood-piece', fromId: 'p2', pieceId: 'owl' })
assert.equal(neighborhoodLobbyReady(room), true)

room = applyAction(room, { type: 'start-neighborhood', fromId: 'h1' })
assert.equal(room.status, 'playing')
assert.equal(room.rulesLocked, true)
assert.ok(room.game)
assert.equal(room.game.phase, 'opening')
assert.equal(Object.keys(room.game.trays).length, 2)

room = applyAction(room, { type: 'nb-opening-roll', fromId: 'h1' })
room = applyAction(room, { type: 'nb-opening-roll', fromId: 'p2' })
// ties may require more rolls — keep rolling until playing
let guard = 0
while (room.game.phase === 'opening' && guard < 20) {
  for (const tid of room.game.openingNeeds) {
    const member = room.game.trays[tid].memberIds[0]
    room = applyAction(room, { type: 'nb-opening-roll', fromId: member })
  }
  guard++
}
assert.equal(room.game.phase, 'playing')
assert.ok(room.game.turnOrder.length >= 2)

const turnTray = room.game.turnOrder[room.game.turnIndex]
const roller = room.game.trays[turnTray].memberIds[0]
room = applyAction(room, { type: 'nb-roll', fromId: roller })
assert.ok(room.game.lastDice || room.game.prompt || room.game.log.length > 1)

console.log('OK neighborhood Slice A+B')
