/**
 * The data behind the side-by-side translation view (reading-assist spec
 * 4.5): the document tree of the saved file and the stored translation it
 * shows.
 *
 * - The tree is built once when the view turns on (a structure job in the
 *   shell's own process, no AI), with the stored AI readings merged so the
 *   blocks match what the translation job keyed. It is kept only while the
 *   view is on and the tab lives: turning the view off drops it (and stops a
 *   build still running), so a large document does not stay in memory.
 * - A save that changed the file bumps `revision`: the tree is built again
 *   from the saved bytes (the store results were carried to the new hash
 *   before).
 * - The language is the stored translation written most recently, else the
 *   default target language; the reader can switch it.
 *
 * Only reads: structure.tree, store.aiReadPages, store.translationRecency,
 * store.translation. Nothing is sent to an AI and nothing is written.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Lang } from '@genoffice/i18n'
import { applyStoredAiReadings } from '../../../../../packages/pdf-structure/src/ai-read'
import { defaultTargetLanguageForTree } from '../../../../../packages/pdf-structure/src/translate/language'
import type { DocumentTree } from '../../../../../packages/pdf-structure/src/tree/types'
import type {
  PdfStoreApi,
  PdfStoredTranslation,
  PdfStructureApi,
  PdfStructureProgress,
} from '../../shared/ipc'
import { buildBilingualModel, chooseBilingualLanguage, type BilingualModel } from './model'

export interface BilingualDataApi {
  tree: PdfStructureApi['tree']
  cancel: PdfStructureApi['cancel']
  onProgress: PdfStructureApi['onProgress']
  store: Pick<PdfStoreApi, 'aiReadPages' | 'translationRecency' | 'translation'>
}

export type BilingualLoad =
  | { kind: 'off' }
  /** no saved file, or no structure channel (standalone run) */
  | { kind: 'unavailable' }
  | { kind: 'loading'; done: number; total: number }
  | { kind: 'failed' }
  | { kind: 'ready' }

export interface BilingualDataOptions {
  enabled: boolean
  /** the open file as saved; empty when there is none */
  filePath: string
  password: string | undefined
  /** UI language (the default target language follows it) */
  uiLang: Lang
  /** bumped after a save that changed the file: rebuild the tree */
  revision: number
  /** null when the structure / store channels are missing */
  api: BilingualDataApi | null
}

export interface BilingualData {
  load: BilingualLoad
  /** result-store key of the analyzed bytes (null while off or loading) */
  docHash: string | null
  /** the tree of the saved file (null while off or loading) */
  tree: DocumentTree | null
  /** the language shown (null until the tree is in) */
  lang: string | null
  /** languages with a stored translation, most recently written first */
  storedLangs: string[]
  setLang: (lang: string) => void
  /** the columns of every page (null until the tree is in) */
  model: BilingualModel | null
  /** read the stored translation again (after a write into the store) */
  refresh: () => void
}

let jobSeq = 0
const newJobId = (): string =>
  `bilingual-tree-${Date.now().toString(36)}-${(++jobSeq).toString(36)}`

interface Analysis {
  docHash: string
  tree: DocumentTree
}

export function useBilingualData(o: BilingualDataOptions): BilingualData {
  const { enabled, filePath, password, revision, api } = o
  const [load, setLoad] = useState<BilingualLoad>({ kind: 'off' })
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [lang, setLangState] = useState<string | null>(null)
  const [storedLangs, setStoredLangs] = useState<string[]>([])
  const [stored, setStored] = useState<PdfStoredTranslation | null>(null)
  const [storeRev, setStoreRev] = useState(0)
  const uiLangRef = useRef(o.uiLang)
  uiLangRef.current = o.uiLang
  const apiRef = useRef(api)
  apiRef.current = api
  /** a language the reader picked survives a rebuild after save, not a turn-off */
  const pickedRef = useRef<string | null>(null)

  // build (or drop) the tree
  useEffect(() => {
    if (!enabled) {
      pickedRef.current = null
      setAnalysis(null)
      setStored(null)
      setLangState(null)
      setStoredLangs([])
      setLoad({ kind: 'off' })
      return
    }
    const a = apiRef.current
    if (!a || !filePath) {
      setAnalysis(null)
      setLoad({ kind: 'unavailable' })
      return
    }
    let alive = true
    let finished = false
    const jobId = newJobId()
    setLoad({ kind: 'loading', done: 0, total: 0 })
    const off = a.onProgress((p: PdfStructureProgress) => {
      if (alive && p.jobId === jobId) setLoad({ kind: 'loading', done: p.done, total: p.total })
    })
    void (async () => {
      try {
        const out = await a.tree({
          jobId,
          path: filePath,
          ...(password !== undefined ? { password } : {}),
        })
        finished = true
        if (!alive) return
        if (!out.ok) {
          setAnalysis(null)
          setLoad({ kind: out.error === 'not-available' ? 'unavailable' : 'failed' })
          return
        }
        const readingsOut = await a.store.aiReadPages(out.docHash).catch(() => null)
        if (!alive) return
        const readings = new Map(
          readingsOut?.ok
            ? readingsOut.pages.map((p) => [p.pageFingerprint, { payload: p.payload }])
            : [],
        )
        const tree = readings.size > 0 ? applyStoredAiReadings(out.tree, readings) : out.tree
        const recency = await a.store.translationRecency(out.docHash).catch(() => null)
        if (!alive) return
        const langs = recency?.ok ? recency.langs : []
        setStoredLangs(langs.filter((l) => l.savedAt !== null).map((l) => l.lang))
        const next =
          pickedRef.current ??
          chooseBilingualLanguage(langs, defaultTargetLanguageForTree(tree, uiLangRef.current))
        setLangState(next)
        setAnalysis({ docHash: out.docHash, tree })
        setLoad({ kind: 'ready' })
      } catch {
        finished = true
        if (alive) {
          setAnalysis(null)
          setLoad({ kind: 'failed' })
        }
      }
    })()
    return () => {
      alive = false
      off()
      if (!finished) void a.cancel(jobId).catch(() => false)
    }
  }, [enabled, filePath, password, revision])

  const docHash = analysis?.docHash ?? null

  // the stored translation in the shown language
  useEffect(() => {
    const a = apiRef.current
    if (!docHash || !lang || !a) {
      setStored(null)
      return
    }
    let alive = true
    void a.store
      .translation(docHash, lang)
      .then((out) => {
        if (!alive) return
        const translation = out.ok ? out.translation : null
        setStored(translation)
        // a language first written here (after a refresh) joins the stored ones
        if (translation && translation.blocks.length > 0) {
          setStoredLangs((prev) => (prev.includes(lang) ? prev : [lang, ...prev]))
        }
      })
      .catch(() => {
        if (alive) setStored(null)
      })
    return () => {
      alive = false
    }
  }, [docHash, lang, storeRev])

  const tree = analysis?.tree ?? null
  // a translation read for another language (a switch in flight) shows as nothing stored
  const shown = stored && stored.lang === lang ? stored : null
  const model = useMemo(() => (tree ? buildBilingualModel(tree, shown) : null), [tree, shown])

  const setLang = useCallback((next: string) => {
    pickedRef.current = next
    setLangState(next)
  }, [])
  const refresh = useCallback(() => setStoreRev((v) => v + 1), [])

  return {
    load,
    docHash: load.kind === 'ready' ? docHash : null,
    tree: load.kind === 'ready' ? tree : null,
    lang: load.kind === 'ready' ? lang : null,
    storedLangs,
    setLang,
    model: load.kind === 'ready' ? model : null,
    refresh,
  }
}
