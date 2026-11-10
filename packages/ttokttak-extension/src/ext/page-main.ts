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
import { edufinePumui } from '../features/edufine-pumui/index'
import { neisRecord } from '../features/neis-record/index'
import { FAKE_NEIS_MARK, isNeisHost } from '../sites/neis/grid'
import { nexacro } from './edufine'
import { PAGE_TAG } from './messages'
import { call } from './page-channel'
import { h, mountPanel, type Panel } from './page-ui'
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
      isNeisHost(location.hostname) ||
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

function start(): void {
  if (window.top !== window || win.__ttokEdufineLoaded) return
  win.__ttokEdufineLoaded = true
  const began = Date.now()
  const watch = (): void => {
    const site = SITES.find((s) => s.here())
    if (site) {
      step('시작 ' + __VERSION__ + ' ' + site.id)
      const panel = mountPanel(() => void home(panel, site.id))
      // remember this site so [K-에듀파인으로 보내기] can bring it forward next time
      void call('site:seen', { site: site.id })
      window.addEventListener('message', (e) => {
        const d = e.data
        if (e.source === window && d && d[PAGE_TAG] === 'cmd' && d.type === 'open')
          void home(panel, site.id)
      })
      // a send opened this tab (or brought it up while it was loading): show the work now
      void call<boolean>('panel:auto').then((auto) => {
        if (auto === true) void home(panel, site.id)
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

function contextFor(panel: Panel, site: SiteId, id: string): FeatureContext {
  const toHome = (): void => void home(panel, site)
  return {
    panel,
    step,
    peek: async () => (await waitingWork(id))?.text ?? null,
    clear: async () => {
      await call('inbox:clear', { feature: id })
    },
    takeDesktop: async () =>
      (await call<DesktopTake>('work:take-desktop', { feature: id }, 25_000)) as DesktopTake,
    home: toHome,
    trouble: () => troubleTools({ panel, log, step, home: toHome }),
  }
}

function openTask(panel: Panel, site: SiteId, id: string, work: string | null): Promise<void> {
  const task = MODULES[id]
  panel.setLabel('똑딱작업실 · ' + task.title)
  return task.open(contextFor(panel, site, id), work)
}

/** the 똑딱 button: the task with work waiting, the only task, or the list of tasks */
async function home(panel: Panel, site: SiteId): Promise<void> {
  step('열기')
  const tasks = featuresOf(site).filter((f) => MODULES[f.id])
  const waiting: Record<string, number> = {}
  const texts = new Map<string, string>()
  for (const f of tasks) {
    const w = await waitingWork(f.id)
    if (w) {
      waiting[f.id] = Number(w.receivedAt) || 0
      texts.set(f.id, w.text)
    }
  }
  const choice = homeChoice(tasks, waiting)
  if (choice.kind === 'open') return openTask(panel, site, choice.id, texts.get(choice.id) ?? null)
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
