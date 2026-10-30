import { useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import './special-features.css'

/**
 * 특화 기능: tools made for Korean school and public-office work, opened from the
 * home sidebar (desktop) or the trial home (web). The list holds one feature so far,
 * 품의서 생성, whose page is laid out but not wired to a generator yet.
 */

type FeatureId = 'approval'

interface Feature {
  id: FeatureId
  title: string
  summary: string
  tags: string[]
}

const FEATURES: Feature[] = [
  {
    id: 'approval',
    title: '품의서 생성',
    summary: '목적·내용·예산만 적으면 결재 양식에 맞춘 품의서 초안을 한글 문서로 만들어요.',
    tags: ['HWP', '결재 문서', '예산 자동 합계'],
  },
]

interface BudgetRow {
  key: number
  item: string
  qty: string
  price: string
}

interface ApprovalForm {
  title: string
  dept: string
  author: string
  date: string
  purpose: string
  detail: string
  account: string
  basis: string
}

const today = (): string => {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
}

const num = (s: string): number => {
  const n = Number(s.replace(/[^\d.]/g, ''))
  return Number.isFinite(n) ? n : 0
}

const won = (n: number): string => n.toLocaleString('ko-KR')

function dotDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return y && m && d ? y + '. ' + Number(m) + '. ' + Number(d) + '.' : ''
}

function Back({ onClick, label }: { onClick: () => void; label: string }): ReactElement {
  return (
    <button type="button" className="sf-back" onClick={onClick}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
          d="M10 3.5L5.5 8l4.5 4.5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {label}
    </button>
  )
}

function ApprovalIcon(): ReactElement {
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
        <span className="sf-eyebrow">똑딱작업실 특화 기능</span>
        <h1>학교·기관 업무에 맞춘 문서 도구</h1>
        <p>자주 쓰는 업무 문서를 양식에 맞춰 빠르게 만들어요. 기능은 계속 늘어납니다.</p>
      </header>
      <div className="sf-grid">
        {FEATURES.map((f) => (
          <button
            key={f.id}
            type="button"
            className="sf-card"
            data-testid={'special-feature-' + f.id}
            onClick={() => onOpen(f.id)}
          >
            <span className="sf-card-top">
              <span className="sf-card-icon">
                <ApprovalIcon />
              </span>
              <span className="sf-badge">NEW</span>
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

function ApprovalDraft({ onBack }: { onBack: () => void }): ReactElement {
  const [form, setForm] = useState<ApprovalForm>({
    title: '',
    dept: '',
    author: '',
    date: today(),
    purpose: '',
    detail: '',
    account: '',
    basis: '',
  })
  const [rows, setRows] = useState<BudgetRow[]>([
    { key: 1, item: '', qty: '', price: '' },
    { key: 2, item: '', qty: '', price: '' },
  ])
  const [nextKey, setNextKey] = useState(3)

  const set = (field: keyof ApprovalForm) => (value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }))
  const setRow = (key: number, field: 'item' | 'qty' | 'price', value: string) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, [field]: value } : r)))
  const addRow = () => {
    setRows((prev) => [...prev, { key: nextKey, item: '', qty: '', price: '' }])
    setNextKey((k) => k + 1)
  }
  const removeRow = (key: number) => setRows((prev) => prev.filter((r) => r.key !== key))

  const total = useMemo(() => rows.reduce((sum, r) => sum + num(r.qty) * num(r.price), 0), [rows])
  const filledRows = rows.filter((r) => r.item.trim() || num(r.qty) || num(r.price))
  const steps = [
    { label: '기본 정보', done: !!(form.title.trim() && form.dept.trim() && form.author.trim()) },
    { label: '품의 내용', done: !!(form.purpose.trim() && form.detail.trim()) },
    { label: '소요 예산', done: filledRows.length > 0 },
  ]

  return (
    <div className="sf-page">
      <div className="sf-page-bar">
        <Back onClick={onBack} label="특화 기능" />
      </div>
      <header className="sf-page-head">
        <span className="sf-card-icon">
          <ApprovalIcon />
        </span>
        <div>
          <h1>품의서 생성</h1>
          <p>왼쪽에 내용을 적으면 오른쪽에 품의서 모양이 바로 보여요.</p>
        </div>
      </header>

      <ol className="sf-steps" aria-label="작성 단계">
        {steps.map((s, i) => (
          <li key={s.label} className={s.done ? 'is-done' : undefined}>
            <b>{s.done ? '✓' : i + 1}</b>
            {s.label}
          </li>
        ))}
      </ol>

      <div className="sf-split">
        <form className="sf-form" onSubmit={(e) => e.preventDefault()}>
          <section className="sf-box">
            <h2>기본 정보</h2>
            <label className="sf-field sf-wide">
              <span>제목</span>
              <input
                value={form.title}
                onChange={(e) => set('title')(e.target.value)}
                placeholder="예: 2027학년도 과학실 실험 기자재 구입"
              />
            </label>
            <div className="sf-row3">
              <label className="sf-field">
                <span>기안 부서</span>
                <input
                  value={form.dept}
                  onChange={(e) => set('dept')(e.target.value)}
                  placeholder="예: 과학정보부"
                />
              </label>
              <label className="sf-field">
                <span>기안자</span>
                <input
                  value={form.author}
                  onChange={(e) => set('author')(e.target.value)}
                  placeholder="이름"
                />
              </label>
              <label className="sf-field">
                <span>기안일</span>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => set('date')(e.target.value)}
                />
              </label>
            </div>
          </section>

          <section className="sf-box">
            <h2>품의 내용</h2>
            <label className="sf-field">
              <span>목적</span>
              <textarea
                rows={2}
                value={form.purpose}
                onChange={(e) => set('purpose')(e.target.value)}
                placeholder="무엇을 왜 하려는지 한두 문장으로 적어 주세요"
              />
            </label>
            <label className="sf-field">
              <span>세부 내용</span>
              <textarea
                rows={4}
                value={form.detail}
                onChange={(e) => set('detail')(e.target.value)}
                placeholder={
                  '줄마다 한 항목씩 적으면 번호가 붙어요\n예: 구입 시기 2027. 3. 중\n예: 사용 장소 본관 2층 과학실'
                }
              />
            </label>
            <label className="sf-field">
              <span>
                관련 근거 <em>선택</em>
              </span>
              <input
                value={form.basis}
                onChange={(e) => set('basis')(e.target.value)}
                placeholder="예: 2027학년도 학교 교육과정 운영 계획"
              />
            </label>
          </section>

          <section className="sf-box">
            <div className="sf-box-head">
              <h2>소요 예산</h2>
              <label className="sf-inline">
                <span>예산 과목</span>
                <input
                  value={form.account}
                  onChange={(e) => set('account')(e.target.value)}
                  placeholder="예: 교육활동 > 교과활동"
                />
              </label>
            </div>
            <div className="sf-budget" role="table" aria-label="예산 항목">
              <div className="sf-budget-row sf-budget-headrow" role="row">
                <span role="columnheader">품목</span>
                <span role="columnheader">수량</span>
                <span role="columnheader">단가(원)</span>
                <span role="columnheader">금액(원)</span>
                <span aria-hidden="true" />
              </div>
              {rows.map((r) => (
                <div key={r.key} className="sf-budget-row" role="row">
                  <input
                    aria-label="품목"
                    value={r.item}
                    onChange={(e) => setRow(r.key, 'item', e.target.value)}
                    placeholder="품목 이름"
                  />
                  <input
                    aria-label="수량"
                    inputMode="numeric"
                    value={r.qty}
                    onChange={(e) => setRow(r.key, 'qty', e.target.value)}
                    placeholder="0"
                  />
                  <input
                    aria-label="단가"
                    inputMode="numeric"
                    value={r.price}
                    onChange={(e) => setRow(r.key, 'price', e.target.value)}
                    placeholder="0"
                  />
                  <span className="sf-amount" role="cell">
                    {won(num(r.qty) * num(r.price))}
                  </span>
                  <button
                    type="button"
                    className="sf-icon-btn"
                    aria-label="이 줄 지우기"
                    disabled={rows.length <= 1}
                    onClick={() => removeRow(r.key)}
                  >
                    ×
                  </button>
                </div>
              ))}
              <div className="sf-budget-foot">
                <button type="button" className="sf-ghost" onClick={addRow}>
                  + 줄 추가
                </button>
                <span>
                  합계 <strong>{won(total)}</strong>원
                </span>
              </div>
            </div>
          </section>
        </form>

        <aside className="sf-preview" aria-label="품의서 미리보기">
          <div className="sf-preview-label">
            <span>미리보기</span>
            <span className="sf-tag">HWP</span>
          </div>
          <div className="sf-paper">
            <div className="sf-paper-top">
              <h3>품 의 서</h3>
              <table className="sf-sign">
                <tbody>
                  <tr>
                    <th rowSpan={2}>결재</th>
                    <td>담당</td>
                    <td>검토</td>
                    <td>결재</td>
                  </tr>
                  <tr>
                    <td className="sf-sign-box">{form.author}</td>
                    <td className="sf-sign-box" />
                    <td className="sf-sign-box" />
                  </tr>
                </tbody>
              </table>
            </div>
            <table className="sf-meta">
              <tbody>
                <tr>
                  <th>기안 부서</th>
                  <td>{form.dept || '—'}</td>
                  <th>기안일</th>
                  <td>{dotDate(form.date) || '—'}</td>
                </tr>
                <tr>
                  <th>제목</th>
                  <td colSpan={3} className="sf-meta-title">
                    {form.title || '제목을 적어 주세요'}
                  </td>
                </tr>
              </tbody>
            </table>
            <div className="sf-paper-body">
              {form.basis.trim() && (
                <p>
                  <b>1. 관련:</b> {form.basis}
                </p>
              )}
              <p>
                <b>{form.basis.trim() ? '2.' : '1.'} 목적:</b>{' '}
                {form.purpose || <span className="sf-dim">목적이 여기에 들어가요.</span>}
              </p>
              <p>
                <b>{form.basis.trim() ? '3.' : '2.'} 세부 내용</b>
              </p>
              {form.detail.trim() ? (
                <ol className="sf-paper-list">
                  {form.detail
                    .split('\n')
                    .map((line) => line.trim())
                    .filter(Boolean)
                    .map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                </ol>
              ) : (
                <p className="sf-dim sf-indent">줄마다 적은 항목이 번호를 달고 들어가요.</p>
              )}
              <p>
                <b>{form.basis.trim() ? '4.' : '3.'} 소요 예산:</b> 금 {won(total)}원
                {form.account.trim() ? ' (' + form.account + ')' : ''}
              </p>
              <table className="sf-paper-table">
                <thead>
                  <tr>
                    <th>품목</th>
                    <th>수량</th>
                    <th>단가</th>
                    <th>금액</th>
                  </tr>
                </thead>
                <tbody>
                  {(filledRows.length ? filledRows : rows.slice(0, 1)).map((r) => (
                    <tr key={r.key}>
                      <td>{r.item || '—'}</td>
                      <td>{num(r.qty) ? won(num(r.qty)) : ''}</td>
                      <td>{num(r.price) ? won(num(r.price)) : ''}</td>
                      <td>{won(num(r.qty) * num(r.price))}</td>
                    </tr>
                  ))}
                  <tr className="sf-paper-sum">
                    <td colSpan={3}>합계</td>
                    <td>{won(total)}</td>
                  </tr>
                </tbody>
              </table>
              <p className="sf-paper-end">위와 같이 품의하오니 결재하여 주시기 바랍니다.</p>
            </div>
          </div>
        </aside>
      </div>

      <div className="sf-actions">
        <p>문서 만들기는 곧 연결돼요. 지금은 화면만 미리 볼 수 있어요.</p>
        <button type="button" className="sf-secondary" disabled title="준비 중">
          AI로 문장 다듬기
        </button>
        <button type="button" className="sf-primary" disabled title="준비 중">
          한글 문서로 만들기
        </button>
      </div>
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
      {open === 'approval' ? (
        <ApprovalDraft onBack={() => setOpen(null)} />
      ) : (
        <FeatureList onOpen={setOpen} />
      )}
    </div>
  )
}
