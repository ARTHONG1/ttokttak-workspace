// Opens the web edition, waits, screenshots, and reports page problems.
// Usage: node web/scripts/web-shot.mjs <url> <out.png> [waitMs]
import { chromium } from 'playwright-core'
const [url, out, wait = '8000'] = process.argv.slice(2)
const browser = await chromium.launch({ channel: 'chrome', headless: true }).catch(() => chromium.launch({ headless: true }))
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const problems = []
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(m.type() + ': ' + m.text().slice(0, 300)) })
page.on('pageerror', (e) => problems.push('pageerror: ' + e.message.slice(0, 300)))
page.on('requestfailed', (r) => problems.push('requestfailed: ' + r.url().slice(0, 200)))
page.on('response', (r) => { if (r.status() >= 400) problems.push('HTTP ' + r.status() + ' ' + r.url().slice(0, 200)) })
await page.goto(url)
await page.waitForTimeout(Number(wait))
await page.screenshot({ path: out })
console.log(JSON.stringify({ frames: page.frames().map((f) => f.url()).slice(0, 12), problems: problems.slice(0, 40) }, null, 2))
await browser.close()

