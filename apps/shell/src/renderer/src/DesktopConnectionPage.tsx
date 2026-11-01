import { AiSubscriptionCard } from '@genoffice/ui'
import { FirstConnectionDialog } from './FirstConnectionNotice'
import { useI18n } from './locale'
import type { SubscriptionConnection } from './subscription-client'
import './desktop-entry.css'

interface DesktopConnectionPageProps {
  connection: SubscriptionConnection
  canStart: boolean
  connectionReady: boolean
  settingsLoaded: boolean
  noticeDue: boolean
  onNoticeAcknowledge: () => void
  onBack: () => void
  onStart: () => void
}

/** Only the user's existing local Codex CLI is selectable for this release. */
export function DesktopConnectionPage({
  connection, canStart, connectionReady, settingsLoaded, noticeDue, onNoticeAcknowledge, onBack, onStart,
}: DesktopConnectionPageProps) {
  const { lang } = useI18n()
  return (
    <div className="desktop-connect" data-screen="connect">
      <main className="dc-panel">
        <button type="button" className="dc-back" onClick={onBack}>← 뒤로 가기</button>
        <h1>AI 연결하기</h1>
        <p className="dc-lead">이미 사용 중인 Codex CLI를 연결하면 기존 로그인과 모델 설정을 그대로 사용할 수 있습니다.</p>
        <div className="dc-status" role="status">
          {connectionReady
            ? !settingsLoaded
              ? 'Codex 연결됨 · 설정 확인 중…'
              : canStart
                ? 'Codex 연결됨 · 시작할 수 있습니다.'
                : 'Codex 연결됨 · 최초 전송 안내를 확인해 주세요.'
            : 'Codex 연결 상태를 확인해 주세요.'}
        </div>
        <AiSubscriptionCard
          status={connection.statuses.codex}
          lang={lang}
          disabled={connection.busy}
          onInstall={connection.install}
          onUpdate={connection.update}
          onCancelLogin={connection.cancelLogin}
          onLogin={connection.login}
          onRecheck={connection.recheck}
          onAcceptMetered={(provider) => { void connection.acceptMetered(provider) }}
          onOpenInstallHelp={connection.openInstallHelp}
        />
        {connection.failed.codex && (
          <p className="dc-error" role="alert">작업을 시작하지 못했습니다. 설치 및 로그인 상태를 확인한 후 다시 시도해 주세요.</p>
        )}
        <div className="dc-help">
          <p>VS Code·터미널에서 사용하던 Codex가 감지되면 다시 로그인할 필요 없이 그대로 연결됩니다.</p>
          <button type="button" className="dc-link" onClick={() => connection.recheck('codex')}>연결 상태 다시 확인 ↗</button>
        </div>
        <button type="button" className="dc-start" disabled={!canStart || connection.busy || noticeDue} onClick={onStart}>시작하기 →</button>
      </main>
      {noticeDue && connectionReady && <FirstConnectionDialog onAcknowledge={onNoticeAcknowledge} />}
    </div>
  )
}
