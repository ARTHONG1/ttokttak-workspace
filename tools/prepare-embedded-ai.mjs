/**
 * Stage one platform's verified GGUF and llama.cpp runtime for electron-builder.
 * Usage: node tools/prepare-embedded-ai.mjs /path/to/model.gguf /path/to/llama/bin
 * Then: GENOFFICE_EMBED_LOCAL_AI=1 npm run dist:mac (or dist:win).
 * The staged 1.28 GB model is deliberately excluded from Git.
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
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const [modelArg, runtimeArg] = process.argv.slice(2)
if (!modelArg || !runtimeArg) {
  throw new Error(
    'Usage: node tools/prepare-embedded-ai.mjs /absolute/model.gguf /absolute/llama-runtime-dir',
  )
}
const model = resolve(modelArg)
const runtime = resolve(runtimeArg)
const exe = process.platform === 'win32' ? 'llama-server.exe' : 'llama-server'
const binary = join(runtime, exe)
const runtimeLicense = join(runtime, 'LICENSE')
if (!existsSync(model) || !existsSync(binary) || !existsSync(runtimeLicense)) {
  throw new Error('Model, llama-server or llama.cpp LICENSE missing')
}
if (!model.endsWith('.gguf') || statSync(model).size > 5_000_000_000) {
  throw new Error('Expected a GGUF model smaller than 5 GB')
}
const sha256 = createHash('sha256')
for await (const block of createReadStream(model)) sha256.update(block)
const hash = sha256.digest('hex')
// The pinned built-in model: 똑딱AI fourth generation (0.16.10), the Qwen3.5-2B below with
// a document-editing and 생기부 LoRA fused in. It replaces the third-generation file of
// 0.16.8 (9507b15d…). A replacement needs a new provenance entry.
const PINNED_SHA = 'd9b028a51147e2656cf19fae3df98660ad82c1493d75c93c9aef526c7452dbc7'
if (hash !== PINNED_SHA) throw new Error(`Unverified model checksum: ${hash}`)

const output = join(root, 'apps/shell/build/local-ai')
rmSync(output, { force: true, recursive: true })
mkdirSync(output, { recursive: true })
copyFileSync(model, join(output, 'model.gguf'))
copyFileSync(binary, join(output, exe))
// llama.cpp dynamic builds load adjacent shared libraries through @loader_path
// (macOS), $ORIGIN (Linux), or DLL lookup (Windows). Resolve symlinks to files.
for (const file of readdirSync(runtime)) {
  if (!(/\.dylib$/.test(file) || /\.so(?:\.|$)/.test(file) || /\.dll$/i.test(file))) continue
  copyFileSync(join(runtime, file), join(output, basename(file)))
}
copyFileSync(runtimeLicense, join(output, 'LLAMA-LICENSE.txt'))
if (existsSync(join(runtime, 'LICENSE-LLVM-OpenMP'))) {
  copyFileSync(join(runtime, 'LICENSE-LLVM-OpenMP'), join(output, 'LICENSE-LLVM-OpenMP.txt'))
}
copyFileSync(join(root, 'LICENSE'), join(output, 'MODEL-LICENSE.txt'))
writeFileSync(
  join(output, 'MODEL-ATTRIBUTION.txt'),
  [
    'Qwen3.5-2B model, Apache License 2.0',
    'Upstream: https://huggingface.co/Qwen/Qwen3.5-2B',
    'GGUF conversion: https://huggingface.co/unsloth/Qwen3.5-2B-GGUF',
    'GGUF revision: f6d5376be1edb4d416d56da11e5397a961aca8ae',
    'Base Q4_K_M SHA256: aaf42c8b7c3cab2bf3d69c355048d4a0ee9973d48f16c731c0520ee914699223',
    'Modified by 똑딱작업실 (똑딱AI, fourth generation): a document-editing LoRA on the',
    'last two layers (rank 8, scale 20, MLX-LM), trained in rounds, each continuing the',
    'previous adapter: three document-editing rounds, HWPX editing (1,600 steps) and',
    'school-record writing on fictional cases (400 steps, 2,000 in all); adapter SHA256',
    'de9913a2bb40f08b263831155f19927dc6a289e686a9e1103864a9114a22fa9a.',
    'The adapter was fused into the BF16 weights, the 61 RMSNorm weights MLX stores',
    'offset by one were restored to the Hugging Face form, and the model was quantized',
    "to Q4_K_M with the base file's type for every tensor (same names, shapes and types).",
    `Q4_K_M SHA256: ${hash}`,
    'llama.cpp runtime: https://github.com/ggml-org/llama.cpp (MIT license)',
    'Runtime revision: b12167',
    '',
  ].join('\n'),
)
const manifest = {
  platform: process.platform,
  arch: process.arch,
  model: 'qwen3.5-2b-local',
  modelBytes: statSync(model).size,
  modelSha256: hash,
  runtime: 'llama.cpp b12167',
}
writeFileSync(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log(
  JSON.stringify(
    {
      output,
      ...manifest,
      bundleBytes: readdirSync(output).reduce((n, f) => n + statSync(join(output, f)).size, 0),
    },
    null,
    2,
  ),
)
