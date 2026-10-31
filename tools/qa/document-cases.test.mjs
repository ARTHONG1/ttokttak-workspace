import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadCases } from './document-cases.mjs'

test('manifest contains six real, hashed format cases', async () => {
  const cases = await loadCases()
  assert.deepEqual(cases.map((c) => c.format).sort(), [
    'docx',
    'hwp',
    'hwpx',
    'pdf',
    'pptx',
    'xlsx',
  ])
  for (const c of cases) {
    assert.match(c.hash, /^[a-f0-9]{64}$/)
    assert.ok(c.features.length && c.expectedEdits.length)
  }
})

test('missing or tampered fixtures are rejected', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'qa-cases-'))
  try {
    const source = join(dir, 'changed.docx')
    await writeFile(source, 'tampered')
    await assert.rejects(
      loadCases([
        {
          id: 'tampered',
          format: 'docx',
          source,
          hash: 'a'.repeat(64),
          features: ['table'],
          expectedEdits: ['text'],
        },
      ]),
      /hash/i,
    )
    await assert.rejects(
      loadCases([
        {
          id: 'missing',
          format: 'docx',
          source: join(dir, 'absent.docx'),
          hash: 'a'.repeat(64),
          features: ['table'],
          expectedEdits: ['text'],
        },
      ]),
      /ENOENT|missing/i,
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
