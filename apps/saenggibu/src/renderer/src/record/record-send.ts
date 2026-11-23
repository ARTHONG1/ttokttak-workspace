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
import type { NeisProgress, NeisResult, SaenggibuApi } from '../../../shared/api'
import { byteLimit, neisBytes, sessionTitle, type RecordMode, type Work } from './record-core'

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
  // 초등 창체 has no cap
  const limit = byteLimit(mode, work.info)
  const over =
    limit === null ? -1 : work.students.findIndex((s) => neisBytes(s.result.trim()) > limit)
  if (over >= 0 && limit !== null) {
    return (
      over +
      1 +
      '번 학생의 글이 ' +
      limit.toLocaleString('ko-KR') +
      '바이트를 넘어요. 줄인 뒤 보내 주세요.'
    )
  }
  return null
}

export interface RecordSendProgress extends NeisProgress {
  mode: RecordMode
  cancelling: boolean
}

/** Keep one request and its original payload until the main process has stopped writing. */
export function createRecordSender(
  api: Pick<SaenggibuApi, 'sendToNeis' | 'focusNeisSend' | 'cancelNeisSend' | 'onNeisProgress'>,
  update: (progress: RecordSendProgress | null) => void,
  finish: (mode: RecordMode, result: NeisResult) => void,
) {
  let active: { progress: RecordSendProgress } | null = null
  let disposed = false
  const unsubscribe = api.onNeisProgress((event) => {
    if (active?.progress.requestId !== event.requestId) return
    active.progress = {
      ...event,
      mode: active.progress.mode,
      cancelling: active.progress.cancelling,
    }
    update(active.progress)
  })
  return {
    start(mode: RecordMode, text: string) {
      if (active || disposed) return
      const requestId = crypto.randomUUID()
      active = {
        progress: { requestId, mode, stage: 'browser-opening', elapsedMs: 0, cancelling: false },
      }
      update(active.progress)
      const settle = (result: NeisResult) => {
        if (active?.progress.requestId !== requestId) return
        active = null
        update(null)
        finish(mode, result)
      }
      void api.sendToNeis(text, requestId).then(settle, () =>
        settle({
          ok: false,
          route: 'direct',
          message: '나이스 전송 연결이 끊겼어요. 입력 화면을 확인해 주세요.',
        }),
      )
    },
    focus(mode: RecordMode) {
      if (active?.progress.mode !== mode || active.progress.cancelling) return
      void api.focusNeisSend(active.progress.requestId).catch(() => undefined)
    },
    cancel() {
      if (!active || active.progress.cancelling) return
      const request = active
      request.progress = { ...request.progress, cancelling: true }
      update(request.progress)
      void api.cancelNeisSend(request.progress.requestId).catch(() => {
        if (active !== request) return
        request.progress = { ...request.progress, cancelling: false }
        update(request.progress)
      })
    },
    dispose() {
      disposed = true
      const request = active
      active = null
      unsubscribe()
      if (request && !request.progress.cancelling)
        void api.cancelNeisSend(request.progress.requestId).catch(() => undefined)
    },
  }
}
