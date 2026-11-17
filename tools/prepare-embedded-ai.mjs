/**
 * Stage one platform's verified 똑딱AI and llama.cpp runtime for electron-builder.
 * 5세대: one fixed Q8_0 base and per-feature LoRA adapters (document, pumui).
 * Usage: node tools/prepare-embedded-ai.mjs /path/base-Q8_0.gguf /path/to/llama/bin \
 *          /path/document-adapter.gguf /path/pumui-adapter.gguf
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
const [modelArg, runtimeArg, documentArg, pumuiArg] = process.argv.slice(2)
if (!modelArg || !runtimeArg || !documentArg || !pumuiArg) {
  throw new Error(
    'Usage: node tools/prepare-embedded-ai.mjs /absolute/base.gguf /absolute/llama-runtime-dir /absolute/document.gguf /absolute/pumui.gguf',
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
async function sha256Of(path) {
  const hash = createHash('sha256')
  for await (const block of createReadStream(path)) hash.update(block)
  return hash.digest('hex')
}
// The pinned built-in model: 똑딱AI fifth generation. The base is the unchanged Qwen3.5-2B
// Q8_0 GGUF; each feature's LoRA is a separate file the server loads beside it. The document
// adapter is the fourth generation's (2,000 steps, the 0.16.10 model before fusing); the 품의
// adapter is final200-v1 step 157, promoted by the user's direction on 2026-11-18 (registry
// ddak_features.json in the model project). A replacement needs a new provenance entry.
const PINNED = {
  base: '1b04acba824817554f4ce23639bc8495ff70453b8fcb047900c731521021f2c1',
  document: '76fac99858b21d136835cc4bdda02edf8721adaf820280ef5aba31c8d506ace9',
  pumui: '7f4304879415d92d87b1c9401819135383a06c2e6e1e39c74e321c44cf7b99ac',
}
const adapters = { document: resolve(documentArg), pumui: resolve(pumuiArg) }
const hash = await sha256Of(model)
if (hash !== PINNED.base) throw new Error('Unverified base checksum: ' + hash)
const adapterHashes = {}
for (const [name, path] of Object.entries(adapters)) {
  if (!existsSync(path)) throw new Error('Adapter missing: ' + name)
  adapterHashes[name] = await sha256Of(path)
  if (adapterHashes[name] !== PINNED[name]) {
    throw new Error('Unverified ' + name + ' adapter checksum: ' + adapterHashes[name])
  }
}

const output = join(root, 'apps/shell/build/local-ai')
rmSync(output, { force: true, recursive: true })
mkdirSync(join(output, 'adapters'), { recursive: true })
copyFileSync(model, join(output, 'model.gguf'))
for (const [name, path] of Object.entries(adapters)) {
  copyFileSync(path, join(output, 'adapters', name + '.gguf'))
}
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
    'Base Q8_0, unchanged, SHA256: ' + hash,
    'Modified by 똑딱작업실 (똑딱AI, fifth generation): per-feature LoRA adapters the',
    'server loads beside the unchanged base (llama.cpp --lora-scaled), one on per request.',
    'document adapter (adapters/document.gguf): the fourth generation 2,000-step LoRA on the',
    'last two layers (rank 8, scale 20, MLX-LM): document editing, HWPX editing and',
    'school-record writing on fictional cases. SHA256: ' + adapterHashes.document,
    'pumui adapter (adapters/pumui.gguf): 품의 cart reading in the v3 copy-the-values format,',
    'eight layers, rank 16, continued from v3 step 400 on 667 checked answers from',
    'Gemini 3.5 Flash-Lite to fictional carts (157 updates). SHA256: ' + adapterHashes.pumui,
    'llama.cpp runtime: https://github.com/ggml-org/llama.cpp (MIT license)',
    'Runtime revision: b12167',
    '',
  ].join('\n'),
)
const manifest = {
  platform: process.platform,
  arch: process.arch,
  model: 'qwen3.5-2b-local',
  generation: 5,
  modelBytes: statSync(model).size,
  modelSha256: hash,
  adapters: Object.fromEntries(
    Object.keys(adapters).map((name) => [
      name,
      { file: 'adapters/' + name + '.gguf', sha256: adapterHashes[name] },
    ]),
  ),
  runtime: 'llama.cpp b12167',
}
writeFileSync(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log(
  JSON.stringify(
    {
      output,
      ...manifest,
      bundleBytes: readdirSync(output, { recursive: true }).reduce((n, f) => {
        const s = statSync(join(output, String(f)))
        return s.isFile() ? n + s.size : n
      }, 0),
    },
    null,
    2,
  ),
)
