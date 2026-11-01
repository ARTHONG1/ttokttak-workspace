import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { SplitViewState } from '../../shared/split-view-api'
import { useFirstConnectionNotice } from './FirstConnectionNotice'
import { DesktopWelcome } from './DesktopWelcome'
import { DesktopConnectionPage } from './DesktopConnectionPage'
import { codexCanStart, desktopCanEnterWorkspace, desktopEntryTransition } from './desktop-entry'
import type { DesktopEntryAction, DesktopEntryScreen } from './desktop-entry'
import { Home } from './Home'
import { TrialHome } from './TrialHome'
import { isWebEdition } from './edition'
import { Onboarding } from './Onboarding'
import {
  SPLIT_EVEN_RATIO,
  dividerRect,
  ratioForDragOffset,
  type ViewportSize,
} from './split-view-geometry'
import { TabBar } from './TabBar'
import { useSubscriptionConnection } from './subscription-client'

interface AppFrameProps {
  /** resolved before first paint (main.tsx) so home never flashes under the overlay */
  initialOnboardingSeen: boolean
}

/** The shell renderer's viewport: the same CSS px space the pane bounds use. */
function useViewportSize(): ViewportSize {
  const [size, setSize] = useState<ViewportSize>(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }))
  useEffect(() => {
    const onResize = (): void => setSize({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return size
}

/** Read the split once, then follow the main process' change notices. */
function useSplitView(): SplitViewState | null {
  const [split, setSplit] = useState<SplitViewState | null>(null)
  useEffect(() => {
    let alive = true
    // until the split wiring is registered a bare read rejects: "not split"
    void window.aiOfficeTabs.getSplit().then(
      (state) => {
        if (alive) setSplit(state)
      },
      () => undefined,
    )
    const off = window.aiOfficeTabs.onSplitChanged(setSplit)
    return () => {
      alive = false
      off()
    }
  }, [])
  return split
}

interface DividerDrag {
  pointerId: number
  /** pointer position minus the divider's leading edge at pointer-down */
  grabOffset: number
  frame: number | null
  pending: number | null
}

/**
 * The two panes are WebContentsViews that paint above shell DOM, so the only
 * chrome the divider can live in is the gap the main process leaves between
 * them. Its rectangle is recomputed from the viewport and the split ratio.
 */
function SplitDivider({ split, viewport }: { split: SplitViewState; viewport: ViewportSize }) {
  const dragRef = useRef<DividerDrag | null>(null)
  // during a drag the divider follows the pointer here so it never lags the
  // main process re-laying the views out; the answered state takes over after
  const [dragRatio, setDragRatio] = useState<number | null>(null)
  const ratio = dragRatio ?? split.ratio
  const rect = dividerRect(viewport, split.orientation, ratio)

  // a queued frame must never fire into an unmounted divider (e.g. the split
  // closed mid-drag)
  useEffect(() => {
    return () => {
      const drag = dragRef.current
      if (drag?.frame != null) cancelAnimationFrame(drag.frame)
      dragRef.current = null
    }
  }, [])

  const pointerAlongAxis = (event: ReactPointerEvent<HTMLDivElement>): number =>
    split.orientation === 'side' ? event.clientX : event.clientY

  const send = (value: number): void => window.aiOfficeTabs.setSplitRatio(value)

  const endDrag = (): void => {
    const drag = dragRef.current
    if (drag?.frame != null) cancelAnimationFrame(drag.frame)
    dragRef.current = null
    setDragRatio(null)
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return
    const current = dividerRect(viewport, split.orientation, split.ratio)
    const leading = split.orientation === 'side' ? current.left : current.top
    dragRef.current = {
      pointerId: event.pointerId,
      grabOffset: pointerAlongAxis(event) - leading,
      frame: null,
      pending: null,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragRatio(split.ratio)
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const target = pointerAlongAxis(event) - drag.grabOffset
    const next = ratioForDragOffset(target, viewport, split.orientation)
    // past a pane's minimum the drag means "close that side": say so once and
    // let the split notice remove the divider
    if (next === 0 || next === 1) {
      endDrag()
      send(next)
      return
    }
    setDragRatio(next)
    drag.pending = next
    // every accepted ratio re-lays both views in the main process, so the
    // pointer stream is sampled to one send per animation frame
    if (drag.frame == null) {
      drag.frame = requestAnimationFrame(() => {
        const current = dragRef.current
        if (!current) return
        current.frame = null
        const pending = current.pending
        current.pending = null
        if (pending != null) send(pending)
      })
    }
  }

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const target = pointerAlongAxis(event) - drag.grabOffset
    // the release position supersedes the last throttled sample
    const final = ratioForDragOffset(target, viewport, split.orientation)
    endDrag()
    send(final)
  }

  return (
    <div
      className={`split-divider ${split.orientation === 'side' ? 'side' : 'stack'}`}
      style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
      role="separator"
      aria-orientation={split.orientation === 'side' ? 'vertical' : 'horizontal'}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      onDoubleClick={() => send(SPLIT_EVEN_RATIO)}
    />
  )
}

export function AppFrame({ initialOnboardingSeen }: AppFrameProps) {
  const webEdition = isWebEdition()
  const [homeActive, setHomeActive] = useState(true)
  // The web keeps its existing first-run walkthrough; the installed app opens
  // the public website's introduction instead (even for returning users).
  const [showOnboarding, setShowOnboarding] = useState(webEdition && !initialOnboardingSeen)
  const [desktopScreen, setDesktopScreen] = useState<DesktopEntryScreen>('welcome')
  const [tabsResolved, setTabsResolved] = useState(false)
  const split = useSplitView()
  const viewport = useViewportSize()
  // one live view of the subscription connection for the home screen, the
  // onboarding and the first-connection notice
  const connection = useSubscriptionConnection()
  const notice = useFirstConnectionNotice(connection.statuses)
  const connectionReady = codexCanStart(connection.statuses.codex)
  const canStart = desktopCanEnterWorkspace(connection.statuses.codex, notice.settings)

  const enterDesktop = (action: DesktopEntryAction): void => {
    // When the first transmission notice is due, show it on the connection
    // page before exposing the work area. The notice is never auto-accepted.
    if (action === 'start' && canStart && notice.due) {
      setDesktopScreen('connect')
      return
    }
    setDesktopScreen((current) => desktopEntryTransition(current, action, canStart))
  }

  useEffect(() => {
    const applyTabs = (tabs: Awaited<ReturnType<typeof window.aiOfficeTabs.list>>) => {
      const active = tabs.find((tab) => tab.active)
      const isHome = !active || active.kind === 'home'
      setHomeActive(isHome)
      // A file opened by macOS Finder, or restored after a crash, must be
      // visible immediately and must never be covered by the welcome screen.
      if (!webEdition && !isHome) setDesktopScreen('workspace')
      setTabsResolved(true)
    }
    void window.aiOfficeTabs.list().then(applyTabs, () => setTabsResolved(true))
    return window.aiOfficeTabs.onChanged(applyTabs)
  }, [webEdition])

  const finishOnboarding = async (): Promise<boolean> => {
    try {
      const persisted = await window.aiOffice.setOnboardingSeen()
      if (!persisted) return false
      setShowOnboarding(false)
      return true
    } catch {
      return false
    }
  }

  // Keep the editor view contract unchanged: the tab bar and Home remain
  // mounted only in the working state, while the marketing and connection
  // screens occupy the full viewport with no competing toolbar.
  if (!webEdition && tabsResolved && homeActive && desktopScreen === 'welcome') {
    return <div className="app-frame"><DesktopWelcome onConnect={() => enterDesktop('connect')} onStart={() => enterDesktop('start')} /></div>
  }
  if (!webEdition && tabsResolved && homeActive && desktopScreen === 'connect') {
    return (
      <div className="app-frame">
        <DesktopConnectionPage
          connection={connection}
          canStart={canStart}
          connectionReady={connectionReady}
          settingsLoaded={notice.settings !== null}
          noticeDue={notice.due}
          onNoticeAcknowledge={notice.acknowledge}
          onBack={() => enterDesktop('back')}
          onStart={() => enterDesktop('start')}
        />
      </div>
    )
  }
  if (!webEdition && !tabsResolved) return <div className="app-frame" />

  return (
    <div className="app-frame">
      <TabBar split={split} />
      {/* divider sits in the gap between the two pane views — the one slice of
       * the content area they do not cover. Home paints this document instead
       * (the panes are only hidden there, not closed), so no seam over it. */}
      {split && !homeActive && <SplitDivider split={split} viewport={viewport} />}
      {/* docs/sheets tabs render as WebContentsView children of this window, positioned
       * by the main process to cover this area — only Home paints its own content here. */}
      <div className="app-frame-content" style={{ visibility: homeActive ? 'visible' : 'hidden' }}>
        {/* the web trial gets a home of its own: open a document, ask the AI */}
        {webEdition ? (
          <TrialHome />
        ) : (
          <Home
            connection={connection}
            aiSettings={notice.settings}
            // during the onboarding its connect step shows the notice instead
            noticeDue={notice.due && !showOnboarding}
            onNoticeAcknowledge={notice.acknowledge}
          />
        )}
      </div>
      {/* editor WebContentsViews paint above ALL shell DOM, so the overlay only
       * renders while the home tab is active — it comes back when home does */}
      {showOnboarding && homeActive && (
        <Onboarding
          onDone={finishOnboarding}
          connection={connection}
          noticeDue={notice.due}
          onNoticeAcknowledge={notice.acknowledge}
        />
      )}
    </div>
  )
}
