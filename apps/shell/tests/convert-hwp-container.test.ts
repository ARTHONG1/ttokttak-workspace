import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { beforeAll, describe, expect, it } from 'vitest'
import init, { HwpDocument } from '@rhwp/core'
import { hwpToText } from '@genoffice/file-parse'
import {
  HwpConvertError,
  convertHwpContainer,
  hwpFirstPageSvg,
} from '../src/main/document-convert/hwp-container'

beforeAll(async () => {
  const wasm = createRequire(import.meta.url).resolve('@rhwp/core/rhwp_bg.wasm')
  await init({ module_or_path: readFileSync(wasm) })
})

const LINES = [
  '2026학년도 봄 현장체험학습 안내',
  '일시: 4월 24일(금)',
  '장소: 국립과천과학관',
  '끝.',
]

/** a small document made with the editor's own engine */
function build(): HwpDocument {
  const doc = HwpDocument.createEmpty()
  doc.createBlankDocument()
  LINES.forEach((line, index) => {
    if (index > 0) doc.splitParagraph(0, index - 1, doc.getParagraphLength(0, index - 1))
    doc.insertText(0, index, 0, line)
  })
  doc.pasteHtml(
    0,
    LINES.length - 1,
    0,
    '<table><tr><td>구분</td><td>내용</td></tr><tr><td>준비물</td><td>도시락</td></tr></table>',
  )
  return doc
}

const head = (bytes: Uint8Array, n: number) => [...bytes.subarray(0, n)]

async function reasonOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise
  } catch (err) {
    return err instanceof HwpConvertError ? err.reason : 'other: ' + String(err)
  }
  return 'resolved'
}

describe('convertHwpContainer', () => {
  it('saves an HWP document as HWPX with the same body text', async () => {
    const hwp = build().exportHwp()
    const hwpx = await convertHwpContainer(hwp, 'hwpx')
    expect(head(hwpx, 2)).toEqual([0x50, 0x4b])
    expect(await hwpToText(hwpx)).toBe(await hwpToText(hwp))
    expect(await hwpToText(hwpx)).toContain('국립과천과학관')
  })

  it('saves an HWPX document as HWP with the same body text', async () => {
    const hwpx = build().exportHwpx()
    const hwp = await convertHwpContainer(hwpx, 'hwp')
    expect(head(hwp, 4)).toEqual([0xd0, 0xcf, 0x11, 0xe0])
    expect(await hwpToText(hwp)).toBe(await hwpToText(hwpx))
  })

  it('refuses bytes that are not a Hangul document', async () => {
    const junk = new TextEncoder().encode('this is not a document')
    expect(await reasonOf(convertHwpContainer(junk, 'hwpx'))).toBe('unreadable')
  })

  it('says a password-protected document needs its password', async () => {
    const locked = build().exportHwpWithPassword('1234')
    expect(await reasonOf(convertHwpContainer(locked, 'hwpx'))).toBe('password')
  })

  it('draws the first page of an HWP or HWPX document as an SVG preview', async () => {
    const hwp = build().exportHwp()
    const hwpx = build().exportHwpx()
    const hwpSvg = await hwpFirstPageSvg(hwp)
    const hwpxSvg = await hwpFirstPageSvg(hwpx)
    expect(hwpSvg?.startsWith('<svg')).toBe(true)
    expect(hwpxSvg?.startsWith('<svg')).toBe(true)
    expect(hwpSvg).toContain('>국</text>')
    expect(hwpxSvg).toContain('>국</text>')
    expect(await hwpFirstPageSvg(new Uint8Array([1, 2, 3]))).toBeUndefined()
  })
})
