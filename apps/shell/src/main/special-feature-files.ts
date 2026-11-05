import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import type { QuizSaveRequest } from '../shared/home-api'

/**
 * 특화 기능's files: the templates the quiz generator draws on and the checks on what a
 * page may save. The templates are the ACE QUIZ LAB's own (its 학습지·정답지 PDF
 * backgrounds and QuizN's upload sheet), shipped in resources/special-features.
 */

export const FEATURE_ASSETS = [
  'quiz-worksheet.pdf',
  'quiz-answers.pdf',
  'quizn-template.xlsx',
  'quiz-bgm.mp3',
] as const
export type FeatureAsset = (typeof FEATURE_ASSETS)[number]

export const FEATURE_LINKS = {
  blooket: 'https://www.blooket.com/',
  quizn: 'https://quizn.show/',
  aceCanvas: 'https://ace-canvas--project-0c1d3dab-8644-4690-9e4.asia-east1.hosted.app/',
  aceCanvasVideo: 'https://youtu.be/1wl_L17E8R4',
  /** 똑딱업무 > 똑딱서명's introduction video */
  ttokSignVideo: 'https://youtu.be/tLxKYB8qInY',
} as const
export type FeatureLinkSite = keyof typeof FEATURE_LINKS

export const isFeatureLinkSite = (site: unknown): site is FeatureLinkSite =>
  typeof site === 'string' && Object.prototype.hasOwnProperty.call(FEATURE_LINKS, site)

export const isFeatureAsset = (name: unknown): name is FeatureAsset =>
  typeof name === 'string' && (FEATURE_ASSETS as readonly string[]).includes(name)

export function featureAssetsDirFor(options: {
  isPackaged: boolean
  resourcesPath: string
  appPath: string
}): string {
  return options.isPackaged
    ? join(options.resourcesPath, 'special-features')
    : join(options.appPath, 'resources', 'special-features')
}

export async function readFeatureAsset(
  dir: string,
  name: FeatureAsset,
): Promise<Uint8Array | null> {
  try {
    return new Uint8Array(await readFile(join(dir, name)))
  } catch {
    return null
  }
}

/** what a page may save: a named file of one of a few kinds, at most 100MB (png: 똑딱서명's pictures) */
const SAVE_EXTENSIONS = new Set(['pdf', 'xlsx', 'csv', 'webm', 'mp4', 'txt', 'png'])
export const SAVE_MAX_BYTES = 100 * 1024 * 1024

export function checkSaveRequest(raw: unknown): QuizSaveRequest | null {
  const r = (raw ?? {}) as Partial<QuizSaveRequest>
  if (typeof r.name !== 'string' || !r.name.trim() || r.name.length > 200) return null
  if (typeof r.filterName !== 'string' || r.filterName.length > 60) return null
  if (!Array.isArray(r.extensions) || r.extensions.length === 0) return null
  const extensions = r.extensions.filter(
    (e): e is string => typeof e === 'string' && SAVE_EXTENSIONS.has(e),
  )
  if (extensions.length !== r.extensions.length) return null
  if (
    !(r.bytes instanceof Uint8Array) ||
    r.bytes.byteLength === 0 ||
    r.bytes.byteLength > SAVE_MAX_BYTES
  )
    return null
  // the suggested name is a name only, never a path, and carries an allowed extension
  const base = r.name.replace(/[\\/:*?"<>|]/g, '_').trim()
  const ext = extname(base).slice(1).toLowerCase()
  const name = extensions.includes(ext) ? base : base + '.' + extensions[0]
  return { name, filterName: r.filterName, extensions, bytes: r.bytes }
}

/** the path the dialog returned, with the request's extension when the user dropped it */
export function withSaveExtension(path: string, extensions: string[]): string {
  const ext = extname(path).slice(1).toLowerCase()
  return extensions.includes(ext) ? path : path + '.' + extensions[0]
}
