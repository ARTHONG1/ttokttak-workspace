// Interactive check of the web edition with Playwright: runs steps from a JSON file.
// Usage: node web/scripts/web-flow.mjs <url> <steps.json> <outdir>
// step: {"click": "text=..."} | {"frameClick": [frameUrlPart, selector]} | {"wait": ms} | {"shot": "name"} | {"upload": path} | {"key": "Meta+s"} | {"type": text}
import { chromium } from 'playwright-core'
import { readFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
const [url, stepsFile, out = '/tmp/web-flow'] = process.argv.slice(2)
mkdirSync(out, { recursive: true })
const steps = JSON.parse(readFileSync(stepsFile, 'utf8'))
const browser = await chromium.launch({ channel: 'chrome', headless: true }).catch(() => chromium.launch({ headless: true }))
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })
await context.addInitScript(() => { delete window.showSaveFilePicker; delete window.showOpenFilePicker })
const page = await context.newPage()
const problems = []
page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text().slice(0, 300)) })
page.on('pageerror', (e) => problems.push('pageerror: ' + e.message.slice(0, 300)))
page.on('response', (r) => { if (r.status() >= 400) problems.push('HTTP ' + r.status() + ' ' + r.url().slice(0, 160)) })
const downloads = []
page.on('download', async (d) => { const p = join(out, d.suggestedFilename()); await d.saveAs(p); downloads.push(p) })
await page.goto(url)
await page.waitForTimeout(5000)
// the last matching frame: a newer tab of the same editor wins
function findFrame(part) { return page.frames().filter((f) => f.url().includes(part)).pop() }
const log = []
for (const step of steps) {
  try {
    if (step.wait) await page.waitForTimeout(step.wait)
    if (step.click) { const [fp, sel] = Array.isArray(step.click) ? step.click : ['/renderer/index.html', step.click]; const f = findFrame(fp) || page; await f.locator(sel).first().click({ timeout: 8000 }) }
    if (step.upload) {
      const ch = page.waitForEvent('filechooser', { timeout: 15000 })
      ch.catch(() => {})
      if (step.trigger) { const [fp, sel] = step.trigger; const f = findFrame(fp) || page; await f.locator(sel).first().click() }
      await (await ch).setFiles(step.upload)
    }
    if (step.key) await page.keyboard.press(step.key)
    if (step.type) await page.keyboard.type(step.type, { delay: 20 })
    if (step.fill) { const [fp, sel, text] = step.fill; const f = findFrame(fp) || page; await f.locator(sel).first().fill(text) }
    if (step.dialog) await page.locator('.dlg button', { hasText: step.dialog }).first().click({ timeout: 8000 })
    if (step.shot) await page.screenshot({ path: join(out, step.shot + '.png') })
    if (step.frames) log.push({ frames: page.frames().map((f) => f.url().slice(0, 140)) })
    log.push({ ok: Object.keys(step)[0] })
  } catch (e) {
    log.push({ fail: JSON.stringify(step).slice(0, 120), error: e.message.split('\n')[0].slice(0, 200) })
  }
}
await page.waitForTimeout(1500)
console.log(JSON.stringify({ log, downloads, problems: problems.slice(0, 30) }, null, 1))
await browser.close()

