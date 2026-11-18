/**
 * Stage 똑딱생기부's built-in 똑딱AI for electron-builder: llama.cpp's llama-server, the
 * unchanged Qwen3.5-2B Q6_K base and the 생기부 adapter, each checked against its pinned
 * SHA256. The 1.6 GB result (build/local-ai) stays out of Git.
 * Usage: node scripts/prepare-ai.mjs /path/base-Q6_K.gguf /path/llama-runtime-dir /path/school_record.gguf
 */
import {
  copyFileSync,
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createHash } from 'node:crypto'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const app = resolve(fileURLToPath(new URL('..', import.meta.url)))
const [modelArg, runtimeArg, adapterArg] = process.argv.slice(2)
if (!modelArg || !runtimeArg || !adapterArg) {
  throw new Error(
    'Usage: node scripts/prepare-ai.mjs /absolute/base.gguf /absolute/llama-runtime-dir /absolute/school_record.gguf',
  )
}
// The base is the unchanged unsloth Qwen3.5-2B Q6_K GGUF (revision f6d5376b…); the adapter is
// school-record-isolated-v3 step 111 from the model project (a copy of the 4th-generation
// document adapter continued on 생기부 only), measured on this base at 200/200 (new dev set)
// and 65/66 (earlier set). Another file needs a new measurement before its hash goes here.
const PINNED = {
  base: 'fc90339420b4298887aafb307a4291c55440b730133bbffe6ba9630503dcb548',
  school_record: 'f2e4710be24c232cd60b8fe29e491e6f20d26959b8d8e7e1978a7d79d566b5bd',
}
const model = resolve(modelArg)
const runtime = resolve(runtimeArg)
const adapter = resolve(adapterArg)
const exe = process.platform === 'win32' ? 'llama-server.exe' : 'llama-server'
for (const path of [model, adapter, join(runtime, exe), join(runtime, 'LICENSE')]) {
  if (!existsSync(path)) throw new Error('Missing: ' + path)
}
async function sha256Of(path) {
  const hash = createHash('sha256')
  for await (const block of createReadStream(path)) hash.update(block)
  return hash.digest('hex')
}
const baseHash = await sha256Of(model)
if (baseHash !== PINNED.base) throw new Error('Unverified base checksum: ' + baseHash)
const adapterHash = await sha256Of(adapter)
if (adapterHash !== PINNED.school_record)
  throw new Error('Unverified adapter checksum: ' + adapterHash)

const output = join(app, 'build/local-ai')
rmSync(output, { force: true, recursive: true })
mkdirSync(join(output, 'adapters'), { recursive: true })
copyFileSync(model, join(output, 'model.gguf'))
copyFileSync(adapter, join(output, 'adapters/school_record.gguf'))
copyFileSync(join(runtime, exe), join(output, exe))
// llama.cpp loads its shared libraries from beside the executable
for (const file of readdirSync(runtime)) {
  if (/\.dylib$/.test(file) || /\.so(?:\.|$)/.test(file) || /\.dll$/i.test(file))
    copyFileSync(join(runtime, file), join(output, basename(file)))
}
copyFileSync(join(runtime, 'LICENSE'), join(output, 'LLAMA-LICENSE.txt'))
if (existsSync(join(runtime, 'LICENSE-LLVM-OpenMP')))
  copyFileSync(join(runtime, 'LICENSE-LLVM-OpenMP'), join(output, 'LICENSE-LLVM-OpenMP.txt'))
writeFileSync(
  join(output, 'MODEL-ATTRIBUTION.txt'),
  [
    'Qwen3.5-2B model, Apache License 2.0',
    'Upstream: https://huggingface.co/Qwen/Qwen3.5-2B',
    'GGUF conversion: https://huggingface.co/unsloth/Qwen3.5-2B-GGUF (revision f6d5376be1edb4d416d56da11e5397a961aca8ae)',
    'Base Q6_K, unchanged, SHA256: ' + baseHash,
    'Modified by 똑딱생기부 (똑딱AI 생기부): a LoRA adapter the server loads beside the unchanged',
    'base (llama.cpp --lora): last two layers, rank 8, trained on checked answers from Gemini 3.5',
    'Flash-Lite to fictional students (교과 세특, 행발, rewording). SHA256: ' + adapterHash,
    'llama.cpp runtime: https://github.com/ggml-org/llama.cpp (MIT license), revision b12167',
    '',
  ].join('\n'),
)
const manifest = {
  platform: process.platform,
  arch: process.arch,
  model: 'ttokttak-saenggibu',
  baseSha256: baseHash,
  adapter: { file: 'adapters/school_record.gguf', sha256: adapterHash },
  runtime: 'llama.cpp b12167',
}
writeFileSync(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log(JSON.stringify({ output, ...manifest }, null, 2))
