import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import JSZip from 'jszip'
import { validateHwpxBeforeOverwrite } from '../src/main/hwpx-save-validation'

const fixture = () =>
  readFile(resolve(import.meta.dirname, 'fixtures/master-page-next-section.hwpx'))

describe('HWPX pre-write validation', () => {
  it('accepts the intact multi-section master-page fixture', async () => {
    expect(await validateHwpxBeforeOverwrite(await fixture())).toBeNull()
  })

  it('rejects a ZIP with a damaged member checksum', async () => {
    const bytes = Buffer.from(await fixture())
    const marker = Buffer.from('application/hwp+zip')
    const at = bytes.indexOf(marker)
    expect(at).toBeGreaterThan(0)
    bytes[at] = 0x78
    expect(await validateHwpxBeforeOverwrite(bytes)).toMatch(/ZIP|CRC|checksum/i)
  })

  it('rejects missing required section and metadata', async () => {
    const zip = await JSZip.loadAsync(await fixture())
    zip.remove('Contents/section0.xml')
    const bad = await zip.generateAsync({ type: 'nodebuffer' })
    expect(await validateHwpxBeforeOverwrite(bad)).toMatch(/section0\.xml/)
  })

  it('rejects a malformed section XML even when the ZIP checksum is valid', async () => {
    const zip = await JSZip.loadAsync(await fixture())
    zip.file('Contents/section0.xml', '<hp:sec><hp:p></hp:sec>')
    const bad = await zip.generateAsync({ type: 'nodebuffer' })
    expect(await validateHwpxBeforeOverwrite(bad)).toMatch(/XML|section0\.xml/i)
  })

  it('rejects a wrong mimetype even with valid package members', async () => {
    const zip = await JSZip.loadAsync(await fixture())
    zip.file('mimetype', 'application/zip')
    const bad = await zip.generateAsync({ type: 'nodebuffer' })
    expect(await validateHwpxBeforeOverwrite(bad)).toMatch(/mimetype/i)
  })

  it('rejects silently dropped master pages from the opened HWPX', async () => {
    const original = await fixture()
    const zip = await JSZip.loadAsync(original)
    zip.remove('Contents/masterpage0.xml')
    const bad = await zip.generateAsync({ type: 'nodebuffer' })
    expect(await validateHwpxBeforeOverwrite(bad, original)).toMatch(/masterpage0\.xml/)
  })

  it('blocks a master page whose XML changed even though the ZIP part is present', async () => {
    const original = await fixture()
    const zip = await JSZip.loadAsync(original)
    const source = await zip.file('Contents/masterpage0.xml')!.async('string')
    expect(source).toContain('MASTER BAND')
    zip.file('Contents/masterpage0.xml', source.replace('MASTER BAND', ''))
    const rewritten = await zip.generateAsync({ type: 'nodebuffer' })
    expect(await validateHwpxBeforeOverwrite(rewritten, original)).toMatch(
      /master page changed.*masterpage0\.xml/i,
    )
  })

  it('rejects a missing body section from the opened HWPX', async () => {
    const original = await fixture()
    const zip = await JSZip.loadAsync(original)
    zip.remove('Contents/section1.xml')
    const bad = await zip.generateAsync({ type: 'nodebuffer' })
    expect(await validateHwpxBeforeOverwrite(bad, original)).toMatch(/section1\.xml/)
  })

  it('rejects an XML part that uses a namespace prefix it never declares', async () => {
    const zip = await JSZip.loadAsync(await fixture())
    const header = await zip.file('Contents/header.xml')!.async('string')
    zip.file('Contents/header.xml', header.replace('</hh:head>', '<ns0:paraHead level="1"/></hh:head>'))
    const bad = await zip.generateAsync({ type: 'nodebuffer' })
    expect(await validateHwpxBeforeOverwrite(bad)).toMatch(/prefix ns0/)
  })
})

describe('HWPX pre-write validation of embedded files', () => {
  const pictureFile = () =>
    readFile(resolve(import.meta.dirname, 'fixtures/header-picture-and-text.hwpx'))

  /** The fixture with its picture under another name, as the engine writes it. */
  async function renamed(to: string): Promise<Buffer> {
    const zip = await JSZip.loadAsync(await pictureFile())
    const bytes = await zip.file('BinData/image1.png')!.async('nodebuffer')
    zip.remove('BinData/image1.png')
    zip.file(to, bytes)
    const hpf = await zip.file('Contents/content.hpf')!.async('string')
    zip.file('Contents/content.hpf', hpf.replace('BinData/image1.png', to))
    return zip.generateAsync({ type: 'nodebuffer' })
  }

  it('accepts a picture the engine wrote under another name, judged by its bytes', async () => {
    const original = await pictureFile()
    expect(await validateHwpxBeforeOverwrite(await renamed('BinData/image7.png'), original)).toBeNull()
  })

  it('rejects a save whose picture bytes are gone', async () => {
    const original = await pictureFile()
    const zip = await JSZip.loadAsync(await renamed('BinData/image7.png'))
    zip.file('BinData/image7.png', Buffer.from('not the picture'))
    const bad = await zip.generateAsync({ type: 'nodebuffer' })
    expect(await validateHwpxBeforeOverwrite(bad, original)).toMatch(/missing BinData\/image1\.png/)
  })

  it('rejects a picture that refers to a file the package does not hold', async () => {
    const zip = await JSZip.loadAsync(await pictureFile())
    zip.remove('BinData/image1.png')
    const bad = await zip.generateAsync({ type: 'nodebuffer' })
    expect(await validateHwpxBeforeOverwrite(bad)).toMatch(/refers to missing image1/)
  })
})

