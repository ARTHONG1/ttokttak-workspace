import { copyFile, mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'
import { test, expect } from '@playwright/test'
import { launchShell, closeAndSaveVideo, screenshotPath } from './helpers'

/** a photographed signature: dark blue strokes on yellowish paper, as a real PNG */
function signaturePhoto(w = 360, h = 140): Buffer {
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
    for (let x = 0; x < w; x++) {
      const wave = h / 2 + Math.sin(x / 22) * 30
      const ink = Math.abs(y - wave) < 5 && x > 30 && x < w - 30
      raw.set(ink ? [30, 45, 150] : [228, 221, 204], y * (1 + w * 3) + 1 + x * 3)
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

test('똑딱서명 signs a Hangul document: converted, placed, turned, saved into the page', async () => {
  test.setTimeout(180_000)
  const dir = await mkdtemp(join(tmpdir(), 'ttok-sign-e2e-'))
  const docPath = join(dir, '운영계획.hwpx')
  await copyFile(
    join(__dirname, '..', 'web', 'runtime', 'samples', '현장체험학습 운영계획(안).hwpx'),
    docPath,
  )
  const outPath = join(dir, '운영계획_서명.pdf')
  const launched = await launchShell({ videoDir: 'ttok-sign', onboardingSeen: true, lang: 'ko' })
  const { app, page } = launched
  try {
    // the OS dialogs answer with the test's files
    await app.evaluate(
      ({ dialog }, files) => {
        dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [files.doc] })) as never
        dialog.showSaveDialog = (async () => ({ canceled: false, filePath: files.out })) as never
      },
      { doc: docPath, out: outPath },
    )
    await page.setViewportSize({ width: 1400, height: 900 })
    // the first screen is the 똑딱작업실 introduction: 시작하기 enters the workspace
    const start = page
      .frameLocator('iframe[title="똑딱작업실 소개"]')
      .locator('.cta [data-action="start"]')
    // it may arrive a moment after the window: wait for it, then go through
    const introShown = await start
      .waitFor({ state: 'visible', timeout: 10_000 })
      .then(() => true)
      .catch(() => false)
    if (introShown) {
      await start.click()
      await expect(page.locator('iframe[title="똑딱작업실 소개"]')).toBeHidden()
    }
    await page
      .getByRole('button', { name: /똑딱업무/ })
      .first()
      .click()
    await page.getByTestId('special-feature-sign').click()
    await expect(page.getByRole('heading', { name: '똑딱서명' })).toBeVisible()

    await page.getByTestId('ts-open').click()
    await expect(page.locator('.ts-page')).toHaveCount(1, { timeout: 90_000 })
    await expect(page.locator('.ts-doc-name')).toContainText('PDF로 바꿈')

    await page.getByTestId('ts-picture-file').setInputFiles({
      name: 'signature.png',
      mimeType: 'image/png',
      buffer: signaturePhoto(),
    })
    const sign = page.getByTestId('ts-sign')
    await expect(sign).toHaveCount(1)

    // move it up-right (staying in the window), make it bigger by a corner, then turn it
    const box = (await sign.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 - 150, { steps: 8 })
    await page.mouse.up()
    const moved = (await sign.boundingBox())!
    expect(moved.x).toBeGreaterThan(box.x + 100)
    expect(moved.y).toBeLessThan(box.y - 100)
    const corner = (await page.locator('.ts-knob-se').boundingBox())!
    await page.mouse.move(corner.x + 6, corner.y + 6)
    await page.mouse.down()
    await page.mouse.move(corner.x + 66, corner.y + 30, { steps: 6 })
    await page.mouse.up()
    expect((await sign.boundingBox())!.width).toBeGreaterThan(moved.width + 30)
    const knob = (await page.getByTestId('ts-turn').boundingBox())!
    const centre = (await sign.boundingBox())!
    await page.mouse.move(knob.x + knob.width / 2, knob.y + knob.height / 2)
    await page.mouse.down()
    await page.mouse.move(centre.x + centre.width, knob.y + 10, { steps: 6 })
    await page.mouse.up()
    const angle = Number(await page.locator('.ts-angle input[type=number]').inputValue())
    expect(Math.abs(angle)).toBeGreaterThan(5)
    await page.screenshot({ path: screenshotPath('ttok-sign-placed') })

    await page.getByTestId('ts-save').click()
    await expect(page.locator('.ts-saved')).toContainText('운영계획_서명.pdf')

    const { OPS, getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const pdf = await getDocument({ data: new Uint8Array(await readFile(outPath)) }).promise
    try {
      expect(pdf.numPages).toBe(1)
      const ops = await (await pdf.getPage(1)).getOperatorList()
      const images = ops.fnArray.filter(
        (fn) => fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject,
      )
      expect(images).toHaveLength(1)
      // the signature is turned in the page: some transform before it has a skew part
      const turned = ops.fnArray.some(
        (fn, i) => fn === OPS.transform && Math.abs((ops.argsArray[i] as number[])[1]!) > 0.01,
      )
      expect(turned).toBe(true)
    } finally {
      await pdf.loadingTask.destroy()
    }
  } finally {
    await closeAndSaveVideo(launched, 'ttok-sign')
  }
})

test('똑딱서명 draws a signature on the pad, sizes and turns it, saves the PDF and the PNG', async () => {
  test.setTimeout(180_000)
  const dir = await mkdtemp(join(tmpdir(), 'ttok-sign-pad-e2e-'))
  const docPath = join(dir, '안내문.hwpx')
  await copyFile(
    join(__dirname, '..', 'web', 'runtime', 'samples', '현장체험학습 운영계획(안).hwpx'),
    docPath,
  )
  const launched = await launchShell({
    videoDir: 'ttok-sign-pad',
    onboardingSeen: true,
    lang: 'ko',
  })
  const { app, page } = launched
  try {
    await app.evaluate(
      ({ dialog }, files) => {
        dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [files.doc] })) as never
        // each save goes where its name says: the signed PDF, then the picture
        dialog.showSaveDialog = (async (_w: unknown, o: { defaultPath?: string }) => ({
          canceled: false,
          filePath:
            files.dir +
            '/' +
            String(o?.defaultPath ?? 'x')
              .split('/')
              .pop(),
        })) as never
      },
      { doc: docPath, dir },
    )
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
      await expect(page.locator('iframe[title="똑딱작업실 소개"]')).toBeHidden()
    }
    await page
      .getByRole('button', { name: /똑딱업무/ })
      .first()
      .click()
    await page.getByTestId('special-feature-sign').click()
    await page.getByTestId('ts-open').click()
    await expect(page.locator('.ts-page')).toHaveCount(1, { timeout: 90_000 })

    // a signature by mouse: a loop and a long tail
    await page.getByTestId('ts-draw').click()
    const pad = page.getByTestId('ts-pad-canvas')
    const b = (await pad.boundingBox())!
    const at = (fx: number, fy: number) => [b.x + b.width * fx, b.y + b.height * fy] as const
    await page.mouse.move(...at(0.15, 0.6))
    await page.mouse.down()
    for (let i = 0; i <= 60; i++) {
      const t = i / 60
      await page.mouse.move(...at(0.15 + t * 0.7, 0.55 + Math.sin(t * 12) * 0.18 - t * 0.1))
    }
    await page.mouse.up()
    await page.mouse.move(...at(0.3, 0.3))
    await page.mouse.down()
    await page.mouse.move(...at(0.34, 0.75), { steps: 12 })
    await page.mouse.up()
    await page.screenshot({ path: screenshotPath('ttok-sign-pad') })
    await page.getByTestId('ts-pad-done').click()

    const sign = page.getByTestId('ts-sign')
    await expect(sign).toHaveCount(1)
    const before = (await sign.boundingBox())!.width
    await page.getByTestId('ts-size').fill('220')
    expect((await sign.boundingBox())!.width).toBeGreaterThan(before)
    await page.locator('.ts-angle input[type=number]').fill('-12')
    await page.screenshot({ path: screenshotPath('ttok-sign-pad-placed') })

    await page.getByTestId('ts-save').click()
    await expect(page.locator('.ts-saved')).toContainText('안내문_서명.pdf')
    const { OPS, getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const pdf = await getDocument({
      data: new Uint8Array(await readFile(join(dir, '안내문_서명.pdf'))),
    }).promise
    try {
      const ops = await (await pdf.getPage(1)).getOperatorList()
      expect(
        ops.fnArray.filter(
          (fn) => fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject,
        ),
      ).toHaveLength(1)
    } finally {
      await pdf.loadingTask.destroy()
    }

    // the drawn picture on its own, as a transparent PNG
    await page.getByTestId('ts-picture-download').first().click()
    await expect(page.locator('.sf-toast')).toContainText('서명.png')
    const png = await readFile(join(dir, '서명.png'))
    expect(png.subarray(1, 4).toString('ascii')).toBe('PNG')
    // colour type 6: RGBA, so the paper around the ink is see-through
    expect(png[25]).toBe(6)
  } finally {
    await closeAndSaveVideo(launched, 'ttok-sign-pad')
  }
})
