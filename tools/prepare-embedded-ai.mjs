/**
 * Stage one platform's built-in 똑딱AI runtime for electron-builder: llama.cpp's llama-server
 * and its libraries, the licences, and a note on the model files the app downloads once on
 * the built-in AI's first use (pinned in apps/docs/src/main/local-ai-model-files.ts). Since
 * 0.17.0 the model files are not part of the installer: the app and the model are released
 * apart (the model release on GitHub), so an app update does not carry 4 GB again and the
 * models stay the original files (each under GitHub's 2 GiB limit, nothing re-quantized).
 * Usage: node tools/prepare-embedded-ai.mjs /path/to/llama/bin
 * Then: GENOFFICE_EMBED_LOCAL_AI=1 npm run dist:mac (or dist:win).
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const [runtimeArg, ...rest] = process.argv.slice(2)
if (!runtimeArg || rest.length > 0) {
  throw new Error(
    'Usage: node tools/prepare-embedded-ai.mjs /absolute/llama-runtime-dir (the model files are downloaded by the app since 0.17.0)',
  )
}
const runtime = resolve(runtimeArg)
const exe = process.platform === 'win32' ? 'llama-server.exe' : 'llama-server'
for (const path of [join(runtime, exe), join(runtime, 'LICENSE')]) {
  if (!existsSync(path)) throw new Error('Missing: ' + path)
}

// the files the app downloads: one definition, in the app's source
const source = readFileSync(join(root, 'apps/docs/src/main/local-ai-model-files.ts'), 'utf8')
const release = /LOCAL_AI_MODEL_RELEASE = '([^']+)'/.exec(source)?.[1]
const files = [
  ...source.matchAll(
    /id: '([a-z_]+)',\s*file: '([^']+)',\s*bytes: ([\d_]+),\s*sha256: '([0-9a-f]{64})',\s*url: DOWNLOAD \+ '([^']+)'/g,
  ),
].map(([, id, file, bytes, sha256, asset]) => ({
  id,
  file,
  bytes: Number(bytes.replaceAll('_', '')),
  sha256,
  asset,
}))
if (!release || files.length !== 4) {
  throw new Error('apps/docs/src/main/local-ai-model-files.ts: expected a release and 4 files')
}

const output = join(root, 'apps/shell/build/local-ai')
rmSync(output, { force: true, recursive: true })
mkdirSync(output, { recursive: true })
copyFileSync(join(runtime, exe), join(output, exe))
// llama.cpp dynamic builds load adjacent shared libraries through @loader_path
// (macOS), $ORIGIN (Linux), or DLL lookup (Windows). Resolve symlinks to files.
for (const file of readdirSync(runtime)) {
  if (/\.dylib$/.test(file) || /\.so(?:\.|$)/.test(file) || /\.dll$/i.test(file))
    copyFileSync(join(runtime, file), join(output, basename(file)))
}
copyFileSync(join(runtime, 'LICENSE'), join(output, 'LLAMA-LICENSE.txt'))
if (existsSync(join(runtime, 'LICENSE-LLVM-OpenMP')))
  copyFileSync(join(runtime, 'LICENSE-LLVM-OpenMP'), join(output, 'LICENSE-LLVM-OpenMP.txt'))
copyFileSync(join(root, 'LICENSE'), join(output, 'MODEL-LICENSE.txt'))
const page = 'https://github.com/ARTHONG1/ttokttak-workspace/releases/tag/' + release
writeFileSync(
  join(output, 'MODEL-ATTRIBUTION.txt'),
  [
    '똑딱AI model files: downloaded on first use of the built-in AI (not part of this installer)',
    'From: ' + page,
    ...files.map((f) => f.asset + ' (' + f.bytes + ' bytes), SHA256 ' + f.sha256),
    '',
    'Qwen3.5-2B model, Apache License 2.0',
    'Upstream: https://huggingface.co/Qwen/Qwen3.5-2B',
    'GGUF conversion: https://huggingface.co/unsloth/Qwen3.5-2B-GGUF',
    'Base: the unchanged Qwen3.5-2B Q8_0 GGUF. 똑딱AI (sixth generation) is this base with one',
    'adapter per feature, all loaded in one server; each request turns on its own adapter.',
    'Modified by 똑딱작업실 (똑딱AI):',
    'document adapter: the fourth generation 2,000-step LoRA on the last two layers (rank 8,',
    'scale 20, MLX-LM): document editing and HWPX editing on fictional cases. On by default.',
    'pumui adapter: 품의 cart reading in the copy-the-values format, eight layers, rank 16,',
    'continued from v3 step 400 on 667 checked answers to fictional carts (157 updates).',
    'school_record adapter: 똑딱AI 생기부 V7 B (the V6 생기부 LoRA fused into Qwen3.5-2B, the',
    'final block fine-tuned for 64 updates on answers from Gemini to fictional students) written',
    'as an adapter on the base: block 22 as its rank-8 change, block 23 as its exact change in',
    'F16 with the RMSNorm changes folded in; the small q/k norm changes are not carried, so its',
    'output is close to, not identical with, V7 B (source SHA256 d31c9139...).',
    'llama.cpp runtime: https://github.com/ggml-org/llama.cpp (MIT license), revision b12167',
    '',
  ].join('\n'),
)
const manifest = {
  platform: process.platform,
  arch: process.arch,
  model: 'qwen3.5-2b-local',
  runtime: 'llama.cpp b12167',
  // the model files are downloaded, not bundled
  models: {
    release,
    page,
    files: files.map(({ id, file, bytes, sha256, asset }) => ({
      id,
      file,
      bytes,
      sha256,
      url:
        'https://github.com/ARTHONG1/ttokttak-workspace/releases/download/' + release + '/' + asset,
    })),
  },
}
writeFileSync(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log(JSON.stringify({ output, ...manifest }, null, 2))
