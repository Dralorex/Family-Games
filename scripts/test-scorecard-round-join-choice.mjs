/**
 * Mid-round This Round / Next Round join choice.
 * Run: npx --yes tsx scripts/test-scorecard-round-join-choice.mjs
 */
import assert from 'node:assert/strict'
import { allScoresEntered, missingScorePlayerIds } from '../src/core/score/engine.ts'
import { createScorecardRoom } from '../src/rooms/factory.ts'
import { applyAction } from '../src/rooms/reducer.ts'

const host = { id: 'h1', name: 'Host', joinedAt: 1, sessionId: 's1' }
let room = createScorecardRoom({
  code: 'CHOIC',
  host,
  templateId: 'play-9',
})

room = applyAction(room, {
  type: 'join',
  player: { id: 'p2', name: 'Pat', joinedAt: 2, sessionId: 's2' },
})
room = applyAction(room, { type: 'start-scorecard', fromId: 'h1' })
room = applyAction(room, {
  type: 'set-score',
  fromId: 'h1',
  targetPlayerId: 'h1',
  round: 1,
  value: 10,
})
room = applyAction(room, {
  type: 'set-score',
  fromId: 'p2',
  targetPlayerId: 'p2',
  round: 1,
  value: 40,
})
room = applyAction(room, { type: 'next-round', fromId: 'h1' })
assert.equal(room.currentRound, 2)
assert.equal(room.completedRounds, 1)

// Mid-game own-phone join → must choose
room = applyAction(room, {
  type: 'join',
  player: { id: 'p3', name: 'New', joinedAt: 3, sessionId: 's3' },
})
assert.equal(room.players.p3.needsRoundJoinChoice, true)
assert.equal(room.scores.p3?.[1], 40, 'copies last-place (Pat) for completed rounds')
assert.equal(room.scores.p3?.[2], undefined)

// Next Round → deferred, not missing for readiness
room = applyAction(room, {
  type: 'set-round-join-choice',
  fromId: 'p3',
  targetPlayerId: 'p3',
  choice: 'next-round',
})
assert.equal(room.players.p3.joinNextRound, true)
assert.equal(room.players.p3.needsRoundJoinChoice, false)
assert.ok(!missingScorePlayerIds(Object.values(room.players), room.scores, 2).includes('p3'))

room = applyAction(room, {
  type: 'set-score',
  fromId: 'h1',
  targetPlayerId: 'h1',
  round: 2,
  value: 5,
})
room = applyAction(room, {
  type: 'set-score',
  fromId: 'p2',
  targetPlayerId: 'p2',
  round: 2,
  value: 12,
})
assert.ok(allScoresEntered(Object.values(room.players), room.scores, 2))

room = applyAction(room, { type: 'next-round', fromId: 'h1' })
assert.equal(room.currentRound, 3)
assert.equal(room.scores.p3?.[2], 12, 'got worst (highest for low-win) of round 2')
assert.equal(room.players.p3.joinNextRound, false)

// Add-on-device This Round
room = applyAction(room, {
  type: 'add-player',
  fromId: 'h1',
  player: { id: 'p4', name: 'Buddy', joinedAt: 4 },
})
assert.equal(room.players.p4.needsRoundJoinChoice, true)
room = applyAction(room, {
  type: 'set-round-join-choice',
  fromId: 'h1',
  targetPlayerId: 'p4',
  choice: 'this-round',
})
assert.equal(room.players.p4.needsRoundJoinChoice, false)
room = applyAction(room, {
  type: 'set-score',
  fromId: 'h1',
  targetPlayerId: 'p4',
  round: 3,
  value: 7,
})
assert.equal(room.scores.p4?.[3], 7)

// Leave + rejoin → ask again
room = applyAction(room, { type: 'leave', playerId: 'p2' })
assert.equal(room.players.p2.left, true)
room = applyAction(room, {
  type: 'rejoin',
  name: 'Pat',
  playerId: 'p2b',
  sessionId: 's2b',
})
assert.equal(room.players.p2b.needsRoundJoinChoice, true)
room = applyAction(room, {
  type: 'set-round-join-choice',
  fromId: 'p2b',
  targetPlayerId: 'p2b',
  choice: 'next-round',
})
assert.equal(room.players.p2b.joinNextRound, true)

console.log('OK scorecard round join choice')
