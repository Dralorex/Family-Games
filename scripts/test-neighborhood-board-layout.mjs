/**
 * Verify Neighborhood visual ring is clockwise from Home (bottom-right).
 * Run: npx --yes tsx scripts/test-neighborhood-board-layout.mjs
 */
import assert from 'node:assert/strict'
import { boardPathIsClockwise, cellForIndex } from '../src/core/neighborhood/board.ts'

assert.equal(boardPathIsClockwise(), true)

const home = cellForIndex(0)
assert.deepEqual(home, { col: 11, row: 11 }, 'Home is bottom-right')

const jail = cellForIndex(10)
assert.deepEqual(jail, { col: 1, row: 11 }, 'Jail is bottom-left')

const square = cellForIndex(20)
assert.deepEqual(square, { col: 1, row: 1 }, 'Town Square is top-left')

const gotoJail = cellForIndex(30)
assert.deepEqual(gotoJail, { col: 11, row: 1 }, 'Sent to Jail is top-right')

// Roll 7 from Home stays on the bottom edge, moving left
const afterSeven = cellForIndex(7)
assert.equal(afterSeven.row, 11)
assert.equal(afterSeven.col, 4)

console.log('OK neighborhood board layout')
