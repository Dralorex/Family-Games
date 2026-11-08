/**
 * Slice A smoke via tsx.
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

const blocked = applyAction(room, { type: 'set-neighborhood-piece', fromId: 'h1', pieceId: 'kite' })
assert.equal(blocked.pieces.h1, 'fox')

// Shared tray: two on tray 1 share fox; tray 2 owl; start
let shared = createNeighborhoodRoom({
  code: 'SHARE',
  host,
  rules: defaultNeighborhoodRules({ teamStyle: 'shared' }),
})
shared = applyAction(shared, {
  type: 'join',
  player: { id: 'p2', name: 'Kid', joinedAt: 2, sessionId: 's2' },
})
shared = applyAction(shared, {
  type: 'join',
  player: { id: 'p3', name: 'Pat', joinedAt: 3, sessionId: 's3' },
})
shared = applyAction(shared, { type: 'set-neighborhood-team', fromId: 'h1', teamId: '1' })
shared = applyAction(shared, { type: 'set-neighborhood-team', fromId: 'p2', teamId: '1' })
shared = applyAction(shared, { type: 'set-neighborhood-team', fromId: 'p3', teamId: '2' })
shared = applyAction(shared, { type: 'set-neighborhood-piece', fromId: 'h1', pieceId: 'fox' })
// p2 inherits/must match tray piece
shared = applyAction(shared, { type: 'set-neighborhood-piece', fromId: 'p2', pieceId: 'fox' })
shared = applyAction(shared, { type: 'set-neighborhood-piece', fromId: 'p3', pieceId: 'owl' })
assert.equal(neighborhoodLobbyReady(shared), true)

console.log('OK neighborhood lobby Slice A')
