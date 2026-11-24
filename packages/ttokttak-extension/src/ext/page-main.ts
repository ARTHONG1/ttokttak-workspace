/**
 * Runs inside every https://*.go.kr page (MAIN world). Where a work site 똑딱작업실 knows
 * is running (K-에듀파인, NEIS) it shows the 똑딱 button. Pressing it opens the task with
 * work waiting, the site's only task straight away, or the list of the site's tasks. No
 * task ever saves, approves or submits anything on the site.
 */
import type { DesktopTake, Feature, FeatureContext, SiteId } from '../core/feature'
import { homeChoice } from '../core/home'
import type { InboxEntry } from '../core/inbox'
import { featuresOf } from '../core/registry'
import { applyFill, planFill, probePumui } from '../features/edufine-pumui/fill'
import { edufinePumui } from '../features/edufine-pumui/index'
import { parsePumuiPackage } from '../features/edufine-pumui/package'
import { fillProtectedGrid, probeRecord } from '../features/neis-record/automatic'
import { neisRecord } from '../features/neis-record/index'
import { parseRecordPackage } from '../features/neis-record/package'
import { openMenu } from '../sites/edufine/menu'
import { findWorkForm, type WorkForm } from '../sites/edufine/screen'
import type { ScreenMap } from '../sites/edufine/screen-map'
import { FAKE_NEIS_MARK, isNeisHost } from '../sites/neis/grid'
import { watchAutomaticTransfer } from './automatic-transfer'
import { edufineMap, localNexacro, nexacro } from './edufine'
import { PAGE_TAG } from './messages'
import { call } from './page-channel'
import { h, mountPanel, won, type Panel } from './page-ui'
import { troubleTools } from './trouble'

/** the page part of each task, by id (their names are in core/registry.ts) */
const MODULES: Readonly<Record<string, Feature>> = {
  [edufinePumui.id]: edufinePumui,
  [neisRecord.id]: neisRecord,
}

/** how each site is recognised on a go.kr page */
const SITES: readonly { id: SiteId; here(): boolean }[] = [
  { id: 'edufine', here: () => !!nexacro() },
  {
    id: 'neis',
    here: () =>
      (isNeisHost(location.hostname) && Boolean(document.querySelector('.cl-grid-row'))) ||
      (__DEV__ && document.documentElement.hasAttribute(FAKE_NEIS_MARK)),
  },
]

type Win = Window & { __ttokEdufineLoaded?: boolean }
const win = window as Win

const log: string[] = []
const step = (s: string): void => {
  log.push(new Date().toISOString().slice(11, 19) + ' ' + s)
  if (log.length > 300) log.shift()
}

/** how long a go.kr page is watched for a site (K-에듀파인 starts after login, sometimes late) */
const WATCH_MS = 30 * 60_000
const WATCH_EVERY_MS = 1_000
const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

function automaticPumui(): Parameters<typeof watchAutomaticTransfer>[2] {
  let map: ScreenMap | undefined
  let loading = false
  let menuRequest: string | undefined
  let menuForms = new WeakSet<WorkForm>()
  let menuWithoutForm = false
  return (status) => {
    const nx = localNexacro()
    if (!nx) return { state: 'absent' }
    if (status.id !== menuRequest) {
      menuForms = new WeakSet()
      menuWithoutForm = false
      menuRequest = status.id
    }
    if (!map) {
      if (!loading) {
        loading = true
        void edufineMap()
          .then((value) => {
            map = value
          })
          .finally(() => {
            loading = false
          })
      }
      return { state: 'absent' }
    }
    const screenMap = map
    const form = findWorkForm(nx, screenMap)
    const target = probePumui(form, screenMap)
    if (target.state === 'menu')
      return {
        state: 'menu',
        openMenu: () => {
          if (localNexacro() !== nx || findWorkForm(nx, screenMap) !== form) return
          if (form ? menuForms.has(form) : menuWithoutForm) return
          if (openMenu(nx, screenMap, screenMap.menu?.pumuiMenuId) !== 'not-ready') {
            if (form) menuForms.add(form)
            else menuWithoutForm = true
          }
        },
      }
    if (target.state !== 'ready') return target
    return {
      state: 'ready',
      write: (text, active) => {
        const parsed = parsePumuiPackage(text)
        if (!parsed.ok) return { ok: false, message: parsed.reason }
        const next = probePumui(findWorkForm(localNexacro(), screenMap), screenMap)
        if (
          !active() ||
          next.state !== 'ready' ||
          next.form !== target.form ||
          next.grid !== target.grid ||
          next.budget !== target.budget ||
          next.mark !== target.mark
        ) {
          return {
            ok: false,
            message: '품의등록 화면이나 예산 줄이 바뀌었어요. 받은 작업을 다시 확인해 주세요.',
          }
        }
        const result = applyFill(
          next.form,
          screenMap,
          planFill(next.form, screenMap, parsed.pkg),
          undefined,
          true,
        )
        return result.ok
          ? {
              ok: true,
              message:
                '품목 ' +
                result.added +
                '줄과 제목·개요를 확인했어요(합계 ' +
                won(result.gridTotal) +
                '). 확인 뒤 [저장]을 눌러 주세요.',
            }
          : { ok: false, message: result.reason }
      },
    }
  }
}

function automaticRecord(): Parameters<typeof watchAutomaticTransfer>[2] {
  return ({ record }) => {
    if (!record) return { state: 'absent' }
    const probe = probeRecord(document, record.mode, record.firstName)
    if (probe.state !== 'ready') return probe
    return {
      state: 'ready',
      write: async (text, active) => {
        const parsed = parseRecordPackage(text)
        if (!parsed.ok) return { ok: false, message: parsed.reason }
        if (parsed.pkg.mode !== record.mode)
          return { ok: false, message: '보낸 업무 종류가 바뀌었어요.' }
        const result = await fillProtectedGrid(
          document,
          record.mode,
          probe.target,
          parsed.pkg.students,
          active,
          wait,
        )
        return result.ok
          ? {
              ok: true,
              message:
                result.written +
                '명의 입력값을 나이스 표에서 확인했어요. 확인 뒤 [저장]을 눌러 주세요.',
            }
          : { ok: false, message: result.reason }
      },
    }
  }
}

function start(): void {
  if (win.__ttokEdufineLoaded) return
  win.__ttokEdufineLoaded = true
  const began = Date.now()
  const watch = (): void => {
    const site = SITES.find((s) => s.here())
    if (site) {
      step('시작 ' + __VERSION__ + ' ' + site.id)
      let automatic: ReturnType<typeof watchAutomaticTransfer> | undefined
      const open = () => {
        if (!automatic?.show()) void home(panel, site.id)
      }
      const panel = mountPanel(open, () => automatic?.cancel() ?? false)
      const feature = featuresOf(site.id)[0]
      if (feature)
        automatic = watchAutomaticTransfer(
          panel,
          feature,
          site.id === 'edufine' ? automaticPumui() : automaticRecord(),
        )
      // remember this site so [K-에듀파인으로 보내기] can bring it forward next time
      void call('site:seen', { site: site.id })
      window.addEventListener('message', (e) => {
        const d = e.data
        if (e.source !== window || !d || d[PAGE_TAG] !== 'cmd') return
        if (d.type === 'open') open()
        if (d.type === 'transfer-changed') automatic?.refresh()
      })
      // a send opened this tab (or brought it up while it was loading): show the work now
      void call<boolean>('panel:auto', { site: site.id }).then((auto) => {
        if (auto === true) open()
      })
      return
    }
    if (Date.now() - began < WATCH_MS) setTimeout(watch, WATCH_EVERY_MS)
  }
  watch()
}

/** the work waiting for a task in its 받은 작업함, from the web app or the desktop app */
async function waitingWork(id: string): Promise<InboxEntry | null> {
  const p = (await call<InboxEntry | null>('inbox:peek', { feature: id })) as InboxEntry | null
  return p && typeof p.text === 'string' && p.text ? p : null
}

function contextFor(
  panel: Panel,
  site: SiteId,
  id: string,
  work: InboxEntry | null,
): FeatureContext {
  const toHome = (): void => void home(panel, site)
  let requestId = work?.requestId
  return {
    panel,
    step,
    peek: async () => {
      const entry = await waitingWork(id)
      requestId = entry?.requestId
      return entry?.text ?? null
    },
    clear: async () => {
      if (requestId) await call('inbox:clear', { feature: id, id: requestId })
    },
    isCurrent: async () =>
      Boolean(
        requestId &&
        (await call<{ ok: boolean }>('inbox:current', { feature: id, id: requestId }))?.ok,
      ),
    takeDesktop: async () => {
      const reply = await call<DesktopTake>('work:take-desktop', { feature: id }, 25_000)
      requestId = 'requestId' in reply ? reply.requestId : undefined
      return reply
    },
    home: toHome,
    trouble: () => troubleTools({ panel, log, step, home: toHome }),
  }
}

function openTask(panel: Panel, site: SiteId, id: string, work: InboxEntry | null): Promise<void> {
  const task = MODULES[id]
  panel.setLabel('똑딱작업실 · ' + task.title)
  return task.open(contextFor(panel, site, id, work), work?.text ?? null)
}

/** the 똑딱 button: the task with work waiting, the only task, or the list of tasks */
async function home(panel: Panel, site: SiteId): Promise<void> {
  step('열기')
  const shown = panel.shown
  const tasks = featuresOf(site).filter((f) => MODULES[f.id])
  const waiting: Record<string, number> = {}
  const entries = new Map<string, InboxEntry>()
  for (const f of tasks) {
    const w = await waitingWork(f.id)
    if (w) {
      waiting[f.id] = Number(w.receivedAt) || 0
      entries.set(f.id, w)
    }
  }
  if (panel.shown !== shown) return
  const choice = homeChoice(tasks, waiting)
  if (choice.kind === 'open')
    return openTask(panel, site, choice.id, entries.get(choice.id) ?? null)
  panel.setLabel('똑딱작업실')
  panel.show(
    h('h2', {}, '무엇을 할까요?'),
    h('p', { class: 'sub' }, '이 화면에서 똑딱작업실로 할 수 있는 일이에요.'),
    ...tasks.map((f) =>
      h(
        'div',
        { class: 'task' },
        h(
          'button',
          {
            class: 'btn primary',
            type: 'button',
            onclick: () => void openTask(panel, site, f.id, null),
          },
          f.title,
        ),
        h('p', { class: 'sub' }, f.help),
      ),
    ),
    troubleTools({ panel, log, step, home: () => void home(panel, site) }),
  )
}

start()
