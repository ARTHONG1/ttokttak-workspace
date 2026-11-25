import { basename, extname } from 'node:path'
import JSZip from 'jszip'
import { openPptx } from '@genoffice/pptx-engine'
import type { ImageRecoder } from '../../../../pdf/src/main/compress'
import type {
  OrganizeCard,
  OrganizeFamily,
  OrganizeFile,
  OrganizeOpenResult,
  OrganizeRunRequest,
  OrganizeRunResult,
  OrganizeUnit,
  OrganizeUnitsResult,
} from '../../shared/organize-api'
import { rangeLabel } from '../../shared/organize-api'
import {
  appendDocx,
  assertWellFormed,
  docxText,
  keepParts,
  partsOf,
  readBody,
  textOf,
  wordParts,
  type DocxMergeNotes,
} from './docx'
import {
  HangulOrganizeError,
  hangulPageSvg,
  hangulPages,
  joinHangul,
  keepHangulPages,
  shrinkHangul,
} from './hangul'
import {
  PdfOrganizeError,
  joinPdfs,
  pdfPageCount,
  pickPdfPages,
  removePdfPages,
  shrinkPdf,
} from './pdf'
import { shrinkPicture, type PictureRecoder } from './pictures'
import { appendDeck, danglingRels, keepSlides, slideText, slidesOf, type MergeNotes } from './pptx'
import { clonePackage, readZip, writeBytes, writeZip, type ZipPackage } from './zip'

/**
 * 똑딱정리's work, without Electron: the picked files kept by token, the cards they can have,
 * their pages for the picker, and the tidy-up itself. The originals are only read; every
 * result is made in memory and handed back for the user to save where they pick.
 */

/** the largest document taken in, and the largest result handed out (the save limit) */
export const ORGANIZE_MAX_BYTES = 100 * 1024 * 1024
/** all files of one join together */
export const ORGANIZE_MAX_TOTAL = 300 * 1024 * 1024
/** files one split may make */
export const ORGANIZE_MAX_PIECES = 200
/** Hangul pieces are made one by one through the engine: fewer */
export const HANGUL_MAX_PIECES = 60
export const ORGANIZE_MAX_FILES = 20

export const ORGANIZE_EXTENSIONS = ['pdf', 'hwp', 'hwpx', 'docx', 'pptx'] as const

export function familyOf(path: string): OrganizeFamily | null {
  const ext = extname(path).slice(1).toLowerCase()
  if (ext === 'pdf') return 'pdf'
  if (ext === 'hwp' || ext === 'hwpx') return 'hangul'
  if (ext === 'docx') return 'docx'
  if (ext === 'pptx') return 'pptx'
  return null
}

export const FAMILY_NAME: Record<OrganizeFamily, string> = {
  pdf: 'PDF',
  hangul: '한글',
  docx: '워드',
  pptx: 'PPT',
}

export const ORGANIZE_ERRORS = {
  tooBig: '파일이 너무 커요. 한 파일에 100MB까지 올릴 수 있어요.',
  tooMany: '한 번에 ' + ORGANIZE_MAX_FILES + '개까지 올릴 수 있어요.',
  totalTooBig: '올린 파일을 모두 합쳐 300MB까지 다룰 수 있어요.',
  resultTooBig: '결과가 100MB를 넘어 내려받을 수 없어요.',
  kind: '한글(HWP·HWPX), 워드(DOCX), PPT(PPTX), PDF 파일을 올려 주세요.',
  mixed: '합치기는 같은 종류의 문서끼리만 할 수 있어요. 한글은 HWP와 HWPX를 함께 올릴 수 있어요.',
  unreadable: '문서를 읽지 못했어요. 편집기에서 열리는지 확인해 주세요.',
  password: '암호가 걸린 문서예요. 암호를 풀고 다시 올려 주세요.',
  again: '문서를 다시 올려 주세요.',
  busy: '정리하는 중이에요. 끝난 뒤 다시 해 주세요.',
  failed: '정리하지 못했어요. 원본은 그대로예요.',
  mismatch:
    '결과를 다시 열어 보니 글이나 쪽 설정이 원본과 달라 저장하지 않았어요. 원본은 그대로예요.',
  notSmaller: '이 문서는 더 줄일 수 없어요. 큰 사진이 없거나 이미 줄어든 문서예요.',
  needTwo: '합칠 문서를 두 개 이상 올려 주세요.',
  pickSome: '쪽을 하나 이상 골라 주세요.',
  keepOne: '모든 쪽을 지울 수는 없어요. 하나 이상 남겨 주세요.',
  tooManyPieces: (n: number) =>
    '한 번에 ' + n + '개 파일까지 나눌 수 있어요. 묶음 크기를 늘려 주세요.',
} as const

const CAUTION = {
  hangulMerge: '문서마다 구역으로 이어 붙여요. 개요 번호나 스타일 모양이 달라질 수 있어요.',
  hangulPages:
    '표나 문단이 쪽을 넘어 이어지면 그 쪽은 따로 처리하지 못해요. 결과가 원본과 다르면 저장하지 않아요.',
  docxMerge: '같은 이름의 스타일은 첫 문서 모양을 따라요. 메모는 옮기지 않아요.',
  docxParts: '워드 파일에는 쪽 정보가 없어서 쪽 나누기·구역 나누기로 나뉜 부분 단위로 처리해요.',
  pptxMerge: '슬라이드 크기가 다르면 모양이 틀어질 수 있어요. 메모는 옮기지 않아요.',
} as const

function unitWord(family: OrganizeFamily): string {
  return family === 'pptx' ? '슬라이드' : family === 'docx' ? '부분' : '쪽'
}

/**
 * the cards for one file of a kind with this many units, or for several files. The page opens
 * on the first: one file's pages (or its size when it has one page), several files' merge.
 */
export function cardsFor(family: OrganizeFamily, files: number, units: number): OrganizeCard[] {
  const word = unitWord(family)
  const object = word + (word === '슬라이드' ? '를' : '을')
  const caution = (key: keyof typeof CAUTION | null) => (key ? { caution: CAUTION[key] } : {})
  const merge: OrganizeCard = {
    action: 'merge',
    title: '합치기',
    summary:
      files > 1
        ? '올린 ' + files + '개 문서를 순서대로 하나의 ' + FAMILY_NAME[family] + ' 문서로 합쳐요.'
        : '같은 종류의 문서를 더 올려 하나로 합쳐요.',
    ...caution(
      family === 'hangul'
        ? 'hangulMerge'
        : family === 'docx'
          ? 'docxMerge'
          : family === 'pptx'
            ? 'pptxMerge'
            : null,
    ),
  }
  if (files > 1) return [merge]
  const pages = family === 'hangul' ? 'hangulPages' : family === 'docx' ? 'docxParts' : null
  const cards: OrganizeCard[] = []
  if (units >= 2) {
    cards.push(
      {
        action: 'remove',
        title: word + ' 고르기',
        summary: '고른 ' + object + ' 빼거나, 고른 ' + word + '만 새 파일로 만들어요.',
        ...caution(pages),
      },
      {
        action: 'split',
        title: '나누기',
        summary: word + '마다, 또는 몇 개씩 묶어 여러 파일로 나눠 ZIP 하나로 받아요.',
        ...caution(pages),
      },
    )
  }
  cards.push({
    action: 'shrink',
    title: '용량 줄이기',
    summary: '문서 속 큰 사진을 작게 저장해 파일 크기를 줄여요. 글과 서식은 그대로예요.',
  })
  return [...cards, merge]
}

export interface OrganizeDeps {
  readFile(path: string): Promise<Uint8Array>
  fileSize(path: string): Promise<number>
  /** document pictures: same format back (desktop: Chromium, web: JS) */
  recodePicture: PictureRecoder
  /** PDF pictures for the PDF editor's "make smaller" */
  recodePdfImage: ImageRecoder
}

interface Held extends OrganizeFile {
  path: string
}

/** the last result, kept in memory for its preview until the next run or the page goes */
interface Kept {
  id: string
  bytes: Uint8Array
}

interface Session {
  token: string
  family: OrganizeFamily
  files: Held[]
  /** units of a single file, read when it came in */
  units: number
  result?: Kept
}

type Hangul = 'hwp' | 'hwpx'

const extOf = (path: string): string => extname(path).slice(1).toLowerCase()

function errorText(err: unknown): string {
  if (err instanceof HangulOrganizeError) {
    const page = (err.page ?? 0) + 1
    switch (err.reason) {
      case 'password':
        return ORGANIZE_ERRORS.password
      case 'unreadable':
        return ORGANIZE_ERRORS.unreadable
      case 'joined':
        return (
          page +
          '쪽은 앞 쪽의 표나 문단이 이어진 쪽이라 따로 떼어 낼 수 없어요. 앞 쪽과 함께 골라 주세요.'
        )
      case 'whole-section':
        return (
          page +
          '쪽에서 시작하는 구역을 통째로 빼는 것은 아직 못 해요. 그 구역의 쪽을 하나 이상 남겨 주세요.'
        )
      case 'sections':
        return '구역이 바뀌는 곳에서 쪽을 처리하지 못했어요. 다른 쪽을 골라 주세요.'
      case 'nothing':
        return ORGANIZE_ERRORS.pickSome
      default:
        return ORGANIZE_ERRORS.mismatch
    }
  }
  if (err instanceof PdfOrganizeError) {
    return err.reason === 'password'
      ? ORGANIZE_ERRORS.password
      : err.reason === 'not-smaller'
        ? ORGANIZE_ERRORS.notSmaller
        : ORGANIZE_ERRORS.unreadable
  }
  if (err instanceof OrganizeRefusal) return err.message
  return ORGANIZE_ERRORS.failed
}

/** a refusal in the user's words */
export class OrganizeRefusal extends Error {}

const sizeOfAll = (files: { size: number }[]): number => files.reduce((s, f) => s + f.size, 0)

/** one file of several pieces as a ZIP; the pieces keep the document's format */
async function zipOf(pieces: { name: string; bytes: Uint8Array }[]): Promise<Uint8Array> {
  const zip = new JSZip()
  for (const p of pieces) zip.file(p.name, p.bytes, { compression: 'STORE' })
  return zip.generateAsync({ type: 'uint8array', platform: 'DOS' })
}

/** the pieces a split makes, as lists of units */
export function piecesOf(units: number, split: OrganizeRunRequest['split']): number[][] {
  if (!split) return []
  if (split.mode === 'pick') {
    const pick = [...new Set(split.pick ?? [])]
      .filter((u) => Number.isInteger(u) && u >= 0 && u < units)
      .sort((a, b) => a - b)
    return pick.length ? [pick] : []
  }
  const every = split.mode === 'each' ? 1 : Math.max(1, Math.floor(split.every ?? 1))
  const out: number[][] = []
  for (let start = 0; start < units; start += every) {
    out.push(Array.from({ length: Math.min(every, units - start) }, (_, i) => start + i))
  }
  return out
}

export class OrganizeService {
  private session: Session | null = null
  private running = false
  private closeWhenIdle: string | null = null

  constructor(private readonly deps: OrganizeDeps) {}

  get busy(): boolean {
    return this.running
  }

  private release(): void {
    this.running = false
    if (this.session?.token === this.closeWhenIdle) this.session = null
    this.closeWhenIdle = null
  }

  private async hold(paths: string[]): Promise<Held[] | string> {
    const out: Held[] = []
    for (const path of paths) {
      if (!familyOf(path)) return ORGANIZE_ERRORS.kind
      let size: number
      try {
        size = await this.deps.fileSize(path)
      } catch {
        return ORGANIZE_ERRORS.unreadable
      }
      if (size > ORGANIZE_MAX_BYTES) return ORGANIZE_ERRORS.tooBig
      out.push({
        id: crypto.randomUUID(),
        path,
        name: basename(path, extname(path)),
        extension: extOf(path),
        size,
      })
    }
    return out
  }

  private view(s: Session): OrganizeOpenResult {
    return {
      ok: true,
      token: s.token,
      family: s.family,
      files: s.files.map(({ id, name, extension, size }) => ({ id, name, extension, size })),
      cards: cardsFor(s.family, s.files.length, s.units),
    }
  }

  /** the files a person picked: one, or several of one kind */
  async open(paths: string[]): Promise<OrganizeOpenResult> {
    if (this.running) return { ok: false, error: ORGANIZE_ERRORS.busy }
    if (paths.length === 0) return { ok: false, error: ORGANIZE_ERRORS.kind }
    if (paths.length > ORGANIZE_MAX_FILES) return { ok: false, error: ORGANIZE_ERRORS.tooMany }
    const families = new Set(paths.map(familyOf))
    if (families.has(null)) return { ok: false, error: ORGANIZE_ERRORS.kind }
    if (families.size > 1) return { ok: false, error: ORGANIZE_ERRORS.mixed }
    this.running = true
    try {
      const held = await this.hold(paths)
      if (typeof held === 'string') return { ok: false, error: held }
      if (sizeOfAll(held) > ORGANIZE_MAX_TOTAL)
        return { ok: false, error: ORGANIZE_ERRORS.totalTooBig }
      const family = familyOf(paths[0]!)!
      let units = 0
      if (held.length === 1) {
        const counted = await this.unitsOf(family, () => this.deps.readFile(held[0]!.path))
        if (!counted.ok) return { ok: false, error: counted.error }
        units = counted.units.length
      }
      this.session = { token: crypto.randomUUID(), family, files: held, units }
      return this.view(this.session)
    } finally {
      this.release()
    }
  }

  /** more files for a join: of the same kind as the first */
  async add(token: string, paths: string[]): Promise<OrganizeOpenResult> {
    const s = this.session
    if (!s || s.token !== token) return { ok: false, error: ORGANIZE_ERRORS.again }
    if (this.running) return { ok: false, error: ORGANIZE_ERRORS.busy }
    if (paths.some((p) => familyOf(p) !== s.family))
      return { ok: false, error: ORGANIZE_ERRORS.mixed }
    if (s.files.length + paths.length > ORGANIZE_MAX_FILES)
      return { ok: false, error: ORGANIZE_ERRORS.tooMany }
    this.running = true
    try {
      const held = await this.hold(paths)
      if (typeof held === 'string') return { ok: false, error: held }
      if (sizeOfAll([...s.files, ...held]) > ORGANIZE_MAX_TOTAL)
        return { ok: false, error: ORGANIZE_ERRORS.totalTooBig }
      s.files.push(...held)
      return this.view(s)
    } finally {
      this.release()
    }
  }

  /** the family of the picked files, for the add dialog's filter */
  familyOf(token: string): OrganizeFamily | null {
    return this.session?.token === token ? this.session.family : null
  }

  /** how to read a picked file or the kept result, by its id */
  private reader(token: string, id: string): (() => Promise<Uint8Array>) | null {
    const s = this.session
    if (!s || s.token !== token) return null
    const result = s.result
    if (result?.id === id) return async () => result.bytes
    const file = s.files.find((f) => f.id === id)
    return file ? () => this.deps.readFile(file.path) : null
  }

  private async unitsOf(
    family: OrganizeFamily,
    read: () => Promise<Uint8Array>,
  ): Promise<OrganizeUnitsResult> {
    try {
      const bytes = await read()
      const word = unitWord(family)
      const label = (i: number): string =>
        family === 'pptx'
          ? '슬라이드 ' + (i + 1)
          : family === 'docx'
            ? i + 1 + '번째 부분'
            : i + 1 + '쪽'
      const clip = (t: string): string => (t.length > 80 ? t.slice(0, 80) + '…' : t)
      let units: OrganizeUnit[]
      if (family === 'pdf') {
        const n = await pdfPageCount(bytes)
        units = Array.from({ length: n }, (_, i) => ({ index: i, label: label(i), text: '' }))
        return { ok: true, word, units, preview: 'pdf' }
      }
      if (family === 'hangul') {
        const pages = await hangulPages(bytes)
        units = pages.map((p, i) => ({
          index: i,
          label: label(i),
          text: clip(p.text),
          ...(p.joined ? { joinedToPrevious: true } : {}),
        }))
        return { ok: true, word, units, preview: 'svg' }
      }
      const pkg = await readZip(bytes)
      if (family === 'pptx') {
        units = slidesOf(pkg).map((s, i) => ({
          index: i,
          label: label(i),
          text: clip(slideText(pkg, s.part)),
        }))
        return { ok: true, word, units, preview: 'text' }
      }
      const body = readBody(pkg)
      units = partsOf(body).map(([a, b], i) => ({
        index: i,
        label: label(i),
        text: clip(
          body.children
            .slice(a, b + 1)
            .map((c) => textOf(c.xml))
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim(),
        ),
      }))
      return { ok: true, word, units, preview: 'text', note: CAUTION.docxParts }
    } catch (err) {
      console.warn('[organize] units failed', err)
      return {
        ok: false,
        error:
          errorText(err) === ORGANIZE_ERRORS.failed ? ORGANIZE_ERRORS.unreadable : errorText(err),
      }
    }
  }

  async units(token: string, id: string): Promise<OrganizeUnitsResult> {
    const read = this.reader(token, id)
    if (!read) return { ok: false, error: ORGANIZE_ERRORS.again }
    return this.unitsOf(this.session!.family, read)
  }

  /** a picked PDF (or the PDF result) itself, for the page pictures */
  async pdfBytes(token: string, id: string): Promise<Uint8Array | null> {
    const read = this.reader(token, id)
    if (!read || this.session!.family !== 'pdf') return null
    try {
      return await read()
    } catch {
      return null
    }
  }

  /** one page of a Hangul document (or the Hangul result) drawn as SVG, for the page pictures */
  async pageSvg(token: string, id: string, page: number): Promise<string | null> {
    const read = this.reader(token, id)
    if (!read || this.session!.family !== 'hangul' || !Number.isInteger(page)) return null
    try {
      return await hangulPageSvg(await read(), page)
    } catch {
      return null
    }
  }

  async run(
    request: OrganizeRunRequest,
    onProgress: (label: string) => void,
  ): Promise<OrganizeRunResult> {
    const s = this.session
    if (!s || s.token !== request.token) return { ok: false, error: ORGANIZE_ERRORS.again }
    if (this.running) return { ok: false, error: ORGANIZE_ERRORS.busy }
    this.running = true
    delete s.result
    try {
      const result = await this.work(s, request, onProgress)
      if (result.ok && result.bytes.byteLength > ORGANIZE_MAX_BYTES) {
        return { ok: false, error: ORGANIZE_ERRORS.resultTooBig }
      }
      // what was checked before the result was handed out (a PDF keeps its pages as they are)
      if (result.ok && s.family !== 'pdf') {
        result.facts.push(s.family === 'pptx' ? '다시 열어 확인함' : '원본과 글 대조함')
      }
      // one document of the session's kind: kept so the page can show its pages
      if (result.ok && result.extension !== 'zip') {
        s.result = { id: crypto.randomUUID(), bytes: result.bytes }
        result.previewId = s.result.id
      }
      return result
    } catch (err) {
      console.warn('[organize] failed', s.family, request.action, err)
      return { ok: false, error: errorText(err) }
    } finally {
      this.release()
    }
  }

  private async work(
    s: Session,
    request: OrganizeRunRequest,
    onProgress: (label: string) => void,
  ): Promise<OrganizeRunResult> {
    const first = s.files[0]!
    const ext = first.extension
    const word = unitWord(s.family)
    if (request.action === 'merge') {
      const ids = request.order ?? s.files.map((f) => f.id)
      const order = ids
        .map((id) => s.files.find((f) => f.id === id))
        .filter((f): f is Held => f !== undefined)
      if (order.length !== ids.length) return { ok: false, error: ORGANIZE_ERRORS.again }
      if (order.length < 2 || new Set(order).size !== order.length)
        return { ok: false, error: ORGANIZE_ERRORS.needTwo }
      onProgress('문서 ' + order.length + '개 읽는 중')
      const inputs = await Promise.all(order.map((f) => this.deps.readFile(f.path)))
      onProgress('합치는 중')
      const head = order[0]!
      const name = head.name + '-합본.' + head.extension
      if (s.family === 'pdf') {
        const made = await joinPdfs(inputs)
        return this.done(name, made.bytes, [made.pages + '쪽', '문서 ' + order.length + '개'], [])
      }
      if (s.family === 'hangul') {
        const made = await joinHangul(
          inputs.map((bytes, i) => ({ bytes, format: order[i]!.extension as Hangul })),
          head.extension as Hangul,
        )
        onProgress('합친 문서를 다시 열어 확인하는 중')
        return this.done(
          name,
          made.bytes,
          [made.pages + '쪽', '문서 ' + order.length + '개'],
          made.warnings,
        )
      }
      const packages: ZipPackage[] = []
      for (const input of inputs) packages.push(await readZip(input))
      const base = packages[0]!
      if (s.family === 'pptx') {
        const notes: MergeNotes = { otherSize: 0, comments: 0 }
        const total = packages.reduce((n, p) => n + slidesOf(p).length, 0)
        packages.slice(1).forEach((p, i) => appendDeck(base, p, order[i + 1]!.name, notes))
        const bytes = await writeZip(base)
        onProgress('합친 문서를 다시 열어 확인하는 중')
        await this.checkDeck(bytes, total)
        const warnings: string[] = []
        if (notes.otherSize)
          warnings.push('슬라이드 크기가 다른 문서가 있어 일부 슬라이드 모양이 달라질 수 있어요.')
        if (notes.comments)
          warnings.push('슬라이드 메모 ' + notes.comments + '개는 옮기지 않았어요.')
        return this.done(
          name,
          bytes,
          ['슬라이드 ' + total + '장', '문서 ' + order.length + '개'],
          warnings,
        )
      }
      const notes: DocxMergeNotes = { sharedStyles: 0, comments: 0 }
      const want = packages.map(docxText).join('')
      for (const p of packages.slice(1)) appendDocx(base, p, notes)
      const bytes = await writeZip(base)
      onProgress('합친 문서를 다시 열어 확인하는 중')
      await this.checkWord(bytes, want)
      const warnings: string[] = []
      if (notes.sharedStyles)
        warnings.push('이름이 같은 스타일 ' + notes.sharedStyles + '개는 첫 문서의 모양을 따라요.')
      if (notes.comments) warnings.push('메모 ' + notes.comments + '개는 옮기지 않았어요.')
      return this.done(name, bytes, ['문서 ' + order.length + '개'], warnings)
    }

    const bytes = await this.deps.readFile(first.path)
    if (request.action === 'shrink') {
      onProgress('사진 찾는 중')
      const progress = (done: number, total: number): void =>
        onProgress('사진 줄이는 중 (' + done + '/' + total + ')')
      let made: { bytes: Uint8Array; recoded: number }
      if (s.family === 'pdf') made = await shrinkPdf(bytes, this.deps.recodePdfImage, progress)
      else if (s.family === 'hangul')
        made = await shrinkHangul(bytes, ext as Hangul, this.deps.recodePicture, progress)
      else made = await this.shrinkZip(bytes, s.family, progress)
      if (made.recoded === 0 || made.bytes.length >= bytes.length)
        return { ok: false, error: ORGANIZE_ERRORS.notSmaller }
      const saved = Math.round((1 - made.bytes.length / bytes.length) * 100)
      const result = this.done(
        first.name + '-용량줄임.' + ext,
        made.bytes,
        ['사진 ' + made.recoded + '장 줄임', saved + '% 줄었어요'],
        ['사진은 화질을 조금 낮춰 다시 저장했어요. 인쇄용 고화질 원본이 필요하면 원본을 쓰세요.'],
      )
      return result.ok ? { ...result, before: bytes.length } : result
    }

    const units = s.units
    if (request.action === 'remove') {
      const gone = [...new Set(request.remove ?? [])].filter(
        (u) => Number.isInteger(u) && u >= 0 && u < units,
      )
      if (gone.length === 0) return { ok: false, error: ORGANIZE_ERRORS.pickSome }
      if (gone.length >= units) return { ok: false, error: ORGANIZE_ERRORS.keepOne }
      const keep = Array.from({ length: units }, (_, i) => i).filter((i) => !gone.includes(i))
      onProgress(word + ' ' + gone.length + '개 빼는 중')
      // a PDF loses the pages in place, so its bookmarks and form fields stay
      const made =
        s.family === 'pdf'
          ? { bytes: await removePdfPages(bytes, gone), fact: keep.length + '쪽', warnings: [] }
          : await this.keep(s.family, ext, bytes, keep, onProgress)
      return this.done(first.name + '-정리.' + ext, made.bytes, [made.fact], made.warnings)
    }

    // split
    const pieces = piecesOf(units, request.split)
    if (pieces.length === 0) return { ok: false, error: ORGANIZE_ERRORS.pickSome }
    const limit = s.family === 'hangul' ? HANGUL_MAX_PIECES : ORGANIZE_MAX_PIECES
    if (pieces.length > limit) return { ok: false, error: ORGANIZE_ERRORS.tooManyPieces(limit) }
    const made: { name: string; bytes: Uint8Array }[] = []
    const facts: string[] = []
    const warnings = new Set<string>()
    for (const [i, piece] of pieces.entries()) {
      onProgress('나누는 중 (' + (i + 1) + '/' + pieces.length + ')')
      const one = await this.keep(s.family, ext, bytes, piece, () => {})
      one.warnings.forEach((w) => warnings.add(w))
      facts.push(one.fact)
      made.push({
        name:
          first.name +
          '-' +
          rangeLabel(piece) +
          (word === '슬라이드' ? '장' : word === '쪽' ? '쪽' : '') +
          '.' +
          ext,
        bytes: one.bytes,
      })
    }
    if (made.length === 1) return this.done(made[0]!.name, made[0]!.bytes, facts, [...warnings])
    onProgress('파일 ' + made.length + '개를 ZIP으로 묶는 중')
    const zip = await zipOf(made)
    const zipped = this.done(
      first.name + '-나눔.zip',
      zip,
      ['파일 ' + made.length + '개', 'ZIP으로 묶음'],
      [...warnings],
    )
    return zipped.ok ? { ...zipped, pieces: made.map((m) => m.name) } : zipped
  }

  private done(
    fileName: string,
    bytes: Uint8Array,
    facts: string[],
    warnings: string[],
  ): OrganizeRunResult {
    return { ok: true, fileName, extension: extname(fileName).slice(1), bytes, facts, warnings }
  }

  /** the document with only these units, checked */
  private async keep(
    family: OrganizeFamily,
    ext: string,
    bytes: Uint8Array,
    keep: number[],
    onProgress: (label: string) => void,
  ): Promise<{ bytes: Uint8Array; fact: string; warnings: string[] }> {
    if (family === 'pdf') {
      const out = await pickPdfPages(bytes, keep)
      return { bytes: out, fact: keep.length + '쪽', warnings: [] }
    }
    if (family === 'hangul') {
      const made = await keepHangulPages(bytes, ext as Hangul, keep)
      onProgress('결과를 다시 열어 확인하는 중')
      return { bytes: made.bytes, fact: made.pages + '쪽', warnings: made.warnings }
    }
    const pkg = await readZip(bytes)
    if (family === 'pptx') {
      keepSlides(pkg, keep)
      const out = await writeZip(pkg)
      await this.checkDeck(out, keep.length)
      return { bytes: out, fact: '슬라이드 ' + keep.length + '장', warnings: [] }
    }
    const want = keepParts(pkg, keep)
    const out = await writeZip(pkg)
    await this.checkWord(out, want)
    return { bytes: out, fact: keep.length + '개 부분', warnings: [] }
  }

  private async checkDeck(bytes: Uint8Array, slides: number): Promise<void> {
    const pkg = await readZip(bytes)
    if (danglingRels(pkg).length > 0) throw new OrganizeRefusal(ORGANIZE_ERRORS.mismatch)
    const opened = await openPptx(bytes)
    if (opened.deck.slides.length !== slides) throw new OrganizeRefusal(ORGANIZE_ERRORS.mismatch)
  }

  private async checkWord(bytes: Uint8Array, want: string): Promise<void> {
    const pkg = await readZip(bytes)
    if (danglingRels(pkg).length > 0) throw new OrganizeRefusal(ORGANIZE_ERRORS.mismatch)
    for (const part of wordParts(pkg)) assertWellFormed(pkg, part)
    if (docxText(pkg).replace(/\s+/g, '') !== want.replace(/\s+/g, '')) {
      throw new OrganizeRefusal(ORGANIZE_ERRORS.mismatch)
    }
  }

  /** the pictures of a Word or PowerPoint file, shrunk in place */
  private async shrinkZip(
    bytes: Uint8Array,
    family: OrganizeFamily,
    onPicture: (done: number, total: number) => void,
  ): Promise<{ bytes: Uint8Array; recoded: number }> {
    const pkg = clonePackage(await readZip(bytes))
    const folder = family === 'docx' ? 'word/media/' : 'ppt/media/'
    const names = pkg.order.filter((n) => n.startsWith(folder) && /\.(?:jpe?g|png)$/i.test(n))
    let recoded = 0
    for (const [i, name] of names.entries()) {
      const made = await shrinkPicture(pkg.files.get(name)!, this.deps.recodePicture)
      if (made) {
        writeBytes(pkg, name, made)
        recoded++
      }
      onPicture(i + 1, names.length)
    }
    if (recoded === 0) return { bytes, recoded }
    const out = await writeZip(pkg)
    if (family === 'pptx') await this.checkDeck(out, slidesOf(pkg).length)
    else await this.checkWord(out, docxText(pkg))
    return { bytes: out, recoded }
  }

  /** forget the picked files (the page went away) */
  close(token: string): void {
    if (this.session?.token !== token) return
    if (this.running) this.closeWhenIdle = token
    else this.session = null
  }
}

const isIndexList = (v: unknown): v is number[] =>
  Array.isArray(v) && v.length <= 10_000 && v.every((n) => Number.isInteger(n) && n >= 0)

/** the run request as the page sent it, or null when its shape is wrong */
export function checkRequest(raw: unknown): OrganizeRunRequest | null {
  const r = (raw ?? {}) as Partial<OrganizeRunRequest>
  if (typeof r.token !== 'string') return null
  if (
    r.action !== 'merge' &&
    r.action !== 'split' &&
    r.action !== 'remove' &&
    r.action !== 'shrink'
  )
    return null
  const out: OrganizeRunRequest = { token: r.token, action: r.action }
  if (r.order !== undefined) {
    if (
      !Array.isArray(r.order) ||
      r.order.length > 100 ||
      !r.order.every((id) => typeof id === 'string')
    )
      return null
    out.order = r.order
  }
  if (r.remove !== undefined) {
    if (!isIndexList(r.remove)) return null
    out.remove = r.remove
  }
  if (r.split !== undefined) {
    const s = r.split
    if (!s || (s.mode !== 'each' && s.mode !== 'every' && s.mode !== 'pick')) return null
    if (s.every !== undefined && (!Number.isInteger(s.every) || s.every < 1)) return null
    if (s.pick !== undefined && !isIndexList(s.pick)) return null
    out.split = {
      mode: s.mode,
      ...(s.every !== undefined ? { every: s.every } : {}),
      ...(s.pick ? { pick: s.pick } : {}),
    }
  }
  return out
}
