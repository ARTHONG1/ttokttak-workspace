/**
 * The memo panel in the built app: reading Hancom-style memos, editing them,
 * adding one, holding save and tab close while its editor is open, and saving
 * them back as HWP and HWPX.
 *
 * The fixture `memo.hwp` / `memo.hwpx` is built by
 * `apps/hwp/scripts/make-memo-fixtures.mjs` with this app's engine, not by
 * Hancom Hangul. The Hancom-made HWP sample is covered by the engine tests; a
 * Hancom-made HWPX sample was not available on this PC (see
 * `docs/tracking/status.md`).
 */
import { test, expect } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { existsSync, readdirSync } from 'node:fs'
import { copyFile, mkdtemp, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeAndSaveVideo, launchShell, waitForPageWithUrl } from './helpers'

const FIXTURES = join(__dirname, '..', 'apps', 'hwp', 'tests', 'fixtures')

interface TabsApiOnWindow {
  aiOfficeTabs: {
    list(): Promise<Array<{ id: string; kind: string; active: boolean; filePath?: string }>>
    close(id: string): Promise<void>
  }
  aiOffice: { openPath(path: string): Promise<void> }
}

/** A scratch copy so a test never changes the committed fixture. */
async function scratchCopy(name: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'genoffice-hwp-memo-'))
  const file = join(dir, name)
  await copyFile(join(FIXTURES, name), file)
  return file
}

/** The page that holds the tab bar and the home API. */
async function shellPage(app: ElectronApplication): Promise<Page> {
  for (const candidate of app.windows()) {
    const has = await candidate
      .evaluate(() => typeof (window as { aiOfficeTabs?: unknown }).aiOfficeTabs === 'object')
      .catch(() => false)
    if (has) return candidate
  }
  throw new Error('no shell page')
}

async function hwpPage(app: ElectronApplication): Promise<Page> {
  const page = await waitForPageWithUrl(app, '://hwp/')
  await page.waitForSelector('.hwp-app[data-phase="ready"]', { timeout: 90_000 })
  await expect(
    page.frameLocator('.hwp-editor-host iframe').locator('[data-cmd="ext:ttok-save"]'),
  ).toHaveCount(1)
  return page
}

/** The memo dock is a second mode of the shared dock; collapse the AI panel first. */
async function openMemoPanel(page: Page): Promise<void> {
  // A reopened tab keeps the dock's last mode: the memo panel may already be out.
  if (
    await page
      .locator('.memo-add-button')
      .isVisible()
      .catch(() => false)
  )
    return
  const collapse = page.locator('.ai-panel-collapse')
  if (await collapse.isVisible().catch(() => false)) await collapse.click()
  await page.locator('.memo-rail').click()
  await expect(page.locator('.memo-panel')).not.toHaveAttribute('aria-hidden', 'true')
  await expect(page.locator('.memo-add-button')).toBeVisible()
}

const memoCards = (page: Page) => page.locator('.memo-card')

/**
 * Where a plain Save of this file lands. HWPX is the default save format
 * (apps/hwp/AGENTS.md, user decision 2026-10-30): an opened .hwp is written as
 * <name>.hwpx beside it and the .hwp is left as it was; an .hwpx is written in place.
 */
function savedPathOf(file: string): string {
  return file.endsWith('.hwp') ? file.slice(0, -'.hwp'.length) + '.hwpx' : file
}

/** The file's mtime, or null while it does not exist yet. */
async function mtimeOf(file: string): Promise<number | null> {
  return existsSync(file) ? (await stat(file)).mtimeMs : null
}

/** The File menu items the plugin adds fire this event on the editor's window. */
async function fileCommand(page: Page, command: 'save' | 'saveAs'): Promise<void> {
  await page.evaluate((detail) => {
    const frame = document.querySelector('.hwp-editor-host iframe') as HTMLIFrameElement | null
    frame?.contentWindow?.dispatchEvent(new CustomEvent('ttok:file-command', { detail }))
  }, command)
}

/** The HWP tab's id in the tab bar. */
async function hwpTabId(app: ElectronApplication): Promise<string> {
  const shell = await shellPage(app)
  return shell.evaluate(async () => {
    const api = (window as unknown as TabsApiOnWindow).aiOfficeTabs
    return (await api.list()).find((tab) => tab.kind === 'hwp')?.id ?? ''
  })
}

async function hwpTabOpen(app: ElectronApplication): Promise<boolean> {
  const shell = await shellPage(app)
  return shell.evaluate(async () => {
    const api = (window as unknown as TabsApiOnWindow).aiOfficeTabs
    return (await api.list()).some((tab) => tab.kind === 'hwp')
  })
}

async function closeHwpTab(app: ElectronApplication): Promise<void> {
  const id = await hwpTabId(app)
  if (!id) return
  const shell = await shellPage(app)
  await shell.evaluate(
    (tabId) => (window as unknown as TabsApiOnWindow).aiOfficeTabs.close(tabId),
    id,
  )
}

async function reopenFile(app: ElectronApplication, file: string): Promise<Page> {
  await closeHwpTab(app)
  await expect.poll(() => hwpTabOpen(app), { timeout: 15_000 }).toBe(false)
  const shell = await shellPage(app)
  await shell.evaluate(
    (path) => (window as unknown as TabsApiOnWindow).aiOffice.openPath(path),
    file,
  )
  return hwpPage(app)
}

/** A stale copy of the save dialog's answer changes per test. */
async function answerSaveAs(app: ElectronApplication, target: string): Promise<void> {
  await app.evaluate(({ dialog: d }, filePath) => {
    const scope = globalThis as { __saveCalls?: number }
    scope.__saveCalls = 0
    d.showSaveDialog = async () => {
      scope.__saveCalls = (scope.__saveCalls ?? 0) + 1
      return { canceled: false, filePath }
    }
  }, target)
}

for (const format of ['hwp', 'hwpx'] as const) {
  test(`lists three memos and keeps an edited body through ${format.toUpperCase()} save and reopen`, async () => {
    const file = await scratchCopy(`memo.${format}`)
    const launched = await launchShell({
      onboardingSeen: true,
      lang: 'ko',
      openFile: file,
      videoDir: `hwp-memos-list-${format}`,
      recordVideo: false,
    })
    try {
      let page = await hwpPage(launched.app)
      await openMemoPanel(page)
      await expect(memoCards(page)).toHaveCount(3)
      await expect(page.locator('.memo-card-author')).toContainText([
        '상자작성자',
        '본문작성자',
        '표작성자',
      ])
      await expect(page.locator('.memo-card-text')).toContainText([
        '글상자 메모입니다.',
        '본문 메모입니다.',
        '표 칸 메모입니다.',
      ])

      const body = memoCards(page).filter({ hasText: '본문 메모입니다.' })
      await body.getByRole('button', { name: '고치기' }).click()
      await expect(page.locator('.memo-modal-title')).toHaveText('메모 고치기')
      await expect(page.locator('.memo-textarea')).toHaveValue(
        '본문 메모입니다.\n두 번째 문단입니다.',
      )
      await page.locator('.memo-textarea').fill('고친 본문 메모입니다.')
      await page.locator('.memo-modal .memo-button-primary').click()
      await expect(page.locator('.memo-modal')).toHaveCount(0)
      await expect(memoCards(page).filter({ hasText: '고친 본문 메모입니다.' })).toHaveCount(1)

      const saved = savedPathOf(file)
      const original = await readFile(file)
      const before = await mtimeOf(saved)
      await fileCommand(page, 'save')
      await expect.poll(() => mtimeOf(saved), { timeout: 20_000 }).not.toBe(before)
      await expect.poll(() => mtimeOf(saved)).not.toBeNull()
      // an opened .hwp is never overwritten
      if (saved !== file) expect((await readFile(file)).equals(original)).toBe(true)

      page = await reopenFile(launched.app, saved)
      await openMemoPanel(page)
      await expect(memoCards(page)).toHaveCount(3)
      await expect(memoCards(page).filter({ hasText: '고친 본문 메모입니다.' })).toHaveCount(1)
    } finally {
      await closeAndSaveVideo(launched, `hwp-memos-list-${format}`)
    }
  })
}

test('adds a memo, then holds save and tab close until its editor is closed', async () => {
  const file = await scratchCopy('memo.hwp')
  const launched = await launchShell({
    onboardingSeen: true,
    lang: 'ko',
    openFile: file,
    videoDir: 'hwp-memos-add',
    recordVideo: false,
  })
  try {
    const page = await hwpPage(launched.app)
    await openMemoPanel(page)
    const box = (await page.locator('.hwp-editor-host iframe').boundingBox())!
    // The body's first line is near the top of the page; End puts the caret
    // after the existing memo anchor instead of inside it.
    await page.mouse.click(box.x + box.width * 0.25, box.y + 190)
    await page.keyboard.press('End')
    await page.locator('.memo-add-button').click()
    await expect(page.locator('.memo-modal')).toBeVisible()
    await expect(page.locator('.memo-modal-title')).toHaveText('메모 넣기')
    await expect(page.locator('.memo-author-value')).not.toBeEmpty()
    await page.locator('.memo-textarea').fill('새로 넣은 메모입니다.')

    const saved = savedPathOf(file)
    const before = (await stat(file)).mtimeMs
    await fileCommand(page, 'save')
    await expect(page.locator('.hwp-notice')).toContainText(
      '메모 작성을 먼저 저장하거나 취소해 주세요.',
    )
    await expect.poll(async () => (await stat(file)).mtimeMs).toBe(before)
    expect(existsSync(saved)).toBe(false)

    // closing asks in main (a hung page must not keep the tab open): Cancel keeps it
    await launched.app.evaluate(({ dialog: d }) => {
      const scope = globalThis as { __memoClosePrompts?: number }
      scope.__memoClosePrompts = 0
      d.showMessageBox = (async () => {
        scope.__memoClosePrompts = (scope.__memoClosePrompts ?? 0) + 1
        return { response: 1, checkboxChecked: false }
      }) as typeof d.showMessageBox
    })
    await closeHwpTab(launched.app)
    await expect
      .poll(() =>
        launched.app.evaluate(
          () => (globalThis as { __memoClosePrompts?: number }).__memoClosePrompts ?? 0,
        ),
      )
      .toBe(1)
    await expect.poll(() => hwpTabOpen(launched.app)).toBe(true)
    await expect(page.locator('.memo-modal')).toBeVisible()

    // The blocked attempts kept the text; saving from the same modal commits it.
    await page.locator('.memo-modal .memo-button-primary').click()
    await expect(page.locator('.memo-modal')).toHaveCount(0)
    await expect(memoCards(page).filter({ hasText: '새로 넣은 메모입니다.' })).toHaveCount(1)

    await fileCommand(page, 'save')
    await expect.poll(() => mtimeOf(saved), { timeout: 20_000 }).not.toBeNull()
    expect((await stat(file)).mtimeMs).toBe(before)
    const reopened = await reopenFile(launched.app, saved)
    await openMemoPanel(reopened)
    await expect(memoCards(reopened).filter({ hasText: '새로 넣은 메모입니다.' })).toHaveCount(1)
  } finally {
    await closeAndSaveVideo(launched, 'hwp-memos-add')
  }
})

test('removes a memo and brings it back with undo', async () => {
  const file = await scratchCopy('memo.hwp')
  const launched = await launchShell({
    onboardingSeen: true,
    lang: 'ko',
    openFile: file,
    videoDir: 'hwp-memos-undo',
    recordVideo: false,
  })
  try {
    const page = await hwpPage(launched.app)
    await openMemoPanel(page)
    await expect(memoCards(page)).toHaveCount(3)
    const table = memoCards(page).filter({ hasText: '표 칸 메모입니다.' })
    await table.getByRole('button', { name: '지우기' }).click()
    await expect(memoCards(page)).toHaveCount(2)

    const box = (await page.locator('.hwp-editor-host iframe').boundingBox())!
    await page.mouse.click(box.x + box.width * 0.25, box.y + 190)
    await page.keyboard.press('Control+z')
    await expect(memoCards(page)).toHaveCount(3, { timeout: 15_000 })
    await expect(memoCards(page).filter({ hasText: '표 칸 메모입니다.' })).toHaveCount(1)
  } finally {
    await closeAndSaveVideo(launched, 'hwp-memos-undo')
  }
})

test('saves the memos into HWPX and reads them back', async () => {
  const file = await scratchCopy('memo.hwp')
  const outDir = await mkdtemp(join(tmpdir(), 'genoffice-hwp-memo-hwpx-'))
  const target = join(outDir, 'memo-copy.hwpx')
  const launched = await launchShell({
    onboardingSeen: true,
    lang: 'ko',
    openFile: file,
    videoDir: 'hwp-memos-hwpx',
    recordVideo: false,
  })
  try {
    const page = await hwpPage(launched.app)
    await openMemoPanel(page)
    await expect(memoCards(page)).toHaveCount(3)
    await answerSaveAs(launched.app, target)
    await fileCommand(page, 'saveAs')
    await expect
      .poll(
        () =>
          launched.app.evaluate(() => (globalThis as { __saveCalls?: number }).__saveCalls ?? 0),
        {
          timeout: 10_000,
        },
      )
      .toBe(1)
    await expect.poll(() => existsSync(target), { timeout: 30_000 }).toBe(true)
    expect(readdirSync(outDir)).toContain('memo-copy.hwpx')

    const reopened = await reopenFile(launched.app, target)
    await openMemoPanel(reopened)
    await expect(memoCards(reopened)).toHaveCount(3)
    await expect(reopened.locator('.memo-card-author')).toContainText([
      '상자작성자',
      '본문작성자',
      '표작성자',
    ])
  } finally {
    await closeAndSaveVideo(launched, 'hwp-memos-hwpx')
  }
})
