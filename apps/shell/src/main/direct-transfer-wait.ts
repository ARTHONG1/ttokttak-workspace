import type { BrowserContext, Frame } from 'playwright-core'
import type { DirectTransferStage } from '../shared/direct-transfer-api'

export type ReadyFrame = { frame: Frame; stage?: DirectTransferStage; reason?: string }

/** Re-discover pages and frames on every pass. Login commonly replaces the entire frame. */
export async function waitForTransferFrame(
  context: BrowserContext,
  inspect: (isActive: () => boolean) => Promise<ReadyFrame[]>,
  options: {
    signal?: AbortSignal
    timeoutMs: number
    pollMs: number
    onStage?: (stage: DirectTransferStage) => void
  },
): Promise<{ frame: Frame } | { reason: string; cancelled?: boolean }> {
  const until = Date.now() + options.timeoutMs
  let lastStage = ''
  let lastReason: 'multiple' | 'selection' | 'login' = 'login'
  let selectionHint = ''
  const stage = (value: DirectTransferStage) => {
    if (value !== lastStage) {
      lastStage = value
      options.onStage?.(value)
    }
  }
  let stopped = false
  let onAbort: () => void = () => {}
  let timeout: ReturnType<typeof setTimeout> | undefined
  const stop = new Promise<'cancelled' | 'timeout'>((resolve) => {
    onAbort = () => {
      stopped = true
      resolve('cancelled')
    }
    options.signal?.addEventListener('abort', onAbort, { once: true })
    timeout = setTimeout(
      () => {
        stopped = true
        resolve('timeout')
      },
      Math.max(0, until - Date.now()),
    )
    if (options.signal?.aborted) onAbort()
  })
  const isActive = (): boolean => !stopped && !options.signal?.aborted && Date.now() < until
  const ended = () => {
    if (options.signal?.aborted) {
      stage('cancelled')
      return { reason: '전송을 취소했어요.', cancelled: true }
    }
    stage('failed')
    return {
      reason:
        lastReason === 'multiple'
          ? '입력 가능한 업무 화면이 여러 개예요. 한 화면만 남긴 뒤 다시 보내 주세요.'
          : lastReason === 'selection'
            ? selectionHint ||
              '화면 준비 대기 시간이 지났어요. 입력할 학생 줄이나 예산 줄을 선택한 뒤 다시 보내 주세요.'
            : '화면 준비 대기 시간이 지났어요. 로그인과 입력 화면을 확인한 뒤 다시 보내 주세요.',
    }
  }
  try {
    while (isActive()) {
      if (!context.pages().length || context.pages().every((page) => page.isClosed())) {
        stage('failed')
        return { reason: '전송용 브라우저 창을 닫았어요. 다시 보내 주세요.' }
      }
      let matches: ReadyFrame[] = []
      try {
        const result = await Promise.race([inspect(isActive), stop])
        if (typeof result === 'string') return ended()
        matches = result
      } catch {
        // Login and redirects dispose frames. The next pass sees their replacements.
      }
      if (!isActive()) return ended()
      if (matches.length === 1 && !matches[0].stage) return { frame: matches[0].frame }
      lastReason =
        matches.length > 1
          ? 'multiple'
          : matches[0]?.stage === 'waiting-selection'
            ? 'selection'
            : 'login'
      selectionHint = lastReason === 'selection' ? (matches[0]?.reason ?? '') : ''
      stage(matches.length > 1 ? 'waiting-selection' : (matches[0]?.stage ?? 'waiting-login'))
      let pollTimer: ReturnType<typeof setTimeout> | undefined
      const paused = await Promise.race([
        new Promise<'poll'>((resolve) => {
          pollTimer = setTimeout(() => resolve('poll'), options.pollMs)
        }),
        stop,
      ])
      if (pollTimer) clearTimeout(pollTimer)
      if (paused !== 'poll') return ended()
    }
    return ended()
  } finally {
    stopped = true
    options.signal?.removeEventListener('abort', onAbort)
    if (timeout) clearTimeout(timeout)
  }
}
