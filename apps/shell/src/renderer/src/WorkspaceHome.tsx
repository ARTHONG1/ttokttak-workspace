import { useEffect, useState } from 'react'
import { selectAiProvider } from '@genoffice/ai-provider/browser'
import { FirstConnectionDialog, useFirstConnectionNotice } from './FirstConnectionNotice'
import { LaunchRecoveryList } from './RecoveryList'
import { SettingsModal, type SettingsTarget } from './SettingsModal'
import { TrialHome } from './TrialHome'
import { isWebEdition } from './edition'
import { useSubscriptionConnection } from './subscription-client'
import { DesktopWelcome } from './DesktopWelcome'
import { DesktopConnectionPage } from './DesktopConnectionPage'
import { desktopConnectionState, startDestination, type DesktopPage } from './desktop-start'

export function WorkspaceHome() {
  const [page, setPage] = useState<DesktopPage>(() => (isWebEdition() ? 'workspace' : 'welcome'))
  const [target, setTarget] = useState<SettingsTarget | null>(null)
  const connection = useSubscriptionConnection()
  const notice = useFirstConnectionNotice(connection.statuses)
  const connectionState = desktopConnectionState(notice.settings, connection.statuses)
  const activeProvider = notice.settings
    ? selectAiProvider(notice.settings, connection.statuses)
    : null
  const start = () => setPage(startDestination(connectionState))
  useEffect(
    () =>
      window.aiOffice.onOpenSettings?.((request) =>
        setTarget({ section: request.section as SettingsTarget['section'] }),
      ),
    [],
  )
  return (
    <>
      <TrialHome />
      {page !== 'workspace' && !isWebEdition() && (
        // Below the tab bar (40px, tabbar.css .app-frame-content): covering it left a
        // document opened from Finder unreachable until 시작하기 was pressed on Home.
        <div
          style={{
            position: 'fixed',
            top: 40,
            right: 0,
            bottom: 0,
            left: 0,
            zIndex: 1000,
            background: '#07080b',
          }}
        >
          {page === 'welcome' ? (
            <DesktopWelcome onConnect={() => setPage('connection')} onStart={start} />
          ) : (
            <DesktopConnectionPage
              connection={connection}
              state={connectionState}
              provider={activeProvider?.connected ? activeProvider.provider : undefined}
              onBack={() => setPage('welcome')}
              onStart={start}
            />
          )}
        </div>
      )}
      <LaunchRecoveryList />
      {target && <SettingsModal target={target} onClose={() => setTarget(null)} />}
      {(target || page === 'connection') && !isWebEdition() && notice.due && (
        <FirstConnectionDialog onAcknowledge={notice.acknowledge} />
      )}
    </>
  )
}
