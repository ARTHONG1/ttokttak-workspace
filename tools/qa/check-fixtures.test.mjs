import { test } from 'node:test'
import assert from 'node:assert/strict'
import { inspectFixtures } from './check-fixtures.mjs'

test('independent parsers can inspect all six golden fixtures', async () => {
  const cases = await inspectFixtures()
  assert.equal(cases.length, 6)
  for (const c of cases) {
    assert.equal(c.structural.unreadable, false, JSON.stringify(c))
    assert.deepEqual(c.structural.unexpectedRemovals, [], c.id)
    assert.equal(c.status, 'LIMITED') // no actual edit or external reopen
  }
})
