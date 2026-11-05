import { useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { PUMUI_FILE_EXTENSION } from '@genoffice/ttokttak-extension/package'
import type { CartFileKind } from '../../shared/home-api'
import { isWebEdition } from './edition'
import { PARSE_SYSTEM } from './proposal-prompts'
import { pumuiPackageFromWork, sendPumui, workProblem } from './pumui-send'
import {
  Back,
  SaveTools,
  ToastView,
  askAi,
  copyText,
  downloadBlob,
  useToast,
} from './special-common'
import { QuizGenerator, QuizIcon } from './QuizGenerator'
import { SignIcon, TtokSign } from './sign/TtokSign'
import { SignVideoButton } from './sign/sign-video'
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

type FeatureId = 'proposal' | 'quiz' | 'sign'

interface Feature {
  id: FeatureId
  title: string
  summary: string
  tags: string[]
}

const FEATURES: Feature[] = [
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
]

/** one row of the 품의 목록; the field names are the original's estimateData */
interface EstimateRow {
  description: string
  specification: string
  unit: string
  quantity: number
  unitPrice: number
  amount: number
}

/** what 임시 저장 keeps, under the original's key and shape */
interface StoredWork {
  title: string
  shoppingCartText: string
  estimateData: EstimateRow[]
  generatedArticle: string | null
}

const STORAGE_KEY = 'procurement_temp_storage'

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
    <div className="sf-list">
      <header className="sf-head">
        <span className="sf-eyebrow sf-eyebrow-work">똑딱업무</span>
        <h1>학교 업무 문서, AI와 함께 빠르게</h1>
        <p>필요한 도구를 골라 내용만 넣으면 양식에 맞춰 만들어 드려요. 도구는 계속 늘어나요.</p>
      </header>
      <div className="sf-grid">
        {FEATURES.map((f) => (
          // the wrap carries what sits on a card without being part of its button (a video)
          <div key={f.id} className="sf-card-wrap">
            <button
              type="button"
              className="sf-card"
              data-testid={'special-feature-' + f.id}
              onClick={() => onOpen(f.id)}
            >
              <span className="sf-card-top">
                <span className="sf-card-icon">
                  {f.id === 'quiz' ? (
                    <QuizIcon />
                  ) : f.id === 'sign' ? (
                    <SignIcon />
                  ) : (
                    <ProposalIcon />
                  )}
                </span>
              </span>
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
            {f.id === 'sign' && <SignVideoButton variant="card" />}
          </div>
        ))}
        <div className="sf-card sf-card-soon" aria-label="다음 기능 준비 중">
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
  const [article, setArticle] = useState<string | null>(null)
  const [rows, setRows] = useState<EstimateRow[]>([])
  const [toast, say] = useToast()
  const [sendNote, setSendNote] = useState<{ ok: boolean; text: string; pkgText: string } | null>(
    null,
  )
  const resultRef = useRef<HTMLElement>(null)

  const total = totalOf(rows)

  // 품의서 생성 → K-에듀파인: the desktop app holds it for the extension, the web app hands
  // it to the extension in this browser; the note below always offers clipboard and file too
  const sendToEdufine = async () => {
    const problem = workProblem(title, rows)
    if (problem) return say(problem, true)
    const pkgText = JSON.stringify(
      pumuiPackageFromWork({ title, estimateData: rows, generatedArticle: article }),
    )
    const api = window.aiOffice
    const out = await sendPumui(pkgText, {
      web: isWebEdition(),
      workSend: typeof api?.workSend === 'function' ? (f, t) => api.workSend(f, t) : undefined,
      openWorkSite:
        typeof api?.openWorkSite === 'function' ? (f) => api.openWorkSite(f) : undefined,
      runtime: (window as unknown as { chrome?: { runtime?: never } }).chrome?.runtime,
    })
    setSendNote({ ok: out.ok, text: out.message, pkgText })
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
      const parsed = parseRows(await askAi(PARSE_SYSTEM, cart))
      setRows(parsed)
      setArticle(proposalArticle(title.trim(), parsed))
      say('품의서를 만들었어요.')
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
      setRows(Array.isArray(work.estimateData) ? work.estimateData : [])
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
    setErrors({})
    say('모든 내용을 지웠어요.')
  }

  return (
    <div className="sf-page">
      <div className="sf-page-bar">
        <Back onClick={onBack} label="똑딱업무" />
      </div>
      <header className="sf-page-head">
        <span className="sf-card-icon">
          <ProposalIcon />
        </span>
        <div className="sf-page-title">
          <h1>품의서 생성</h1>
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
                  disabled={reading !== null || busy}
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
                  disabled={rows.length === 0}
                  onClick={() => void sendToEdufine()}
                >
                  K-에듀파인으로 보내기
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
                <div className="sf-btn-row">
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
                      <tr key={i}>
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
      ) : (
        <FeatureList onOpen={setOpen} />
      )}
    </div>
  )
}
