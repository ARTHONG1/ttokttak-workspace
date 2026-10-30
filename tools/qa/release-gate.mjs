const VALID = new Set(['PASS', 'LIMITED', 'BLOCK', 'NOT RUN'])

/** Fail closed: a case is safe to enable only when all required checks passed. */
export function decideRelease(cases) {
  if (!Array.isArray(cases) || cases.length === 0)
    throw new Error('Release gate requires test evidence')
  const byFormat = {}
  for (const item of cases) {
    if (!item.id || !item.format || !VALID.has(item.status)) {
      throw new Error(`Invalid release case ${JSON.stringify(item)}`)
    }
    const bucket = (byFormat[item.format] ??= { safeToEnableWrites: true, blockedCaseIds: [] })
    if (item.status !== 'PASS') {
      bucket.safeToEnableWrites = false
      bucket.blockedCaseIds.push(item.id)
    }
  }
  return {
    safeToEnableWrites: Object.values(byFormat).every((bucket) => bucket.safeToEnableWrites),
    blockedCaseIds: cases.filter((c) => c.status !== 'PASS').map((c) => c.id),
    byFormat,
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const { readFile, writeFile } = await import('node:fs/promises')
  const { dirname, resolve } = await import('node:path')
  const { fileURLToPath } = await import('node:url')
  const base = dirname(fileURLToPath(import.meta.url))
  const source = process.argv[2] ?? resolve(base, 'release-evidence.json')
  const target = process.argv[3] ?? resolve(base, '../../docs/qa/release-decision.md')
  const cases = JSON.parse(await readFile(source, 'utf8'))
  const decision = decideRelease(cases)
  const body =
    [
      '# Desktop six-format release decision',
      '',
      `**Generated:** ${new Date().toISOString()}`,
      '',
      `**Write enablement across all six formats:** ${decision.safeToEnableWrites ? 'PASS' : 'BLOCKED'}`,
      '',
      '| Format | Safe to enable all writes | Missing evidence / active blocker |',
      '| --- | --- | --- |',
      ...Object.entries(decision.byFormat).map(
        ([format, state]) =>
          `| ${format.toUpperCase()} | ${state.safeToEnableWrites ? 'YES' : 'NO'} | ${state.blockedCaseIds.join(', ') || 'none'} |`,
      ),
      '',
      '| Case | Status | Severity | Reason |',
      '| --- | --- | --- | --- |',
      ...cases.map((c) => `| ${c.id} | ${c.status} | ${c.severity} | ${c.reason ?? ''} |`),
      '',
      'A `PASS` for a unit test or internal E2E is not proof of full external application compatibility.',
      'This report is a release policy decision. Product enforcement is implemented only for the HWP/HWPX integrity abort in `apps/hwp/src/main/hwp-main.ts`.',
      'The actual Codex/Claude subscription and proprietary Office/Hancom editor workflows need separate evidence before any global write enablement.',
    ].join('\n') + '\n'
  await writeFile(target, body)
  console.log(JSON.stringify({ target, ...decision }, null, 2))
}
