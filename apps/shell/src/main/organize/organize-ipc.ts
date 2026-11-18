import { stat, readFile } from 'node:fs/promises'
import { BrowserWindow, dialog, ipcMain, nativeImage, type WebContents } from 'electron'
import { showOpenDialogWithMemory } from '@genoffice/electron-utils'
import { HOME_CHANNELS } from '../../shared/home-api'
import { recodeWithChromium } from '../pdf-tools/image-recode'
import { fittedSize, recodePdfImageInJs, recodePictureInJs, type PictureRecoder } from './pictures'
import { droppedPaths } from '../dropped-paths'
import { FAMILY_NAME, ORGANIZE_EXTENSIONS, OrganizeService, checkRequest } from './service'

/**
 * 똑딱정리's channels. The files come from the open dialog or a drop on the page (on the web
 * edition, the browser's upload into this session's own folder); the page gets a token and
 * ids, never a path back, and the results go back as bytes for the save dialog the page opens.
 */

/** Chromium's decoder, resizer and encoders: a picture back in its own format */
const recodePictureWithChromium: PictureRecoder = async (bytes, kind, target) => {
  await new Promise((resolve) => setImmediate(resolve))
  const image = nativeImage.createFromBuffer(Buffer.from(bytes))
  if (image.isEmpty()) return null
  const size = image.getSize()
  const fit = fittedSize(size.width, size.height, target.longSide)
  const fitted =
    fit.width < size.width
      ? image.resize({ width: fit.width, height: fit.height, quality: 'good' })
      : image
  return new Uint8Array(kind === 'jpeg' ? fitted.toJPEG(target.quality) : fitted.toPNG())
}

const EXTENSIONS: Record<string, string[]> = {
  pdf: ['pdf'],
  hangul: ['hwp', 'hwpx'],
  docx: ['docx'],
  pptx: ['pptx'],
}

export function registerOrganizeIpc(fallbackWindow: () => BrowserWindow | null): void {
  // the web edition's nativeImage is a stand-in that cannot shrink: it uses the JS coders
  const web = Boolean(process.env.WEB_SESSION_DIR)
  const service = new OrganizeService({
    readFile: async (path) => new Uint8Array(await readFile(path)),
    fileSize: async (path) => (await stat(path)).size,
    recodePicture: web ? recodePictureInJs : recodePictureWithChromium,
    recodePdfImage: web ? recodePdfImageInJs : recodeWithChromium,
  })
  const windowOf = (sender: WebContents): BrowserWindow | null =>
    BrowserWindow.fromWebContents(sender) ?? fallbackWindow()

  const pick = async (sender: WebContents, family: string | null): Promise<string[] | null> => {
    const win = windowOf(sender)
    if (!win) return null
    const extensions = family ? EXTENSIONS[family]! : [...ORGANIZE_EXTENSIONS]
    const result = await showOpenDialogWithMemory(dialog, win, {
      title: family
        ? '합칠 ' + FAMILY_NAME[family as keyof typeof FAMILY_NAME] + ' 문서 더 고르기'
        : '정리할 문서 고르기',
      filters: [
        {
          name: family ? FAMILY_NAME[family as keyof typeof FAMILY_NAME] + ' 문서' : '정리할 문서',
          extensions,
        },
      ],
      properties: ['openFile', 'multiSelections'],
    })
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths
  }

  ipcMain.handle(HOME_CHANNELS.organizeOpen, async (event) => {
    if (service.busy) return { ok: false, error: '정리하는 중이에요. 끝난 뒤 올려 주세요.' }
    const paths = await pick(event.sender, null)
    return paths ? service.open(paths) : null
  })

  ipcMain.handle(HOME_CHANNELS.organizeAdd, async (event, token: unknown) => {
    if (typeof token !== 'string') return { ok: false, error: '문서를 다시 올려 주세요.' }
    const family = service.familyOf(token)
    if (!family) return { ok: false, error: '문서를 다시 올려 주세요.' }
    const paths = await pick(event.sender, family)
    return paths ? service.add(token, paths) : null
  })

  // documents dropped on the page: the same checks as picked ones; the web edition takes
  // only its own session's uploads
  const sessionDir = process.env.WEB_SESSION_DIR || undefined
  const DROP_REFUSED = {
    ok: false,
    error: '놓은 파일을 읽지 못했어요. [문서 올리기]로 골라 주세요.',
  }
  ipcMain.handle(HOME_CHANNELS.organizeOpenPaths, async (_event, raw: unknown) => {
    if (service.busy) return { ok: false, error: '정리하는 중이에요. 끝난 뒤 올려 주세요.' }
    const paths = droppedPaths(raw, sessionDir)
    return paths ? service.open(paths) : DROP_REFUSED
  })
  ipcMain.handle(HOME_CHANNELS.organizeAddPaths, async (_event, token: unknown, raw: unknown) => {
    if (typeof token !== 'string' || !service.familyOf(token))
      return { ok: false, error: '문서를 다시 올려 주세요.' }
    const paths = droppedPaths(raw, sessionDir)
    return paths ? service.add(token, paths) : DROP_REFUSED
  })

  ipcMain.handle(HOME_CHANNELS.organizeUnits, (_event, token: unknown, id: unknown) =>
    typeof token === 'string' && typeof id === 'string'
      ? service.units(token, id)
      : { ok: false, error: '문서를 다시 올려 주세요.' },
  )

  ipcMain.handle(HOME_CHANNELS.organizePdfBytes, (_event, token: unknown, id: unknown) =>
    typeof token === 'string' && typeof id === 'string' ? service.pdfBytes(token, id) : null,
  )

  ipcMain.handle(
    HOME_CHANNELS.organizePageSvg,
    (_event, token: unknown, id: unknown, page: unknown) =>
      typeof token === 'string' && typeof id === 'string' && typeof page === 'number'
        ? service.pageSvg(token, id, page)
        : null,
  )

  ipcMain.handle(HOME_CHANNELS.organizeRun, (event, raw: unknown) => {
    const request = checkRequest(raw)
    if (!request) return { ok: false, error: '문서를 다시 올려 주세요.' }
    return service.run(request, (label) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send(HOME_CHANNELS.organizeProgress, { token: request.token, label })
      }
    })
  })

  ipcMain.handle(HOME_CHANNELS.organizeClose, (_event, token: unknown) => {
    if (typeof token === 'string') service.close(token)
  })
}
