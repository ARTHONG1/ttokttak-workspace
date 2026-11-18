import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { PUMUI_FILE_EXTENSION } from '@genoffice/ttokttak-extension/package'
import type { CartFileKind } from '../../shared/home-api'
import { isWebEdition } from './edition'
import { PARSE_SYSTEM, PUMUI_EXTRACT_SYSTEM } from './proposal-prompts'
import { pumuiPackageFromWork, sendPumui, workProblem } from './pumui-send'
import { computeRows, parseExtractReply } from './pumui/compute'
import { extractGrammar } from './pumui/grammar'
import { flagText, flagTexts, STATUS_TEXT } from './pumui/messages'
import { prepareCart } from './pumui/normalize'
import type { EstimateRow, PumuiFlag, PumuiStatus } from './pumui/types'
import { check } from './pumui/verifier'
import {
  Back,
  Modal,
  SaveTools,
  SpecialAiPicker,
  ToastView,
  askAi,
  copyText,
  downloadBlob,
  useToast,
} from './special-common'
import { QuizGenerator, QuizIcon } from './QuizGenerator'
import { TtokSign } from './sign/TtokSign'
import { SignVideoPreview } from './sign/sign-video'
import { ConvertIcon, TtokConvert } from './convert/TtokConvert'
import { OrganizeIcon, TtokOrganize } from './organize/TtokOrganize'
import { RecordIcon, SchoolRecord } from './record/SchoolRecord'
import './special-features.css'
import './quiz-generator.css'

/**
 * 특화 기능: tools made for Korean school and public-office work, opened from the
 * home sidebar (desktop) or the trial home (web).
 *
 * 품의서 생성 follows the author's ACE AI 품의서 생성기:
 * the same inputs (품의 제목 of 5+ characters, 장바구니 내용 of 10+), the same 기안문
 * template, the same 품의 목록 columns, CSV columns and temporary-storage record. The AI
 * only reads the cart into rows; the 기안문 is built from the rows, so its amount is
 * always the table's total.
 */

type FeatureId = 'proposal' | 'quiz' | 'sign' | 'convert' | 'organize' | 'record'

interface Feature {
  id: FeatureId
  title: string
  summary: string
  tags: string[]
}

export const FEATURES: Feature[] = [
  {
    id: 'proposal',
    title: '품의서 생성',
    summary: '장바구니 내용을 붙여 넣으면 AI가 품의 기안문과 품의 목록을 만들어요.',
    tags: ['기안문', '품의 목록', 'CSV'],
  },
  {
    id: 'quiz',
    title: '똑딱퀴즈',
    summary:
      '학습 자료나 유튜브 영상으로 다섯 가지 유형의 퀴즈를 만들고, 바로 풀거나 학습지로 뽑아요.',
    tags: ['5가지 유형', '단어 찾기', '학습지 PDF', '블루킷·퀴즈앤'],
  },
  {
    id: 'sign',
    title: '똑딱서명',
    summary: '문서를 올리고 서명 그림을 놓으면, 크기와 방향을 맞춰 서명이 들어간 PDF로 저장해요.',
    tags: ['한글·워드·PDF', '배경 자동 지우기', '자유 회전', '서명 기억'],
  },
  {
    id: 'convert',
    title: '문서 변환',
    summary: '어떤 문서든 올리면 바꿀 수 있는 형식을 보여 주고, 고른 형식으로 바꿔 내려받아요.',
    tags: ['한글·워드·PDF·PPT', '카드로 고르기', '변환 과정 보기'],
  },
  {
    id: 'organize',
    title: '똑딱정리',
    summary:
      '문서를 올리면 할 수 있는 정리를 카드로 보여 주고, 합치기·나누기·쪽 지우기·용량 줄이기를 원래 형식 그대로 해요.',
    tags: ['한글·워드·PDF·PPT', '원래 형식 유지', '어디에도 저장 안 함'],
  },
  {
    id: 'record',
    title: '생기부',
    summary:
      '과제와 성취 수준, 관찰 기록을 넣으면 AI가 나이스에 넣을 교과 세특과 행발 초안을 써요.',
    tags: ['교과 세특', '행발', '나이스로 보내기', '유사도 검사'],
  },
]

/** the picture side of a card that has no video: a tilted paper with the tool's stamp */
const CARD_VISUAL: Record<
  Exclude<FeatureId, 'sign'>,
  { kicker: string; stamp: string; caption: string }
> = {
  proposal: { kicker: '문서 작성', stamp: 'AI', caption: '장바구니에서 기안문까지' },
  quiz: { kicker: '학습 자료', stamp: 'Q & A', caption: '자료 하나로 다채로운 퀴즈' },
  convert: { kicker: '형식 바꾸기', stamp: 'HWP→PDF', caption: '올리고, 고르고, 내려받기' },
  organize: { kicker: '문서 정리', stamp: '합치기·나누기', caption: '쪽 지우기와 용량 줄이기까지' },
  record: {
    kicker: '학교생활기록부',
    stamp: '세특·행발',
    caption: '관찰 기록에서 나이스 문장까지',
  },
}

/** what 임시 저장 keeps, under the original's key and shape */
interface StoredWork {
  title: string
  shoppingCartText: string
  estimateData: EstimateRow[]
  generatedArticle: string | null
}

const STORAGE_KEY = 'procurement_temp_storage'

/**
 * Which way 품의서 생성 reads a cart: 'legacy' asks PARSE_SYSTEM for finished rows; 'v3' asks
 * PUMUI_EXTRACT_SYSTEM for the written values and computes the rows (pumui/compute.ts). A
 * hidden switch (Option+Shift+V) picks it for the other AIs; the built-in 똑딱AI always reads
 * the v3 way, the only way its 품의 adapter (5세대, final200-v1) was trained.
 */
const EXTRACT_MODE_KEY = 'pumui_extract_mode'
type ExtractMode = 'legacy' | 'v3'
const readExtractMode = (): ExtractMode => {
  try {
    return localStorage.getItem(EXTRACT_MODE_KEY) === 'v3' ? 'v3' : 'legacy'
  } catch {
    return 'legacy'
  }
}

/** the money check of the rows on screen: the verifier plus the v3 computation's own flags */
interface Verdict {
  status: PumuiStatus
  flags: PumuiFlag[]
}

function verdictOf(
  source: string,
  rows: EstimateRow[],
  computed: WeakMap<EstimateRow, string[]>,
): Verdict {
  const result = check(
    source,
    rows.map(({ description, specification, unit, quantity, unitPrice }) => ({
      description,
      specification,
      unit,
      quantity,
      unitPrice,
    })),
  )
  const fromCompute = rows.flatMap((row, i) =>
    (computed.get(row) ?? []).map((reason) => ({ row: i, reason })),
  )
  const flagged = new Set(fromCompute.map((f) => f.row))
  // a row the computation could not finish also fails the verifier's format check: say it once
  const flags = [
    ...fromCompute,
    ...result.flags.filter((f) => !(f.reason === 'format' && f.row !== null && flagged.has(f.row))),
  ]
  return { status: flags.length ? 'needs_review' : result.status, flags }
}

const won = (n: number): string => n.toLocaleString('ko-KR')

const toNumber = (v: unknown): number => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const n = parseFloat(String(v ?? '').replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

const totalOf = (rows: EstimateRow[]): number => rows.reduce((sum, r) => sum + r.amount, 0)

const itemLine = (rows: EstimateRow[]): string =>
  rows.length === 0
    ? ''
    : rows[0].description + (rows.length > 1 ? ' 외 ' + (rows.length - 1) + '종' : '')

/** the original's 기안문, line for line */
export function proposalArticle(title: string, rows: EstimateRow[]): string {
  return [
    '1. 관련: ',
    '2. ' + title + '을(를) 구입하고자 합니다.',
    '   가. 품목: ' + itemLine(rows),
    '   나. 금액: 금' + won(totalOf(rows)) + '원',
    '   다. 구입처: 온라인 쇼핑몰',
    '   .  끝.',
  ].join('\n')
}

/** after a table edit the 기안문 keeps the user's wording; only its item and amount lines follow */
function syncArticle(article: string, rows: EstimateRow[]): string {
  return article
    .replace(/나\. 금액: 금[\d,]+원/g, '나. 금액: 금' + won(totalOf(rows)) + '원')
    .replace(/가\. 품목: [^\n]*/g, '가. 품목: ' + itemLine(rows))
}

/** the original reads a cart screenshot into text first and appends it to the cart box */
const IMAGE_SYSTEM = [
  '너는 쇼핑몰 장바구니 화면 사진에서 글을 읽어 옮기는 도우미다.',
  '사진 속 장바구니의 상품마다 한 줄로 상품명, 옵션(규격), 수량, 가격을 그대로 적는다.',
  '예: 모나미 153 볼펜 흑색 12개입 / 수량 5 / 3,600원',
  '배송비가 보이면 마지막 줄에 배송비 금액을 적는다. 광고, 추천 상품, 쿠폰 안내는 적지 않는다.',
  '설명이나 머리말 없이 옮긴 줄만 출력한다.',
].join('\n')

const CART_BUTTONS: { kind: CartFileKind; label: string }[] = [
  { kind: 'image', label: '이미지' },
  { kind: 'hwp', label: '한글' },
  { kind: 'pdf', label: 'PDF' },
  { kind: 'excel', label: '엑셀' },
]

function CartFileIcon({ kind }: { kind: CartFileKind }): ReactElement {
  const common = {
    stroke: 'currentColor',
    strokeWidth: 1.4,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      {kind === 'image' ? (
        <>
          <rect x="2" y="3" width="12" height="10" rx="1.6" {...common} />
          <circle cx="6" cy="6.6" r="1.2" {...common} />
          <path d="M2.5 11.5l3.3-3 2.6 2.3 2-1.7 3.1 2.6" {...common} />
        </>
      ) : kind === 'excel' ? (
        <>
          <rect x="2.5" y="2.5" width="11" height="11" rx="1.4" {...common} />
          <path d="M2.5 6.2h11M2.5 9.8h11M6.4 2.5v11" {...common} />
        </>
      ) : (
        <>
          <path d="M4 1.8h5.2L12.5 5v9.2H4z" {...common} />
          <path d="M9 1.8V5h3.5" {...common} />
          {kind === 'pdf' ? (
            <path d="M6 9h4.5M6 11.4h3" {...common} />
          ) : (
            <path d="M6.2 8.4h4M8.2 8.4v3.6M6.4 12h3.6" {...common} />
          )}
        </>
      )}
    </svg>
  )
}

function parseRows(reply: string): EstimateRow[] {
  const start = reply.indexOf('{')
  const end = reply.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('AI 답에서 품목을 찾지 못했어요. 다시 해 주세요.')
  let data: unknown
  try {
    data = JSON.parse(reply.slice(start, end + 1))
  } catch {
    throw new Error('AI 답을 읽지 못했어요. 다시 해 주세요.')
  }
  const items = (data as { items?: unknown }).items
  if (!Array.isArray(items)) throw new Error('AI 답에서 품목을 찾지 못했어요. 다시 해 주세요.')
  const rows = items
    .map((raw): EstimateRow => {
      const item = (raw ?? {}) as Record<string, unknown>
      const quantity = toNumber(item.quantity) || 1
      const unitPrice = toNumber(item.unitPrice)
      return {
        description: String(item.description ?? '').trim(),
        specification: String(item.specification ?? '').trim(),
        unit: String(item.unit ?? '').trim() || '개',
        quantity,
        unitPrice,
        amount: quantity * unitPrice,
      }
    })
    .filter((row) => row.description)
  if (rows.length === 0) throw new Error('장바구니에서 품목을 찾지 못했어요. 내용을 확인해 주세요.')
  return rows
}

function downloadCsv(title: string, rows: EstimateRow[]): void {
  const quote = (s: string) => '"' + s.replace(/"/g, '""') + '"'
  const lines = ['내용,규격,단위,수량,예상단가,예상금액']
  for (const r of rows) {
    lines.push(
      [
        quote(r.description),
        quote(r.specification),
        quote(r.unit),
        r.quantity,
        r.unitPrice,
        r.amount,
      ].join(','),
    )
  }
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  downloadBlob(blob, (title.trim() || 'estimate') + '.csv')
}

function ProposalIcon(): ReactElement {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4.5" y="3" width="15" height="18" rx="2.2" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M8 8h8M8 11.5h8M8 15h4.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <circle cx="16.2" cy="16.3" r="2.6" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

function FeatureList({ onOpen }: { onOpen: (id: FeatureId) => void }): ReactElement {
  return (
    <div className="sf-list sf-work-list">
      <header className="sf-head">
        <span className="sf-eyebrow sf-eyebrow-work">똑딱업무</span>
        <h1>학교 업무 문서, AI와 함께 빠르게</h1>
        <p>필요한 도구를 골라 내용만 넣으면 양식에 맞춰 만들어 드려요. 도구는 계속 늘어나요.</p>
      </header>
      <div className="sf-grid sf-work-grid">
        {FEATURES.map((f) => (
          <article key={f.id} className={'sf-work-card sf-work-card-' + f.id}>
            {f.id === 'sign' ? (
              <SignVideoPreview />
            ) : (
              <button
                type="button"
                className="sf-work-visual"
                aria-label={f.title + ' 열기'}
                onClick={() => onOpen(f.id)}
              >
                <span className="sf-work-kicker">{CARD_VISUAL[f.id].kicker}</span>
                <span className="sf-work-paper" aria-hidden="true">
                  {f.id === 'quiz' ? (
                    <QuizIcon />
                  ) : f.id === 'convert' ? (
                    <ConvertIcon />
                  ) : f.id === 'organize' ? (
                    <OrganizeIcon />
                  ) : f.id === 'record' ? (
                    <RecordIcon />
                  ) : (
                    <ProposalIcon />
                  )}
                  <span className="sf-work-paper-line" />
                  <span className="sf-work-paper-line" />
                  <span className="sf-work-paper-stamp">{CARD_VISUAL[f.id].stamp}</span>
                </span>
                <span className="sf-work-caption">{CARD_VISUAL[f.id].caption}</span>
              </button>
            )}
            <button
              type="button"
              className="sf-work-body"
              data-testid={'special-feature-' + f.id}
              onClick={() => onOpen(f.id)}
            >
              <span className="sf-card-title">{f.title}</span>
              <span className="sf-card-sum">{f.summary}</span>
              <span className="sf-tags">
                {f.tags.map((tag) => (
                  <span key={tag} className="sf-tag">
                    {tag}
                  </span>
                ))}
              </span>
              <span className="sf-card-go">
                열기
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path
                    d="M3 8h9.5M8.5 4l4 4-4 4"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            </button>
          </article>
        ))}
        <div className="sf-card sf-card-soon sf-work-soon" aria-label="다음 기능 준비 중">
          <span className="sf-soon-mark" aria-hidden="true">
            +
          </span>
          <span className="sf-card-title">다음 기능 준비 중</span>
          <span className="sf-card-sum">
            공문 기안, 가정통신문, 계획서 같은 업무 문서를 차례로 더해요.
          </span>
        </div>
      </div>
    </div>
  )
}

function ProposalGenerator({ onBack }: { onBack: () => void }): ReactElement {
  const [title, setTitle] = useState('')
  const [cart, setCart] = useState('')
  const [errors, setErrors] = useState<{ title?: string; cart?: string }>({})
  const [busy, setBusy] = useState(false)
  const [reading, setReading] = useState<CartFileKind | null>(null)
  const [usingLocal, setUsingLocal] = useState(false)
  useEffect(() => {
    let alive = true
    const load = () => {
      void window.aiOffice
        ?.getAiSettings?.()
        .then((s) => {
          if (alive) setUsingLocal(s?.provider === 'local')
        })
        .catch(() => {})
    }
    load()
    const off = window.aiOffice?.onAiSettingsChanged?.(load)
    return () => {
      alive = false
      off?.()
    }
  }, [])
  const [article, setArticle] = useState<string | null>(null)
  const [rows, setRows] = useState<EstimateRow[]>([])
  // the text the AI read (tidied, without recommendation areas); the rows are checked against it
  const [checkSource, setCheckSource] = useState<string | null>(null)
  const [cropped, setCropped] = useState(0)
  const [mode, setMode] = useState<ExtractMode>(readExtractMode)
  const [confirmSend, setConfirmSend] = useState(false)
  // the v3 computation's flags live on the row objects: an edited row is a new object and drops them
  const computed = useRef(new WeakMap<EstimateRow, string[]>())
  const verdict = useMemo(
    () =>
      checkSource !== null && rows.length > 0
        ? verdictOf(checkSource, rows, computed.current)
        : null,
    [checkSource, rows],
  )
  const rowFlags = useMemo(() => {
    const map = new Map<number, string[]>()
    for (const flag of verdict?.flags ?? []) {
      if (flag.row === null) continue
      const texts = map.get(flag.row) ?? []
      const text = flagText(flag)
      if (!texts.includes(text)) texts.push(text)
      map.set(flag.row, texts)
    }
    return map
  }, [verdict])
  const listTexts = flagTexts((verdict?.flags ?? []).filter((f) => f.row === null))

  // the hidden v3 switch: Option(Alt)+Shift+V while this page is open
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.altKey && e.shiftKey && e.code === 'KeyV')) return
      e.preventDefault()
      setMode((prev) => {
        const next: ExtractMode = prev === 'v3' ? 'legacy' : 'v3'
        try {
          localStorage.setItem(EXTRACT_MODE_KEY, next)
        } catch {
          // a browser without storage keeps the choice for this page only
        }
        return next
      })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const [toast, say] = useToast()
  const [sendNote, setSendNote] = useState<{ ok: boolean; text: string; pkgText: string } | null>(
    null,
  )
  const [sending, setSending] = useState(false)
  const resultRef = useRef<HTMLElement>(null)

  const total = totalOf(rows)

  // 품의서 생성 → K-에듀파인: the desktop app fills it itself through its own browser window
  // (no extension); the web app hands it to the extension in this browser
  const sendToEdufine = async (confirmed = false) => {
    const problem = workProblem(title, rows)
    if (problem) return say(problem, true)
    // flagged amounts go to K-에듀파인 only after one more yes
    if (!confirmed && verdict?.status === 'needs_review') return setConfirmSend(true)
    const pkgText = JSON.stringify(
      pumuiPackageFromWork({ title, estimateData: rows, generatedArticle: article }),
    )
    const api = window.aiOffice
    setSending(true)
    try {
      const out = await sendPumui(pkgText, {
        web: isWebEdition(),
        directTransfer:
          typeof api?.directTransfer === 'function'
            ? (f, t) => api.directTransfer(f, t)
            : undefined,
        runtime: (window as unknown as { chrome?: { runtime?: never } }).chrome?.runtime,
      })
      setSendNote({ ok: out.ok, text: out.message, pkgText })
    } catch {
      setSendNote({
        ok: false,
        text: '전송 연결을 확인하지 못했어요. 화면에 들어간 내용을 먼저 확인해 주세요.',
        pkgText,
      })
    } finally {
      setSending(false)
    }
  }

  const appendCart = (piece: string) =>
    setCart((prev) => (prev.trim() ? prev.replace(/\s+$/, '') + '\n\n' + piece : piece))

  const readFromFile = async (kind: CartFileKind) => {
    if (typeof window.aiOffice?.readCartFile !== 'function') return
    setReading(kind)
    try {
      const result = await window.aiOffice.readCartFile(kind)
      if (!result) return
      if (!result.ok) return say(result.error, true)
      if (result.kind === 'text') {
        appendCart(result.text)
        say(
          result.name +
            '에서 장바구니 내용을 가져왔어요.' +
            (result.truncated ? ' 내용이 길어 앞부분만 넣었어요.' : ''),
        )
      } else {
        const read = (
          await askAi(IMAGE_SYSTEM, '이 장바구니 사진의 상품을 옮겨 줘.', [
            { base64: result.base64, mime: result.mime },
          ])
        ).trim()
        if (!read) return say('사진에서 상품을 찾지 못했어요.', true)
        appendCart(read)
        say(result.name + '에서 장바구니 내용을 읽었어요.')
      }
      setErrors((prev) => ({ ...prev, cart: undefined }))
    } catch (error) {
      say(error instanceof Error ? error.message : String(error), true)
    } finally {
      setReading(null)
    }
  }

  const changeRows = (next: EstimateRow[]) => {
    setRows(next)
    setArticle((prev) => (prev === null ? prev : syncArticle(prev, next)))
  }

  const editRow = (index: number, field: keyof EstimateRow, value: string) => {
    const next = rows.map((r, i) => {
      if (i !== index) return r
      const row = { ...r }
      if (field === 'quantity' || field === 'unitPrice' || field === 'amount')
        row[field] = toNumber(value)
      else row[field] = value
      if (field === 'quantity' || field === 'unitPrice') row.amount = row.quantity * row.unitPrice
      // a computation flag is about the money: it goes once the user edits a money cell
      const marks = computed.current.get(r)
      if (marks && field !== 'quantity' && field !== 'unitPrice' && field !== 'amount')
        computed.current.set(row, marks)
      return row
    })
    changeRows(next)
  }

  const generate = async () => {
    const found: { title?: string; cart?: string } = {}
    if (title.trim().length < 5) found.title = '품의 제목을 5자 이상 입력해주세요.'
    if (cart.trim().length < 10) found.cart = '장바구니 내용을 10자 이상 입력해주세요.'
    setErrors(found)
    if (found.title || found.cart) return
    setBusy(true)
    try {
      const prepared = prepareCart(cart)
      // recommendation areas are always left out, even when nothing else remains
      if (!prepared.text.trim())
        throw new Error('추천 상품 구역을 빼면 남는 품목이 없어요. 장바구니 내용을 확인해 주세요.')
      const work = prepared
      const marks = new WeakMap<EstimateRow, string[]>()
      let parsed: EstimateRow[]
      if (mode === 'v3' || usingLocal) {
        const reply = await askAi(PUMUI_EXTRACT_SYSTEM, work.text, [], 4000, {
          feature: 'pumui',
          ...(usingLocal ? { grammar: extractGrammar(work.text) } : {}),
        })
        const out = computeRows(parseExtractReply(reply))
        if (out.rows.length === 0)
          throw new Error('장바구니에서 품목을 찾지 못했어요. 내용을 확인해 주세요.')
        for (const flag of out.flags) {
          if (flag.row === null) continue
          const row = out.rows[flag.row]
          marks.set(row, [...(marks.get(row) ?? []), flag.reason])
        }
        parsed = out.rows
      } else {
        parsed = parseRows(await askAi(PARSE_SYSTEM, work.text, [], 4000, { feature: 'pumui' }))
      }
      computed.current = marks
      setCheckSource(work.text)
      setCropped(work.removed)
      setRows(parsed)
      setArticle(proposalArticle(title.trim(), parsed))
      say(
        '품의서를 만들었어요.' +
          (work.removed > 0 ? ' 추천 상품 구역 ' + work.removed + '줄을 빼고 읽었어요.' : ''),
      )
      requestAnimationFrame(() =>
        resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      )
    } catch (error) {
      say(error instanceof Error ? error.message : String(error), true)
    } finally {
      setBusy(false)
    }
  }

  const saveTemp = () => {
    const work: StoredWork = {
      title,
      shoppingCartText: cart,
      estimateData: rows,
      generatedArticle: article,
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(work))
      say('지금 작업 내용을 이 브라우저에 저장했어요.')
    } catch {
      say('저장하지 못했어요. 브라우저 저장 공간을 확인해 주세요.', true)
    }
  }

  const loadTemp = () => {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return say('저장된 작업이 없어요.', true)
    try {
      const work = JSON.parse(raw) as Partial<StoredWork>
      setTitle(work.title || '')
      setCart(work.shoppingCartText || '')
      const loaded = Array.isArray(work.estimateData) ? work.estimateData : []
      computed.current = new WeakMap()
      // a saved work is checked again against its saved cart (the saved shape is unchanged)
      setCheckSource(loaded.length > 0 ? prepareCart(work.shoppingCartText || '').text : null)
      setCropped(0)
      setRows(loaded)
      setArticle(work.generatedArticle || null)
      setErrors({})
      say('저장된 작업을 불러왔어요.')
    } catch {
      say('저장된 작업을 읽지 못했어요.', true)
    }
  }

  const deleteTemp = () => {
    localStorage.removeItem(STORAGE_KEY)
    say('저장된 작업을 지웠어요.')
  }

  const resetAll = () => {
    setTitle('')
    setCart('')
    setRows([])
    setArticle(null)
    setCheckSource(null)
    setCropped(0)
    setErrors({})
    say('모든 내용을 지웠어요.')
  }

  return (
    <div className="sf-page">
      <div className="sf-page-bar">
        <Back onClick={onBack} label="똑딱업무" />
        <SpecialAiPicker />
      </div>
      <header className="sf-page-head">
        <span className="sf-card-icon">
          <ProposalIcon />
        </span>
        <div className="sf-page-title">
          <h1>
            품의서 생성
            {mode === 'v3' && (
              <span className="sf-mode-badge" data-testid="pumui-mode">
                옮겨 적기(v3)
              </span>
            )}
          </h1>
          <p>장바구니 내용을 붙여 넣으면 AI가 품의 기안문과 품의 목록을 만들어요.</p>
        </div>
        <SaveTools onSave={saveTemp} onLoad={loadTemp} onDelete={deleteTemp} />
      </header>

      <div className="sf-stack">
        <section className="sf-box" aria-labelledby="sf-input-title">
          <div className="sf-box-head">
            <div>
              <h2 id="sf-input-title">정보 입력</h2>
              <p className="sf-box-sub">품의서를 만들 내용을 입력하세요.</p>
            </div>
            <button type="button" className="sf-text-btn" onClick={resetAll}>
              전체 초기화
            </button>
          </div>
          <label className="sf-field">
            <span>품의 제목</span>
            <input
              data-testid="proposal-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 2025학년도 4학년 학급 용품 구입"
              aria-invalid={errors.title ? true : undefined}
            />
            {errors.title && <em className="sf-error">{errors.title}</em>}
          </label>
          <div className="sf-field">
            <label htmlFor="sf-cart">장바구니 내용</label>
            <div className="sf-file-row" role="group" aria-label="파일에서 장바구니 읽기">
              {CART_BUTTONS.map((b) => (
                <button
                  key={b.kind}
                  type="button"
                  className="sf-secondary sf-sm"
                  data-testid={'proposal-file-' + b.kind}
                  disabled={reading !== null || busy || (b.kind === 'image' && usingLocal)}
                  title={
                    b.kind === 'image' && usingLocal
                      ? '똑딱AI는 이미지 읽기를 지원하지 않아요. 위에서 구독·키 AI로 바꿔 주세요.'
                      : undefined
                  }
                  onClick={() => void readFromFile(b.kind)}
                >
                  {reading === b.kind ? (
                    <span className="sf-spinner" aria-hidden="true" />
                  ) : (
                    <CartFileIcon kind={b.kind} />
                  )}
                  {b.label}
                </button>
              ))}
              <span className="sf-file-hint">파일 내용은 아래 칸에 덧붙여요</span>
            </div>
            <textarea
              id="sf-cart"
              data-testid="proposal-cart"
              rows={8}
              value={cart}
              onChange={(e) => setCart(e.target.value)}
              placeholder={
                '쇼핑몰 장바구니 화면의 글을 그대로 복사해 붙여 넣으세요.\n예: 모나미 153 볼펜 흑색 12개입 3,600원 수량 5'
              }
              aria-invalid={errors.cart ? true : undefined}
            />
            {errors.cart && <em className="sf-error">{errors.cart}</em>}
          </div>
          <button
            type="button"
            className="sf-primary sf-wide-btn"
            data-testid="proposal-generate"
            disabled={busy || reading !== null}
            onClick={() => void generate()}
          >
            {busy ? (
              <>
                <span className="sf-spinner" aria-hidden="true" />
                품의서를 만드는 중…
              </>
            ) : (
              '품의서 생성하기'
            )}
          </button>
        </section>

        {article !== null && (
          <section
            className="sf-box"
            aria-labelledby="sf-result-title"
            ref={resultRef}
            data-testid="proposal-result"
          >
            <div className="sf-box-head">
              <div>
                <h2 id="sf-result-title">생성 결과</h2>
                <p className="sf-box-sub">내용을 확인하고 고친 뒤 복사하거나 저장하세요.</p>
              </div>
              <div className="sf-btn-row">
                <button
                  type="button"
                  className="sf-secondary sf-sm"
                  onClick={() =>
                    void copyText(article.trim()).then(() => say('기안문을 복사했어요.'))
                  }
                >
                  본문 복사
                </button>
                <button
                  type="button"
                  className="sf-secondary sf-sm"
                  disabled={rows.length === 0}
                  onClick={() => downloadCsv(title, rows)}
                >
                  CSV 저장
                </button>
                <button
                  type="button"
                  className="sf-primary sf-sm"
                  data-testid="pumui-send"
                  disabled={rows.length === 0 || sending}
                  onClick={() => void sendToEdufine()}
                >
                  {sending ? '입력 확인 중…' : 'K-에듀파인으로 보내기'}
                </button>
              </div>
            </div>

            {sendNote && (
              <div
                className={sendNote.ok ? 'sf-send-note' : 'sf-send-note sf-send-warn'}
                role="status"
                data-testid="pumui-send-note"
              >
                <p>{sendNote.text}</p>
                {!isWebEdition() && (
                  <p>
                    앱이 연 전용 브라우저에서 로그인해 주세요. 저장·결재는 입력 내용을 확인한 뒤
                    직접 진행해 주세요.
                  </p>
                )}
                <div className="sf-btn-row">
                  {isWebEdition() && (
                    <button
                      type="button"
                      className="sf-secondary sf-sm"
                      onClick={() =>
                        void copyText(sendNote.pkgText).then(() =>
                          say(
                            '품의를 복사했어요. K-에듀파인 화면의 [똑딱] → [복사했거나 파일로 받은 품의 넣기]에 붙여 넣어 주세요.',
                          ),
                        )
                      }
                    >
                      클립보드로 복사
                    </button>
                  )}
                  <button
                    type="button"
                    className="sf-secondary sf-sm"
                    onClick={() =>
                      downloadBlob(
                        new Blob([sendNote.pkgText], { type: 'application/json' }),
                        (title.trim() || '품의') + PUMUI_FILE_EXTENSION,
                      )
                    }
                  >
                    품의 파일 저장
                  </button>
                </div>
              </div>
            )}

            <label className="sf-field">
              <span>품의 기안문</span>
              <textarea
                data-testid="proposal-article"
                className="sf-article"
                rows={7}
                value={article}
                onChange={(e) => setArticle(e.target.value)}
              />
            </label>

            <div className="sf-field">
              <span>품의 목록</span>
              {verdict && (
                <div
                  className={'sf-check sf-check-' + verdict.status}
                  role="status"
                  data-testid="pumui-check"
                  data-status={verdict.status}
                >
                  <p className="sf-check-title">{STATUS_TEXT[verdict.status]}</p>
                  {(listTexts.length > 0 || rowFlags.size > 0 || cropped > 0) && (
                    <ul>
                      {listTexts.map((t) => (
                        <li key={t}>{t}</li>
                      ))}
                      {rowFlags.size > 0 && (
                        <li>표에서 표시한 줄 {rowFlags.size}개를 원문과 비교해 주세요</li>
                      )}
                      {cropped > 0 && <li>추천 상품 구역 {cropped}줄을 빼고 읽었어요</li>}
                    </ul>
                  )}
                </div>
              )}
              <div className="sf-table-wrap">
                <table className="sf-table" data-testid="proposal-table">
                  <thead>
                    <tr>
                      <th className="sf-col-no">#</th>
                      <th>품명</th>
                      <th>규격</th>
                      <th className="sf-col-unit">단위</th>
                      <th className="sf-col-qty">수량</th>
                      <th className="sf-col-num">단가</th>
                      <th className="sf-col-num">금액</th>
                      <th className="sf-col-del" aria-label="지우기" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <Fragment key={i}>
                        <tr
                          className={rowFlags.has(i) ? 'sf-row-flag' : undefined}
                          data-testid={rowFlags.has(i) ? 'pumui-flagged-row' : undefined}
                        >
                          <td className="sf-col-no">{i + 1}</td>
                          <td>
                            <input
                              aria-label={i + 1 + '번 품명'}
                              value={r.description}
                              onChange={(e) => editRow(i, 'description', e.target.value)}
                            />
                          </td>
                          <td>
                            <input
                              aria-label={i + 1 + '번 규격'}
                              value={r.specification}
                              onChange={(e) => editRow(i, 'specification', e.target.value)}
                            />
                          </td>
                          <td className="sf-col-unit">
                            <input
                              aria-label={i + 1 + '번 단위'}
                              value={r.unit}
                              onChange={(e) => editRow(i, 'unit', e.target.value)}
                            />
                          </td>
                          <td className="sf-col-qty">
                            <input
                              aria-label={i + 1 + '번 수량'}
                              inputMode="numeric"
                              value={String(r.quantity)}
                              onChange={(e) => editRow(i, 'quantity', e.target.value)}
                            />
                          </td>
                          <td className="sf-col-num">
                            <input
                              aria-label={i + 1 + '번 단가'}
                              inputMode="numeric"
                              value={String(r.unitPrice)}
                              onChange={(e) => editRow(i, 'unitPrice', e.target.value)}
                            />
                          </td>
                          <td className="sf-col-num sf-amount">{won(r.amount)}</td>
                          <td className="sf-col-del">
                            <button
                              type="button"
                              className="sf-icon-btn"
                              aria-label={i + 1 + '번 줄 지우기'}
                              onClick={() => changeRows(rows.filter((_, j) => j !== i))}
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                        {rowFlags.has(i) && (
                          <tr className="sf-row-why">
                            <td />
                            <td colSpan={7}>{rowFlags.get(i)?.join(' · ')}</td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={6} className="sf-sum-label">
                        합계
                      </td>
                      <td className="sf-col-num sf-sum" data-testid="proposal-total">
                        {won(total)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
              <button
                type="button"
                className="sf-ghost"
                onClick={() =>
                  changeRows([
                    ...rows,
                    {
                      description: '',
                      specification: '',
                      unit: '개',
                      quantity: 1,
                      unitPrice: 0,
                      amount: 0,
                    },
                  ])
                }
              >
                + 줄 추가
              </button>
            </div>
          </section>
        )}
      </div>

      <ToastView toast={toast} />
      {confirmSend && (
        <Modal title="확인이 필요한 곳이 남아 있어요" onClose={() => setConfirmSend(false)}>
          <div className="sf-confirm" data-testid="pumui-send-confirm">
            <p>
              금액 확인에서 걸린 곳이 있어요. 표시한 줄을 원문과 비교하셨나요? 그래도 K-에듀파인으로
              보낼까요?
            </p>
            <div className="sf-btn-row">
              <button
                type="button"
                className="sf-secondary sf-sm"
                onClick={() => setConfirmSend(false)}
              >
                돌아가서 확인
              </button>
              <button
                type="button"
                className="sf-primary sf-sm"
                data-testid="pumui-send-anyway"
                onClick={() => {
                  setConfirmSend(false)
                  void sendToEdufine(true)
                }}
              >
                그래도 보내기
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

export function SpecialFeatures({
  variant,
  onExit,
}: {
  /** desktop: the home's content pane; web: the trial home's whole page */
  variant: 'desktop' | 'web'
  /** web only: back to the trial home */
  onExit?: () => void
}): ReactElement {
  const [open, setOpen] = useState<FeatureId | null>(null)
  return (
    <div className={'sf sf-' + variant} data-testid="special-features">
      {open === null && onExit && (
        <div className="sf-page-bar">
          <Back onClick={onExit} label="처음 화면" />
        </div>
      )}
      {open === 'proposal' ? (
        <ProposalGenerator onBack={() => setOpen(null)} />
      ) : open === 'quiz' ? (
        <QuizGenerator onBack={() => setOpen(null)} />
      ) : open === 'sign' ? (
        <TtokSign onBack={() => setOpen(null)} />
      ) : open === 'convert' ? (
        <TtokConvert onBack={() => setOpen(null)} />
      ) : open === 'organize' ? (
        <TtokOrganize onBack={() => setOpen(null)} />
      ) : open === 'record' ? (
        <SchoolRecord onBack={() => setOpen(null)} />
      ) : (
        <FeatureList onOpen={setOpen} />
      )}
    </div>
  )
}
