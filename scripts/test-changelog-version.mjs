/**
 * Update versions count on their own line — not from the PR number.
 * Run: npx --yes tsx scripts/test-changelog-version.mjs
 */
import assert from 'node:assert/strict'
import { nextPatchVersion } from '../src/updates/changelog.ts'

assert.equal(nextPatchVersion(null), '0.0.1')
assert.equal(nextPatchVersion('0.0.20'), '0.0.21')
assert.equal(nextPatchVersion('0.1.0'), '0.1.1')
assert.equal(nextPatchVersion('0.1.3'), '0.1.4')
assert.equal(nextPatchVersion('1.0.0'), '1.0.1')
assert.equal(nextPatchVersion('1'), '1.0.1')

console.log('OK changelog versions')
