import { createServer, type Server } from 'node:http'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import { launchShell, closeAndSaveVideo, screenshotPath } from './helpers'

/**
 * The 알림·홍보 목록 on the desktop app: the list from a local server standing in for the
 * notice repository, its desktop popup shown on the home and put away for the day, and the
 * promos at the bottom of the home beside who made the app, with the uploaded picture.
 */

const PICTURE = '0f8fad5b-d9cb-469f-a165-70867728950e.png'
const PNG = readFileSync(join(__dirname, '..', 'apps', 'shell', 'build', 'icon.png'))
const promo = (id: string, title: string, mediaType = 'none', mediaUrl = '') => ({
  id,
  enabled: true,
  title,
  text: title + ' 소개',
  mediaType,
  mediaUrl,
  linkUrl: 'https://example.com/' + id,
  linkLabel: '보러 가기',
  startsAt: '',
  endsAt: '',
})
const NOTICES = {
  version: 1,
  popups: [
    {
      id: 'desktop-news',
      enabled: true,
      title: '데스크톱 소식',
      body: '데스크톱 앱에만 보이는 팝업',
      mediaType: 'none',
      mediaUrl: '',
      linkUrl: '',
      linkLabel: '',
      placements: ['desktop'],
      startsAt: '',
      endsAt: '',
    },
    {
      id: 'web-only',
      enabled: true,
      title: '웹 소식',
      body: '웹에만',
      mediaType: 'none',
      mediaUrl: '',
      linkUrl: '',
      linkLabel: '',
      placements: ['home', 'app'],
      startsAt: '',
      endsAt: '',
    },
  ],
  promos: [
    promo('book', '바로 배워서 바로 써먹는 AI 에이전트', 'image', '/__web/popup-media/' + PICTURE),
    promo('gemini', '교실로 ON 제미나이'),
    promo('training', '클래스똑딱 연수', 'youtube', 'https://youtu.be/37n2EIFW6Hw'),
    { ...promo('later', '나중 소식'), startsAt: '2099-01-01' },
  ],
}

test('the desktop home shows the list from outside: its popup, then the promos', async () => {
  test.setTimeout(2 * 60_000)
  const server: Server = createServer((req, res) => {
    if (req.url === '/notices.json') {
      res.writeHead(200, { 'Content-Type': 'application/json', ETag: '"one"' })
      res.end(JSON.stringify(NOTICES))
    } else if (req.url === '/media/' + PICTURE) {
      res.writeHead(200, { 'Content-Type': 'image/png' })
      res.end(PNG)
    } else {
      res.writeHead(404)
      res.end()
    }
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  const launched = await launchShell({
    videoDir: 'home-notices',
    onboardingSeen: true,
    lang: 'ko',
    env: { TTOKTTAK_NOTICE_URL: 'http://127.0.0.1:' + port + '/notices.json' },
  })
  const { page } = launched
  try {
    await page.setViewportSize({ width: 1300, height: 900 })
    const popup = page.getByTestId('home-popup')
    await expect(popup).toBeVisible({ timeout: 30_000 })
    await expect(popup).toContainText('데스크톱 소식')
    await page.screenshot({ path: screenshotPath('home-notices-popup') })
    await popup.getByLabel('오늘 하루 보지 않기').check()
    await popup.getByRole('button', { name: '닫기' }).click()
    // the popup for the web only does not follow on the desktop
    await expect(popup).toBeHidden()

    const promos = page.getByTestId('home-promos')
    await promos.scrollIntoViewIfNeeded()
    await expect(promos.locator('.promo-card')).toHaveCount(3)
    await expect(promos.locator('.promo-title').first()).toHaveText(
      '인천봉수초 홍찬우가 만들었어요',
    )
    // three promos inside their dates take turns; the one starting in 2099 is not among them
    await expect(promos.locator('.home-promo-dots button')).toHaveCount(3)
    await expect(promos).not.toContainText('나중 소식')
    await expect(promos.locator('img').first()).toHaveAttribute('src', /^data:image\/png;base64,/)
    await page.screenshot({ path: screenshotPath('home-notices-promos') })

    // a YouTube promo: its thumbnail on the card, and pressing it plays the video over the home
    await promos.getByRole('button', { name: '클래스똑딱 연수 보기' }).click()
    const clip = promos.getByRole('button', { name: /클래스똑딱 연수/ }).first()
    await expect(clip.locator('img')).toHaveAttribute('src', /i\.ytimg\.com\/vi\/37n2EIFW6Hw/)
    await clip.click()
    const player = page.getByTestId('promo-player')
    await expect(player).toBeVisible()
    await expect(player.locator('iframe')).toHaveAttribute(
      'src',
      /youtube-nocookie\.com\/embed\/37n2EIFW6Hw/,
    )
    await page.screenshot({ path: screenshotPath('home-notices-player') })
    await player.getByRole('button', { name: '닫기' }).click()
    await expect(player).toBeHidden()

    // put away for today: opening the home again does not bring it back
    await page.reload()
    await expect(page.getByTestId('home-promos')).toBeVisible({ timeout: 30_000 })
    await page.waitForTimeout(1500)
    await expect(page.getByTestId('home-popup')).toBeHidden()
  } finally {
    await closeAndSaveVideo(launched, 'home-notices')
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})
