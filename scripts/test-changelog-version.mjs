/**
 * Update versions count on their own line — not from the PR number.
 * Run: npx --yes tsx scripts/test-changelog-version.mjs
 */
import assert from 'node:assert/strict'
import {
  nextMajorVersion,
  nextMinorVersion,
  nextPatchVersion,
} from '../src/updates/changelog.ts'

assert.equal(nextPatchVersion(null), '0.0.1')
assert.equal(nextPatchVersion('0.0.20'), '0.0.21')
assert.equal(nextPatchVersion('0.2.0'), '0.2.1')
assert.equal(nextPatchVersion('1.4.0'), '1.4.1')
assert.equal(nextPatchVersion('1'), '1.0.1')

assert.equal(nextMinorVersion('0.0.20'), '0.1.0')
assert.equal(nextMinorVersion('0.1.7'), '0.2.0')
assert.equal(nextMinorVersion('1.3.4'), '1.4.0')
assert.equal(nextPatchVersion(nextMinorVersion('0.0.20')), '0.1.1')

assert.equal(nextMajorVersion('0.0.20'), '1.0.0')
assert.equal(nextMajorVersion('0.4.2'), '1.0.0')
assert.equal(nextMajorVersion('1.8.6'), '2.0.0')
assert.equal(nextPatchVersion(nextMajorVersion('1.8.6')), '2.0.1')

console.log('OK changelog versions')
