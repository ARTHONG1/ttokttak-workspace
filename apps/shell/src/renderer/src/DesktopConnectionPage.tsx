import { isKeyProviderConfigured } from '@genoffice/ai-provider/browser'
import { AI_SUBSCRIPTION_PROVIDERS } from '@genoffice/ai-provider/browser'
import { AiSubscriptionCard } from '@genoffice/ui'
import { useAiSettings } from './FreeAiCards'
import { useI18n } from './locale'
import { changeAiSettings } from './settings-ai'
import type { SubscriptionConnection } from './subscription-client'
import { usableSubscriptionProviders } from './subscription-status'

export function DesktopConnectionPage({
  connection,
  state,
  provider,
  onBack,
  onStart,
}: {
  connection: SubscriptionConnection
  state: 'connected' | 'checking' | 'disconnected'
  provider?: string | undefined
  onBack: () => void
  onStart: () => void
}) {
  const { lang } = useI18n()
  const settings = useAiSettings()
  const hasLocal = Boolean(settings && isKeyProviderConfigured(settings, 'local'))
  const usable = usableSubscriptionProviders(connection.statuses)
  const ready = state === 'connected' || hasLocal
  return (
    <div
      style={{
        height: '100%',
        overflow: 'auto',
        background: '#f5f5f5',
        color: '#202124',
        padding: '40px 24px',
      }}
    >
      <div
        style={{
          maxWidth: 820,
          margin: 'auto',
          background: 'white',
          padding: 32,
          borderRadius: 16,
        }}
      >
        <button className="set-btn" onClick={onBack}>
          ← 뒤로 가기
        </button>
        <h1 style={{ fontSize: 30, margin: '24px 0 8px' }}>AI 연결하기</h1>
        <p>Codex 또는 Claude Code 구독을 연결하거나, 내장된 똑딱AI로 바로 시작할 수 있어요.</p>
        <p role="status">
          {state === 'checking'
            ? '연결 확인 중…'
            : state === 'connected'
              ? `${provider === 'local' ? '똑딱AI (내장·오프라인)' : provider === 'codex' ? 'Codex' : 'Claude Code'} 연결됨`
              : hasLocal
                ? '내장 똑딱AI 사용 가능'
                : '사용할 AI를 연결하거나 선택해 주세요.'}
        </p>
        <div className="set-sub-cards">
          {AI_SUBSCRIPTION_PROVIDERS.map((provider) => (
            <div key={provider}>
              <AiSubscriptionCard
                status={connection.statuses[provider]}
                lang={lang}
                disabled={connection.busy}
                onInstall={connection.install}
                onUpdate={connection.update}
                onCancelLogin={connection.cancelLogin}
                onLogin={connection.login}
                onRecheck={connection.recheck}
                onAcceptMetered={connection.acceptMetered}
                onOpenInstallHelp={connection.openInstallHelp}
              />
              {connection.failed[provider] && (
                <p role="alert">연결을 시작하지 못했습니다. 설치와 로그인을 확인해 주세요.</p>
              )}
              {usable.includes(provider) && (
                <button
                  className="set-btn"
                  onClick={() => void changeAiSettings((settings) => ({ ...settings, provider }))}
                >
                  {provider === 'codex' ? 'Codex' : 'Claude Code'} 사용하기
                </button>
              )}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 24, flexWrap: 'wrap' }}>
          <button className="set-btn primary" disabled={!ready} onClick={onStart}>
            시작하기
          </button>
          {hasLocal && provider !== 'local' && (
            <button
              className="set-btn"
              onClick={() => {
                void changeAiSettings((s) => ({ ...s, provider: 'local' }))
                onStart()
              }}
            >
              똑딱AI(내장)로 시작하기
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
