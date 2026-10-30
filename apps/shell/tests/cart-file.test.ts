import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import init, { HwpDocument } from '@rhwp/core'
import { readCartFile } from '../src/main/cart-file'

/**
 * 특화 기능 > 품의서 생성 reads a cart from 이미지·한글·PDF·엑셀 files. Each case writes a
 * real file of the kind and checks the text that would land in the cart box.
 */
const require = createRequire(import.meta.url)
const dir = mkdtempSync(join(tmpdir(), 'cart-file-'))
const file = (name: string, bytes: string | Uint8Array) => {
  const path = join(dir, name)
  writeFileSync(path, bytes)
  return path
}

beforeAll(async () => {
  await init({ module_or_path: readFileSync(require.resolve('@rhwp/core/rhwp_bg.wasm')) })
})

describe('reading a cart from a file', () => {
  it('reads the text of a Hangul document', async () => {
    const doc = HwpDocument.createEmpty()
    doc.createBlankDocument()
    doc.insertText(0, 0, 0, '모나미 153 볼펜 흑색 12개입 3,600원 수량 5')
    const result = await readCartFile(file('cart.hwp', doc.exportHwp()), 'hwp')
    expect(result).toMatchObject({ ok: true, kind: 'text', name: 'cart.hwp' })
    expect(result.ok && result.kind === 'text' && result.text).toContain('모나미 153 볼펜')
  })

  it('reads a CSV export of a cart', async () => {
    const result = await readCartFile(
      file('cart.csv', '상품명,수량,가격\n3M 포스트잇 653,2,8900\n'),
      'excel',
    )
    expect(result.ok && result.kind === 'text' && result.text).toContain('3M 포스트잇 653')
  })

  it('hands an image back as bytes for the AI to read', async () => {
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const result = await readCartFile(file('cart.png', png), 'image')
    expect(result).toMatchObject({ ok: true, kind: 'image', mime: 'image/png' })
    expect(result.ok && result.kind === 'image' && result.base64).toBe(
      Buffer.from(png).toString('base64'),
    )
  })

  it('refuses a file of another kind than the button', async () => {
    const result = await readCartFile(file('cart.txt', '볼펜 5개'), 'pdf')
    expect(result.ok).toBe(false)
  })

  it('tells how to read an old .xls', async () => {
    const result = await readCartFile(file('cart.xls', 'x'), 'excel')
    expect(result).toMatchObject({ ok: false })
    expect(!result.ok && result.error).toContain('.xlsx')
  })

  it('says so when a PDF has no text', async () => {
    const result = await readCartFile(file('scan.pdf', 'not a pdf'), 'pdf')
    expect(result.ok).toBe(false)
  })
})
