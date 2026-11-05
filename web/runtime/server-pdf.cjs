'use strict'
/**
 * printToPDF for the web edition's print windows. In the web edition a window's page is
 * drawn by the user's browser, which cannot hand back a PDF; a page that is a file on this
 * server (an editor's self-contained print page, e.g. the HWP editor's pages as SVG) is
 * printed here instead, by the server's Chromium (WEB_PDF_CHROMIUM) with the same options
 * Electron takes. One Chromium per session program, started when first needed and closed
 * after a minute unused.
 */
const IDLE_MS = 60_000

let launching = null
let idleTimer = null

function chromium() {
  if (!launching) {
    const { chromium: pw } = require('playwright-core')
    launching = pw
      .launch({
        executablePath: process.env.WEB_PDF_CHROMIUM,
        args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
      })
      .catch((err) => {
        launching = null
        throw err
      })
  }
  return launching
}

function closeLater() {
  clearTimeout(idleTimer)
  idleTimer = setTimeout(() => {
    const was = launching
    launching = null
    if (was) was.then((b) => b.close()).catch(() => {})
  }, IDLE_MS)
  idleTimer.unref?.()
}

const inches = (n) => (typeof n === 'number' && Number.isFinite(n) ? n + 'in' : '0')

/** whether this server prints such a page itself */
function printsHere(url) {
  return (
    Boolean(process.env.WEB_PDF_CHROMIUM) && typeof url === 'string' && url.startsWith('file://')
  )
}

/** the page at `url` (file://) as PDF bytes, with Electron's printToPDF options */
async function printFileToPdf(url, options = {}) {
  clearTimeout(idleTimer)
  const browser = await chromium()
  // print pages are static: no scripts, as Electron's print windows run them
  const context = await browser.newContext({ javaScriptEnabled: false })
  try {
    const page = await context.newPage()
    await page.goto(url, { waitUntil: 'load', timeout: 60_000 })
    const m = options.margins || {}
    const pdf = await page.pdf({
      preferCSSPageSize: options.preferCSSPageSize !== false,
      printBackground: options.printBackground !== false,
      landscape: Boolean(options.landscape),
      ...(typeof options.scale === 'number' ? { scale: options.scale } : {}),
      margin: {
        top: inches(m.top),
        bottom: inches(m.bottom),
        left: inches(m.left),
        right: inches(m.right),
      },
    })
    return Buffer.from(pdf)
  } finally {
    await context.close().catch(() => {})
    closeLater()
  }
}

module.exports = { printsHere, printFileToPdf }
