import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import init, { HwpDocument } from '@rhwp/core'

const output = process.argv[2]
if (!output) throw new Error('Expected the destination HWPX path')

const require = createRequire(import.meta.url)
await init({
  module_or_path: readFileSync(join(dirname(require.resolve('@rhwp/core')), 'rhwp_bg.wasm')),
})

const document = HwpDocument.createEmpty()
try {
  document.createBlankDocument()
  const lines = process.argv.includes('--blank')
    ? []
    : ['새빛초등학교 공문', '행사일: 2026년 12월 3일', '예산: 350,000원', '협조 부탁드립니다.']
  lines.forEach((line, index) => {
    if (index) document.splitParagraph(0, index - 1, document.getParagraphLength(0, index - 1))
    document.insertText(0, index, 0, line)
  })
  writeFileSync(output, document.exportHwpx())
} finally {
  document.free()
}
