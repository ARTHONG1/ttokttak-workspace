/**
 * 생기부 → 나이스: turns the students' texts into a 생기부 꾸러미 and hands it on. The desktop
 * app holds it for the 똑딱작업실 extension (which takes it through native messaging) and
 * opens the browser on NEIS; the web app gives it straight to the extension in this
 * browser. The extension types the texts into the NEIS grid; saving stays with the teacher.
 */
import {
  buildRecordPackage,
  writtenCount,
  type RecordPackage,
} from '@genoffice/ttokttak-extension/record'
import { sendWorkToExtension, type ExtensionRuntime } from '../work-send'
import { NEIS_BYTE_LIMIT, neisBytes, sessionTitle, type RecordMode, type Work } from './record-core'

/** this task's id in the 똑딱작업실 extension */
export const NEIS_RECORD = 'neis-record'

/**
 * The students in the order of the list, which is the order of the NEIS grid. A student
 * without a text stays in, so the extension passes that row over instead of shifting
 * everyone after it up a row.
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

export interface RecordSendDeps {
  /** true in the web edition: the extension in this browser is the only route */
  web: boolean
  /** the desktop app's queue (window.aiOffice.workSend) */
  workSend?: (
    feature: string,
    text: string,
  ) => Promise<{ ok: true; title: string } | { ok: false; reason: string }>
  /** the desktop app opens the browser on the task's site (window.aiOffice.openWorkSite) */
  openWorkSite?: (feature: string) => Promise<unknown>
  /** window.chrome.runtime when an extension lets this page talk to it */
  runtime?: ExtensionRuntime
  timeoutMs?: number
}

export type RecordSendOutcome =
  | { ok: true; route: 'desktop' | 'extension'; message: string }
  | { ok: false; route: 'desktop' | 'none'; message: string }

const HOW_TO_FILL =
  '나이스 입력 화면의 표에서 첫 학생 줄을 누른 뒤, [똑딱] 창의 [나이스에 채우기]를 누르세요.'
const TAKE_HINT = '나이스 화면 오른쪽 아래 [똑딱]을 누르면 보낸 내용이 보여요.'

export const NO_RECORD_EXTENSION =
  '이 브라우저에 「똑딱작업실」 확장 프로그램이 없어요. 설치한 뒤 다시 누르거나, 아래 [클립보드로 복사]로 넘겨 주세요.'
const OLD_EXTENSION =
  '설치된 「똑딱작업실」 확장 프로그램이 나이스 입력을 아직 몰라요. 확장 프로그램을 0.7.0 이상으로 업데이트해 주세요.'

/** what the extension did with the browser after it took the work */
function movedMessage(moved: unknown): string {
  if (moved === 'focused') return '나이스 화면으로 옮겼어요. ' + HOW_TO_FILL
  if (moved === 'opened') {
    return (
      '나이스를 새 탭으로 열었어요. 로그인하고 입력 화면을 열면 보낸 내용이 떠요. ' + HOW_TO_FILL
    )
  }
  return (
    '확장 프로그램에 보냈어요. ' +
    TAKE_HINT +
    ' 나이스를 한 번 열어 두면 다음부터는 이 버튼이 그 화면으로 바로 옮겨 줘요.'
  )
}

export async function sendRecord(text: string, deps: RecordSendDeps): Promise<RecordSendOutcome> {
  if (!deps.web && deps.workSend) {
    const r = await deps.workSend(NEIS_RECORD, text)
    if (!r.ok) return { ok: false, route: 'desktop', message: r.reason }
    if (!deps.openWorkSite) {
      return { ok: true, route: 'desktop', message: '똑딱작업실이 준비했어요. ' + TAKE_HINT }
    }
    await deps.openWorkSite(NEIS_RECORD).catch(() => undefined)
    return {
      ok: true,
      route: 'desktop',
      message: '준비하고 브라우저에서 나이스로 옮겼어요. ' + HOW_TO_FILL,
    }
  }
  const rt = deps.runtime
  if (!rt || typeof rt.sendMessage !== 'function') {
    return { ok: false, route: 'none', message: NO_RECORD_EXTENSION }
  }
  const r = await sendWorkToExtension(NEIS_RECORD, text, rt, deps.timeoutMs)
  if (r?.ok) return { ok: true, route: 'extension', message: movedMessage(r.moved) }
  // an extension from before this task says it does not know the task, or the request
  if (r && r.reason) {
    return {
      ok: false,
      route: 'none',
      message: /모르는 업무|알 수 없는 요청/.test(r.reason) ? OLD_EXTENSION : r.reason,
    }
  }
  return { ok: false, route: 'none', message: NO_RECORD_EXTENSION }
}
