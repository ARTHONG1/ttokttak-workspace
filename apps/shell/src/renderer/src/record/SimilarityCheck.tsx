import { useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { askAi, downloadBlob } from '../special-common'
import { cleanReply, hasContent, type RecordMode, type Work } from './record-core'
import {
  MAX_ENTRIES,
  REWORD_SYSTEM,
  entriesFromText,
  entriesToCsv,
  pairsToCsv,
  rewordRequest,
  rewordTargets,
  sharedPieces,
  similarPairs,
  similarity,
  type Entry,
} from './record-similarity'

/**
 * 똑딱업무 > 생기부 > 유사도 검사: finds the students whose texts read alike, in the 세특 or
 * 행발 written here or in a spreadsheet of texts written elsewhere, and rewords them. The
 * comparing is counted on this device; each pair opens to both texts with the shared
 * wording marked. [표현 바꾸기] asks the AI to say the same in other words (the text and
 * the shared wording go to the AI, never a name), and the pair is compared again.
 */

type Source = RecordMode | 'file'

const FLOORS = [
  { id: 30, label: '30% 이상' },
  { id: 50, label: '50% 이상' },
  { id: 70, label: '70% 이상' },
] as const

const entriesOf = (work: Work): Entry[] =>
  work.students
    .map((s, i) => ({
      id: s.id,
      name: s.name.trim() || i + 1 + '번',
      text: s.result.trim(),
      has: hasContent(s),
    }))
    .filter((e) => e.has && e.text)
    .map(({ id, name, text }) => ({ id, name, text }))

const level = (percent: number): string =>
  percent >= 70 ? 'is-high' : percent >= 50 ? 'is-mid' : ''

function Marked({ text, other }: { text: string; other: string }): ReactElement {
  return (
    <p className="sr-sim-text">
      {sharedPieces(text, other).map((piece, i) =>
        piece.shared ? <mark key={i}>{piece.text}</mark> : <span key={i}>{piece.text}</span>,
      )}
    </p>
  )
}

export function SimilarityCheck({
  works,
  initialSource,
  onReword,
  say,
}: {
  works: Record<RecordMode, Work>
  /** the tab the teacher came from (세특 or 행발); opened when it has two or more texts */
  initialSource?: RecordMode
  /** a text written here was reworded: put it into the student's result */
  onReword: (mode: RecordMode, id: string, text: string) => void
  say: (text: string, bad?: boolean) => void
}): ReactElement {
  const written = { subject: entriesOf(works.subject), behavior: entriesOf(works.behavior) }
  const [source, setSource] = useState<Source>(
    initialSource && written[initialSource].length >= 2
      ? initialSource
      : written.subject.length < 2 && written.behavior.length >= 2
        ? 'behavior'
        : (initialSource ?? 'subject'),
  )
  const [file, setFile] = useState<{ name: string; entries: Entry[] } | null>(null)
  const [reading, setReading] = useState(false)
  const [floor, setFloor] = useState<number>(30)
  const [open, setOpen] = useState<string | null>(null)
  /** the entries being reworded, by index, and whether a whole run is going */
  const [busy, setBusy] = useState<number[]>([])
  const [running, setRunning] = useState(false)
  const stop = useRef(false)
  /** what a text was before it was reworded, to take a rewording back */
  const [before, setBefore] = useState<Record<string, string>>({})

  const entries = source === 'file' ? (file?.entries ?? []) : written[source]
  const entriesRef = useRef(entries)
  entriesRef.current = entries
  const entriesKey = JSON.stringify(entries)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the entries by their content
  const pairs = useMemo(() => similarPairs(entries, floor), [entriesKey, floor])
  const involved = new Set(pairs.flatMap((p) => [p.a, p.b])).size
  const keyOf = (index: number): string => source + ':' + (entries[index]?.id ?? index)

  const setText = (index: number, text: string): void => {
    const entry = entriesRef.current[index]
    if (!entry) return
    if (source === 'file') {
      setFile((prev) =>
        prev
          ? { ...prev, entries: prev.entries.map((e, i) => (i === index ? { ...e, text } : e)) }
          : prev,
      )
    } else if (entry.id) onReword(source, entry.id, text)
    // the next rewording in the same run compares against this text
    entriesRef.current = entriesRef.current.map((e, i) => (i === index ? { ...e, text } : e))
  }

  /** reword one entry away from everything it reads like; resolves to the new top percent */
  const rewordOne = async (index: number): Promise<number> => {
    const all = entriesRef.current
    const self = all[index]
    const others = all
      .filter((_, i) => i !== index)
      .map((e) => e.text)
      .filter((t) => similarity(self.text, t) >= Math.min(floor, 30))
    const reply = cleanReply(await askAi(REWORD_SYSTEM, rewordRequest(self.text, others)))
    if (!reply) throw new Error('AI가 빈 답을 보냈어요. 다시 해 주세요.')
    const key = keyOf(index)
    setBefore((prev) => (key in prev ? prev : { ...prev, [key]: self.text }))
    setText(index, reply)
    return Math.max(0, ...others.map((t) => similarity(reply, t)))
  }

  const reword = async (index: number) => {
    setBusy((prev) => [...prev, index])
    try {
      const left = await rewordOne(index)
      say(
        entries[index].name +
          '의 글 표현을 바꿨어요. ' +
          (left >= floor
            ? '아직 ' + left + '% 겹쳐요. 한 번 더 바꿔 보세요.'
            : '이제 ' + left + '% 겹쳐요.'),
        left >= floor,
      )
    } catch (error) {
      say(error instanceof Error ? error.message : String(error), true)
    } finally {
      setBusy((prev) => prev.filter((i) => i !== index))
    }
  }

  const rewordAll = async () => {
    const targets = rewordTargets(entriesRef.current, floor)
    if (targets.length === 0) return
    stop.current = false
    setRunning(true)
    setBusy(targets)
    let done = 0
    let failed = ''
    for (const index of targets) {
      if (stop.current) break
      try {
        await rewordOne(index)
        done += 1
      } catch (error) {
        failed = error instanceof Error ? error.message : String(error)
        break
      } finally {
        setBusy((prev) => prev.filter((i) => i !== index))
      }
    }
    setBusy([])
    setRunning(false)
    const left = similarPairs(entriesRef.current, floor).length
    say(
      done +
        '명의 글 표현을 바꿨어요. ' +
        (failed ? failed : left > 0 ? '아직 ' + left + '쌍이 겹쳐요.' : '겹치는 쌍이 없어요.'),
      Boolean(failed) || left > 0,
    )
  }

  const takeBack = (index: number) => {
    const key = keyOf(index)
    const old = before[key]
    if (old === undefined) return
    setText(index, old)
    setBefore((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  const pickFile = async () => {
    const api = window.aiOffice
    if (typeof api?.readCartFile !== 'function') {
      return say('이 화면에서는 파일을 읽을 수 없어요.', true)
    }
    setReading(true)
    try {
      const result = await api.readCartFile('excel')
      if (!result) return
      if (!result.ok) return say(result.error, true)
      if (result.kind !== 'text') return
      const found = entriesFromText(result.text)
      if (found.length < 2) {
        return say('파일에서 비교할 글을 두 개 이상 찾지 못했어요.', true)
      }
      setFile({ name: result.name, entries: found })
      setSource('file')
      setOpen(null)
      say(
        found.length +
          '명의 글을 불러왔어요.' +
          (found.length >= MAX_ENTRIES ? ' ' + MAX_ENTRIES + '명까지만 비교해요.' : ''),
      )
    } catch (error) {
      say(error instanceof Error ? error.message : String(error), true)
    } finally {
      setReading(false)
    }
  }

  const saveCsv = (text: string, name: string) =>
    downloadBlob(new Blob(['\uFEFF' + text], { type: 'text/csv;charset=utf-8;' }), name)

  const sources: { id: Source; label: string }[] = [
    { id: 'subject', label: '교과 세특 (' + written.subject.length + '명)' },
    { id: 'behavior', label: '행발 (' + written.behavior.length + '명)' },
    { id: 'file', label: file ? '파일 (' + file.entries.length + '명)' : '파일' },
  ]
  const working = busy.length > 0

  const side = (index: number, other: number): ReactElement => (
    <div>
      <div className="sr-sim-who">
        <b>{entries[index].name}</b>
        <span className="sr-toolbar-gap" />
        {before[keyOf(index)] !== undefined && !busy.includes(index) && (
          <button type="button" className="sf-text-btn" onClick={() => takeBack(index)}>
            되돌리기
          </button>
        )}
        <button
          type="button"
          className="sf-secondary sf-sm"
          data-testid="similarity-reword"
          disabled={working}
          onClick={() => void reword(index)}
        >
          {busy.includes(index) && <span className="sf-spinner" aria-hidden="true" />}
          표현 바꾸기
        </button>
      </div>
      <Marked text={entries[index].text} other={entries[other].text} />
    </div>
  )

  return (
    <>
      <p className="sr-note">
        학생들의 글에서 같은 표현이 얼마나 겹치는지 찾아요. 비교는 이 기기 안에서만 해요. [표현
        바꾸기]를 누를 때만 그 글과 겹치는 표현을 AI에 보내고, 학생 이름은 보내지 않아요.
      </p>
      <div className="sf-stack">
        <section className="sf-box" aria-labelledby="sr-sim-source">
          <div className="sf-box-head">
            <div>
              <h2 id="sr-sim-source">검사할 글</h2>
              <p className="sf-box-sub">
                여기서 쓴 글을 바로 검사하거나, 다른 곳에서 쓴 글을 엑셀·CSV 파일로 불러와요.
              </p>
            </div>
          </div>
          <div className="sr-toolbar">
            <div className="sr-segs" role="group" aria-label="검사할 글">
              {sources.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={'sr-seg' + (source === s.id ? ' is-on' : '')}
                  aria-pressed={source === s.id}
                  data-testid={'similarity-source-' + s.id}
                  disabled={working || (s.id === 'file' && !file)}
                  onClick={() => {
                    setSource(s.id)
                    setOpen(null)
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <span className="sr-toolbar-gap" />
            <button
              type="button"
              className="sf-secondary sf-sm"
              onClick={() => saveCsv('이름,내용', '유사도_검사_양식.csv')}
            >
              양식 받기
            </button>
            <button
              type="button"
              className="sf-primary sf-sm"
              data-testid="similarity-file"
              disabled={reading || working}
              onClick={() => void pickFile()}
            >
              {reading && <span className="sf-spinner" aria-hidden="true" />}
              파일 불러오기
            </button>
          </div>
          <p className="sf-box-sub sr-sim-hint">
            {source === 'file' && file
              ? file.name + '에서 불러온 글이에요. 표현을 바꾼 뒤 [글 전체 CSV 저장]으로 받으세요.'
              : '파일은 첫 줄에 이름(또는 성명)과 글 칸이 있으면 돼요. 글이 가장 많은 칸을 비교해요.'}
          </p>
        </section>

        <section className="sf-box" aria-labelledby="sr-sim-result" data-testid="similarity-result">
          <div className="sf-box-head">
            <div>
              <h2 id="sr-sim-result">검사 결과</h2>
              <p className="sf-box-sub" data-testid="similarity-summary">
                {entries.length < 2
                  ? '비교할 글이 두 명 이상 있어야 해요.'
                  : pairs.length === 0
                    ? entries.length + '명의 글에서 ' + floor + '% 이상 겹치는 쌍이 없어요.'
                    : entries.length +
                      '명 가운데 ' +
                      involved +
                      '명의 글이 서로 비슷해요 (' +
                      pairs.length +
                      '쌍).'}
              </p>
            </div>
            <div className="sf-btn-row">
              <div className="sr-segs is-small" role="group" aria-label="보여 줄 기준">
                {FLOORS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className={'sr-seg' + (floor === f.id ? ' is-on' : '')}
                    aria-pressed={floor === f.id}
                    data-testid={'similarity-floor-' + f.id}
                    disabled={working}
                    onClick={() => setFloor(f.id)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="sf-secondary sf-sm"
                disabled={pairs.length === 0}
                onClick={() => saveCsv(pairsToCsv(entries, pairs), '생기부_유사도_검사.csv')}
              >
                결과 CSV 저장
              </button>
              {source === 'file' && file && (
                <button
                  type="button"
                  className="sf-secondary sf-sm"
                  onClick={() => saveCsv(entriesToCsv(entries), '생기부_글_전체.csv')}
                >
                  글 전체 CSV 저장
                </button>
              )}
            </div>
          </div>

          {pairs.length > 0 && (
            <div className="sr-sim-warn" role="alert" data-testid="similarity-warning">
              <p>
                <b>
                  {involved}명의 글이 다른 학생의 글과 {floor}% 이상 겹쳐요.
                </b>{' '}
                같은 문장이 여러 학생에게 들어가지 않게 표현을 바꿔 주세요.
              </p>
              {running ? (
                <button
                  type="button"
                  className="sf-secondary sf-sm sf-danger"
                  onClick={() => {
                    stop.current = true
                  }}
                >
                  <span className="sf-spinner" aria-hidden="true" />
                  멈추기 ({busy.length}명 남음)
                </button>
              ) : (
                <button
                  type="button"
                  className="sf-primary sf-sm"
                  data-testid="similarity-reword-all"
                  disabled={working}
                  onClick={() => void rewordAll()}
                >
                  겹치는 글 표현 한꺼번에 바꾸기
                </button>
              )}
            </div>
          )}

          {pairs.length > 0 && (
            <ul className="sr-sim-list">
              {pairs.map((p) => {
                const id = p.a + '-' + p.b
                const shown = open === id
                return (
                  <li key={id} className="sr-sim-pair" data-testid="similarity-pair">
                    <button
                      type="button"
                      className="sr-sim-head"
                      aria-expanded={shown}
                      onClick={() => setOpen(shown ? null : id)}
                    >
                      <span className={'sr-sim-percent ' + level(p.percent)}>{p.percent}%</span>
                      <span className="sr-sim-names">
                        {entries[p.a].name} · {entries[p.b].name}
                      </span>
                      <span className="sr-sim-more">{shown ? '접기' : '글 보기'}</span>
                    </button>
                    {shown && (
                      <div className="sr-sim-body">
                        {side(p.a, p.b)}
                        {side(p.b, p.a)}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          <p className="sf-box-sub sr-sim-hint">
            유사도는 두 글의 글자 가운데 같은 표현(띄어쓰기를 빼고 6자 이상 이어지는 부분)에 든
            글자의 비율이에요. 색칠된 부분이 겹치는 표현이에요. AI가 바꾼 글은 내용이 그대로인지 꼭
            읽어 보세요.
          </p>
        </section>
      </div>
    </>
  )
}
