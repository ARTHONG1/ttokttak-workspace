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
// The pinned built-in model: the Qwen3.5-2B Q4_K_M below with a document-editing
// LoRA merged into layers 22-23 (0.16.4). A replacement needs a new provenance entry.
const PINNED_SHA = '7b856b1c0456bd895b48ffceec62592ad181090ccd20823708ce691caf86fae7'
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
    'Modified by 똑딱작업실: a document-editing LoRA (rank 8, scale 20, MLX-LM 0.32.2,',
    'adapter SHA256 39e4d87bf36a6c1790e979636a6bc197dda359f5776feadad0d91c59e5863de2)',
    'merged into the BF16 weights of layers 22-23 and quantized back to each tensor',
    'type of the base file; every other tensor and all metadata are unchanged.',
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
