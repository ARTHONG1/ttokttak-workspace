import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { isWebEdition } from '../edition'
import { Back, Modal, ToastView, askAi, copyText, downloadBlob, useToast } from '../special-common'
import {
  BEHAVIOR_SYSTEM,
  CUSTOM_SUBJECT,
  GENERATE_AT_ONCE,
  LENGTHS,
  LEVELS,
  MAX_SESSIONS,
  MAX_STUDENTS,
  MODES,
  NEIS_BYTE_LIMIT,
  SCHOOL_LEVELS,
  SESSIONS_KEY,
  SETTINGS_KEY,
  SUBJECTS,
  SUBJECT_SYSTEM,
  behaviorRequest,
  cleanReply,
  commonProblem,
  decodeCsvBytes,
  emptyInfo,
  hasContent,
  neisBytes,
  resizeStudents,
  rosterNames,
  runPool,
  sessionTitle,
  sessionsFrom,
  studentsFromCsv,
  studentsToCsv,
  subjectRequest,
  templateCsv,
  workFrom,
  type CommonInfo,
  type Level,
  type RecordMode,
  type SavedSession,
  type SchoolLevel,
  type Student,
  type StudentFields,
  type Work,
} from './record-core'
import { recordPackageFromWork, recordSendProblem, sendRecord } from './record-send'
import './school-record.css'

/**
 * 똑딱업무 > 생기부: 교과 세특 and 행발 drafts for NEIS, after the author's ACE 세특&행발.
 * The teacher sets the length and any instruction, fills in the students (by hand, from
 * a class list or from a CSV), and the connected AI writes one student at a time. The
 * result stays editable, with NEIS's byte count beside it, and leaves as a copy, a CSV, or
 * straight into NEIS: [나이스로 보내기] hands the class to the 똑딱작업실 extension, which
 * types it into the NEIS grid.
 */

const newId = (): string => crypto.randomUUID()

const newStudent = (fields: Partial<StudentFields> = {}): Student => ({
  id: newId(),
  name: '',
  level: '상',
  notes: '',
  result: '',
  ...fields,
})

const emptyWork = (): Work => ({
  length: 'medium',
  instructions: '',
  info: emptyInfo(),
  students: [newStudent()],
})

type Works = Record<RecordMode, Work>

/** the settings of the last visit; the students start empty */
function initialWorks(): Works {
  const works: Works = { subject: emptyWork(), behavior: emptyWork() }
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null') as Record<
      string,
      unknown
    > | null
    if (saved) {
      for (const mode of ['subject', 'behavior'] as const) {
        const kept = workFrom(saved[mode], newId)
        works[mode] = { ...kept, students: [newStudent()] }
      }
    }
  } catch {
    // nothing remembered: start empty
  }
  return works
}

const RESULT_NAME: Record<RecordMode, string> = { subject: '세특', behavior: '행발' }
const NOTES_LABEL: Record<RecordMode, string> = {
  subject: '개별 관찰 및 특성 기록 (선택)',
  behavior: '학생 관찰 및 특성 기록',
}
const NOTES_HINT: Record<RecordMode, string> = {
  subject: '예: 평소 질문이 많고 호기심이 강함. 실험 과정에서 변인 통제 능력이 탁월함.',
  behavior:
    '예: 수업 시간에 적극적으로 질문하고 친구들에게 친절하게 설명해 줌. 맡은 일을 끝까지 해냄.',
}
const CSV_NAME: Record<RecordMode, string> = {
  subject: '학생_세특.csv',
  behavior: '학생_행동특성_및_종합의견.csv',
}

const savedAtText = (iso: string): string => {
  const time = new Date(iso)
  return Number.isNaN(time.getTime())
    ? ''
    : time.toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })
}

export function RecordIcon(): ReactElement {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="3.5" width="16" height="17" rx="2.4" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="9.3" cy="9.2" r="1.9" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M6.6 14.4c.5-1.4 1.5-2.1 2.7-2.1s2.2.7 2.7 2.1M14.2 8.2h3.2M14.2 11.3h3.2M6.8 17.3h10.6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

function Segs<T extends string>({
  label,
  options,
  value,
  onPick,
  small = false,
  testId,
}: {
  label: string
  options: readonly { id: T; label: string }[]
  value: T
  onPick: (id: T) => void
  small?: boolean
  testId?: string
}): ReactElement {
  return (
    <div className={'sr-segs' + (small ? ' is-small' : '')} role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          className={'sr-seg' + (o.id === value ? ' is-on' : '')}
          aria-pressed={o.id === value}
          data-testid={testId ? testId + '-' + o.id : undefined}
          onClick={() => onPick(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

const LEVEL_OPTIONS = LEVELS.map((level) => ({ id: level, label: level }))

export function SchoolRecord({ onBack }: { onBack: () => void }): ReactElement {
  const [mode, setMode] = useState<RecordMode>('subject')
  const [works, setWorks] = useState<Works>(initialWorks)
  const worksRef = useRef(works)
  worksRef.current = works
  /** the students being written, and whether a whole-class run is going */
  const [busy, setBusy] = useState<Record<RecordMode, string[]>>({ subject: [], behavior: [] })
  const [running, setRunning] = useState<Record<RecordMode, boolean>>({
    subject: false,
    behavior: false,
  })
  const stop = useRef<Record<RecordMode, boolean>>({ subject: false, behavior: false })
  const [sessions, setSessions] = useState<SavedSession[]>(() =>
    sessionsFrom(localStorage.getItem(SESSIONS_KEY), newId),
  )
  const [listOpen, setListOpen] = useState(false)
  const [loadOpen, setLoadOpen] = useState(false)
  const [readingRoster, setReadingRoster] = useState(false)
  const [showProblem, setShowProblem] = useState(false)
  const [countText, setCountText] = useState<string | null>(null)
  const csvRef = useRef<HTMLInputElement>(null)
  const [toast, say] = useToast()
  const [sending, setSending] = useState(false)
  const [sendNote, setSendNote] = useState<{
    mode: RecordMode
    ok: boolean
    text: string
    pkgText: string
  } | null>(null)

  const work = works[mode]
  const resultName = RESULT_NAME[mode]
  const modeBusy = busy[mode]
  const anyBusy = modeBusy.length > 0

  const patch = (m: RecordMode, change: (w: Work) => Work) =>
    setWorks((prev) => ({ ...prev, [m]: change(prev[m]) }))
  const patchStudent = (m: RecordMode, id: string, fields: Partial<StudentFields>) =>
    patch(m, (w) => ({
      ...w,
      students: w.students.map((s) => (s.id === id ? { ...s, ...fields } : s)),
    }))
  const patchInfo = (fields: Partial<CommonInfo>) =>
    patch('subject', (w) => ({ ...w, info: { ...w.info, ...fields } }))

  // the length, the instruction and the common information come back on the next visit;
  // the students are kept only when the teacher saves them
  const settings = JSON.stringify({
    subject: {
      length: works.subject.length,
      instructions: works.subject.instructions,
      info: works.subject.info,
    },
    behavior: { length: works.behavior.length, instructions: works.behavior.instructions },
  })
  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, settings)
    } catch {
      // a full or closed storage: the page still works
    }
  }, [settings])

  const problem = mode === 'subject' ? commonProblem(work.info) : null

  /* ---------------------------------------------------------------- writing */

  const writeOne = async (m: RecordMode, student: Student): Promise<string> => {
    const w = worksRef.current[m]
    const order = w.students.findIndex((s) => s.id === student.id) + 1 || undefined
    const reply =
      m === 'subject'
        ? await askAi(
            SUBJECT_SYSTEM,
            subjectRequest(w.info, w.length, w.instructions, student, order),
          )
        : await askAi(BEHAVIOR_SYSTEM, behaviorRequest(w.length, w.instructions, student, order))
    const out = cleanReply(reply)
    if (!out) throw new Error('AI가 빈 답을 보냈어요. 다시 해 주세요.')
    return out
  }

  const generate = async (m: RecordMode, targets: Student[], whole: boolean) => {
    if (m === 'subject') {
      const found = commonProblem(worksRef.current[m].info)
      if (found) {
        setShowProblem(true)
        return say(found, true)
      }
    }
    if (targets.length === 0) {
      return say(
        m === 'behavior' ? '관찰 기록을 입력한 학생이 없어요.' : '생성할 학생이 없어요.',
        true,
      )
    }
    const ids = targets.map((s) => s.id)
    stop.current[m] = false
    setBusy((prev) => ({ ...prev, [m]: [...prev[m], ...ids] }))
    if (whole) setRunning((prev) => ({ ...prev, [m]: true }))
    let done = 0
    let failed = 0
    let streak = 0
    let firstError = ''
    try {
      await runPool(
        targets,
        GENERATE_AT_ONCE,
        async (student) => {
          try {
            const result = await writeOne(m, student)
            patchStudent(m, student.id, { result })
            done += 1
            streak = 0
          } catch (error) {
            failed += 1
            streak += 1
            firstError ||= error instanceof Error ? error.message : String(error)
            // the AI is not answering at all: the rest of the class would fail the same way
            if (streak >= 2) stop.current[m] = true
          } finally {
            setBusy((prev) => ({ ...prev, [m]: prev[m].filter((id) => id !== student.id) }))
          }
        },
        () => stop.current[m],
      )
    } finally {
      setBusy((prev) => ({ ...prev, [m]: prev[m].filter((id) => !ids.includes(id)) }))
      if (whole) setRunning((prev) => ({ ...prev, [m]: false }))
    }
    const name = RESULT_NAME[m]
    if (done === 0) return say(firstError || name + ' 생성을 멈췄어요.', true)
    const left = targets.length - done
    say(
      done +
        '명의 ' +
        name +
        '을 만들었어요.' +
        (failed > 0
          ? ' ' + left + '명은 만들지 못했어요. ' + firstError
          : left > 0
            ? ' ' + left + '명은 멈춰서 남았어요.'
            : ''),
      failed > 0,
    )
  }

  const generateOne = (student: Student) => {
    if (mode === 'behavior' && !student.notes.trim()) {
      return say('학생 관찰 및 특성 기록을 먼저 입력해 주세요.', true)
    }
    void generate(mode, [student], false)
  }

  // a whole-class run writes the students who have nothing yet; once everyone has a
  // text it writes them all again
  const writable = work.students.filter((s) => mode === 'subject' || s.notes.trim())
  const unwritten = writable.filter((s) => !s.result.trim())
  const wholeTargets = unwritten.length > 0 ? unwritten : writable
  const wholeLabel =
    unwritten.length === 0 && writable.length > 0
      ? '전체 다시 생성'
      : unwritten.length < writable.length
        ? '남은 ' + unwritten.length + '명 생성'
        : '전체 ' + resultName + ' 생성'

  /* ---------------------------------------------------------------- students */

  const setCount = (raw: string) => {
    setCountText(null)
    const count = parseInt(raw, 10)
    if (!Number.isFinite(count) || count < 1) return
    const wanted = Math.min(count, MAX_STUDENTS)
    const next = resizeStudents(work.students, wanted, newStudent)
    patch(mode, (w) => ({ ...w, students: next }))
    if (next.length > wanted) say('내용이 있는 학생은 지우지 않았어요.')
    else if (count > MAX_STUDENTS) say('한 번에 ' + MAX_STUDENTS + '명까지 쓸 수 있어요.')
  }

  const removeStudent = (id: string) =>
    patch(mode, (w) => {
      const students = w.students.filter((s) => s.id !== id)
      return { ...w, students: students.length > 0 ? students : [newStudent()] }
    })

  const clearStudents = () => {
    patch(mode, (w) => ({ ...w, students: [newStudent()] }))
    say('학생 목록을 비웠어요.')
  }

  const setAllLevels = (level: Level) => {
    patch('subject', (w) => ({ ...w, students: w.students.map((s) => ({ ...s, level })) }))
    say("모든 학생의 성취 수준을 '" + level + "'(으)로 맞췄어요.")
  }

  const loadRoster = async () => {
    const api = window.aiOffice
    if (typeof api?.readCartFile !== 'function') {
      return say('이 화면에서는 파일을 읽을 수 없어요.', true)
    }
    setReadingRoster(true)
    try {
      const result = await api.readCartFile('excel')
      if (!result) return
      if (!result.ok) return say(result.error, true)
      if (result.kind !== 'text') return
      const names = rosterNames(result.text)
      if (names.length === 0) {
        return say("파일에서 '성명'이나 '이름' 칸을 찾지 못했어요.", true)
      }
      patch(mode, (w) => ({
        ...w,
        students: resizeStudents(w.students, names.length, newStudent).map((s, i) =>
          i < names.length ? { ...s, name: names[i] } : s,
        ),
      }))
      say(names.length + '명의 이름을 불러왔어요.')
    } catch (error) {
      say(error instanceof Error ? error.message : String(error), true)
    } finally {
      setReadingRoster(false)
    }
  }

  const loadCsv = async (file: File) => {
    try {
      const rows = studentsFromCsv(decodeCsvBytes(new Uint8Array(await file.arrayBuffer())), mode)
      if (rows.length === 0) return say('파일에 학생 내용이 없어요.', true)
      patch(mode, (w) => ({ ...w, students: rows.map((row) => newStudent(row)) }))
      setLoadOpen(false)
      say(rows.length + '명의 내용을 불러왔어요.')
    } catch (error) {
      say(error instanceof Error ? error.message : 'CSV 파일을 읽지 못했어요.', true)
    }
  }

  const saveCsv = (text: string, name: string) =>
    downloadBlob(new Blob(['\uFEFF' + text], { type: 'text/csv;charset=utf-8;' }), name)

  const downloadCsv = () => {
    if (!work.students.some(hasContent)) {
      return say('이름이나 내용이 있는 학생이 없어요.', true)
    }
    saveCsv(studentsToCsv(work.students, mode), CSV_NAME[mode])
  }

  // 생기부 → 나이스: the desktop app holds the class for the extension and opens the
  // browser on NEIS, the web app hands it to the extension in this browser; the note
  // below always offers the clipboard too
  const sendToNeis = async () => {
    const found = recordSendProblem(mode, work)
    if (found) return say(found, true)
    const pkgText = JSON.stringify(recordPackageFromWork(mode, work))
    const api = window.aiOffice
    setSending(true)
    try {
      const out = await sendRecord(pkgText, {
        web: isWebEdition(),
        workSend: typeof api?.workSend === 'function' ? (f, t) => api.workSend(f, t) : undefined,
        openWorkSite:
          typeof api?.openWorkSite === 'function' ? (f) => api.openWorkSite(f) : undefined,
        runtime: (window as unknown as { chrome?: { runtime?: never } }).chrome?.runtime,
      })
      setSendNote({ mode, ok: out.ok, text: out.message, pkgText })
    } catch (error) {
      say(error instanceof Error ? error.message : String(error), true)
    } finally {
      setSending(false)
    }
  }

  /* ---------------------------------------------------------------- saved work */

  const storeSessions = (next: SavedSession[]): boolean => {
    try {
      localStorage.setItem(SESSIONS_KEY, JSON.stringify(next))
      setSessions(next)
      return true
    } catch {
      say('저장하지 못했어요. 저장 공간을 확인해 주세요.', true)
      return false
    }
  }

  const saveSession = () => {
    const session: SavedSession = {
      id: newId(),
      mode,
      title: sessionTitle(mode, work),
      savedAt: new Date().toISOString(),
      work,
    }
    if (storeSessions([session, ...sessions].slice(0, MAX_SESSIONS))) {
      say('지금 작업을 이 기기에 저장했어요. [불러오기]에서 다시 열 수 있어요.')
    }
  }

  const openSession = (session: SavedSession) => {
    const students = session.work.students.length > 0 ? session.work.students : [newStudent()]
    patch(session.mode, () => ({ ...session.work, students }))
    setMode(session.mode)
    setListOpen(false)
    say('"' + session.title + '" 작업을 불러왔어요.')
  }

  /* ---------------------------------------------------------------- screen */

  return (
    <div className="sf-page sr-page">
      <div className="sf-page-bar">
        <Back onClick={onBack} label="똑딱업무" />
      </div>
      <header className="sf-page-head">
        <span className="sf-card-icon">
          <RecordIcon />
        </span>
        <div className="sf-page-title">
          <h1>생기부</h1>
          <p>과제와 성취 수준, 관찰 기록을 넣으면 AI가 나이스에 넣을 세특과 행발 초안을 써요.</p>
        </div>
        <div
          className="sf-save"
          role="group"
          aria-label="임시 저장"
          title="작업 내용은 이 기기에만 저장해요."
        >
          <button type="button" data-testid="record-save" onClick={saveSession}>
            임시 저장
          </button>
          <button type="button" data-testid="record-open-list" onClick={() => setListOpen(true)}>
            불러오기{sessions.length > 0 ? ' (' + sessions.length + ')' : ''}
          </button>
        </div>
      </header>

      <div className="sr-tabs" role="tablist" aria-label="생기부 항목">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={mode === m.id}
            className={'sr-tab' + (mode === m.id ? ' is-on' : '')}
            data-testid={'record-tab-' + m.id}
            onClick={() => {
              setMode(m.id)
              setCountText(null)
            }}
          >
            <b>{m.label}</b>
            <small>{m.long}</small>
          </button>
        ))}
      </div>

      <p className="sr-note">
        AI가 쓴 글은 초안이에요. 나이스에 넣기 전에 꼭 읽고 고쳐 주세요. 학생 이름은 AI에 보내지
        않고, 관찰 기록과 {mode === 'subject' ? '공통 정보' : '지시사항'}만 보내요.
      </p>

      <div className="sf-stack">
        <section className="sf-box" aria-labelledby="sr-setting-title">
          <div className="sf-box-head">
            <div>
              <h2 id="sr-setting-title">생성 설정</h2>
              <p className="sf-box-sub">길이와 지시사항은 다음에 열 때도 그대로 있어요.</p>
            </div>
          </div>
          <div className="sf-field">
            <span>{resultName} 길이</span>
            <Segs
              label={resultName + ' 길이'}
              options={LENGTHS}
              value={work.length}
              onPick={(length) => patch(mode, (w) => ({ ...w, length }))}
              testId="record-length"
            />
          </div>
          <label className="sf-field">
            <span>AI에게 더 일러 둘 말 (선택)</span>
            <textarea
              rows={2}
              data-testid="record-instructions"
              value={work.instructions}
              onChange={(e) => patch(mode, (w) => ({ ...w, instructions: e.target.value }))}
              placeholder="예: 학생의 창의성이 드러나도록 써 줘. 협동심과 관련된 내용을 꼭 넣어 줘."
            />
          </label>
        </section>

        {mode === 'subject' && (
          <section className="sf-box" aria-labelledby="sr-info-title">
            <div className="sf-box-head">
              <div>
                <h2 id="sr-info-title">공통 정보</h2>
                <p className="sf-box-sub">모든 학생의 세특에 함께 쓰는 수업 정보예요.</p>
              </div>
            </div>
            <div className="sr-grid">
              <label className="sf-field">
                <span>학교급</span>
                <select
                  data-testid="record-school"
                  value={work.info.schoolLevel}
                  aria-invalid={showProblem && !work.info.schoolLevel ? true : undefined}
                  onChange={(e) => patchInfo({ schoolLevel: e.target.value as SchoolLevel | '' })}
                >
                  <option value="">학교급 선택</option>
                  {SCHOOL_LEVELS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="sf-field">
                <span>학년 (선택)</span>
                <input
                  value={work.info.grade}
                  onChange={(e) => patchInfo({ grade: e.target.value })}
                  placeholder="예: 3"
                />
              </label>
              <label className="sf-field">
                <span>과목</span>
                <select
                  data-testid="record-subject"
                  value={work.info.subject}
                  aria-invalid={
                    showProblem && !work.info.subject && !work.info.customSubject.trim()
                      ? true
                      : undefined
                  }
                  onChange={(e) => patchInfo({ subject: e.target.value })}
                >
                  <option value="">과목 선택</option>
                  {SUBJECTS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                  <option value={CUSTOM_SUBJECT}>직접 입력</option>
                </select>
              </label>
              {work.info.subject === CUSTOM_SUBJECT && (
                <label className="sf-field">
                  <span>과목 이름</span>
                  <input
                    data-testid="record-subject-custom"
                    value={work.info.customSubject}
                    aria-invalid={showProblem && !work.info.customSubject.trim() ? true : undefined}
                    onChange={(e) => patchInfo({ customSubject: e.target.value })}
                    placeholder="과목 이름을 입력하세요"
                  />
                </label>
              )}
              <label className="sf-field sr-span-2">
                <span>단원 (선택)</span>
                <input
                  value={work.info.unitName}
                  onChange={(e) => patchInfo({ unitName: e.target.value })}
                  placeholder="예: 문학의 이해"
                />
              </label>
            </div>
            <label className="sf-field">
              <span>과제 설명</span>
              <textarea
                rows={3}
                data-testid="record-assignment"
                value={work.info.assignmentDesc}
                aria-invalid={showProblem && !work.info.assignmentDesc.trim() ? true : undefined}
                onChange={(e) => patchInfo({ assignmentDesc: e.target.value })}
                placeholder="학생들이 한 과제나 활동을 설명해 주세요."
              />
            </label>
            <label className="sf-field">
              <span>관련 성취기준</span>
              <textarea
                rows={2}
                data-testid="record-standard"
                value={work.info.achievementStandard}
                aria-invalid={
                  showProblem && !work.info.achievementStandard.trim() ? true : undefined
                }
                onChange={(e) => patchInfo({ achievementStandard: e.target.value })}
                placeholder="예: [10국01-01] 읽기의 즐거움과 중요성을 깨닫고 읽기를 생활화하는 태도를 지닌다."
              />
            </label>
            {showProblem && problem && <em className="sf-error sr-problem">{problem}</em>}
          </section>
        )}

        <section className="sf-box" aria-labelledby="sr-students-title">
          <div className="sf-box-head">
            <div>
              <h2 id="sr-students-title">학생</h2>
              <p className="sf-box-sub">
                {mode === 'subject'
                  ? '학생마다 성취 수준을 고르고, 눈에 띈 점이 있으면 적어 주세요.'
                  : '학생마다 평소 모습과 관찰한 내용을 적어 주세요.'}
              </p>
            </div>
            <button type="button" className="sf-text-btn" onClick={clearStudents}>
              학생 목록 비우기
            </button>
          </div>

          <div className="sr-toolbar">
            <label className="sr-count">
              <span>학생 수</span>
              <input
                inputMode="numeric"
                data-testid="record-count"
                aria-label="학생 수"
                value={countText ?? String(work.students.length)}
                onChange={(e) => setCountText(e.target.value.replace(/\D/g, '').slice(0, 2))}
                onBlur={(e) => setCount(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                }}
              />
              <span>명</span>
            </label>
            <button
              type="button"
              className="sf-secondary sf-sm"
              data-testid="record-roster"
              disabled={readingRoster}
              onClick={() => void loadRoster()}
            >
              {readingRoster && <span className="sf-spinner" aria-hidden="true" />}
              명렬표 불러오기
            </button>
            <button
              type="button"
              className="sf-secondary sf-sm"
              data-testid="record-load"
              onClick={() => setLoadOpen(true)}
            >
              내용 불러오기
            </button>
            <span className="sr-toolbar-gap" />
            <button
              type="button"
              className="sf-secondary sf-sm"
              data-testid="record-download"
              onClick={downloadCsv}
            >
              CSV 저장
            </button>
            <button
              type="button"
              className="sf-secondary sf-sm"
              data-testid="record-send"
              disabled={sending || anyBusy}
              onClick={() => void sendToNeis()}
            >
              {sending && <span className="sf-spinner" aria-hidden="true" />}
              나이스로 보내기
            </button>
            {running[mode] ? (
              <button
                type="button"
                className="sf-secondary sf-sm sf-danger"
                data-testid="record-stop"
                onClick={() => {
                  stop.current[mode] = true
                }}
              >
                <span className="sf-spinner" aria-hidden="true" />
                멈추기 ({modeBusy.length}명 남음)
              </button>
            ) : (
              <button
                type="button"
                className="sf-primary sf-sm"
                data-testid="record-generate-all"
                disabled={anyBusy}
                onClick={() => void generate(mode, wholeTargets, true)}
              >
                {wholeLabel}
              </button>
            )}
          </div>

          {sendNote && sendNote.mode === mode && (
            <div
              className={sendNote.ok ? 'sf-send-note' : 'sf-send-note sf-send-warn'}
              role="status"
              data-testid="record-send-note"
            >
              <p>{sendNote.text}</p>
              <p className="sr-send-sub">
                나이스 [저장]은 채운 내용을 확인한 뒤 선생님이 직접 눌러요. 글을 고쳤다면 다시 보내
                주세요.
              </p>
              <div className="sf-btn-row">
                <button
                  type="button"
                  className="sf-secondary sf-sm"
                  onClick={() =>
                    void copyText(sendNote.pkgText).then(() =>
                      say(
                        '복사했어요. 나이스 화면의 [똑딱] → [복사한 생기부 작업 넣기]에 붙여 넣어 주세요.',
                      ),
                    )
                  }
                >
                  클립보드로 복사
                </button>
                <button type="button" className="sf-text-btn" onClick={() => setSendNote(null)}>
                  닫기
                </button>
              </div>
            </div>
          )}

          {mode === 'subject' && (
            <div className="sr-bulk">
              <span>성취 수준 한꺼번에 맞추기</span>
              <div className="sr-segs is-small" role="group" aria-label="성취 수준 한꺼번에 맞추기">
                {LEVELS.map((level) => (
                  <button
                    key={level}
                    type="button"
                    className="sr-seg"
                    onClick={() => setAllLevels(level)}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>
          )}

          <ol className="sr-students">
            {work.students.map((s, i) => {
              const writing = modeBusy.includes(s.id)
              const bytes = neisBytes(s.result)
              return (
                <li key={s.id} className="sr-student" data-testid="record-student">
                  <div className="sr-student-head">
                    <span className="sr-no" aria-hidden="true">
                      {i + 1}
                    </span>
                    <input
                      className="sr-name"
                      data-testid="record-name"
                      aria-label={i + 1 + '번 학생 이름'}
                      value={s.name}
                      onChange={(e) => patchStudent(mode, s.id, { name: e.target.value })}
                      placeholder="이름 (선택)"
                    />
                    {mode === 'subject' && (
                      <Segs
                        label={i + 1 + '번 학생 성취 수준'}
                        options={LEVEL_OPTIONS}
                        value={s.level}
                        onPick={(level) => patchStudent(mode, s.id, { level })}
                        small
                      />
                    )}
                    <span className="sr-toolbar-gap" />
                    <button
                      type="button"
                      className="sf-secondary sf-sm"
                      disabled={!s.result.trim()}
                      onClick={() =>
                        void copyText(s.result.trim()).then(() =>
                          say(
                            (s.name.trim() || i + 1 + '번 학생') +
                              '의 ' +
                              resultName +
                              '을 복사했어요.',
                          ),
                        )
                      }
                    >
                      복사
                    </button>
                    <button
                      type="button"
                      className="sf-primary sf-sm"
                      data-testid="record-generate-one"
                      disabled={writing}
                      onClick={() => generateOne(s)}
                    >
                      {writing ? (
                        <>
                          <span className="sf-spinner" aria-hidden="true" />
                          쓰는 중…
                        </>
                      ) : s.result.trim() ? (
                        '다시 생성'
                      ) : (
                        '생성'
                      )}
                    </button>
                    <button
                      type="button"
                      className="sf-icon-btn"
                      aria-label={i + 1 + '번 학생 지우기'}
                      disabled={writing}
                      onClick={() => removeStudent(s.id)}
                    >
                      ×
                    </button>
                  </div>
                  <label className="sf-field">
                    <span>{NOTES_LABEL[mode]}</span>
                    <textarea
                      rows={2}
                      data-testid="record-notes"
                      value={s.notes}
                      onChange={(e) => patchStudent(mode, s.id, { notes: e.target.value })}
                      placeholder={NOTES_HINT[mode]}
                    />
                  </label>
                  <label className="sf-field">
                    <span className="sr-result-label">
                      {resultName}
                      <em
                        className={'sr-bytes' + (bytes > NEIS_BYTE_LIMIT ? ' is-over' : '')}
                        data-testid="record-bytes"
                      >
                        {bytes.toLocaleString('ko-KR')} / {NEIS_BYTE_LIMIT.toLocaleString('ko-KR')}{' '}
                        바이트
                      </em>
                    </span>
                    <textarea
                      rows={4}
                      className={'sr-result' + (writing ? ' is-writing' : '')}
                      data-testid="record-result"
                      value={s.result}
                      readOnly={writing}
                      onChange={(e) => patchStudent(mode, s.id, { result: e.target.value })}
                      placeholder={
                        writing
                          ? 'AI가 ' + resultName + '을 쓰고 있어요…'
                          : 'AI가 쓴 ' + resultName + '이 여기에 나와요. 직접 고칠 수 있어요.'
                      }
                    />
                  </label>
                </li>
              )
            })}
          </ol>
          <button
            type="button"
            className="sf-ghost"
            data-testid="record-add"
            disabled={work.students.length >= MAX_STUDENTS}
            onClick={() => patch(mode, (w) => ({ ...w, students: [...w.students, newStudent()] }))}
          >
            + 학생 추가
          </button>
        </section>
      </div>

      <input
        ref={csvRef}
        type="file"
        accept=".csv,text/csv"
        hidden
        data-testid="record-csv-file"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) void loadCsv(file)
        }}
      />

      {loadOpen && (
        <Modal title="내용 불러오기 (CSV)" onClose={() => setLoadOpen(false)}>
          <div className="sr-modal-body">
            <p>
              템플릿을 받아 엑셀에서 <b>이름</b>
              {mode === 'subject' ? (
                <>
                  , <b>성취 수준</b>(최상·상·보통·하·최하)
                </>
              ) : null}
              , <b>{mode === 'subject' ? '개별 관찰 및 특성 기록' : '학생 관찰 및 특성 기록'}</b>을
              채운 뒤 CSV로 저장해 올려 주세요. 여기서 [CSV 저장]으로 받은 파일도 그대로 올릴 수
              있어요.
            </p>
            <p className="sr-modal-warn">올리면 지금 학생 목록이 파일 내용으로 바뀌어요.</p>
            <div className="sr-two">
              <button
                type="button"
                className="sf-secondary"
                data-testid="record-template"
                onClick={() => saveCsv(templateCsv(mode), resultName + '_템플릿.csv')}
              >
                템플릿 받기
              </button>
              <button
                type="button"
                className="sf-primary"
                data-testid="record-csv-pick"
                onClick={() => csvRef.current?.click()}
              >
                CSV 파일 올리기
              </button>
            </div>
          </div>
        </Modal>
      )}

      {listOpen && (
        <Modal title="임시 저장한 작업" onClose={() => setListOpen(false)} wide>
          <div className="sr-modal-body">
            {sessions.length === 0 ? (
              <p className="sr-empty">
                저장한 작업이 없어요. [임시 저장]을 누르면 지금 쓰던 내용을 이 기기에 남겨요.
              </p>
            ) : (
              <ul className="sr-sessions">
                {sessions.map((session) => (
                  <li key={session.id} data-testid="record-session">
                    <div className="sr-session-text">
                      <b>{session.title}</b>
                      <small>{savedAtText(session.savedAt)}</small>
                    </div>
                    <button
                      type="button"
                      className="sf-primary sf-sm"
                      onClick={() => openSession(session)}
                    >
                      불러오기
                    </button>
                    <button
                      type="button"
                      className="sf-secondary sf-sm sf-danger"
                      onClick={() => storeSessions(sessions.filter((x) => x.id !== session.id))}
                    >
                      삭제
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Modal>
      )}

      <ToastView toast={toast} />
    </div>
  )
}
