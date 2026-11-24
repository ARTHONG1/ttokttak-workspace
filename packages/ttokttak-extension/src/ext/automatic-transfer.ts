import type { FeatureInfo } from '../core/feature'
import type { CandidateReply, CandidateState, TransferStatus } from './messages'
import { call } from './page-channel'
import { h, type Panel } from './page-ui'

type WriteResult = { ok: boolean; message: string }
export interface TransferProbe {
  state: CandidateState
  openMenu?: () => void
  write?: (text: string, active: () => boolean) => WriteResult | Promise<WriteResult>
}

const POLL_MS = 600
const NO_SCREEN = {
  edufine: '로그인한 뒤 K-에듀파인 품의등록 화면을 열어 주세요.',
  neis: '로그인한 뒤 나이스에서 보낸 업무에 맞는 입력 화면을 열어 주세요.',
}
const NO_SELECTION = {
  edufine: '품의등록 화면에서 사용할 예산 줄과 물품·용역 구분을 골라 주세요.',
  neis: '나이스 입력 표에서 보낸 작업의 첫 학생 줄을 하나만 골라 주세요.',
}

export function watchAutomaticTransfer(
  panel: Panel,
  feature: FeatureInfo,
  probe: (transfer: TransferStatus) => TransferProbe,
) {
  let pending: TransferStatus | undefined
  let rendering = ''
  let renderedAt = -1
  let timer: ReturnType<typeof setTimeout> | undefined
  let busy = false
  let changed = false
  let present = true
  let cancelled: string | undefined
  let cancelResponse: Promise<{ ok: boolean }> | undefined
  const request = { feature: feature.id }
  const note = (
    title: string,
    message: string,
    state: 'wait' | 'done' | 'err',
    canCancel = false,
  ) => {
    panel.setLabel('똑딱작업실 · ' + feature.title)
    panel.show(
      h('h2', {}, title),
      h('p', { class: state === 'wait' ? 'note' : state, role: 'status' }, message),
      canCancel
        ? h('button', { class: 'btn', type: 'button', onclick: () => cancel() }, '자동 입력 취소')
        : h('button', { class: 'btn', type: 'button', onclick: () => panel.hide() }, '확인'),
    )
  }
  const cancel = (): boolean => {
    const id = pending?.id
    if (!id || (pending?.writing && !canStopLocally) || cancelled === id) return false
    cancelled = id
    note('자동 입력 취소 중', '현재 요청을 중단하고 있어요.', 'wait')
    cancelResponse = call<{ ok: boolean }>('transfer:cancel', { ...request, id })
    void cancelResponse.then((reply) => {
      if (!present || pending?.id !== id) return
      if (!canStopLocally) {
        note(
          reply?.ok ? '자동 입력을 취소했어요' : '자동 입력 상태를 확인해 주세요',
          reply?.ok
            ? '받은 작업은 [똑딱]에서 수동으로 열 수 있어요.'
            : '다른 화면에서 이미 입력을 시작했으면 그 화면에서 취소할 수 있어요.',
          reply?.ok ? 'wait' : 'err',
        )
        pending = undefined
      }
      refresh()
    })
    return true
  }
  let canStopLocally = false

  function waitNote(title: string, message: string, canCancel: boolean) {
    const key = title + message + canCancel
    if (rendering === key && renderedAt === panel.shown && panel.isOpen()) return
    rendering = key
    note(title, message, 'wait', canCancel)
    renderedAt = panel.shown
  }

  async function runClaim(
    status: TransferStatus,
    target: TransferProbe,
    claim: Extract<CandidateReply, { state: 'claimed' }>,
  ) {
    const id = status.id
    let leaseUntil = claim.leaseUntil
    let renewal: ReturnType<typeof setTimeout> | undefined
    canStopLocally = true
    const active = () =>
      present &&
      cancelled !== id &&
      document.visibilityState !== 'hidden' &&
      Date.now() < leaseUntil
    const renew = async () => {
      if (!canStopLocally || !active()) return
      const reply = await call<{ ok: boolean; leaseUntil?: number }>(
        'transfer:renew',
        { ...request, id },
        2_000,
      )
      if (!canStopLocally) return
      if (reply?.ok && typeof reply.leaseUntil === 'number') {
        leaseUntil = reply.leaseUntil
        renewal = setTimeout(() => void renew(), 1_000)
      } else {
        leaseUntil = 0
      }
    }
    let result: WriteResult = { ok: false, message: '입력할 화면을 다시 확인해 주세요.' }
    try {
      if (active() && target.write) {
        waitNote('자동 입력 중', '입력한 값을 업무 화면에서 다시 확인하고 있어요.', true)
        renewal = setTimeout(() => void renew(), 1_000)
        result = await target.write(claim.text, active)
      }
    } catch {
      result = {
        ok: false,
        message: '입력 중 연결이 끊겼어요. 업무 화면에 들어간 값을 확인해 주세요.',
      }
    } finally {
      canStopLocally = false
      clearTimeout(renewal)
    }
    if (cancelled === id) await cancelResponse
    const success = result.ok && active()
    const ended = await call<{ ok: boolean }>('transfer:end', { ...request, id, success })
    pending = undefined
    if (!present) return
    if (cancelled === id) note('자동 입력을 취소했어요', result.message, 'wait')
    else if (success && ended?.ok) note('채웠어요', result.message, 'done')
    else
      note(
        '자동 입력을 마치지 못했어요',
        success ? '업무 화면에서 들어간 값을 확인해 주세요.' : result.message,
        'err',
      )
  }

  async function poll() {
    if (!present || busy) return
    busy = true
    changed = false
    try {
      const status = await call<TransferStatus | null>('transfer:status', request)
      if (!present) return
      if (status && 'ok' in status) return
      if (!status || !status.id) {
        if (pending && cancelled !== pending.id)
          note(
            '자동 입력 대기가 끝났어요',
            '받은 작업은 [똑딱]에서 수동으로 확인할 수 있어요.',
            'wait',
          )
        pending = undefined
        return
      }
      if (cancelled === status.id) return
      pending = status
      if (status.writing) {
        if (rendering)
          waitNote('자동 입력 중', '입력이 진행되는 업무 화면에서 결과를 확인해 주세요.', false)
        return
      }
      const target =
        document.visibilityState === 'hidden' ? { state: 'absent' as const } : probe(status)
      if (target.state !== 'absent') {
        waitNote(
          '자동 입력 대기 중',
          target.state === 'ready'
            ? '입력할 화면을 확인하고 있어요.'
            : target.state === 'menu'
              ? NO_SCREEN[feature.site]
              : NO_SELECTION[feature.site],
          true,
        )
      } else if (panel.isOpen() && rendering) {
        waitNote('자동 입력 대기 중', NO_SCREEN[feature.site], true)
      }
      const reply = await call<CandidateReply>('transfer:candidate', {
        ...request,
        id: status.id,
        state: target.state,
      })
      if (reply && 'state' in reply && reply.state === 'claimed') {
        await runClaim(status, target, reply)
      } else if (
        present &&
        cancelled !== status.id &&
        reply &&
        'state' in reply &&
        document.visibilityState !== 'hidden' &&
        Date.now() < status.until
      ) {
        if (reply.state === 'ambiguous' && target.state !== 'absent')
          waitNote('자동 입력 대기 중', '입력할 업무 화면과 선택을 하나만 남겨 주세요.', true)
        if (reply.state === 'menu') target.openMenu?.()
      }
    } finally {
      busy = false
      if (present && (pending || changed))
        timer = setTimeout(() => void poll(), changed ? 0 : POLL_MS)
    }
  }

  function refresh() {
    changed = true
    if (!present || busy) return
    clearTimeout(timer)
    void poll()
  }

  function show(): boolean {
    if (!pending || cancelled === pending.id) return false
    if (!panel.isOpen() || !rendering)
      waitNote('자동 입력 대기 중', NO_SCREEN[feature.site], !pending.writing)
    refresh()
    return true
  }

  window.addEventListener('pagehide', () => {
    present = false
    clearTimeout(timer)
  })
  window.addEventListener('pageshow', () => {
    present = true
    refresh()
  })
  document.addEventListener('visibilitychange', refresh)
  refresh()
  return { refresh, show, cancel }
}
