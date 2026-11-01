import { useEffect, useState } from 'react'
import { FirstConnectionDialog, useFirstConnectionNotice } from './FirstConnectionNotice'
import { LaunchRecoveryList } from './RecoveryList'
import { SettingsModal, type SettingsTarget } from './SettingsModal'
import { TrialHome } from './TrialHome'
import { isWebEdition } from './edition'
import { useSubscriptionConnection } from './subscription-client'

export function WorkspaceHome() {
  const [target, setTarget] = useState<SettingsTarget | null>(null)
  const connection = useSubscriptionConnection()
  const notice = useFirstConnectionNotice(connection.statuses)
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
      <LaunchRecoveryList />
      {target && <SettingsModal target={target} onClose={() => setTarget(null)} />}
      {target && !isWebEdition() && notice.due && (
        <FirstConnectionDialog onAcknowledge={notice.acknowledge} />
      )}
    </>
  )
}
