import { useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import type { NeisClassResult } from '../../../shared/neis-class'
import { Modal } from '../common'
import { MAX_STUDENTS, type RecordMode, type Student, type StudentFields } from './record-core'
import { LONG_NOTES, applyNeisClass } from './record-neis'

type Read = Extract<NeisClassResult, { ok: true }>

/**
 * 나이스에서 가져오기: the teacher signs in to NEIS in the app's own browser window and opens a
 * screen with the class list (the 누가기록 screen for a homeroom); the app reads the list and,
 * for 행발, each student's 누가기록, shows them with what putting them in will do to the list
 * the teacher has, and puts them in on [학생 목록에 넣기]. Nothing in NEIS is changed, and
 * nothing leaves this computer.
 */
export function NeisImport({
  mode,
  current,
  make,
  onApply,
  onClose,
}: {
  mode: RecordMode
  /** the list as it is now */
  current: readonly Student[]
  make: (fields?: Partial<StudentFields>) => Student
  onApply: (read: Read, withRecords: boolean) => void
  onClose: () => void
}): ReactElement {
  const behavior = mode === 'behavior'
  const [reading, setReading] = useState(false)
  const [read, setRead] = useState<Read | null>(null)
  const [error, setError] = useState('')
  const [recordsChosen, setRecordsChosen] = useState(true)
  const withRecords = behavior && recordsChosen && !!read && read.recordsRead > 0
  const outcome = useMemo(
    () => (read ? applyNeisClass(current, read.students, { withRecords }, make) : null),
    [read, current, withRecords, make],
  )

  const readNow = async () => {
    setReading(true)
    setError('')
    try {
      const result = await window.saenggibu.readNeisClass()
      if (result.ok) setRead(result)
      else {
        setRead(null)
        setError(result.message)
      }
    } catch {
      setRead(null)
      setError('나이스 화면을 읽지 못했어요. 다시 해 주세요.')
    } finally {
      setReading(false)
    }
  }

  const classes = read ? [...new Set(read.students.map((s) => s.cls).filter(Boolean))] : []
  const total = outcome?.students.length ?? 0
  return (
    <Modal title="나이스에서 가져오기" onClose={onClose} wide>
      <div className="sr-modal-body">
        <ol className="sr-neis-steps">
          <li>
            [나이스 화면에서 읽기]를 누르면 똑딱생기부 전용 브라우저가 열려요. 업무포털에 로그인해
            주세요.
          </li>
          <li>
            나이스에서 <b>학급담임 → 행동특성및종합의견 → 누가기록</b> 화면을 열어 주세요.
          </li>
          <li>
            다시 [나이스 화면에서 읽기]를 누르면 학급 명단{behavior ? '과 누가기록' : ''}을 읽어요.
            나이스에는 아무것도 바꾸지 않고, 읽은 내용은 이 컴퓨터에만 둬요.
          </li>
        </ol>
        <button
          type="button"
          className="sf-primary"
          data-testid="record-neis-read"
          disabled={reading}
          onClick={() => void readNow()}
        >
          {reading && <span className="sf-spinner" aria-hidden="true" />}
          나이스 화면에서 읽기
        </button>
        {error && (
          <p className="sf-error sr-neis-error" role="alert" data-testid="record-neis-error">
            {error}
          </p>
        )}
        {read && outcome && (
          <>
            <p className="sr-neis-summary" data-testid="record-neis-summary">
              {classes.length === 1 ? classes[0] + '반 ' : ''}학생 {read.students.length}명을
              읽었어요.
              {behavior ? ' 누가기록 ' + read.recordsRead + '건.' : ''}
            </p>
            <div className="sr-neis-list">
              <table>
                <thead>
                  <tr>
                    <th>번호</th>
                    <th>이름</th>
                    {behavior && <th>누가기록</th>}
                  </tr>
                </thead>
                <tbody>
                  {read.students.map((s) => (
                    <tr key={s.cls + ':' + s.no}>
                      <td>{s.no}</td>
                      <td>{s.name}</td>
                      {behavior && <td>{s.records.length}건</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {behavior && read.recordsRead > 0 && (
              <label className="sr-neis-check">
                <input
                  type="checkbox"
                  data-testid="record-neis-records"
                  checked={recordsChosen}
                  onChange={(e) => setRecordsChosen(e.target.checked)}
                />
                누가기록을 학생마다 &lsquo;학생 관찰 및 특성 기록&rsquo;에 넣기 (이미 쓴 내용은
                그대로 두고 뒤에 덧붙이며, 이미 들어 있는 기록은 다시 넣지 않아요)
              </label>
            )}
            {behavior && read.recordsFor === 'selected' && (
              <p className="sr-neis-note">
                이 화면에서는 나이스에서 선택한 학생의 누가기록만 읽혔어요. 다른 학생의 기록은
                나이스에서 학생을 바꿔 가며 다시 읽어 주세요.
              </p>
            )}
            {behavior && read.unplaced > 0 && (
              <p className="sr-neis-note">
                어느 학생의 것인지 알 수 없는 누가기록 {read.unplaced}건은 넣지 않아요.
              </p>
            )}
            <p className="sr-neis-note" data-testid="record-neis-outcome">
              나이스 순서대로 넣어요.
              {outcome.matched > 0
                ? ' 이미 목록에 있는 학생 ' +
                  outcome.matched +
                  '명은 이름으로 찾아 쓴 내용을 그대로 둬요.'
                : ''}
              {outcome.added > 0 ? ' 새 학생 ' + outcome.added + '명을 더해요.' : ''}
              {withRecords
                ? outcome.notesFilled > 0
                  ? ' ' + outcome.notesFilled + '명의 관찰 기록에 누가기록을 넣어요.'
                  : ' 누가기록은 모두 이미 관찰 기록에 들어 있어요.'
                : ''}
            </p>
            {outcome.kept > 0 && (
              <p className="sr-neis-note" data-testid="record-neis-kept">
                나이스 명단에 없는 학생 {outcome.kept}명(
                {outcome.keptNames.slice(0, 5).join(', ')}
                {outcome.keptNames.length > 5 ? ' 외' : ''})은 지우지 않고 맨 뒤에 둬요.
              </p>
            )}
            {outcome.sameNames.length > 0 && (
              <p className="sr-neis-note sr-neis-warn" data-testid="record-neis-same">
                같은 이름의 학생({outcome.sameNames.join(', ')})은 지금 목록의 순서대로 맞춰요. 넣은
                뒤 쓴 내용이 맞는 학생에게 있는지 확인해 주세요.
              </p>
            )}
            {outcome.longNotes > 0 && (
              <p className="sr-neis-note sr-neis-warn">
                관찰 기록이 {LONG_NOTES.toLocaleString()}자를 넘는 학생이 {outcome.longNotes}명
                생겨요. 똑딱AI가 한 번에 읽을 수 있게, 생성하기 전에 중요한 기록만 남겨 주세요.
              </p>
            )}
            {outcome.tooMany && (
              <p className="sf-error sr-neis-error" role="alert" data-testid="record-neis-too-many">
                합치면 학생이 {total}명이라 한 목록에 넣을 수 있는 {MAX_STUDENTS}명을 넘어요.
                {outcome.kept > 0
                  ? ' 나이스 명단에 없는 학생을 목록에서 정리하거나 [목록 비우기]로 비운 뒤 다시 가져와 주세요.'
                  : ' 한 반의 명단이 있는 화면에서 다시 읽어 주세요.'}
              </p>
            )}
            <div className="sr-two">
              <button type="button" className="sf-secondary" onClick={onClose}>
                취소
              </button>
              <button
                type="button"
                className="sf-primary"
                data-testid="record-neis-apply"
                disabled={reading || outcome.tooMany}
                onClick={() => onApply(read, withRecords)}
              >
                학생 목록에 넣기
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
