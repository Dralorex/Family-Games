/**
 * Scorecards have no 6-player cap — host can seat 8+ via joins.
 * Run: npx --yes tsx scripts/test-scorecard-many-joins.mjs
 */
import assert from 'node:assert/strict'
import { createScorecardRoom } from '../src/rooms/factory.ts'
import { applyAction } from '../src/rooms/reducer.ts'

const host = { id: 'h1', name: 'Host', joinedAt: 1, sessionId: 's1' }
let room = createScorecardRoom({
  code: 'JOINX',
  host,
  templateId: 'play-9',
})

for (let i = 2; i <= 8; i++) {
  room = applyAction(room, {
    type: 'join',
    player: {
      id: `p${i}`,
      name: `Player${i}`,
      joinedAt: i,
      sessionId: `s${i}`,
    },
  })
}

const active = Object.values(room.players).filter((p) => !p.left)
assert.equal(active.length, 8, 'expected 8 seats after joins')

// Idempotent re-join of an existing id does not duplicate
room = applyAction(room, {
  type: 'join',
  player: {
    id: 'p5',
    name: 'Player5',
    joinedAt: 5,
    sessionId: 's5-retry',
  },
})
assert.equal(Object.keys(room.players).length, 8)
assert.equal(room.players.p5.sessionId, 's5-retry')

console.log('OK scorecard many joins', active.map((p) => p.name).join(', '))
