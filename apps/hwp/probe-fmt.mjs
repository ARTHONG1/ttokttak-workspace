import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import init, { HwpDocument } from '@rhwp/core'
const require = createRequire(import.meta.url)
await init({
  module_or_path: readFileSync(join(dirname(require.resolve('@rhwp/core')), 'rhwp_bg.wasm')),
})
const bytes = readFileSync(
  '/private/tmp/ttokttak-hwp-preserve/web/runtime/samples/현장체험학습 운영계획(안).hwpx',
)
const doc = new HwpDocument(bytes)
const info = JSON.parse(doc.getDocumentInfo())
console.log('docinfo keys', Object.keys(info), JSON.stringify(info).slice(0, 600))
console.log('numbering', doc.getNumberingList().slice(0, 300))
console.log('bullets', doc.getBulletList().slice(0, 300))
console.log('styles', doc.getStyleList().slice(0, 200))
for (let p = 0; p < Math.min(doc.getParagraphCount(0), 12); p++) {
  const len = doc.getParagraphLength(0, p)
  const t = len ? doc.getTextRange(0, p, 0, len) : ''
  const pp = JSON.parse(doc.getParaPropertiesAt(0, p))
  console.log(
    p,
    JSON.stringify(t.slice(0, 30)),
    'margin',
    pp.marginLeft,
    'indent',
    pp.indent,
    'keys',
    Object.keys(pp).join(',').slice(0, 200),
    'runs',
    doc.getCharShapeRuns(0, p, 0, len).slice(0, 120),
  )
}
