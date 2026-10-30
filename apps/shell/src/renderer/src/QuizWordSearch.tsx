import { useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import { Modal, askAi } from './special-common'
import {
  LEVELS,
  MAX_WORDS,
  NO_DEFINITION,
  SIZES,
  answerCells,
  cardWords,
  checkSettings,
  makeMatching,
  makePuzzle,
  parseSuggestions,
  suggestionPrompt,
  wordProblem,
  type Matching,
  type Overlap,
  type Placement,
  type Puzzle,
  type SearchSettings,
} from './wordsearch-model'
import { searchPdf, type SearchSheet } from './wordsearch-export'

/**
 * 똑딱퀴즈 > 단어 찾기, after the author's WordClass: a list of words and meanings (typed or
 * suggested by the AI), a layout (a difficulty slider or the grid, directions and overlap),
 * then the word-search sheet with its answer view, the 단어/뜻 list, a sentence-writing
 * sheet, a matching sheet and cut-out word and meaning cards, each saved as a PDF.
 */

/** the original's storage key and record */
const STORAGE_KEY = 'wordsearch_local_save'

interface Stored {
  parsedWords: string[]
  wordDefinitions: Record<string, string>
  rows: number
  cols: number
  placementOptions: Placement
  overlapSetting: Overlap
  worksheetData: Puzzle | null
}

const DIRECTION_LABEL: { key: keyof Placement; label: string }[] = [
  { key: 'horizontal', label: '가로' },
  { key: 'vertical', label: '세로' },
  { key: 'diagonal', label: '대각선' },
  { key: 'allowBackward', label: '역방향 허용' },
]

const OVERLAP_LABEL: { value: Overlap; label: string }[] = [
  { value: 'allow', label: '보통 (자연스러움)' },
  { value: 'maximize', label: '높음 (단어들이 많이 겹침)' },
  { value: 'minimize', label: '낮음 (겹침 최소화)' },
]

type SheetTab = 'puzzle' | 'answer'

export function QuizWordSearch({
  say,
}: {
  say: (text: string, bad?: boolean) => void
}): ReactElement {
  const [words, setWords] = useState<string[]>([])
  const [defs, setDefs] = useState<Record<string, string>>({})
  const [newWord, setNewWord] = useState('')
  const [newDef, setNewDef] = useState('')
  const [editing, setEditing] = useState<{ word: string; def: string } | null>(null)
  const [level, setLevel] = useState(1)
  const [advanced, setAdvanced] = useState(false)
  const [size, setSize] = useState(15)
  const [placement, setPlacement] = useState<Placement>(LEVELS[1].placement)
  const [overlap, setOverlap] = useState<Overlap>('allow')
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null)
  const [shown, setShown] = useState<SearchSettings | null>(null)
  const [tab, setTab] = useState<SheetTab>('puzzle')
  const [highlight, setHighlight] = useState(false)
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [count, setCount] = useState(10)
  const [busy, setBusy] = useState<string | null>(null)
  const [matching, setMatching] = useState<Matching | null>(null)
  const [showLines, setShowLines] = useState(false)

  const settings: SearchSettings = {
    words,
    definitions: defs,
    rows: size,
    cols: size,
    placement,
    overlap,
  }
  const cells = useMemo(() => (puzzle ? answerCells(puzzle) : new Map<string, number>()), [puzzle])

  const chooseLevel = (n: number) => {
    setLevel(n)
    setSize(LEVELS[n].size)
    setPlacement(LEVELS[n].placement)
    setOverlap(LEVELS[n].overlap)
  }

  const addWord = () => {
    const problem = wordProblem(newWord, words)
    if (problem) return say(problem, true)
    const w = newWord.trim()
    setWords([...words, w])
    setDefs({ ...defs, [w]: newDef.trim() || NO_DEFINITION })
    setNewWord('')
    setNewDef('')
  }

  const removeWord = (w: string) => {
    setWords(words.filter((x) => x !== w))
    const next = { ...defs }
    delete next[w]
    setDefs(next)
  }

  const suggest = async () => {
    if (!prompt.trim()) return say('만들고 싶은 단어를 설명해 주세요.', true)
    const room = MAX_WORDS - words.length
    if (room <= 0) return say('단어는 ' + MAX_WORDS + '개까지 넣을 수 있어요.', true)
    setBusy('suggest')
    try {
      const reply = await askAi(suggestionPrompt(Math.min(count, room)), prompt.trim(), [], 4000)
      const got = parseSuggestions(reply, words).slice(0, room)
      if (got.length === 0) return say('AI가 제안한 단어가 모두 이미 목록에 있어요.')
      setWords([...words, ...got.map((g) => g.word)])
      setDefs({ ...defs, ...Object.fromEntries(got.map((g) => [g.word, g.definition])) })
      setSuggestOpen(false)
      say(got.length + '개의 새 단어를 넣었어요.')
    } catch (e) {
      say(e instanceof Error ? e.message : '단어를 제안받지 못했어요.', true)
    } finally {
      setBusy(null)
    }
  }

  const generate = (from = settings) => {
    const { blocking, advice } = checkSettings(from)
    if (blocking.length) return say(blocking.join(' '), true)
    const p = makePuzzle(from)
    setPuzzle(p)
    setShown({ ...from, words: p.words })
    setMatching(makeMatching({ words: p.words, definitions: from.definitions }))
    setShowLines(false)
    setTab('puzzle')
    if (p.unplaced.length)
      say(
        p.unplaced.length +
          '개의 단어를 넣지 못했어요: ' +
          p.unplaced.join(', ') +
          '. 그리드를 키우거나 방향을 더해 보세요.',
        true,
      )
    else say(advice[0] ?? '학습지를 만들었어요.')
  }

  const save = async (bytes: Uint8Array, name: string) => {
    const path = await window.aiOffice.saveFeatureFile({
      name,
      filterName: 'PDF',
      extensions: ['pdf'],
      bytes,
    })
    if (path) say(path.split(/[\\/]/).pop() + '을(를) 저장했어요.')
  }

  const exportPdf = async (sheet: SearchSheet, name: string) => {
    if (!puzzle || !shown) return
    setBusy(sheet)
    try {
      await save(await searchPdf(sheet, puzzle, shown, matching), name)
    } catch (e) {
      say(e instanceof Error ? e.message : 'PDF를 만들지 못했어요.', true)
    } finally {
      setBusy(null)
    }
  }

  const saveTemp = () => {
    const s: Stored = {
      parsedWords: words,
      wordDefinitions: defs,
      rows: size,
      cols: size,
      placementOptions: placement,
      overlapSetting: overlap,
      worksheetData: puzzle,
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
      say('작업 내용을 이 브라우저에 저장했어요.')
    } catch {
      say('저장하지 못했어요.', true)
    }
  }
  const loadTemp = () => {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return say('저장된 작업이 없어요.', true)
    try {
      const s = JSON.parse(raw) as Partial<Stored>
      setWords(s.parsedWords ?? [])
      setDefs(s.wordDefinitions ?? {})
      setSize(s.rows ?? 15)
      setPlacement(s.placementOptions ?? LEVELS[1].placement)
      setOverlap(s.overlapSetting ?? 'allow')
      setAdvanced(true)
      setPuzzle(s.worksheetData ?? null)
      if (s.worksheetData) {
        const from = {
          words: s.worksheetData.words,
          definitions: s.wordDefinitions ?? {},
          rows: s.rows ?? 15,
          cols: s.cols ?? 15,
          placement: s.placementOptions ?? LEVELS[1].placement,
          overlap: s.overlapSetting ?? 'allow',
        }
        setShown(from)
        setMatching(makeMatching(from))
      }
      say('저장된 작업을 불러왔어요.')
    } catch {
      say('저장된 작업을 읽지 못했어요.', true)
    }
  }
  const deleteTemp = () => {
    localStorage.removeItem(STORAGE_KEY)
    say('저장된 작업을 지웠어요.')
  }
  const reset = () => {
    setWords([])
    setDefs({})
    setPuzzle(null)
    setShown(null)
    setMatching(null)
    chooseLevel(1)
    setAdvanced(false)
    say('모든 입력과 설정을 지웠어요.')
  }

  const sheetWords = shown ? cardWords(shown) : []

  return (
    <div className="sf-stack">
      <div className="qz-head-tools ws-tools">
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

      <section className="sf-box" aria-labelledby="ws-words">
        <div className="sf-box-head">
          <h2 id="ws-words" className="qz-step">
            <i>1</i>단어 목록 <small className="ws-count">{words.length}</small>
          </h2>
          <div className="sf-btn-row">
            <button type="button" className="sf-text-btn" onClick={reset}>
              초기화
            </button>
            <button
              type="button"
              className="sf-primary sf-sm"
              data-testid="ws-suggest"
              onClick={() => setSuggestOpen(true)}
            >
              AI 제안
            </button>
          </div>
        </div>
        {words.length === 0 ? (
          <p className="qz-empty">
            아직 단어가 없어요. 아래에 단어를 넣거나 AI 제안을 눌러 보세요.
          </p>
        ) : (
          <ol className="ws-list" data-testid="ws-list">
            {words.map((w, i) => (
              <li key={w}>
                <b>{i + 1}</b>
                <span className="ws-word">{w}</span>
                {editing?.word === w ? (
                  <input
                    autoFocus
                    value={editing.def}
                    aria-label={w + ' 뜻'}
                    onChange={(e) => setEditing({ word: w, def: e.target.value })}
                    onBlur={() => {
                      setDefs({ ...defs, [w]: editing.def.trim() || NO_DEFINITION })
                      setEditing(null)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="ws-def"
                    title="눌러서 뜻 고치기"
                    onClick={() =>
                      setEditing({ word: w, def: defs[w] === NO_DEFINITION ? '' : (defs[w] ?? '') })
                    }
                  >
                    {defs[w] || NO_DEFINITION}
                  </button>
                )}
                <button
                  type="button"
                  className="sf-icon-btn qz-del"
                  aria-label={w + ' 지우기'}
                  onClick={() => removeWord(w)}
                >
                  ×
                </button>
              </li>
            ))}
          </ol>
        )}
        <div className="ws-add">
          <input
            data-testid="ws-new-word"
            value={newWord}
            placeholder="새 단어"
            onChange={(e) => setNewWord(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && addWord()}
          />
          <input
            value={newDef}
            placeholder="뜻 (선택)"
            onChange={(e) => setNewDef(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && addWord()}
          />
          <button type="button" className="sf-secondary" onClick={addWord}>
            추가
          </button>
        </div>
      </section>

      <section className="sf-box" aria-labelledby="ws-layout">
        <h2 id="ws-layout" className="qz-step">
          <i>2</i>레이아웃 설정
        </h2>
        <div className="qz-segs is-three" role="radiogroup" aria-label="전체 난이도">
          {LEVELS.map((l, i) => (
            <button
              key={l.label}
              type="button"
              role="radio"
              aria-checked={!advanced && level === i}
              className={'qz-seg' + (!advanced && level === i ? ' is-on' : '')}
              onClick={() => {
                setAdvanced(false)
                chooseLevel(i)
              }}
            >
              {l.label}
              <small className="ws-seg-sub">
                {l.size}×{l.size}
              </small>
            </button>
          ))}
        </div>
        <label className="ws-switch">
          <input
            type="checkbox"
            checked={advanced}
            onChange={(e) => setAdvanced(e.target.checked)}
          />
          <span>세부 설정 직접하기</span>
        </label>
        {advanced && (
          <div className="ws-advanced">
            <label className="sf-field">
              <span>그리드 크기</span>
              <select value={size} onChange={(e) => setSize(Number(e.target.value))}>
                {SIZES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="sf-field">
              <span>단어 배치 방향</span>
              <div className="ws-checks">
                {DIRECTION_LABEL.map((d) => (
                  <label key={d.key} className={'ws-check' + (placement[d.key] ? ' is-on' : '')}>
                    <input
                      type="checkbox"
                      checked={placement[d.key]}
                      onChange={(e) => setPlacement({ ...placement, [d.key]: e.target.checked })}
                    />
                    {d.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="sf-field">
              <span>겹침 밀도</span>
              <div className="ws-checks">
                {OVERLAP_LABEL.map((o) => (
                  <label
                    key={o.value}
                    className={'ws-check' + (overlap === o.value ? ' is-on' : '')}
                  >
                    <input
                      type="radio"
                      name="ws-overlap"
                      checked={overlap === o.value}
                      onChange={() => setOverlap(o.value)}
                    />
                    {o.label}
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      <button
        type="button"
        className="sf-primary sf-wide-btn qz-go"
        data-testid="ws-generate"
        onClick={() => generate()}
      >
        학습지 만들기
      </button>

      {puzzle && shown && (
        <section className="sf-box" aria-labelledby="ws-sheet" data-testid="ws-result">
          <div className="sf-box-head">
            <div>
              <h2 id="ws-sheet">단어 찾기 학습지</h2>
              <p className="sf-box-sub">
                단어 {puzzle.words.length}개 · {shown.rows}×{shown.cols}
                {puzzle.unplaced.length > 0 && ' · 넣지 못한 단어: ' + puzzle.unplaced.join(', ')}
              </p>
            </div>
            <button type="button" className="sf-secondary sf-sm" onClick={() => generate(shown)}>
              다른 배치
            </button>
          </div>
          <div className="ws-tabbar">
            <div className="qz-tabs ws-tabs" role="tablist">
              {(['puzzle', 'answer'] as SheetTab[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  className={'qz-tab' + (tab === t ? ' is-on' : '')}
                  onClick={() => setTab(t)}
                >
                  {t === 'puzzle' ? '학습지' : '해답'}
                </button>
              ))}
            </div>
            {tab === 'puzzle' && (
              <button
                type="button"
                className="sf-text-btn"
                onClick={() => setHighlight(!highlight)}
              >
                {highlight ? '정답 표시 끄기' : '정답 표시 켜기'}
              </button>
            )}
          </div>
          <div className="ws-chips">
            {puzzle.words.map((w) => (
              <span
                key={w}
                className={'sf-tag' + (puzzle.unplaced.includes(w) ? ' ws-missing' : '')}
              >
                {w}
              </span>
            ))}
          </div>
          <div className="ws-grid-wrap">
            <table
              className="ws-grid"
              data-testid="ws-grid"
              style={{ ['--ws-n' as string]: shown.cols }}
            >
              <tbody>
                {puzzle.grid.map((row, r) => (
                  <tr key={r}>
                    {row.map((ch, c) => {
                      const hit = cells.get(r + ',' + c)
                      const on = hit !== undefined && (tab === 'answer' || highlight)
                      return (
                        <td
                          key={c}
                          className={on ? 'is-hit' : tab === 'answer' ? 'is-dim' : undefined}
                          style={
                            on ? { ['--ws-hue' as string]: ((hit ?? 0) * 47) % 360 } : undefined
                          }
                        >
                          {ch}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {sheetWords.length > 0 && (
            <div className="ws-defs">
              <h3>찾을 단어와 뜻풀이</h3>
              <ul>
                {sheetWords.map((w) => (
                  <li key={w}>
                    <b>{w}</b> {shown.definitions[w]}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="qz-actions ws-actions">
            <button
              type="button"
              className="qz-action"
              disabled={busy !== null}
              onClick={() => void exportPdf('puzzle', '단어찾기_학습지.pdf')}
            >
              <b>{busy === 'puzzle' ? '만드는 중…' : '학습지 PDF'}</b>
              <span>단어 목록과 그리드</span>
            </button>
            <button
              type="button"
              className="qz-action"
              disabled={busy !== null}
              onClick={() => void exportPdf('answer', '단어찾기_정답.pdf')}
            >
              <b>{busy === 'answer' ? '만드는 중…' : '정답 PDF'}</b>
              <span>찾은 단어 표시</span>
            </button>
            <button
              type="button"
              className="qz-action"
              disabled={busy !== null || sheetWords.length === 0}
              onClick={() => void exportPdf('definitions', '단어와_뜻.pdf')}
            >
              <b>{busy === 'definitions' ? '만드는 중…' : '단어·뜻 PDF'}</b>
              <span>뜻풀이 목록</span>
            </button>
          </div>
        </section>
      )}

      {puzzle && shown && (
        <section className="sf-box" aria-labelledby="ws-more">
          <h2 id="ws-more">더 해 볼 활동</h2>
          <p className="sf-box-sub">같은 단어로 만드는 활동지예요. 눌러서 PDF로 저장하세요.</p>
          <div className="qz-actions ws-actions">
            <button
              type="button"
              className="qz-action"
              disabled={busy !== null}
              onClick={() => void exportPdf('sentences', '활동1_문장만들기.pdf')}
            >
              <b>{busy === 'sentences' ? '만드는 중…' : '활동 1 · 나만의 문장'}</b>
              <span>단어마다 두 줄 쓰기</span>
            </button>
            <button
              type="button"
              className="qz-action"
              disabled={busy !== null || !matching}
              onClick={() => void exportPdf('matching', '활동2_단어뜻연결.pdf')}
            >
              <b>{busy === 'matching' ? '만드는 중…' : '활동 2 · 단어와 뜻 잇기'}</b>
              <span>
                {matching
                  ? '헷갈리는 뜻 ' + (matching.meanings.length - matching.words.length) + '개 포함'
                  : '뜻이 있는 단어 2개 이상 필요'}
              </span>
            </button>
            <button
              type="button"
              className="qz-action"
              disabled={busy !== null || sheetWords.length === 0}
              onClick={() => void exportPdf('cards', '활동3_단어카드.pdf')}
            >
              <b>{busy === 'cards' ? '만드는 중…' : '활동 3 · 단어 카드'}</b>
              <span>단어 카드와 뜻풀이 카드</span>
            </button>
          </div>
          {matching && (
            <div className="ws-match">
              <div className="ws-match-head">
                <h3>단어와 뜻 잇기 미리보기</h3>
                <button
                  type="button"
                  className="sf-text-btn"
                  onClick={() => setShowLines(!showLines)}
                >
                  {showLines ? '정답 숨기기' : '정답 확인'}
                </button>
              </div>
              <div className="ws-match-cols">
                <ol>
                  {matching.words.map((w) => (
                    <li key={w.id}>{w.text}</li>
                  ))}
                </ol>
                <ol className="ws-match-right">
                  {matching.meanings.map((m) => (
                    <li
                      key={m.id}
                      className={showLines ? (m.wordId ? 'is-right' : 'is-extra') : undefined}
                    >
                      {showLines && (
                        <b>
                          {m.wordId ? matching.words.find((w) => w.id === m.wordId)?.text : '없음'}
                        </b>
                      )}
                      {m.text}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          )}
        </section>
      )}

      {suggestOpen && (
        <Modal title="AI 단어 제안" onClose={() => setSuggestOpen(false)}>
          <p className="sf-box-sub">
            만들고 싶은 단어를 자유롭게 설명하세요. AI가 단어와 뜻을 제안해요.
          </p>
          <label className="sf-field">
            <span>설명</span>
            <textarea
              rows={3}
              data-testid="ws-prompt"
              value={prompt}
              placeholder="예: 초등학교 3학년 수준의 동물 단어, 조선시대 왕 이름과 업적, 우주에 관련된 영어 단어"
              onChange={(e) => setPrompt(e.target.value)}
            />
          </label>
          <label className="sf-field">
            <span>개수</span>
            <input
              type="number"
              min={1}
              max={30}
              value={count}
              onChange={(e) =>
                setCount(Math.max(1, Math.min(30, parseInt(e.target.value, 10) || 1)))
              }
            />
          </label>
          <div className="sf-btn-row qz-modal-foot">
            <button type="button" className="sf-text-btn" onClick={() => setSuggestOpen(false)}>
              취소
            </button>
            <button
              type="button"
              className="sf-primary"
              data-testid="ws-suggest-go"
              disabled={busy === 'suggest'}
              onClick={() => void suggest()}
            >
              {busy === 'suggest' ? '만드는 중…' : '제안받기'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
