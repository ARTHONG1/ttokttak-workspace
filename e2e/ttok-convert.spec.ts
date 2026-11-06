import { copyFile, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'
import JSZip from 'jszip'
import { test, expect, type Page, type ElectronApplication } from '@playwright/test'
import { launchShell, closeAndSaveVideo, screenshotPath } from './helpers'

/**
 * 문서 변환 end to end on the desktop app: every card of the built-in route table, each
 * result downloaded through the save dialog and checked (its format by its bytes, a PDF
 * by its pages, an HWP/HWPX by its body text). Results feed later inputs: the HWPX's PDF
 * is the PDF input, the Word file's ODT the ODT input.
 */

const SAMPLES = join(__dirname, '..', 'web', 'runtime', 'samples')
const PPTX = join(
  __dirname,
  '..',
  'packages',
  'pptx-engine',
  'tests',
  'fixtures',
  '05_unicode_cjk_emoji.pptx',
)

/** the body text of an HWP / HWPX document, read by the engine the editor runs */
async function hangulText(path: string): Promise<string> {
  const { createRequire } = await import('node:module')
  const rhwp = await import('@rhwp/core')
  const wasm = createRequire(__filename).resolve('@rhwp/core/rhwp_bg.wasm')
  await rhwp.default({ module_or_path: await readFile(wasm) })
  const doc = new rhwp.HwpDocument(new Uint8Array(await readFile(path)))
  try {
    return JSON.parse(doc.getTextFileText()) as string
  } finally {
    doc.free()
  }
}

/** a small photo-like PNG */
function photo(w = 240, h = 160): Buffer {
  const table = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc = (b: Buffer) => {
    let c = 0xffffffff
    for (const x of b) c = table[(c ^ x) & 0xff]! ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type: string, body: Buffer) => {
    const head = Buffer.alloc(8)
    head.writeUInt32BE(body.length, 0)
    head.write(type, 4, 'ascii')
    const tail = Buffer.alloc(4)
    tail.writeUInt32BE(crc(Buffer.concat([head.subarray(4), body])), 0)
    return Buffer.concat([head, body, tail])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr.set([8, 2, 0, 0, 0], 8)
  const raw = Buffer.alloc(h * (1 + w * 3))
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) raw.set([x % 256, y % 256, 160], y * (1 + w * 3) + 1 + x * 3)
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const head = (b: Uint8Array, n: number) => [...b.subarray(0, n)]
const isZip = (b: Uint8Array) => head(b, 2).join() === [0x50, 0x4b].join()

async function pdfPages(bytes: Uint8Array): Promise<number> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const pdf = await getDocument({ data: bytes.slice() }).promise
  try {
    return pdf.numPages
  } finally {
    await pdf.loadingTask.destroy()
  }
}

/** what a result must look like */
async function checkResult(format: string, bytes: Uint8Array): Promise<string> {
  expect(bytes.byteLength).toBeGreaterThan(0)
  switch (format) {
    case 'pdf': {
      const pages = await pdfPages(bytes)
      expect(pages).toBeGreaterThan(0)
      return pages + '쪽'
    }
    case 'png': {
      const zip = await JSZip.loadAsync(bytes)
      const names = Object.keys(zip.files)
      expect(names.length).toBeGreaterThan(0)
      return names.length + '장'
    }
    case 'hwp':
      expect(head(bytes, 4)).toEqual([0xd0, 0xcf, 0x11, 0xe0])
      return 'HWP5'
    case 'html':
    case 'md': {
      const text = new TextDecoder().decode(bytes)
      expect(text.trim().length).toBeGreaterThan(0)
      return text.length + '자'
    }
    default:
      expect(isZip(bytes)).toBe(true)
      return 'zip ' + bytes.byteLength + 'B'
  }
}

async function answerDialogs(app: ElectronApplication, open: string, save: string): Promise<void> {
  await app.evaluate(
    ({ dialog }, files) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [files.open] })) as never
      dialog.showSaveDialog = (async () => ({ canceled: false, filePath: files.save })) as never
    },
    { open, save },
  )
}

test('문서 변환 makes every built-in format and hands each result out', async () => {
  test.setTimeout(20 * 60_000)
  const dir = await mkdtemp(join(tmpdir(), 'ttok-convert-e2e-'))
  const file = (name: string) => join(dir, name)
  await copyFile(join(SAMPLES, '현장체험학습 운영계획(안).hwpx'), file('운영계획.hwpx'))
  await copyFile(join(SAMPLES, '독서 행사 안내문.docx'), file('안내문.docx'))
  await copyFile(join(SAMPLES, '2027 예산표.xlsx'), file('예산표.xlsx'))
  await copyFile(PPTX, file('발표.pptx'))
  await writeFile(
    file('행사 안내.html'),
    '<!doctype html><html><body><h1>독서 행사 안내</h1><p>11월 7일 도서관에서 열려요.</p>' +
      '<table><tr><td>시간</td><td>13:30</td></tr></table></body></html>',
  )
  await writeFile(file('메모.md'), '# 회의 메모\n\n- 일정 확인\n- 장소 예약\n')
  await writeFile(file('사진.png'), photo())

  const launched = await launchShell({ videoDir: 'ttok-convert', onboardingSeen: true, lang: 'ko' })
  const { app, page } = launched
  const rows: string[] = []
  try {
    await page.setViewportSize({ width: 1400, height: 900 })
    const start = page
      .frameLocator('iframe[title="똑딱작업실 소개"]')
      .locator('.cta [data-action="start"]')
    if (
      await start
        .waitFor({ state: 'visible', timeout: 10_000 })
        .then(() => true)
        .catch(() => false)
    ) {
      await start.click()
    }
    await page
      .getByRole('button', { name: /똑딱업무/ })
      .first()
      .click()
    await page.getByTestId('special-feature-convert').click()
    await expect(page.getByRole('heading', { name: '문서 변환' })).toBeVisible()

    /** put a document in and return the cards' formats */
    const upload = async (p: Page, input: string): Promise<string[]> => {
      await answerDialogs(app, input, join(dir, 'unused'))
      const first = p.getByTestId('tc-open')
      console.log('upload', input)
      if (await first.isVisible()) await first.click({ timeout: 30_000 })
      else await p.getByRole('button', { name: '다른 문서 올리기' }).click({ timeout: 30_000 })
      const base = input.split('/').pop()!
      // the name with its extension: an earlier document may share the name
      await expect(p.locator('.tc-file-name')).toContainText(
        base.replace(/\.[^.]+$/, '') + '.' + base.split('.').pop() + ' ·',
      )
      await expect(p.locator('[data-testid^="tc-target-"]').first()).toBeVisible()
      const ids = await p
        .locator('[data-testid^="tc-target-"]')
        .evaluateAll((els) =>
          els.map((el) => (el.getAttribute('data-testid') ?? '').replace('tc-target-', '')),
        )
      return ids
    }

    /** one card: convert, download, check */
    const convert = async (input: string, format: string): Promise<string> => {
      const ext = format === 'png' ? 'zip' : format
      const out = join(
        dir,
        'out-' +
          input
            .split('/')
            .pop()!
            .replace(/\.[^.]+$/, '') +
          '.' +
          ext,
      )
      await answerDialogs(app, input, out)
      console.log('convert', input, '→', format)
      if (!(await page.getByTestId('tc-target-' + format).isVisible())) {
        await page.getByRole('button', { name: /다른 형식/ }).click({ timeout: 30_000 })
      }
      await page.getByTestId('tc-target-' + format).click({ timeout: 30_000 })
      const done = page.getByTestId('tc-result')
      const failed = page.locator('.tc-failed')
      await expect(done.or(failed)).toBeVisible({ timeout: 180_000 })
      if (await failed.isVisible()) throw new Error(await failed.innerText())
      await page.getByTestId('tc-download').click({ timeout: 30_000 })
      await expect(page.locator('.sf-toast')).toContainText('저장했어요')
      const bytes = new Uint8Array(await readFile(out))
      const note = await checkResult(format, bytes)
      return out + ' · ' + note
    }

    const cases: [string, string[]][] = [
      ['운영계획.hwpx', ['pdf', 'hwp', 'png']],
      ['안내문.docx', ['pdf', 'odt', 'html', 'md', 'png']],
      ['예산표.xlsx', ['pdf', 'png']],
      ['발표.pptx', ['pdf', 'png']],
      ['행사 안내.html', ['pdf', 'docx', 'odt']],
      ['메모.md', ['pdf']],
      ['사진.png', ['pdf']],
    ]
    for (const [name, formats] of cases) {
      const offered = await upload(page, file(name))
      expect.soft(offered, name + ' cards').toEqual(expect.arrayContaining(formats))
      for (const format of formats) {
        const started = Date.now()
        try {
          const note = await convert(file(name), format)
          rows.push([name, format, 'ok', (Date.now() - started) / 1000 + 's', note].join(' | '))
          console.log(rows.at(-1))
        } catch (err) {
          rows.push([name, format, 'FAIL', String(err).slice(0, 160)].join(' | '))
          console.log(rows.at(-1))
          await page.screenshot({ path: screenshotPath('ttok-convert-fail-' + format) })
          expect.soft(String(err), name + ' → ' + format).toBe('')
        }
      }
    }
    await page.screenshot({ path: screenshotPath('ttok-convert-result') })

    // the results feed the inputs that need them
    await copyFile(join(dir, 'out-운영계획.hwp'), file('운영계획2.hwp'))
    await copyFile(join(dir, 'out-운영계획.pdf'), file('운영계획.pdf'))
    await copyFile(join(dir, 'out-안내문.odt'), file('안내문2.odt'))
    const later: [string, string[]][] = [
      ['운영계획2.hwp', ['hwpx', 'pdf']],
      ['운영계획.pdf', ['docx', 'pptx', 'xlsx', 'png']],
      ['안내문2.odt', ['docx', 'pdf', 'html', 'md']],
    ]
    for (const [name, formats] of later) {
      await upload(page, file(name))
      for (const format of formats) {
        const started = Date.now()
        try {
          const note = await convert(file(name), format)
          rows.push([name, format, 'ok', (Date.now() - started) / 1000 + 's', note].join(' | '))
          console.log(rows.at(-1))
        } catch (err) {
          rows.push([name, format, 'FAIL', String(err).slice(0, 160)].join(' | '))
          console.log(rows.at(-1))
          await page.screenshot({ path: screenshotPath('ttok-convert-fail-' + format) })
          expect.soft(String(err), name + ' → ' + format).toBe('')
        }
      }
    }

    // HWP ↔ HWPX keeps the body text
    const original = await hangulText(file('운영계획.hwpx'))
    const asHwp = await hangulText(join(dir, 'out-운영계획.hwp'))
    const backToHwpx = await hangulText(join(dir, 'out-운영계획2.hwpx'))
    expect(asHwp).toBe(original)
    expect(backToHwpx).toBe(original)
  } finally {
    console.log('문서 변환 results:\n' + rows.join('\n'))
    await writeFile(join(dir, 'results.txt'), rows.join('\n'))
    console.log('files in', dir)
    await closeAndSaveVideo(launched, 'ttok-convert')
  }
})
