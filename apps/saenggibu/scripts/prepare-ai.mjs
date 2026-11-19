/**
 * Stage 똑딱생기부's built-in 똑딱AI runtime for electron-builder: llama.cpp's llama-server and
 * its libraries for this platform, the licences, and a note on the model the app downloads
 * on first launch (똑딱AI 생기부 V7 B, pinned in src/shared/model.ts). The model itself is not
 * part of the installer: it does not fit GitHub's 2 GiB file limit or a Windows installer.
 * Usage: node scripts/prepare-ai.mjs /path/llama-runtime-dir
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

const app = resolve(fileURLToPath(new URL('..', import.meta.url)))
const [runtimeArg] = process.argv.slice(2)
if (!runtimeArg) throw new Error('Usage: node scripts/prepare-ai.mjs /absolute/llama-runtime-dir')
const runtime = resolve(runtimeArg)
const exe = process.platform === 'win32' ? 'llama-server.exe' : 'llama-server'
for (const path of [join(runtime, exe), join(runtime, 'LICENSE')]) {
  if (!existsSync(path)) throw new Error('Missing: ' + path)
}

// the model the app downloads: one definition, in the app's source
const source = readFileSync(join(app, 'src/shared/model.ts'), 'utf8')
const field = (name, pattern) => {
  const m = new RegExp(name + ':\\s*' + pattern).exec(source)
  if (!m) throw new Error('src/shared/model.ts has no ' + name)
  return m[1]
}
const model = {
  name: field('name', "'([^']+)'"),
  bytes: Number(field('bytes', '([\\d_]+)').replaceAll('_', '')),
  sha256: field('sha256', "'([0-9a-f]{64})'"),
  url: field('url', "'(https://[^']+)'"),
}

const output = join(app, 'build/local-ai')
rmSync(output, { force: true, recursive: true })
mkdirSync(output, { recursive: true })
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
    'The model is downloaded on first launch (not part of this installer):',
    model.name + ' (school-record-v7-b), ' + model.bytes + ' bytes, SHA256 ' + model.sha256,
    'From: ' + model.url,
    'Qwen3.5-2B model, Apache License 2.0',
    'Upstream: https://huggingface.co/Qwen/Qwen3.5-2B (revision 15852e8c16360a2fea060d615a32b45270f8a8fc)',
    'Modified by 똑딱생기부: the V6 생기부 LoRA (last two layers) fused into the model, then the',
    'final block fine-tuned for 64 updates on answers from Gemini to fictional students (행발,',
    '초등 평어, 교과 세특, 창체); exported to Q8_0 GGUF. A whole model; no adapter at run time.',
    'llama.cpp runtime: https://github.com/ggml-org/llama.cpp (MIT license), revision b12167',
    '',
  ].join('\n'),
)
const manifest = {
  platform: process.platform,
  arch: process.arch,
  runtime: 'llama.cpp b12167',
  model: { ...model, source: 'school-record-v7-b', downloaded: true },
}
writeFileSync(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log(JSON.stringify({ output, ...manifest }, null, 2))
