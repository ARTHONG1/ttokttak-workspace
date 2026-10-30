import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { Back, Modal, ToastView, askAi, copyText, useToast } from './special-common'
import {
  DIFFICULTY_LABEL,
  LANGUAGES,
  MAX_QUESTIONS,
  QUESTION_TYPES,
  TYPE_LABEL,
  TYPE_TAB,
  answerText,
  blooketCsv,
  chosungOf,
  generationPrompt,
  isCorrect,
  mergeTranslation,
  newId,
  parseQuizReply,
  totalOf,
  translationPrompt,
  type Difficulty,
  type Question,
  type QuestionType,
  type QuizCounts,
  type QuizData,
} from './quiz-model'
import { buildQuiznWorkbook, buildWorksheetPdf, recordQuizVideo } from './quiz-export'
import { QuizWordSearch } from './QuizWordSearch'

/**
 * 특화 기능 > 퀴즈 생성기, after the author's ACE QUIZ LAB: 학습 자료 (typed, a PDF or Hangul
 * file, or a YouTube video's captions), the count of each of five question types (30 at
 * most), a difficulty, then the quiz: a list by type to edit, reorder and add to, a
 * translation into five languages, a play mode with a presenter draw, 문제지·정답지 PDFs on
 * the original's templates, Blooket CSV and QuizN XLSX, and a quiz video.
 */

type InputType = 'text' | 'pdf' | 'youtube' | 'hwp'

const INPUTS: { id: InputType; label: string }[] = [
  { id: 'text', label: '직접 입력' },
  { id: 'pdf', label: 'PDF 파일' },
  { id: 'youtube', label: '유튜브' },
  { id: 'hwp', label: '한글 파일' },
]

const COUNT_FIELDS: { key: keyof QuizCounts; label: string }[] = [
  { key: 'multipleChoice', label: '선택형' },
  { key: 'ox', label: 'OX형' },
  { key: 'shortAnswer', label: '단답형' },
  { key: 'ordering', label: '순서 완성' },
  { key: 'initialConsonant', label: '초성퀴즈' },
]

/** the original's temporary-storage key and shape */
const STORAGE_KEY = 'aceQuizLabState'

interface StoredState {
  formValues: {
    inputType: InputType
    content: string
    youtubeUrl: string
    counts: QuizCounts
    difficulty: Difficulty
  }
  quizData: QuizData | null
}

const DEFAULT_COUNTS: QuizCounts = {
  multipleChoice: 5,
  ox: 0,
  shortAnswer: 0,
  ordering: 0,
  initialConsonant: 0,
}

function QuizIcon(): ReactElement {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M9.6 9.4a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1.1.9-1.1 1.6v.4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <circle cx="12" cy="16.6" r="1" fill="currentColor" />
    </svg>
  )
}
export { QuizIcon }

/* ------------------------------------------------------------------ list */

function QuestionCard({
  q,
  index,
  onChange,
  onDelete,
  onMove,
}: {
  q: Question
  index: number
  onChange: (next: Question) => void
  onDelete: () => void
  onMove: (dir: -1 | 1) => void
}): ReactElement {
  const [editing, setEditing] = useState<Question | null>(null)
  const view = editing ?? q
  const set = (patch: Partial<Question>) => editing && setEditing({ ...editing, ...patch })
  const setOption = (i: number, v: string) => {
    if (!editing?.options) return
    const options = [...editing.options]
    const was = options[i]
    options[i] = v
    // a 선택형 answer follows the option it named
    set({
      options,
      answer: editing.type === 'multiple-choice' && editing.answer === was ? v : editing.answer,
    })
  }
  const save = () => {
    if (!editing) return
    const next = { ...editing }
    if (next.type === 'initial-consonant')
      next.options = [next.options?.[0]?.trim() || chosungOf(next.answer)]
    onChange(next)
    setEditing(null)
  }
  return (
    <article className="qz-card" data-testid="quiz-question">
      <header className="qz-card-head">
        <h3>문제 {index + 1}</h3>
        <span className="sf-tag">{TYPE_LABEL[q.type]}</span>
        <div className="qz-card-tools">
          {editing ? (
            <>
              <button type="button" className="sf-secondary sf-sm" onClick={save}>
                저장
              </button>
              <button type="button" className="sf-text-btn" onClick={() => setEditing(null)}>
                취소
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="sf-icon-btn"
                aria-label="고치기"
                title="고치기"
                onClick={() => setEditing({ ...q })}
              >
                ✎
              </button>
              <button
                type="button"
                className="sf-icon-btn"
                aria-label="위로"
                title="위로"
                onClick={() => onMove(-1)}
              >
                ↑
              </button>
              <button
                type="button"
                className="sf-icon-btn"
                aria-label="아래로"
                title="아래로"
                onClick={() => onMove(1)}
              >
                ↓
              </button>
              <button
                type="button"
                className="sf-icon-btn qz-del"
                aria-label="지우기"
                title="지우기"
                onClick={onDelete}
              >
                ×
              </button>
            </>
          )}
        </div>
      </header>

      <div className="qz-field">
        <span>질문</span>
        {editing ? (
          <textarea
            rows={3}
            value={view.question}
            onChange={(e) => set({ question: e.target.value })}
          />
        ) : (
          <p className="qz-q">{view.question}</p>
        )}
      </div>

      {view.options && view.type !== 'short-answer' && (
        <div className="qz-field">
          <span>{view.type === 'initial-consonant' ? '힌트' : '보기'}</span>
          {view.type === 'initial-consonant' ? (
            editing ? (
              <input
                value={view.options[0] ?? ''}
                placeholder="초성 힌트를 입력하세요 (예: ㅇㄱㅈㄴ)"
                onChange={(e) => setOption(0, e.target.value)}
              />
            ) : (
              <p className="qz-hint">{view.options[0]}</p>
            )
          ) : (
            <ol className="qz-options">
              {view.options.map((o, i) => {
                const right = !editing && view.type === 'multiple-choice' && o === view.answer
                return (
                  <li key={i} className={right ? 'is-right' : undefined}>
                    <b>{i + 1}</b>
                    {editing && view.type !== 'ox' ? (
                      <input value={o} onChange={(e) => setOption(i, e.target.value)} />
                    ) : (
                      <span>{o}</span>
                    )}
                  </li>
                )
              })}
            </ol>
          )}
        </div>
      )}

      <div className="qz-field">
        <span className="qz-answer-label">정답</span>
        {editing ? (
          view.type === 'multiple-choice' && view.options ? (
            <select value={view.answer} onChange={(e) => set({ answer: e.target.value })}>
              {view.options.map((o, i) => (
                <option key={i} value={o}>
                  {i + 1}. {o}
                </option>
              ))}
            </select>
          ) : view.type === 'ox' ? (
            <select value={view.answer} onChange={(e) => set({ answer: e.target.value })}>
              <option value="O">O</option>
              <option value="X">X</option>
            </select>
          ) : (
            <input
              value={view.answer}
              placeholder={view.type === 'ordering' ? '보기 번호를 순서대로 (예: 2,4,1,3)' : '정답'}
              onChange={(e) => set({ answer: e.target.value })}
            />
          )
        ) : (
          <p className="qz-answer">{answerText(view)}</p>
        )}
      </div>

      {(view.explanation || editing) && (
        <div className="qz-field">
          <span className="qz-expl-label">해설</span>
          {editing ? (
            <textarea
              rows={3}
              value={view.explanation ?? ''}
              onChange={(e) => set({ explanation: e.target.value })}
            />
          ) : (
            <p className="qz-expl">{view.explanation}</p>
          )}
        </div>
      )}
    </article>
  )
}

/* ------------------------------------------------------------------ play */

function shuffled<T>(list: T[]): T[] {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function PresenterDraw({ onClose }: { onClose: () => void }): ReactElement {
  const [from, setFrom] = useState(1)
  const [to, setTo] = useState(30)
  const [picked, setPicked] = useState<number | null>(null)
  const [rolling, setRolling] = useState(false)
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  useEffect(() => () => clearInterval(timer.current), [])
  const draw = () => {
    if (from > to) return
    setRolling(true)
    let n = 0
    timer.current = setInterval(() => {
      setPicked(Math.floor(Math.random() * (to - from + 1)) + from)
      if (++n > 15) {
        clearInterval(timer.current)
        setRolling(false)
      }
    }, 100)
  }
  return (
    <Modal title="발표자 추첨 (번호)" onClose={onClose}>
      <p className="sf-box-sub">추첨할 번호 범위를 입력하고 버튼을 눌러주세요.</p>
      <div className="qz-draw-range">
        <label className="sf-field">
          <span>시작 번호</span>
          <input
            type="number"
            value={from}
            onChange={(e) => setFrom(parseInt(e.target.value) || 0)}
          />
        </label>
        <span aria-hidden="true">~</span>
        <label className="sf-field">
          <span>끝 번호</span>
          <input type="number" value={to} onChange={(e) => setTo(parseInt(e.target.value) || 0)} />
        </label>
      </div>
      <div className={'qz-draw-box' + (rolling ? ' is-rolling' : '')}>
        {picked === null ? <span>행운의 번호는?</span> : <b>{picked}</b>}
      </div>
      <button
        type="button"
        className="sf-primary sf-wide-btn qz-draw-btn"
        disabled={rolling || from > to}
        onClick={draw}
      >
        {rolling ? '추첨 중...' : '번호 뽑기'}
      </button>
    </Modal>
  )
}

function QuizPlay({
  questions,
  onFinish,
}: {
  questions: Question[]
  onFinish: () => void
}): ReactElement {
  const [at, setAt] = useState(0)
  const [chosen, setChosen] = useState<string | null>(null)
  const [typed, setTyped] = useState('')
  const [order, setOrder] = useState<string[]>([])
  const [checked, setChecked] = useState(false)
  const [score, setScore] = useState(0)
  const [done, setDone] = useState(false)
  const [big, setBig] = useState(false)
  const [drawOpen, setDrawOpen] = useState(false)
  const dragFrom = useRef<number | null>(null)
  const q = questions[at]

  useEffect(() => {
    setChosen(null)
    setTyped('')
    setChecked(false)
    setOrder(q.type === 'ordering' && q.options ? shuffled(q.options) : [])
  }, [at, q])

  const check = (given: string | string[]) => {
    if (checked) return
    setChecked(true)
    if (isCorrect(q, given)) setScore((s) => s + 1)
  }
  const right =
    checked &&
    (q.type === 'ordering'
      ? isCorrect(q, order)
      : q.type === 'short-answer' || q.type === 'initial-consonant'
        ? isCorrect(q, typed)
        : chosen === q.answer)
  const move = (to: number) => {
    const from = dragFrom.current
    dragFrom.current = null
    if (from === null || from === to) return
    const next = [...order]
    const [it] = next.splice(from, 1)
    next.splice(to, 0, it)
    setOrder(next)
  }
  const nudge = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= order.length) return
    const next = [...order]
    ;[next[i], next[j]] = [next[j], next[i]]
    setOrder(next)
  }

  if (done) {
    return (
      <div className="qz-play">
        <div className="qz-result">
          <span className="sf-eyebrow">퀴즈 끝</span>
          <h2>
            {questions.length}문제 가운데 <em>{score}</em>문제를 맞혔어요
          </h2>
          <div className="sf-btn-row">
            <button
              type="button"
              className="sf-secondary"
              onClick={() => {
                setAt(0)
                setScore(0)
                setDone(false)
              }}
            >
              다시 풀기
            </button>
            <button type="button" className="sf-primary" onClick={onFinish}>
              퀴즈 목록으로
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={'qz-play' + (big ? ' is-big' : '')} data-testid="quiz-play">
      <div className="qz-stage">
        <div className="qz-stage-top">
          <span className="qz-count">
            QUESTION {at + 1} / {questions.length}
          </span>
          <button type="button" className="sf-text-btn" onClick={() => setBig(!big)}>
            {big ? '작게 보기' : '크게 보기'}
          </button>
        </div>
        <h2 className="qz-stage-q">{q.question}</h2>

        {(q.type === 'multiple-choice' || q.type === 'ox') && (
          <div className={'qz-choices' + (q.type === 'ox' ? ' is-ox' : '')}>
            {(q.options ?? []).map((o, i) => {
              const state = !checked
                ? ''
                : o === q.answer
                  ? ' is-right'
                  : o === chosen
                    ? ' is-wrong'
                    : ' is-dim'
              return (
                <button
                  key={i}
                  type="button"
                  className={
                    'qz-choice' + state + (q.type === 'ox' ? (o === 'O' ? ' is-o' : ' is-x') : '')
                  }
                  disabled={checked}
                  onClick={() => {
                    setChosen(o)
                    check(o)
                  }}
                >
                  {q.type === 'ox' ? (
                    o
                  ) : (
                    <>
                      <b>{i + 1}</b>
                      <span>{o}</span>
                    </>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {(q.type === 'short-answer' || q.type === 'initial-consonant') && (
          <div className="qz-typed">
            {q.type === 'initial-consonant' && (
              <p className="qz-hint">
                <small>초성 힌트</small>
                {q.options?.[0]}
              </p>
            )}
            <input
              value={typed}
              placeholder="정답을 입력하세요..."
              disabled={checked}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) check(typed)
              }}
            />
            {!checked && (
              <button type="button" className="sf-primary sf-wide-btn" onClick={() => check(typed)}>
                정답 확인
              </button>
            )}
          </div>
        )}

        {q.type === 'ordering' && (
          <div className="qz-order">
            <p className="sf-box-sub">보기의 순서를 끌어서 올바르게 배열하세요.</p>
            <ol>
              {order.map((o, i) => (
                <li
                  key={o + i}
                  draggable={!checked}
                  onDragStart={() => (dragFrom.current = i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => move(i)}
                >
                  <b>{i + 1}</b>
                  <span>{o}</span>
                  {!checked && (
                    <span className="qz-order-btns">
                      <button
                        type="button"
                        className="sf-icon-btn"
                        aria-label="위로"
                        onClick={() => nudge(i, -1)}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="sf-icon-btn"
                        aria-label="아래로"
                        onClick={() => nudge(i, 1)}
                      >
                        ↓
                      </button>
                    </span>
                  )}
                </li>
              ))}
            </ol>
            {!checked && (
              <button type="button" className="sf-primary sf-wide-btn" onClick={() => check(order)}>
                순서 확인
              </button>
            )}
          </div>
        )}

        {checked && (
          <div className={'qz-verdict' + (right ? ' is-right' : ' is-wrong')} role="status">
            <h3>{right ? '🎉 정답입니다!' : '❌ 오답입니다'}</h3>
            {!right && <p>정답: {answerText(q)}</p>}
            {q.explanation && <p className="qz-verdict-expl">“{q.explanation}”</p>}
          </div>
        )}
      </div>

      <div className="qz-play-bar">
        <div className="sf-btn-row">
          <button type="button" className="sf-secondary" onClick={onFinish}>
            퀴즈 종료
          </button>
          <button
            type="button"
            className="sf-secondary qz-draw-open"
            onClick={() => setDrawOpen(true)}
          >
            발표자 추첨
          </button>
        </div>
        <button
          type="button"
          className="sf-primary"
          disabled={!checked}
          onClick={() => (at < questions.length - 1 ? setAt(at + 1) : setDone(true))}
        >
          {at < questions.length - 1 ? '다음 문제' : '결과 보기'}
        </button>
      </div>
      {drawOpen && <PresenterDraw onClose={() => setDrawOpen(false)} />}
    </div>
  )
}

/* ------------------------------------------------------------------ page */

export function QuizGenerator({ onBack }: { onBack: () => void }): ReactElement {
  const [mode, setMode] = useState<'quiz' | 'words'>('quiz')
  const [inputType, setInputType] = useState<InputType>('text')
  const [content, setContent] = useState('')
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [source, setSource] = useState<string | null>(null)
  const [counts, setCounts] = useState<QuizCounts>(DEFAULT_COUNTS)
  const [difficulty, setDifficulty] = useState<Difficulty>('medium')
  const [quiz, setQuiz] = useState<QuizData | null>(null)
  const [translations, setTranslations] = useState<Record<string, QuizData>>({})
  const [language, setLanguage] = useState('ko')
  const [busy, setBusy] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [dialog, setDialog] = useState<'worksheet' | 'export' | 'video' | null>(null)
  const [subtitle, setSubtitle] = useState('')
  const [video, setVideo] = useState<{ url: string; blob: Blob; ext: string } | null>(null)
  const [tab, setTab] = useState<QuestionType>('multiple-choice')
  const [toast, say] = useToast()
  const resultRef = useRef<HTMLElement>(null)

  useEffect(
    () => () => {
      if (video) URL.revokeObjectURL(video.url)
    },
    [video],
  )

  const shown = language === 'ko' || !quiz ? quiz : (translations[language] ?? quiz)
  const total = totalOf(counts)
  const byType = useMemo(() => {
    const map = Object.fromEntries(QUESTION_TYPES.map((t) => [t, [] as Question[]])) as Record<
      QuestionType,
      Question[]
    >
    for (const q of shown?.questions ?? []) map[q.type].push(q)
    return map
  }, [shown])
  const firstTab = QUESTION_TYPES.find((t) => byType[t].length > 0) ?? 'multiple-choice'
  const activeTab = byType[tab].length > 0 ? tab : firstTab

  /** every change to the Korean quiz drops the translations, as the original does */
  const changeQuiz = (next: QuizData, message?: string) => {
    setQuiz(next)
    setTranslations({})
    setLanguage('ko')
    if (message) say(message)
  }

  const chooseInput = (id: InputType) => {
    setInputType(id)
    setContent('')
    setYoutubeUrl('')
    setSource(null)
  }

  const readFile = async (kind: 'pdf' | 'hwp') => {
    if (typeof window.aiOffice?.readQuizFile !== 'function') return
    setBusy('read')
    try {
      const r = await window.aiOffice.readQuizFile(kind)
      if (!r) return
      if (!r.ok) return say(r.error, true)
      setContent(r.text)
      setSource(r.name)
      say(
        '파일에서 텍스트를 성공적으로 추출했습니다.' +
          (r.truncated ? ' 내용이 길어 앞부분만 넣었어요.' : ''),
      )
    } finally {
      setBusy(null)
    }
  }

  const readYoutube = async () => {
    if (!youtubeUrl.trim()) return
    setBusy('read')
    try {
      const r = await window.aiOffice.readYoutubeTranscript(youtubeUrl.trim())
      if (!r.ok) return say(r.error, true)
      setContent(r.text)
      setSource(r.name)
      say(
        '유튜브 영상 스크립트를 성공적으로 추출했습니다.' +
          (r.truncated ? ' 내용이 길어 앞부분만 넣었어요.' : ''),
      )
    } finally {
      setBusy(null)
    }
  }

  const generate = async () => {
    if (!content.trim()) return say('학습 자료를 먼저 넣어 주세요.', true)
    if (total < 1 || total > MAX_QUESTIONS)
      return say('총 문제 수는 1에서 30 사이여야 합니다.', true)
    setBusy('generate')
    try {
      const reply = await askAi(generationPrompt(counts, difficulty), content.trim(), [], 12000)
      const data = parseQuizReply(reply)
      changeQuiz(data)
      setTab(
        QUESTION_TYPES.find((t) => data.questions.some((q) => q.type === t)) ?? 'multiple-choice',
      )
      say(data.questions.length + '문제를 만들었어요.')
      requestAnimationFrame(() =>
        resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      )
    } catch (e) {
      say(e instanceof Error ? e.message : String(e), true)
    } finally {
      setBusy(null)
    }
  }

  const translate = async (code: string) => {
    if (!quiz || code === language) return
    if (code === 'ko' || translations[code]) return setLanguage(code)
    const lang = LANGUAGES.find((l) => l.code === code)
    if (!lang) return
    setBusy('translate')
    say(lang.label + '(으)로 번역하고 있어요...')
    try {
      const reply = await askAi(translationPrompt(lang.name), JSON.stringify(quiz), [], 12000)
      const done = mergeTranslation(quiz, reply)
      setTranslations((t) => ({ ...t, [code]: done }))
      setLanguage(code)
      say('퀴즈를 ' + lang.label + '(으)로 번역했어요.')
    } catch {
      say('퀴즈 번역 중 오류가 발생했습니다. 다시 시도해주세요.', true)
    } finally {
      setBusy(null)
    }
  }

  const save = async (bytes: Uint8Array, name: string, filterName: string, ext: string) => {
    const path = await window.aiOffice.saveFeatureFile({
      name,
      filterName,
      extensions: [ext],
      bytes,
    })
    if (path) say(path.split(/[\\/]/).pop() + '을(를) 저장했어요.')
  }

  const makeWorksheet = async (answers: boolean) => {
    if (!shown) return
    setDialog(null)
    setBusy('worksheet')
    say('학습지를 만들고 있어요...')
    try {
      const template = await window.aiOffice.readFeatureAsset(
        answers ? 'quiz-answers.pdf' : 'quiz-worksheet.pdf',
      )
      if (!template) throw new Error('학습지 서식을 찾을 수 없어요.')
      const pdf = await buildWorksheetPdf(template, shown.questions, answers)
      await save(pdf, answers ? '정답지_완료.pdf' : '문제지_완료.pdf', 'PDF', 'pdf')
    } catch (e) {
      say(e instanceof Error ? e.message : 'PDF를 만들지 못했어요.', true)
    } finally {
      setBusy(null)
    }
  }

  const exportBlooket = async () => {
    if (!shown) return
    const n = shown.questions.filter((q) => q.type === 'multiple-choice' || q.type === 'ox').length
    if (n === 0) return say('블루킷은 선택형과 OX형 문제만 받아요.', true)
    setDialog(null)
    await save(new TextEncoder().encode(blooketCsv(shown)), 'blooket_quiz_import.csv', 'CSV', 'csv')
  }

  const exportQuizn = async () => {
    if (!shown) return
    setDialog(null)
    try {
      const template = await window.aiOffice.readFeatureAsset('quizn-template.xlsx')
      if (!template) throw new Error('퀴즈앤 서식을 찾을 수 없어요.')
      await save(
        await buildQuiznWorkbook(template, shown),
        'QuizN_Upload_File.xlsx',
        '엑셀',
        'xlsx',
      )
    } catch (e) {
      say(e instanceof Error ? e.message : '원본 서식 보존 과정에서 오류가 발생했습니다.', true)
    }
  }

  const makeVideo = async () => {
    if (!shown || shown.questions.length === 0) return say('동영상을 만들 문제가 없어요.', true)
    setDialog(null)
    setBusy('video')
    say('동영상을 만들고 있어요. 문제마다 17초쯤 걸려요.')
    try {
      const bgm = await window.aiOffice.readFeatureAsset('quiz-bgm.mp3')
      const made = await recordQuizVideo(shown.questions, subtitle.trim(), bgm)
      if (video) URL.revokeObjectURL(video.url)
      setVideo({ url: URL.createObjectURL(made.blob), blob: made.blob, ext: made.ext })
      say('동영상을 만들었어요.')
    } catch (e) {
      say(e instanceof Error ? e.message : '동영상을 만들지 못했어요.', true)
    } finally {
      setBusy(null)
    }
  }

  const saveTemp = () => {
    const state: StoredState = {
      formValues: { inputType, content, youtubeUrl, counts, difficulty },
      quizData: quiz,
    }
    if (!content.trim() && !quiz) return say('저장할 내용이 없습니다.', true)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
      say('현재 상태가 브라우저에 임시 저장되었습니다.')
    } catch {
      say('저장하지 못했어요. 브라우저 저장 공간을 확인해 주세요.', true)
    }
  }
  const loadTemp = () => {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return say('저장된 데이터가 없습니다.', true)
    try {
      const s = JSON.parse(raw) as StoredState
      setInputType(s.formValues.inputType ?? 'text')
      setContent(s.formValues.content ?? '')
      setYoutubeUrl(s.formValues.youtubeUrl ?? '')
      setCounts({ ...DEFAULT_COUNTS, ...s.formValues.counts })
      setDifficulty(s.formValues.difficulty ?? 'medium')
      changeQuiz(s.quizData && Array.isArray(s.quizData.questions) ? s.quizData : { questions: [] })
      if (!s.quizData) setQuiz(null)
      say('저장된 상태를 불러왔습니다.')
    } catch {
      say('저장된 데이터를 불러오는 중 오류가 발생했습니다.', true)
    }
  }
  const deleteTemp = () => {
    localStorage.removeItem(STORAGE_KEY)
    say('임시 저장된 데이터가 삭제되었습니다.')
  }

  if (playing && shown && shown.questions.length > 0) {
    return (
      <div className="sf-page qz-page">
        <QuizPlay questions={shown.questions} onFinish={() => setPlaying(false)} />
        <ToastView toast={toast} />
      </div>
    )
  }

  const editQuestion = (next: Question) =>
    quiz &&
    changeQuiz(
      { questions: quiz.questions.map((q) => (q.id === next.id ? next : q)) },
      '문제를 고쳤어요. 번역은 다시 해야 해요.',
    )
  const deleteQuestion = (id: string) =>
    quiz && changeQuiz({ questions: quiz.questions.filter((q) => q.id !== id) }, '문제를 지웠어요.')
  const moveQuestion = (id: string, dir: -1 | 1) => {
    if (!quiz) return
    const list = [...quiz.questions]
    const i = list.findIndex((q) => q.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= list.length) return
    ;[list[i], list[j]] = [list[j], list[i]]
    changeQuiz({ questions: list })
  }
  const addQuestion = () => {
    const base = quiz ?? { questions: [] }
    changeQuiz(
      {
        questions: [
          ...base.questions,
          {
            id: newId(),
            type: 'multiple-choice',
            question: '새로운 질문을 입력하세요.',
            options: ['보기 1', '보기 2', '보기 3', '보기 4'],
            answer: '보기 1',
            explanation: '해설을 입력하세요.',
          },
        ],
      },
      '새 문제를 넣었어요.',
    )
    setTab('multiple-choice')
  }

  return (
    <div className="sf-page qz-page">
      <div className="sf-page-bar">
        <Back onClick={onBack} label="특화 기능" />
      </div>
      <header className="sf-page-head">
        <span className="sf-card-icon">
          <QuizIcon />
        </span>
        <div>
          <h1>똑딱퀴즈</h1>
          <p>
            {mode === 'quiz'
              ? '학습 자료를 넣으면 AI가 다섯 가지 유형의 퀴즈를 만들어요. 바로 풀거나 학습지로 뽑을 수 있어요.'
              : '단어와 뜻으로 단어 찾기 학습지와 활동지를 만들어요. AI가 주제에 맞는 단어를 제안해 줘요.'}
          </p>
        </div>
        {mode === 'quiz' && (
          <div className="qz-head-tools">
            <button type="button" className="sf-secondary sf-sm" onClick={saveTemp}>
              임시 저장
            </button>
            <button type="button" className="sf-secondary sf-sm" onClick={loadTemp}>
              불러오기
            </button>
            <button type="button" className="sf-secondary sf-sm sf-danger" onClick={deleteTemp}>
              삭제하기
            </button>
          </div>
        )}
      </header>

      <div className="qz-modes" role="tablist" aria-label="똑딱퀴즈 도구">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'quiz'}
          data-testid="quiz-mode-quiz"
          className={'qz-mode' + (mode === 'quiz' ? ' is-on' : '')}
          onClick={() => setMode('quiz')}
        >
          <b>퀴즈 만들기</b>
          <span>선택형·OX·단답·순서·초성</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'words'}
          data-testid="quiz-mode-words"
          className={'qz-mode' + (mode === 'words' ? ' is-on' : '')}
          onClick={() => setMode('words')}
        >
          <b>단어 찾기</b>
          <span>워드서치 학습지·활동지</span>
        </button>
      </div>

      {mode === 'words' ? (
        <QuizWordSearch say={say} />
      ) : (
        <div className="sf-stack">
          <section className="sf-box" aria-labelledby="qz-in">
            <h2 id="qz-in" className="qz-step">
              <i>1</i>입력 방식 선택
            </h2>
            <div className="qz-segs" role="radiogroup" aria-label="입력 방식">
              {INPUTS.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  role="radio"
                  aria-checked={inputType === it.id}
                  className={'qz-seg' + (inputType === it.id ? ' is-on' : '')}
                  data-testid={'quiz-input-' + it.id}
                  onClick={() => chooseInput(it.id)}
                >
                  {it.label}
                </button>
              ))}
            </div>

            {(inputType === 'pdf' || inputType === 'hwp') && (
              <button
                type="button"
                className="qz-drop"
                data-testid="quiz-file"
                disabled={busy !== null}
                onClick={() => void readFile(inputType)}
              >
                <b>{inputType === 'hwp' ? '한글 파일(.hwp, .hwpx)' : 'PDF 파일'}을 골라 주세요</b>
                <span>
                  {busy === 'read'
                    ? '텍스트를 읽어오는 중입니다...'
                    : source
                      ? '선택된 파일: ' + source
                      : '눌러서 파일을 고르면 글을 꺼내 아래에 넣어요'}
                </span>
              </button>
            )}
            {inputType === 'youtube' && (
              <div className="qz-yt">
                <input
                  data-testid="quiz-youtube"
                  value={youtubeUrl}
                  placeholder="유튜브 주소를 붙여넣으세요..."
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void readYoutube()
                  }}
                />
                <button
                  type="button"
                  className="sf-secondary"
                  disabled={busy !== null || !youtubeUrl.trim()}
                  onClick={() => void readYoutube()}
                >
                  {busy === 'read' ? '읽는 중…' : '자막 가져오기'}
                </button>
                {source && <p className="sf-box-sub">영상: {source}</p>}
              </div>
            )}
            <textarea
              className="qz-content"
              data-testid="quiz-content"
              rows={inputType === 'text' ? 9 : 6}
              value={content}
              placeholder={
                inputType === 'text'
                  ? '여기에 텍스트를 붙여넣으세요...'
                  : '추출된 텍스트가 여기에 표시됩니다.'
              }
              onChange={(e) => setContent(e.target.value)}
            />
          </section>

          <section className="sf-box" aria-labelledby="qz-types">
            <h2 id="qz-types" className="qz-step">
              <i>2</i>생성할 문제 유형 및 개수
            </h2>
            <div className="qz-counts">
              {COUNT_FIELDS.map((f) => (
                <label key={f.key} className="qz-count-row">
                  <span>{f.label}</span>
                  <input
                    type="number"
                    min={0}
                    max={MAX_QUESTIONS}
                    data-testid={'quiz-count-' + f.key}
                    value={counts[f.key]}
                    onChange={(e) =>
                      setCounts({
                        ...counts,
                        [f.key]: Math.max(
                          0,
                          Math.min(MAX_QUESTIONS, parseInt(e.target.value, 10) || 0),
                        ),
                      })
                    }
                  />
                </label>
              ))}
            </div>
            <p className={'qz-total' + (total > MAX_QUESTIONS || total < 1 ? ' is-bad' : '')}>
              모두 {total}문제 · 한 번에 최대 {MAX_QUESTIONS}문제까지 만들 수 있어요
            </p>
          </section>

          <section className="sf-box" aria-labelledby="qz-level">
            <h2 id="qz-level" className="qz-step">
              <i>3</i>퀴즈 난이도
            </h2>
            <div className="qz-segs is-three" role="radiogroup" aria-label="난이도">
              {(Object.keys(DIFFICULTY_LABEL) as Difficulty[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={difficulty === d}
                  className={'qz-seg' + (difficulty === d ? ' is-on' : '')}
                  onClick={() => setDifficulty(d)}
                >
                  {DIFFICULTY_LABEL[d]}
                </button>
              ))}
            </div>
          </section>

          <button
            type="button"
            className="sf-primary sf-wide-btn qz-go"
            data-testid="quiz-generate"
            disabled={busy !== null}
            onClick={() => void generate()}
          >
            {busy === 'generate' ? (
              <>
                <span className="sf-spinner" aria-hidden="true" />
                퀴즈를 만드는 중…
              </>
            ) : (
              '퀴즈 생성하기'
            )}
          </button>

          {quiz && (
            <section
              className="sf-box qz-result-box"
              aria-labelledby="qz-list"
              ref={resultRef}
              data-testid="quiz-result"
            >
              <div className="sf-box-head">
                <div>
                  <h2 id="qz-list">생성된 퀴즈 목록</h2>
                  <p className="sf-box-sub">문제를 고치고 순서를 바꾼 뒤 풀거나 내보내세요.</p>
                </div>
                <label className="qz-lang">
                  <span>언어</span>
                  <select
                    value={language}
                    disabled={busy !== null}
                    onChange={(e) => void translate(e.target.value)}
                  >
                    {LANGUAGES.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {shown && shown.questions.length > 0 ? (
                <>
                  <div className="qz-tabs" role="tablist">
                    {QUESTION_TYPES.map((t) => (
                      <button
                        key={t}
                        type="button"
                        role="tab"
                        aria-selected={activeTab === t}
                        disabled={byType[t].length === 0}
                        className={'qz-tab' + (activeTab === t ? ' is-on' : '')}
                        onClick={() => setTab(t)}
                      >
                        {TYPE_TAB[t]}
                        <small>{byType[t].length}</small>
                      </button>
                    ))}
                  </div>
                  <div className="qz-list">
                    {byType[activeTab].map((q, i) => (
                      <QuestionCard
                        key={q.id + language}
                        q={q}
                        index={i}
                        onChange={editQuestion}
                        onDelete={() => deleteQuestion(q.id)}
                        onMove={(dir) => moveQuestion(q.id, dir)}
                      />
                    ))}
                  </div>
                </>
              ) : (
                <p className="qz-empty">생성된 퀴즈가 없습니다.</p>
              )}

              <button type="button" className="sf-ghost" onClick={addQuestion}>
                + 문제 추가
              </button>

              <div className="qz-actions">
                <button
                  type="button"
                  className="qz-action is-play"
                  data-testid="quiz-play-start"
                  disabled={!shown?.questions.length}
                  onClick={() => setPlaying(true)}
                >
                  <b>퀴즈 시작</b>
                  <span>한 문제씩 풀기</span>
                </button>
                <button
                  type="button"
                  className="qz-action"
                  disabled={!shown?.questions.length || busy !== null}
                  onClick={() => setDialog('worksheet')}
                >
                  <b>학습지</b>
                  <span>문제지·정답지 PDF</span>
                </button>
                <button
                  type="button"
                  className="qz-action"
                  disabled={!shown?.questions.length}
                  onClick={() => setDialog('export')}
                >
                  <b>내보내기</b>
                  <span>블루킷·퀴즈앤</span>
                </button>
                <button
                  type="button"
                  className="qz-action"
                  disabled={!shown?.questions.length || busy !== null}
                  onClick={() => setDialog('video')}
                >
                  <b>{busy === 'video' ? '만드는 중…' : '동영상 생성'}</b>
                  <span>문제·정답 영상</span>
                </button>
              </div>

              {video && (
                <div className="qz-video">
                  <h3>만든 동영상</h3>
                  <video src={video.url} controls />
                  <button
                    type="button"
                    className="sf-secondary"
                    onClick={async () =>
                      save(
                        new Uint8Array(await video.blob.arrayBuffer()),
                        'quiz-video-' + Date.now() + '.' + video.ext,
                        '동영상',
                        video.ext,
                      )
                    }
                  >
                    동영상 저장
                  </button>
                </div>
              )}

              <button
                type="button"
                className="sf-text-btn qz-copy"
                disabled={!shown?.questions.length}
                onClick={() =>
                  shown &&
                  void copyText(
                    shown.questions
                      .map(
                        (q, i) =>
                          i +
                          1 +
                          '. ' +
                          q.question +
                          (q.options && q.type !== 'short-answer' && q.type !== 'initial-consonant'
                            ? '\n' + q.options.map((o, k) => '   ' + (k + 1) + ') ' + o).join('\n')
                            : '') +
                          '\n   정답: ' +
                          answerText(q),
                      )
                      .join('\n\n'),
                  ).then(() => say('문제를 복사했어요.'))
                }
              >
                문제 전체 복사
              </button>
            </section>
          )}
        </div>
      )}

      {dialog === 'worksheet' && (
        <Modal title="학습지 종류 선택" onClose={() => setDialog(null)}>
          <div className="qz-pick">
            <button type="button" className="qz-action" onClick={() => void makeWorksheet(false)}>
              <b>문제지</b>
              <span>한 쪽에 4문제</span>
            </button>
            <button type="button" className="qz-action" onClick={() => void makeWorksheet(true)}>
              <b>정답지</b>
              <span>정답과 해설, 한 쪽에 2문제</span>
            </button>
          </div>
        </Modal>
      )}
      {dialog === 'export' && (
        <Modal title="내보내기 옵션" onClose={() => setDialog(null)}>
          <p className="sf-box-sub">퀴즈를 내보낼 형식을 선택하세요.</p>
          <div className="qz-export">
            <button type="button" className="sf-secondary" onClick={() => void exportBlooket()}>
              블루킷 (CSV)
            </button>
            <button
              type="button"
              className="sf-text-btn"
              onClick={() => void window.aiOffice.openFeatureLink('blooket')}
            >
              블루킷 열기 ↗
            </button>
          </div>
          <div className="qz-export">
            <button type="button" className="sf-secondary" onClick={() => void exportQuizn()}>
              퀴즈앤 (XLSX)
            </button>
            <button
              type="button"
              className="sf-text-btn"
              onClick={() => void window.aiOffice.openFeatureLink('quizn')}
            >
              퀴즈앤 열기 ↗
            </button>
          </div>
        </Modal>
      )}
      {dialog === 'video' && (
        <Modal title="동영상 부제 설정" onClose={() => setDialog(null)}>
          <label className="sf-field">
            <span>부제</span>
            <input
              value={subtitle}
              placeholder="예: 6학년 1학기 과학 퀴즈"
              onChange={(e) => setSubtitle(e.target.value)}
            />
          </label>
          <div className="sf-btn-row qz-modal-foot">
            <button type="button" className="sf-text-btn" onClick={() => setDialog(null)}>
              취소
            </button>
            <button type="button" className="sf-primary" onClick={() => void makeVideo()}>
              만들기
            </button>
          </div>
        </Modal>
      )}
      <ToastView toast={toast} />
    </div>
  )
}
