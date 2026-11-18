/**
 * 생기부 → 나이스: turns the students' texts into a 생기부 꾸러미 and hands it to the main
 * process, which types them into the NEIS grid in the app's own browser window. Saving in
 * NEIS stays with the teacher.
 */
import {
  buildRecordPackage,
  writtenCount,
  type RecordPackage,
} from '../../../shared/record-package'
import type { NeisResult } from '../../../shared/api'
import { NEIS_BYTE_LIMIT, neisBytes, sessionTitle, type RecordMode, type Work } from './record-core'

/**
 * The students in the order of the list, which is the order of the NEIS grid. A student
 * without a text stays in, so that row is passed over instead of shifting everyone after it
 * up a row.
 */
export function recordPackageFromWork(
  mode: RecordMode,
  work: Work,
  now: Date = new Date(),
): RecordPackage {
  return buildRecordPackage({
    mode,
    title: sessionTitle(mode, work),
    students: work.students.map((s) => ({ name: s.name, text: s.result })),
    now,
  })
}

/** why this work cannot be sent yet, or null */
export function recordSendProblem(mode: RecordMode, work: Work): string | null {
  const pkg = recordPackageFromWork(mode, work)
  if (writtenCount(pkg.students) === 0) {
    return '나이스로 보낼 글이 없어요. 먼저 글을 만들어 주세요.'
  }
  const over = work.students.findIndex((s) => neisBytes(s.result.trim()) > NEIS_BYTE_LIMIT)
  if (over >= 0) {
    return (
      over +
      1 +
      '번 학생의 글이 ' +
      NEIS_BYTE_LIMIT.toLocaleString('ko-KR') +
      '바이트를 넘어요. 줄인 뒤 보내 주세요.'
    )
  }
  return null
}

/** the main process fills NEIS; its answer goes back to the page as it is */
export function sendRecord(
  text: string,
  send: (text: string) => Promise<NeisResult> = (t) => window.saenggibu.sendToNeis(t),
): Promise<NeisResult> {
  return send(text)
}
