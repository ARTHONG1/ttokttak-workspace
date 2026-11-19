/**
 * Stage 똑딱생기부's built-in 똑딱AI for electron-builder: llama.cpp's llama-server and the
 * 똑딱AI 생기부 V7 B model (school-record-v7-b), checked against its pinned SHA256. V7 B is a
 * whole model (no adapter): the model project's standalone GGUF, used as it was measured.
 * The 2.1 GB result (build/local-ai) stays out of Git.
 * Usage: node scripts/prepare-ai.mjs /path/school-record-v7-b/model-Q8_0.gguf /path/llama-runtime-dir
 */
import {
  copyFileSync,
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createHash } from 'node:crypto'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const app = resolve(fileURLToPath(new URL('..', import.meta.url)))
const [modelArg, runtimeArg] = process.argv.slice(2)
if (!modelArg || !runtimeArg) {
  throw new Error(
    'Usage: node scripts/prepare-ai.mjs /absolute/school-record-v7-b/model-Q8_0.gguf /absolute/llama-runtime-dir',
  )
}
// school-record-v7-b: Qwen3.5-2B with the V6 생기부 LoRA fused in and the final block fine-tuned
// (64 updates), exported to Q8_0 by the model project and promoted by the user's direction on
// 2026-11-19 (registry ddak_features.json, standalone_models). Measured there on 80 dev
// prompts in llama.cpp b12167 at temperature 0. Another file needs a new measurement first.
const PINNED_MODEL = 'd31c913928eea57ca2d1bfb2a0a158dcb48ef2b4c6bae6dede91cdd7457d0fdf'
const model = resolve(modelArg)
const runtime = resolve(runtimeArg)
const exe = process.platform === 'win32' ? 'llama-server.exe' : 'llama-server'
for (const path of [model, join(runtime, exe), join(runtime, 'LICENSE')]) {
  if (!existsSync(path)) throw new Error('Missing: ' + path)
}
async function sha256Of(path) {
  const hash = createHash('sha256')
  for await (const block of createReadStream(path)) hash.update(block)
  return hash.digest('hex')
}
const modelHash = await sha256Of(model)
if (modelHash !== PINNED_MODEL) throw new Error('Unverified model checksum: ' + modelHash)

const output = join(app, 'build/local-ai')
rmSync(output, { force: true, recursive: true })
mkdirSync(output, { recursive: true })
copyFileSync(model, join(output, 'model.gguf'))
copyFileSync(join(runtime, exe), join(output, exe))
// llama.cpp loads its shared libraries from beside the executable
for (const file of readdirSync(runtime)) {
  if (/\.dylib$/.test(file) || /\.so(?:\.|$)/.test(file) || /\.dll$/i.test(file))
    copyFileSync(join(runtime, file), join(output, basename(file)))
}
copyFileSync(join(runtime, 'LICENSE'), join(output, 'LLAMA-LICENSE.txt'))
if (existsSync(join(runtime, 'LICENSE-LLVM-OpenMP')))
  copyFileSync(join(runtime, 'LICENSE-LLVM-OpenMP'), join(output, 'LICENSE-LLVM-OpenMP.txt'))
// the model's own Apache-2.0 LICENSE and change NOTICE, kept beside it in the model project
for (const [from, to] of [
  ['LICENSE', 'MODEL-LICENSE.txt'],
  ['NOTICE', 'MODEL-NOTICE.txt'],
]) {
  if (existsSync(join(dirname(model), from)))
    copyFileSync(join(dirname(model), from), join(output, to))
}
writeFileSync(
  join(output, 'MODEL-ATTRIBUTION.txt'),
  [
    'Qwen3.5-2B model, Apache License 2.0',
    'Upstream: https://huggingface.co/Qwen/Qwen3.5-2B (revision 15852e8c16360a2fea060d615a32b45270f8a8fc)',
    'Modified by 똑딱생기부 (똑딱AI 생기부 V7 B, school-record-v7-b): the V6 생기부 LoRA (last two',
    'layers) fused into the model, then the final block fine-tuned for 64 updates on answers from',
    'Gemini to fictional students (행발, 초등 평어, 교과 세특, 창체); exported to Q8_0 GGUF.',
    'A whole model; no adapter at run time. SHA256: ' + modelHash,
    'llama.cpp runtime: https://github.com/ggml-org/llama.cpp (MIT license), revision b12167',
    '',
  ].join('\n'),
)
const manifest = {
  platform: process.platform,
  arch: process.arch,
  model: 'ttokttak-saenggibu',
  source: 'school-record-v7-b',
  modelBytes: statSync(model).size,
  modelSha256: modelHash,
  runtime: 'llama.cpp b12167',
}
writeFileSync(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log(JSON.stringify({ output, ...manifest }, null, 2))
