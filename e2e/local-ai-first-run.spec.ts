import { expect, test } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import {
  launchShell,
  closeAndSaveVideo,
  screenshotPath,
  waitForPageWithUrl,
  enterWorkspace,
} from './helpers'

const fixtureRoot =
  process.env.GENOFFICE_LOCAL_AI_FIXTURE_ROOT || join(homedir(), 'Desktop/인공지능 모델/.local-ai')
const model = join(fixtureRoot, 'models/Qwen3.5-2B-Q4_K_M.gguf')
const executable = join(fixtureRoot, 'runtime/llama-b12167/llama-server')
const packagedExecutable = process.env.GENOFFICE_E2E_PACKAGED_EXECUTABLE
const bundledDir = packagedExecutable
  ? resolve(dirname(packagedExecutable), '../Resources/local-ai')
  : null
const testEnv = packagedExecutable
  ? {}
  : { GENOFFICE_LOCAL_AI_MODEL: model, GENOFFICE_LOCAL_AI_RUNTIME: executable }
const modelReady = bundledDir
  ? existsSync(join(bundledDir, 'model.gguf')) && existsSync(join(bundledDir, 'llama-server'))
  : existsSync(model) && existsSync(executable)

function bundledServerPids(): number[] {
  if (!bundledDir) return []
  const runtime = join(bundledDir, 'llama-server')
  const modelFile = join(bundledDir, 'model.gguf')
  // Return PIDs only; the actual command line contains the ephemeral API key.
  return execFileSync('ps', ['-axww', '-o', 'pid=,command='], { encoding: 'utf8' })
    .split('\n')
    .filter((line) => line.includes(`${runtime} --model ${modelFile}`))
    .map((line) => Number.parseInt(line.trim(), 10))
    .filter(Number.isInteger)
}

test('fresh installation selects the bundled local model and accepts a keyless connection test', async () => {
  test.setTimeout(150_000)
  test.skip(!modelReady, 'Local model/runtime are not staged')
  const launched = await launchShell({
    onboardingSeen: true,
    subscriptionNoticeSeen: false,
    recordVideo: false,
    videoDir: 'local-ai-first-run',
    env: testEnv,
  })
  const { page } = launched
  let bundledPid: number | undefined
  try {
    if (packagedExecutable) {
      const runtime = await launched.app.evaluate(({ app }) => ({
        packaged: app.isPackaged,
        resourcesPath: process.resourcesPath,
      }))
      expect(runtime.packaged).toBe(true)
      expect(runtime.resourcesPath).toBe(resolve(bundledDir!, '..'))
    }
    const settings = await page.evaluate(() => window.aiOffice.getAiSettings())
    expect(settings.provider).toBe('local')
    expect(settings.providers.local.model).toBe('qwen3.5-2b-local')
    expect(settings.providers.local.apiKey).toBe('')
    expect(
      (await page.evaluate(() => window.aiOffice.getAiProviders())).find((p) => p.id === 'local')
        ?.defaultBaseUrl,
    ).toBe('')
    console.log('[local-ai-e2e] fresh default and provider catalog ready')

    await enterWorkspace(page)
    await expect(page.locator('.hub-title').first()).toBeVisible()
    console.log('[local-ai-e2e] workspace entered')
    const opened = await launched.app.evaluate(({ Menu, BrowserWindow }) => {
      const item = Menu.getApplicationMenu()
        ?.items.flatMap((entry) => entry.submenu?.items ?? [])
        .find((entry) => entry.id === 'workspace-ai-settings')
      if (!item) return false
      item.click(undefined as never, BrowserWindow.getAllWindows()[0], undefined as never)
      return true
    })
    expect(opened).toBe(true)
    await expect(page.locator('.set-dialog')).toBeVisible()
    await expect(page.locator('.first-notice-overlay')).toHaveCount(0)
    console.log('[local-ai-e2e] settings opened without subscription notice')
    await page.locator('.set-nav-item').filter({ hasText: 'AI' }).first().click()
    await expect(page.getByTestId('offline-ai-info')).toBeVisible()
    await expect(page.locator('.set-sub-cards')).toHaveCount(0)
    await expect(page.getByTestId('external-ai-toggle')).toHaveAttribute('aria-expanded', 'false')
    await page.getByTestId('external-ai-toggle').click()
    await expect(page.locator('.set-sub-cards')).toBeVisible()
    await page.getByTestId('external-ai-toggle').click()
    await expect(page.locator('.set-sub-cards')).toHaveCount(0)
    await page.locator('.set-adv-toggle:not(.set-external-ai-toggle)').click()
    console.log('[local-ai-e2e] advanced editor opened')
    await expect(page.locator('.set-pane-head .set-pane-title')).toHaveText('AI Model')
    await expect(page.locator('#set-ai-key')).toHaveCount(0)
    await expect(page.locator('#set-ai-base-url')).toHaveCount(0)
    await expect(page.locator('#set-ai-cli-path')).toHaveCount(0)
    await expect(page.locator('.set-pane-head .set-dd')).toHaveCount(0)

    await page.locator('.set-pane-head .set-btn').filter({ hasText: /Test/i }).click()
    console.log('[local-ai-e2e] local connection ping submitted')
    await expect(page.locator('.set-pane-head [role="status"]')).toContainText(
      /Connection OK|연결 성공|连接成功/i,
      { timeout: 90_000 },
    )
    if (packagedExecutable) {
      await expect.poll(bundledServerPids, { timeout: 10_000 }).not.toEqual([])
      const pids = bundledServerPids()
      expect(pids).toHaveLength(1)
      bundledPid = pids[0]
      console.log('[local-ai-e2e] bundled model process started:', bundledPid)
    }
    await page.screenshot({ path: screenshotPath('local-ai-first-run') })
  } finally {
    await closeAndSaveVideo(launched, 'local-ai-first-run')
    if (bundledPid !== undefined) {
      await expect.poll(bundledServerPids, { timeout: 15_000 }).not.toContain(bundledPid)
      console.log('[local-ai-e2e] bundled model process exited:', bundledPid)
    }
  }
})

test('offline AI edits one quoted phrase in DOCX and preserves other content after save and reopen', async () => {
  test.setTimeout(150_000)
  test.skip(!modelReady, 'Local model/runtime are not staged')
  const outputDir = await mkdtemp(join(tmpdir(), 'genoffice-local-edit-'))
  const launched = await launchShell({
    onboardingSeen: true,
    subscriptionNoticeSeen: false,
    recordVideo: false,
    videoDir: 'local-ai-docx-edit',
    env: testEnv,
  })
  try {
    await enterWorkspace(launched.page)
    await expect(launched.page.locator('.hub-title').first()).toBeVisible()
    await launched.page.locator('.trial-tile[data-ext="docx"]').click()
    const page = await waitForPageWithUrl(launched.app, '://docs/')
    await expect(page.locator('.ProseMirror').first()).toBeVisible({ timeout: 30_000 })
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            Boolean((window as unknown as { __aidocs?: { editor?: unknown } }).__aidocs?.editor),
          ),
        { timeout: 30_000 },
      )
      .toBe(true)
    const before = [
      '새빛초등학교 공문',
      '행사일: 2026년 12월 3일',
      '예산: 350,000원',
      '협조 부탁드립니다.',
    ]
    const after = [...before.slice(0, -1), '협조하여 주시기 바랍니다.']
    await page.evaluate((lines) => {
      const editor = (
        window as unknown as {
          __aidocs: { editor: import('@tiptap/core').Editor }
        }
      ).__aidocs.editor
      editor.commands.setContent({
        type: 'doc',
        content: lines.map((line) => ({
          type: 'docParagraph',
          content: [{ type: 'text', text: line }],
        })),
      })
    }, before)
    const readParagraphs = () =>
      page.evaluate(() => {
        const editor = (
          window as unknown as {
            __aidocs: { editor: import('@tiptap/core').Editor }
          }
        ).__aidocs.editor
        return editor.state.doc.content.content.map((node) => node.textContent)
      })
    expect(await readParagraphs()).toEqual(before)

    await page.evaluate(() => {
      const diagnosticWindow = window as unknown as { __localAiChunks?: unknown[] }
      diagnosticWindow.__localAiChunks = []
      window.desktop.onAiStream((chunk) => diagnosticWindow.__localAiChunks?.push(chunk))
    })

    const input = page.locator('.ai-composer textarea')
    await expect(input).toBeVisible()
    await input.fill(
      '날짜와 예산은 그대로 두고 "협조 부탁드립니다."를 "협조하여 주시기 바랍니다."로 바꿔 줘.',
    )
    await page.locator('.ai-composer .ai-send-btn').click()
    try {
      await expect.poll(readParagraphs, { timeout: 30_000 }).toEqual(after)
    } catch (error) {
      const diagnostic = await page.evaluate(async () => ({
        provider: (await window.desktop.getAiSettings()).provider,
        chunkTypes: (
          (window as unknown as { __localAiChunks?: Array<{ type?: string }> }).__localAiChunks ??
          []
        ).map((c) => c.type),
        errors: document.querySelectorAll('.ai-msg-error').length,
      }))
      console.log('[local-ai-e2e] failed DOCX edit diagnostic:', JSON.stringify(diagnostic))
      throw error
    }
    // The edit itself can succeed while AgentLoop's final summary turn fails.
    // Check the entire agent run has actually finished successfully.
    await expect(page.locator('.ai-msg-assistant').last()).toContainText(
      '요청하신 문구를 변경했습니다.',
      {
        timeout: 30_000,
      },
    )
    await expect(page.locator('.ai-msg-assistant.ai-msg-streaming')).toHaveCount(0)
    await expect(page.locator('.ai-msg-error')).toHaveCount(0)

    await launched.app.evaluate(
      ({ dialog }, outputPath) => {
        dialog.showSaveDialog = async () => ({ canceled: false, filePath: outputPath })
      },
      join(outputDir, 'local-edited.docx'),
    )
    expect(
      await page.evaluate(() =>
        (window as unknown as { __aidocs: { save: () => Promise<boolean> } }).__aidocs.save(),
      ),
    ).toBe(true)
    const files = (await readdir(outputDir)).filter((name) => name.endsWith('.docx'))
    expect(files).toHaveLength(1)
    const saved = join(outputDir, files[0])
    await page.evaluate((path) => {
      ;(window as unknown as { __aidocs: { openPath: (p: string) => void } }).__aidocs.openPath(
        path,
      )
    }, saved)
    await expect.poll(readParagraphs, { timeout: 20_000 }).toEqual(after)
  } finally {
    await closeAndSaveVideo(launched, 'local-ai-docx-edit')
    await rm(outputDir, { recursive: true, force: true })
  }
})

test('offline AI answers a document question without exceeding the model context', async () => {
  test.setTimeout(180_000)
  test.skip(!modelReady, 'Local model/runtime are not staged')
  const launched = await launchShell({
    onboardingSeen: true,
    subscriptionNoticeSeen: false,
    recordVideo: false,
    videoDir: 'local-ai-docx-question',
    env: testEnv,
  })
  try {
    await enterWorkspace(launched.page)
    await expect(launched.page.locator('.hub-title').first()).toBeVisible()
    await launched.page.locator('.trial-tile[data-ext="docx"]').click()
    const page = await waitForPageWithUrl(launched.app, '://docs/')
    await expect(page.locator('.ProseMirror').first()).toBeVisible({ timeout: 30_000 })
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            Boolean((window as unknown as { __aidocs?: { editor?: unknown } }).__aidocs?.editor),
          ),
        { timeout: 30_000 },
      )
      .toBe(true)
    await page.evaluate(() => {
      const editor = (window as unknown as { __aidocs: { editor: import('@tiptap/core').Editor } })
        .__aidocs.editor
      editor.commands.setContent({
        type: 'doc',
        content: [
          {
            type: 'docHeading',
            attrs: { level: 1 },
            content: [{ type: 'text', text: '새빛초등학교 공문' }],
          },
        ],
      })
    })
    const input = page.locator('.ai-composer textarea')
    await expect(input).toBeVisible()
    await input.fill('이 문서 제목이 무엇인가요? 한 문장으로 알려 주세요.')
    await page.locator('.ai-composer .ai-send-btn').click()
    await expect(page.locator('.ai-msg-assistant').last()).toBeVisible({ timeout: 90_000 })
    await expect(page.locator('.ai-msg-assistant.ai-msg-streaming')).toHaveCount(0, {
      timeout: 90_000,
    })
    await expect(page.locator('.ai-msg-error')).toHaveCount(0)
    await expect(page.locator('.ai-msg-assistant').last()).toContainText('새빛초등학교')
  } finally {
    await closeAndSaveVideo(launched, 'local-ai-docx-question')
  }
})

test('offline AI changes the color of named text while leaving adjacent text untouched', async () => {
  test.setTimeout(180_000)
  test.skip(!modelReady, 'Local model/runtime are not staged')
  const launched = await launchShell({
    onboardingSeen: true,
    subscriptionNoticeSeen: false,
    recordVideo: false,
    videoDir: 'local-ai-docx-format',
    env: testEnv,
  })
  try {
    await enterWorkspace(launched.page)
    await expect(launched.page.locator('.hub-title').first()).toBeVisible()
    await launched.page.locator('.trial-tile[data-ext="docx"]').click()
    const page = await waitForPageWithUrl(launched.app, '://docs/')
    await expect(page.locator('.ProseMirror').first()).toBeVisible({ timeout: 30_000 })
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            Boolean((window as unknown as { __aidocs?: { editor?: unknown } }).__aidocs?.editor),
          ),
        { timeout: 30_000 },
      )
      .toBe(true)
    await page.evaluate(() => {
      const editor = (window as unknown as { __aidocs: { editor: import('@tiptap/core').Editor } })
        .__aidocs.editor
      editor.commands.setContent({
        type: 'doc',
        content: [
          { type: 'docParagraph', content: [{ type: 'text', text: '행사일은 12월 3일입니다.' }] },
          { type: 'docParagraph', content: [{ type: 'text', text: '중요 공지' }] },
        ],
      })
    })
    const readDocument = () =>
      page.evaluate(() => {
        const editor = (
          window as unknown as { __aidocs: { editor: import('@tiptap/core').Editor } }
        ).__aidocs.editor
        return editor.getJSON()
      })
    const input = page.locator('.ai-composer textarea')
    await expect(input).toBeVisible()
    await input.fill('문서에서 중요 공지 문단의 글자색을 빨간색으로 변경해 주세요.')
    await page.locator('.ai-composer .ai-send-btn').click()
    await expect(page.locator('.ai-msg-assistant').last()).toBeVisible({ timeout: 90_000 })
    await expect(page.locator('.ai-msg-assistant.ai-msg-streaming')).toHaveCount(0, {
      timeout: 90_000,
    })
    await expect
      .poll(
        async () => {
          const doc = (await readDocument()) as {
            content?: Array<{ content?: Array<{ marks?: Array<{ attrs?: { color?: string } }> }> }>
          }
          return doc.content?.[1]?.content?.[0]?.marks?.find((mark) => mark.attrs?.color)?.attrs
            ?.color
        },
        { timeout: 10_000 },
      )
      .toBe('FF0000')
    await expect(page.locator('.ai-msg-error')).toHaveCount(0)
    const doc = (await readDocument()) as {
      content?: Array<{ content?: Array<{ text?: string; marks?: unknown[] }> }>
    }
    expect(doc.content?.[0]?.content?.[0]).toEqual({
      type: 'text',
      text: '행사일은 12월 3일입니다.',
    })
    expect(doc.content?.[1]?.content?.[0]?.text).toBe('중요 공지')
  } finally {
    await closeAndSaveVideo(launched, 'local-ai-docx-format')
  }
})

test('offline AI edits a HWPX paragraph and preserves the rest after save and reopen', async () => {
  test.setTimeout(180_000)
  test.skip(!modelReady, 'Local model/runtime are not staged')
  const outputDir = await mkdtemp(join(tmpdir(), 'genoffice-local-hwpx-'))
  const file = join(outputDir, 'offline-edit.hwpx')
  execFileSync(process.execPath, [join(__dirname, 'assets', 'make-local-ai-hwpx.mjs'), file])

  const launched = await launchShell({
    onboardingSeen: true,
    subscriptionNoticeSeen: false,
    lang: 'ko',
    openFile: file,
    recordVideo: false,
    videoDir: 'local-ai-hwpx-edit',
    env: testEnv,
  })
  try {
    let page = await waitForPageWithUrl(launched.app, '://hwp/')
    const ready = async () => {
      await page.waitForSelector('.hwp-app[data-phase="ready"]', { timeout: 90_000 })
      await expect(
        page.frameLocator('.hwp-editor-host iframe').locator('[data-cmd="ext:ttok-save"]'),
      ).toHaveCount(1)
    }
    const readEditorText = async () =>
      page.evaluate(async () => {
        const iframe = document.querySelector('.hwp-editor-host iframe') as HTMLIFrameElement
        const studio = (iframe.contentWindow as any).rhwpStudio
        await studio.plugins.load('ttok-agent')
        return (await studio.plugins.invoke('ttok-agent', 'readText', [])) as string
      })
    await ready()
    const original = await readEditorText()
    expect(original).toContain('행사일: 2026년 12월 3일')
    expect(original).toContain('예산: 350,000원')
    expect(original).toContain('협조 부탁드립니다.')

    const input = page.locator('.ai-composer textarea')
    if (!(await input.isVisible())) await page.locator('.ai-rail').first().click()
    await expect(input).toBeVisible()
    await input.fill('"협조 부탁드립니다."를 "협조하여 주시기 바랍니다."로 바꿔 주세요.')
    await page.locator('.ai-composer .ai-send-btn').click()
    try {
      await expect(page.locator('.ai-chat .ai-msg-user')).toHaveCount(1, { timeout: 15_000 })
    } catch (error) {
      console.log(
        '[local-ai-e2e] HWPX send was not admitted:',
        JSON.stringify({
          chat: await page.locator('.ai-chat').innerText(),
          input: await input.inputValue(),
          sendDisabled: await page.locator('.ai-composer .ai-send-btn').isDisabled(),
          selectedProvider: (await page.evaluate(() => window.hwpApi.getAiSettings())).provider,
        }),
      )
      throw error
    }
    await expect(page.locator('.ai-msg-assistant').last()).toBeVisible({ timeout: 90_000 })
    await expect(page.locator('.ai-msg-assistant.ai-msg-streaming')).toHaveCount(0, {
      timeout: 90_000,
    })
    await expect(page.locator('.ai-msg-error')).toHaveCount(0)
    try {
      await expect.poll(readEditorText, { timeout: 20_000 }).toContain('협조하여 주시기 바랍니다.')
    } catch (error) {
      console.log(
        '[local-ai-e2e] failed HWPX edit diagnostic:',
        JSON.stringify({
          assistant: await page.locator('.ai-msg-assistant').allTextContents(),
          errors: await page.locator('.ai-msg-error').allTextContents(),
          editorText: await readEditorText(),
        }),
      )
      throw error
    }

    // A real user normally asks for a new value in Korean without placing
    // both the old and new text in quotation marks. This used to get a chat
    // explanation instead of an editor operation.
    const priorTurns = await page.locator('.ai-chat .ai-msg-user').count()
    await input.fill('예산을 450,000원으로 바꿔 주세요.')
    await page.locator('.ai-composer .ai-send-btn').click()
    await expect(page.locator('.ai-chat .ai-msg-user')).toHaveCount(priorTurns + 1, {
      timeout: 30_000,
    })
    try {
      await expect.poll(readEditorText, { timeout: 40_000 }).toContain('예산: 450,000원')
    } catch (error) {
      console.log(
        '[local-ai-e2e] contextual HWPX edit diagnostic:',
        JSON.stringify({
          assistant: await page.locator('.ai-msg-assistant').allTextContents(),
          errors: await page.locator('.ai-msg-error').allTextContents(),
          editorText: await readEditorText(),
        }),
      )
      throw error
    }
    await expect(page.locator('.ai-msg-assistant.ai-msg-streaming')).toHaveCount(0, {
      timeout: 40_000,
    })
    await expect(page.locator('.ai-msg-error')).toHaveCount(0)
    expect(await readEditorText()).not.toContain('예산: 350,000원')

    const beforeSave = (await stat(file)).mtimeMs
    await page.evaluate(() => {
      const iframe = document.querySelector('.hwp-editor-host iframe') as HTMLIFrameElement
      iframe.contentWindow?.dispatchEvent(new CustomEvent('ttok:file-command', { detail: 'save' }))
    })
    await expect
      .poll(async () => (await stat(file)).mtimeMs, { timeout: 30_000 })
      .not.toBe(beforeSave)

    // Electron's firstWindow() can be an editor view when a file is opened
    // at startup. Find the shell by its actual tabs preload API instead.
    let shell = launched.page
    await expect
      .poll(
        async () => {
          for (const candidate of launched.app.windows()) {
            const hasTabs = await candidate
              .evaluate(() => typeof (window as any).aiOfficeTabs?.list === 'function')
              .catch(() => false)
            if (hasTabs) {
              shell = candidate
              return true
            }
          }
          return false
        },
        { timeout: 30_000 },
      )
      .toBe(true)
    const tabId = await shell.evaluate(async () => {
      const api = (window as any).aiOfficeTabs
      return ((await api.list()) as Array<{ id: string; kind: string }>).find(
        (tab) => tab.kind === 'hwp',
      )?.id
    })
    expect(tabId).toBeTruthy()
    await shell.evaluate((id) => (window as any).aiOfficeTabs.close(id), tabId)
    await expect
      .poll(() =>
        shell.evaluate(async () =>
          (await (window as any).aiOfficeTabs.list()).some(
            (tab: { kind: string }) => tab.kind === 'hwp',
          ),
        ),
      )
      .toBe(false)
    await shell.evaluate((path) => (window as any).aiOffice.openPath(path), file)
    page = await waitForPageWithUrl(launched.app, '://hwp/')
    await ready()
    const reopened = await readEditorText()
    expect(reopened).toContain('협조하여 주시기 바랍니다.')
    expect(reopened).not.toContain('협조 부탁드립니다.')
    expect(reopened).toContain('새빛초등학교 공문')
    expect(reopened).toContain('행사일: 2026년 12월 3일')
    expect(reopened).toContain('예산: 450,000원')
  } finally {
    await closeAndSaveVideo(launched, 'local-ai-hwpx-edit')
    await rm(outputDir, { recursive: true, force: true })
  }
})

test('offline AI writes into a blank HWPX and the actual document persists on disk', async () => {
  test.setTimeout(240_000)
  test.skip(!modelReady, 'Local model/runtime are not staged')
  const outputDir = await mkdtemp(join(tmpdir(), 'genoffice-local-hwpx-draft-'))
  const file = join(outputDir, 'offline-draft.hwpx')
  execFileSync(process.execPath, [
    join(__dirname, 'assets', 'make-local-ai-hwpx.mjs'),
    file,
    '--blank',
  ])
  const launched = await launchShell({
    onboardingSeen: true,
    subscriptionNoticeSeen: false,
    lang: 'ko',
    openFile: file,
    recordVideo: false,
    videoDir: 'local-ai-hwpx-draft',
    env: testEnv,
  })
  try {
    let page = await waitForPageWithUrl(launched.app, '://hwp/')
    const ready = async () => {
      await page.waitForSelector('.hwp-app[data-phase="ready"]', { timeout: 90_000 })
      await expect(
        page.frameLocator('.hwp-editor-host iframe').locator('[data-cmd="ext:ttok-save"]'),
      ).toHaveCount(1)
    }
    const readEditorText = async () =>
      page.evaluate(async () => {
        const iframe = document.querySelector('.hwp-editor-host iframe') as HTMLIFrameElement
        const studio = (iframe.contentWindow as any).rhwpStudio
        await studio.plugins.load('ttok-agent')
        return (await studio.plugins.invoke('ttok-agent', 'readText', [])) as string
      })
    await ready()
    expect((await readEditorText()).trim()).toBe('')
    const input = page.locator('.ai-composer textarea')
    if (!(await input.isVisible())) await page.locator('.ai-rail').first().click()
    await expect(input).toBeVisible()
    await input.fill('현장체험학습 계획서 작성해줘')
    await page.locator('.ai-composer .ai-send-btn').click()
    await expect(page.locator('.ai-msg-assistant').last()).toBeVisible({ timeout: 150_000 })
    await expect(page.locator('.ai-msg-assistant.ai-msg-streaming')).toHaveCount(0, {
      timeout: 150_000,
    })
    let written = ''
    try {
      await expect.poll(readEditorText, { timeout: 20_000 }).toContain('현장체험학습')
      written = await readEditorText()
      expect(written.length).toBeGreaterThan(90)
      await expect(page.locator('.ai-msg-error')).toHaveCount(0)
      await expect(page.locator('.ai-msg-assistant').last()).toContainText('문단을 작성했습니다')
    } catch (error) {
      console.log(
        '[local-ai-e2e] failed blank HWPX draft diagnostic:',
        JSON.stringify({
          assistant: await page.locator('.ai-msg-assistant').allTextContents(),
          errors: await page.locator('.ai-msg-error').allTextContents(),
          document: await readEditorText(),
          toolLabels: await page.locator('.ai-chat [class*="tool"]').allTextContents(),
        }),
      )
      throw error
    }

    const beforeSave = (await stat(file)).mtimeMs
    await page.evaluate(() => {
      const iframe = document.querySelector('.hwp-editor-host iframe') as HTMLIFrameElement
      iframe.contentWindow?.dispatchEvent(new CustomEvent('ttok:file-command', { detail: 'save' }))
    })
    await expect
      .poll(async () => (await stat(file)).mtimeMs, { timeout: 30_000 })
      .not.toBe(beforeSave)
    let shell = launched.page
    await expect
      .poll(
        async () => {
          for (const candidate of launched.app.windows()) {
            const hasTabs = await candidate
              .evaluate(() => typeof (window as any).aiOfficeTabs?.list === 'function')
              .catch(() => false)
            if (hasTabs) {
              shell = candidate
              return true
            }
          }
          return false
        },
        { timeout: 30_000 },
      )
      .toBe(true)
    const tabId = await shell.evaluate(
      async () =>
        ((await (window as any).aiOfficeTabs.list()) as Array<{ id: string; kind: string }>).find(
          (tab) => tab.kind === 'hwp',
        )?.id,
    )
    expect(tabId).toBeTruthy()
    await shell.evaluate((id) => (window as any).aiOfficeTabs.close(id), tabId)
    await expect
      .poll(() =>
        shell.evaluate(async () =>
          (await (window as any).aiOfficeTabs.list()).some(
            (tab: { kind: string }) => tab.kind === 'hwp',
          ),
        ),
      )
      .toBe(false)
    await shell.evaluate((path) => (window as any).aiOffice.openPath(path), file)
    page = await waitForPageWithUrl(launched.app, '://hwp/')
    await ready()
    const persisted = await readEditorText()
    expect(persisted).toContain('현장체험학습')
    expect(persisted.length).toBeGreaterThan(90)
    expect(persisted).toBe(written)
  } finally {
    await closeAndSaveVideo(launched, 'local-ai-hwpx-draft')
    await rm(outputDir, { recursive: true, force: true })
  }
})

test('offline AI carries a field-trip topic into "네가 알아서 넣어" and saves the edited HWPX', async () => {
  test.setTimeout(240_000)
  test.skip(!modelReady, 'Local model/runtime are not staged')
  const outputDir = await mkdtemp(join(tmpdir(), 'genoffice-local-hwpx-followup-'))
  const file = join(outputDir, 'followup-draft.hwpx')
  execFileSync(process.execPath, [
    join(__dirname, 'assets', 'make-local-ai-hwpx.mjs'),
    file,
    '--blank',
  ])
  const launched = await launchShell({
    onboardingSeen: true,
    lang: 'ko',
    openFile: file,
    recordVideo: false,
    videoDir: 'local-ai-hwpx-followup',
    env: testEnv,
  })
  try {
    let page = await waitForPageWithUrl(launched.app, '://hwp/')
    const ready = async () => {
      await page.waitForSelector('.hwp-app[data-phase="ready"]', { timeout: 90_000 })
      await expect(
        page.frameLocator('.hwp-editor-host iframe').locator('[data-cmd="ext:ttok-save"]'),
      ).toHaveCount(1)
    }
    const readEditorText = () =>
      page.evaluate(async () => {
        const iframe = document.querySelector('.hwp-editor-host iframe') as HTMLIFrameElement
        const studio = (iframe.contentWindow as any).rhwpStudio
        await studio.plugins.load('ttok-agent')
        return (await studio.plugins.invoke('ttok-agent', 'readText', [])) as string
      })
    await ready()
    const input = page.locator('.ai-composer textarea')
    if (!(await input.isVisible())) await page.locator('.ai-rail').first().click()
    const initialUserCount = await page.locator('.ai-msg-user').count()
    await input.fill('현장체험학습 계획서에는 어떤 항목이 들어가?')
    await page.locator('.ai-composer .ai-send-btn').click()
    // The first async send can still be starting when the UI has zero
    // streaming bubbles. Wait for the actual user turn before awaiting done.
    await expect(page.locator('.ai-msg-user')).toHaveCount(initialUserCount + 1, {
      timeout: 30_000,
    })
    await expect(page.locator('.ai-msg-assistant.ai-msg-streaming')).toHaveCount(0, {
      timeout: 120_000,
    })
    await expect(page.locator('.ai-msg-assistant').last()).toBeVisible()
    expect((await readEditorText()).trim()).toBe('')

    await input.fill('그냥 네가 알아서 넣으라구')
    await page.locator('.ai-composer .ai-send-btn').click()
    await expect(page.locator('.ai-msg-user')).toHaveCount(initialUserCount + 2, {
      timeout: 30_000,
    })
    try {
      await expect.poll(readEditorText, { timeout: 120_000 }).toContain('현장체험학습')
      await expect(page.locator('.ai-msg-assistant.ai-msg-streaming')).toHaveCount(0, {
        timeout: 30_000,
      })
      await expect(page.locator('.ai-msg-error')).toHaveCount(0)
      await expect(page.locator('.ai-msg-assistant').last()).toContainText(
        /넣었습니다|문단을 작성했습니다/,
      )
    } catch (error) {
      console.log(
        '[local-ai-e2e] HWPX follow-up diagnostic:',
        JSON.stringify({
          users: await page.locator('.ai-msg-user').allTextContents(),
          messages: await page.locator('.ai-msg-assistant').allTextContents(),
          errors: await page.locator('.ai-msg-error').allTextContents(),
          editor: await readEditorText(),
        }),
      )
      throw error
    }
    const written = await readEditorText()
    expect(written.length).toBeGreaterThan(90)
    const beforeSave = (await stat(file)).mtimeMs
    await page.evaluate(() => {
      const iframe = document.querySelector('.hwp-editor-host iframe') as HTMLIFrameElement
      iframe.contentWindow?.dispatchEvent(new CustomEvent('ttok:file-command', { detail: 'save' }))
    })
    await expect
      .poll(async () => (await stat(file)).mtimeMs, { timeout: 30_000 })
      .not.toBe(beforeSave)

    let shell = launched.page
    await expect
      .poll(
        async () => {
          for (const candidate of launched.app.windows()) {
            if (
              await candidate
                .evaluate(() => typeof (window as any).aiOfficeTabs?.list === 'function')
                .catch(() => false)
            ) {
              shell = candidate
              return true
            }
          }
          return false
        },
        { timeout: 30_000 },
      )
      .toBe(true)
    const tabId = await shell.evaluate(
      async () =>
        ((await (window as any).aiOfficeTabs.list()) as Array<{ id: string; kind: string }>).find(
          (tab) => tab.kind === 'hwp',
        )?.id,
    )
    expect(tabId).toBeTruthy()
    await shell.evaluate((id) => (window as any).aiOfficeTabs.close(id), tabId)
    await expect
      .poll(() =>
        shell.evaluate(async () =>
          (await (window as any).aiOfficeTabs.list()).some(
            (tab: { kind: string }) => tab.kind === 'hwp',
          ),
        ),
      )
      .toBe(false)
    await shell.evaluate((path) => (window as any).aiOffice.openPath(path), file)
    page = await waitForPageWithUrl(launched.app, '://hwp/')
    await ready()
    expect(await readEditorText()).toBe(written)
  } finally {
    await closeAndSaveVideo(launched, 'local-ai-hwpx-followup')
    await rm(outputDir, { recursive: true, force: true })
  }
})

// A dirty editor may veto app.quit() after Electron has already emitted before-quit.
// The bundled AI must still accept requests in that same process afterwards.
test('cancelled quit keeps local AI usable in the open editor', async () => {
  test.setTimeout(180_000)
  test.skip(!modelReady, 'Local model/runtime are not staged')
  const outputDir = await mkdtemp(join(tmpdir(), 'genoffice-local-ai-quit-veto-'))
  const file = join(outputDir, 'unsaved.hwpx')
  execFileSync(process.execPath, [
    join(__dirname, 'assets', 'make-local-ai-hwpx.mjs'),
    file,
    '--blank',
  ])
  const launched = await launchShell({
    onboardingSeen: true,
    lang: 'ko',
    openFile: file,
    recordVideo: false,
    videoDir: 'local-ai-quit-veto',
    env: testEnv,
  })
  try {
    const editor = await waitForPageWithUrl(launched.app, '://hwp/')
    await editor.waitForSelector('.hwp-app[data-phase="ready"]', { timeout: 90_000 })
    await expect(
      editor.frameLocator('.hwp-editor-host iframe').locator('[data-cmd="ext:ttok-save"]'),
    ).toHaveCount(1)
    let shell = launched.page
    await expect
      .poll(async () => {
        for (const candidate of launched.app.windows()) {
          if (
            await candidate
              .evaluate(() => typeof (window as any).aiOffice?.testAiSettings === 'function')
              .catch(() => false)
          ) {
            shell = candidate
            return true
          }
        }
        return false
      })
      .toBe(true)
    const checkLocalAi = () =>
      shell.evaluate(async () => {
        const api = (window as any).aiOffice
        const settings = await api.getAiSettings()
        return api.testAiSettings({ ...settings, provider: 'local' }) as Promise<{
          ok: boolean
          error?: string
        }>
      })
    expect(await checkLocalAi()).toMatchObject({ ok: true })

    const box = await editor.locator('.hwp-editor-host iframe').boundingBox()
    expect(box).not.toBeNull()
    await editor.mouse.click(box!.x + box!.width * 0.4, box!.y + 300)
    await editor.keyboard.press('x')
    await expect
      .poll(async () =>
        editor.evaluate(async () => {
          const iframe = document.querySelector('.hwp-editor-host iframe') as HTMLIFrameElement
          const studio = (iframe.contentWindow as any).rhwpStudio
          await studio.plugins.load('ttok-agent')
          return studio.plugins.invoke('ttok-agent', 'readText', []) as Promise<string>
        }),
      )
      .toContain('x')

    await launched.app.evaluate(({ dialog }) => {
      const state = globalThis as { __quitCancelPrompts?: number; __quitAnswer?: number }
      state.__quitCancelPrompts = 0
      state.__quitAnswer = 2
      dialog.showMessageBox = (async () => {
        state.__quitCancelPrompts! += 1
        return { response: state.__quitAnswer!, checkboxChecked: false }
      }) as typeof dialog.showMessageBox
    })
    await launched.app.evaluate(({ app }) => app.quit())
    await expect
      .poll(
        () =>
          launched.app.evaluate(
            () => (globalThis as { __quitCancelPrompts?: number }).__quitCancelPrompts ?? 0,
          ),
        { timeout: 30_000 },
      )
      .toBe(1)
    await expect(editor.locator('.hwp-app[data-phase="ready"]')).toBeVisible()
    expect(await checkLocalAi()).toMatchObject({ ok: true })
    await launched.app.evaluate(() => {
      ;(globalThis as { __quitAnswer?: number }).__quitAnswer = 1
    })
  } finally {
    await closeAndSaveVideo(launched, 'local-ai-quit-veto')
    await rm(outputDir, { recursive: true, force: true })
  }
})
