/**
 * 품의서 생성 → K-에듀파인: turns the 품의 목록 into a 품의 패키지 and hands it on. The
 * desktop app holds it for the 똑딱 에듀파인 연결 extension (which takes it through native
 * messaging); the web app gives it straight to the extension in this browser. When neither
 * works the page offers the clipboard and a .ttokpumui file, which also cover schools whose
 * K-에듀파인 PC has no internet.
 */
import { EXTENSION_ID } from '@genoffice/edufine-link/ids'
import { buildPumuiPackage, type PumuiPackage } from '@genoffice/edufine-link/package'

export interface WorkRow {
  description: string
  specification: string
  unit: string
  quantity: number
  unitPrice: number
  amount: number
}

/** why this 품의 cannot be sent yet, or null */
export function workProblem(title: string, rows: WorkRow[]): string | null {
  if (title.trim().length < 5) return '품의 제목을 5자 이상 입력해주세요.'
  if (rows.length === 0) return '품의 목록이 비어 있어요.'
  for (const [i, r] of rows.entries()) {
    if (!r.description.trim()) return i + 1 + '번째 줄의 품명이 비어 있어요.'
    if (Math.round(r.quantity * r.unitPrice) !== r.amount) {
      return i + 1 + '번째 줄의 금액이 수량×단가와 달라요. 수량이나 단가를 고쳐 주세요.'
    }
  }
  return null
}

export function pumuiPackageFromWork(
  work: { title: string; estimateData: WorkRow[]; generatedArticle: string | null },
  now: Date = new Date(),
): PumuiPackage {
  return buildPumuiPackage({
    title: work.title,
    summary: work.generatedArticle ?? '',
    items: work.estimateData.map((r) => ({ ...r })),
    now,
  })
}

export interface SendDeps {
  /** true in the web edition: the extension in this browser is the only route */
  web: boolean
  /** the desktop app's queue (window.aiOffice.pumuiSend) */
  pumuiSend?: (text: string) => Promise<{ ok: true; title: string } | { ok: false; reason: string }>
  /** window.chrome.runtime when an extension lets this page talk to it */
  runtime?: {
    sendMessage(id: string, msg: unknown, cb: (reply: unknown) => void): void
    lastError?: { message?: string }
  }
  timeoutMs?: number
}

export type SendOutcome =
  | { ok: true; route: 'desktop' | 'extension'; message: string }
  | { ok: false; route: 'desktop' | 'none'; message: string }

const TAKE_HINT = 'K-에듀파인 품의등록 화면 오른쪽 아래 [똑딱]을 누르면 바로 보여요'

export const NO_EXTENSION =
  '이 브라우저에 「똑딱 에듀파인 연결」 확장 프로그램이 없어요. 설치하거나, 아래 [클립보드로 복사]·[품의 파일 저장]으로 넘겨 주세요.'

export async function sendPumui(text: string, deps: SendDeps): Promise<SendOutcome> {
  if (!deps.web && deps.pumuiSend) {
    const r = await deps.pumuiSend(text)
    return r.ok
      ? {
          ok: true,
          route: 'desktop',
          message: '똑딱작업실이 품의를 준비했어요. ' + TAKE_HINT + '.',
        }
      : { ok: false, route: 'desktop', message: r.reason }
  }
  const rt = deps.runtime
  if (!rt || typeof rt.sendMessage !== 'function')
    return { ok: false, route: 'none', message: NO_EXTENSION }
  const reply = await new Promise<unknown>((resolve) => {
    const timer = setTimeout(() => resolve(null), deps.timeoutMs ?? 4000)
    try {
      rt.sendMessage(EXTENSION_ID, { type: 'pumui:send', text }, (r: unknown) => {
        clearTimeout(timer)
        resolve(rt.lastError ? null : r)
      })
    } catch {
      clearTimeout(timer)
      resolve(null)
    }
  })
  const r = reply as { ok?: boolean; reason?: string } | null
  if (r?.ok)
    return {
      ok: true,
      route: 'extension',
      message: '확장 프로그램에 품의를 보냈어요. ' + TAKE_HINT + '.',
    }
  if (r && r.reason) return { ok: false, route: 'none', message: r.reason }
  return { ok: false, route: 'none', message: NO_EXTENSION }
}
