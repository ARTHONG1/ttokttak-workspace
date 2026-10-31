import { loadCases } from './document-cases.mjs'
import { compareTextDocuments } from './compare-text-containers.mjs'
import { compareMediaDocuments } from './compare-media-containers.mjs'

export async function inspectFixtures() {
  const results = []
  for (const c of await loadCases()) {
    const compare = ['hwp', 'hwpx', 'docx'].includes(c.format)
      ? compareTextDocuments
      : compareMediaDocuments
    // A self-check verifies that this independent reader accepts the fixture;
    // it is not evidence that any editor has saved a correct modified copy.
    const structural = await compare({ before: c.source, after: c.source, format: c.format })
    results.push({
      id: c.id,
      format: c.format,
      hash: c.hash,
      source: c.source,
      status: structural.unreadable || structural.unexpectedRemovals.length ? 'BLOCK' : 'LIMITED',
      structural,
    })
  }
  return results
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const results = await inspectFixtures()
  console.log(JSON.stringify(results, null, 2))
  if (results.some((c) => c.status === 'BLOCK')) process.exitCode = 1
}
