import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decideRelease } from './release-gate.mjs'

test('one blocked P0 prevents enabling writes', () => {
  const report = decideRelease([
    { id: 'hwp-master', format: 'hwp', status: 'BLOCK', severity: 'P0' },
    { id: 'doc-basic', format: 'docx', status: 'PASS', severity: 'P2' },
  ])
  assert.equal(report.safeToEnableWrites, false)
  assert.deepEqual(report.blockedCaseIds, ['hwp-master'])
  assert.equal(report.byFormat.hwp.safeToEnableWrites, false)
  assert.equal(report.byFormat.docx.safeToEnableWrites, true)
})

test('untested and limited cases cannot be promoted to a PASS', () => {
  const report = decideRelease([
    { id: 'needs-reopen', format: 'pptx', status: 'NOT RUN', severity: 'P1' },
    { id: 'partial', format: 'pdf', status: 'LIMITED', severity: 'P1' },
  ])
  assert.equal(report.safeToEnableWrites, false)
  assert.deepEqual(report.blockedCaseIds, ['needs-reopen', 'partial'])
  assert.equal(report.byFormat.pdf.safeToEnableWrites, false)
})
