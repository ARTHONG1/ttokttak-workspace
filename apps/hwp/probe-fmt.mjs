import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import init, { HwpDocument } from '@rhwp/core'
const require = createRequire(import.meta.url)
await init({
  module_or_path: readFileSync(join(dirname(require.resolve('@rhwp/core')), 'rhwp_bg.wasm')),
})
const doc = new HwpDocument(
  readFileSync(
    '/private/tmp/ttokttak-hwp-preserve/web/runtime/samples/현장체험학습 운영계획(안).hwpx',
  ),
)
const pp = (p) => JSON.parse(doc.getParaPropertiesAt(0, p))
const runs = (p) => doc.getCharShapeRuns(0, p, 0, doc.getParagraphLength(0, p))
console.log('heading', pp(1).paraShapeId, runs(1), 'bullet', pp(2).paraShapeId, runs(2))
// new paragraph after heading 1 (copies heading)
doc.splitParagraph(0, 1, doc.getParagraphLength(0, 1))
doc.insertText(0, 2, 0, '- 새 항목입니다.')
console.log('new before', pp(2).paraShapeId, runs(2))
const ref = pp(3)
const props = { paraShapeId: ref.paraShapeId }
console.log(
  'applyParaFormat(paraShapeId)',
  doc.applyParaFormat(0, 2, JSON.stringify(props)),
  pp(2).paraShapeId,
)
const full = {}
for (const k of [
  'alignment',
  'lineSpacing',
  'lineSpacingType',
  'marginLeft',
  'marginRight',
  'indent',
  'spacingBefore',
  'spacingAfter',
  'headType',
  'paraLevel',
  'numberingId',
])
  full[k] = ref[k]
console.log(
  'applyParaFormat(full)',
  doc.applyParaFormat(0, 2, JSON.stringify(full)),
  pp(2).paraShapeId,
)
const cid = JSON.parse(runs(3))[0].charShapeId
console.log(
  'setCharShapeId',
  doc.setCharShapeId(0, 2, 0, doc.getParagraphLength(0, 2), cid),
  runs(2),
)
