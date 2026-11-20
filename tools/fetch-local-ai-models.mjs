/**
 * Download 똑딱AI's model files named in a built-in AI manifest.json (written by
 * tools/prepare-embedded-ai.mjs) into a folder laid out as the app lays out its models
 * folder, each checked against its pinned SHA256. For the Windows build's smoke test and for
 * checking a model release by hand; the app itself downloads with local-ai-model-store.ts.
 * Usage: node tools/fetch-local-ai-models.mjs /path/manifest.json /path/models-folder
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const [manifestArg, outArg] = process.argv.slice(2)
if (!manifestArg || !outArg)
  throw new Error('Usage: node tools/fetch-local-ai-models.mjs manifest.json models-folder')
const { models } = JSON.parse(readFileSync(resolve(manifestArg), 'utf8'))
if (!models?.files?.length) throw new Error('manifest.json lists no model files')
const out = resolve(outArg)

async function sha256Of(path) {
  const hash = createHash('sha256')
  for await (const block of createReadStream(path, { highWaterMark: 1 << 22 })) hash.update(block)
  return hash.digest('hex')
}

for (const f of models.files) {
  const dest = join(out, f.file)
  mkdirSync(dirname(dest), { recursive: true })
  if (!existsSync(dest) || statSync(dest).size !== f.bytes) {
    // -C -: resume a file a dropped connection left short
    execFileSync(
      'curl',
      ['-sSfL', '--retry', '5', '--retry-all-errors', '-C', '-', '-o', dest, f.url],
      {
        stdio: 'inherit',
      },
    )
  }
  const actual = await sha256Of(dest)
  if (statSync(dest).size !== f.bytes || actual !== f.sha256)
    throw new Error(f.file + ': got ' + actual + ', expected ' + f.sha256)
  console.log('ok', f.file, f.bytes)
}
