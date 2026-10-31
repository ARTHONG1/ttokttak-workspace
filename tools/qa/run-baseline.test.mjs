import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm, writeFile, chmod } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

test('baseline persists separate exit codes and does not turn failures into passes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'qa-baseline-'))
  try {
    const fake = join(dir, 'fake.sh')
    await writeFile(fake, '#!/bin/bash\n[[ "$1" == "pdf" ]] && exit 17\nexit 0\n')
    await chmod(fake, 0o755)
    const result = spawnSync('bash', ['tools/qa/run-baseline.sh'], {
      cwd: new URL('../..', import.meta.url),
      env: { ...process.env, QA_TEST_RUNNER: fake, QA_OUTPUT_DIR: dir, QA_SKIP_E2E: '1' },
      encoding: 'utf8',
    })
    assert.equal(result.status, 1)
    const path = (await readdir(dir)).find((name) => name.startsWith('baseline-'))
    const report = await readFile(join(dir, path), 'utf8')
    assert.match(report, /\| hwp \|.*\| 0 \| PASS \|/)
    assert.match(report, /\| pdf \|.*\| 17 \| FAIL \|/)
    assert.match(report, /\| electron-e2e \|.*NOT RUN/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
