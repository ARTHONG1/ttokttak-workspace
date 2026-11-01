import { AI_SUBSCRIPTION_PROVIDERS } from '@genoffice/ai-provider/browser'
import { AiSubscriptionCard } from '@genoffice/ui'
import { useI18n } from './locale'
import { changeAiSettings } from './settings-ai'
import type { SubscriptionConnection } from './subscription-client'
import { usableSubscriptionProviders } from './subscription-status'

export function DesktopConnectionPage({ connection, state, provider, onBack, onStart }: {
  connection: SubscriptionConnection
  state: 'connected' | 'checking' | 'disconnected'
  provider?: string | undefined
  onBack: () => void
  onStart: () => void
}) {
  const { lang } = useI18n()
  const usable = usableSubscriptionProviders(connection.statuses)
  return <div style={{ height: '100%', overflow: 'auto', background: '#f5f5f5', color: '#202124', padding: '40px 24px' }}>
    <div style={{ maxWidth: 820, margin: 'auto', background: 'white', padding: 32, borderRadius: 16 }}>
      <button className="set-btn" onClick={onBack}>← 뒤로 가기</button>
      <h1 style={{ fontSize: 30, margin: '24px 0 8px' }}>AI 연결하기</h1>
      <p>Codex 또는 Claude Code 중 하나를 연결하고 사용할 AI를 선택해 주세요.</p>
      <p role="status">{state === 'checking' ? '연결 확인 중…' : state === 'connected' ? `${provider === 'codex' ? 'Codex' : 'Claude Code'} 연결됨` : '사용할 AI를 연결하거나 선택해 주세요.'}</p>
      <div className="set-sub-cards">
        {AI_SUBSCRIPTION_PROVIDERS.map((provider) => <div key={provider}>
          <AiSubscriptionCard status={connection.statuses[provider]} lang={lang} disabled={connection.busy}
            onInstall={connection.install} onUpdate={connection.update} onCancelLogin={connection.cancelLogin}
            onLogin={connection.login} onRecheck={connection.recheck} onAcceptMetered={connection.acceptMetered}
            onOpenInstallHelp={connection.openInstallHelp} />
          {connection.failed[provider] && <p role="alert">연결을 시작하지 못했습니다. 설치와 로그인을 확인해 주세요.</p>}
          {usable.includes(provider) && <button className="set-btn" onClick={() => void changeAiSettings((settings) => ({ ...settings, provider }))}>
            {provider === 'codex' ? 'Codex' : 'Claude Code'} 사용하기
          </button>}
        </div>)}
      </div>
      <button style={{ marginTop: 24 }} className="set-btn primary" disabled={state !== 'connected'} onClick={onStart}>시작하기</button>
    </div>
  </div>
}
