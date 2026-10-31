import { describe, expect, it } from 'vitest'
import type {
  AiSubscriptionProviderId,
  AiSubscriptionState,
  AiSubscriptionStatus,
} from '@genoffice/ai-provider'
import { aiConnectGuideView, aiConnectInfoText, aiConnectStepsView } from '../src/connect-guide'

const status = (
  provider: AiSubscriptionProviderId,
  state: AiSubscriptionState,
  extra: Partial<AiSubscriptionStatus> = {},
): AiSubscriptionStatus => ({ provider, state, meteredAccepted: false, ...extra })

describe('aiConnectGuideView', () => {
  it('asks while nothing is under way or working, and names what is already there', () => {
    const view = aiConnectGuideView(
      {
        'claude-code': status('claude-code', 'signed-out'),
        codex: status('codex', 'error', { error: 'needs-update: too old' }),
      },
      null,
    )
    expect(view.open).toBeNull()
    expect(view.options).toEqual([
      {
        path: 'claude-code',
        titleKey: 'guidePathClaudeTitle',
        bodyKey: 'guidePathClaudeBody',
        badgeKey: 'guideBadgeInstalled',
      },
      {
        path: 'codex',
        titleKey: 'guidePathCodexTitle',
        bodyKey: 'guidePathCodexBody',
        badgeKey: 'guideBadgeCheck',
      },
      { path: 'free', titleKey: 'guidePathFreeTitle', bodyKey: 'guidePathFreeBody' },
    ])
  })

  it('opens by itself a sign-in under way, then a connection that works, then a free one', () => {
    const signingIn = {
      'claude-code': status('claude-code', 'ready'),
      codex: status('codex', 'signed-out', { signingIn: 'window' as const }),
    }
    expect(aiConnectGuideView(signingIn, null).open).toBe('codex')
    expect(aiConnectGuideView({ codex: status('codex', 'ready') }, null, true).open).toBe('codex')
    const free = aiConnectGuideView({ codex: status('codex', 'not-installed') }, null, true)
    expect(free.open).toBe('free')
    expect(free.options[2]!.badgeKey).toBe('guideBadgeReady')
  })

  it('the user’s own choice wins, and "ask" brings the question back over anything', () => {
    const statuses = { codex: status('codex', 'signed-out', { signingIn: 'browser' as const }) }
    expect(aiConnectGuideView(statuses, 'free').open).toBe('free')
    expect(aiConnectGuideView(statuses, 'ask').open).toBeNull()
  })
})

describe('aiConnectStepsView', () => {
  const at = (s: AiSubscriptionStatus) => {
    const view = aiConnectStepsView(s)
    return [view.current, view.steps.filter((step) => step.done).map((step) => step.id)]
  }

  it('places each state on install → sign in → connected', () => {
    expect(at(status('codex', 'checking'))).toEqual([null, []])
    expect(at(status('codex', 'not-installed'))).toEqual(['install', []])
    expect(at(status('codex', 'signed-out'))).toEqual(['login', ['install']])
    expect(at(status('codex', 'signed-out', { signingIn: 'browser' }))).toEqual([
      'login',
      ['install'],
    ])
    expect(at(status('codex', 'metered'))).toEqual(['login', ['install']])
    expect(at(status('codex', 'ready'))).toEqual(['ready', ['install', 'login', 'ready']])
  })

  it('a program to update is back on the install step; another failure found the program', () => {
    expect(at(status('codex', 'error', { error: 'needs-update: too old' }))).toEqual([
      'install',
      [],
    ])
    expect(at(status('codex', 'error', { error: 'timeout: no answer' }))).toEqual([
      'login',
      ['install'],
    ])
  })
})

describe('aiConnectInfoText', () => {
  it('lists each provider, then the system and the app, on one line each', () => {
    expect(
      aiConnectInfoText(
        {
          'claude-code': status('claude-code', 'signed-out', {
            version: '2.1.250',
            signingIn: 'browser',
          }),
        },
        { platform: 'Win32', userAgent: 'Mozilla/5.0 (Windows NT 10.0)\n Electron/38' },
      ),
    ).toBe(
      [
        'claude-code: state=signed-out version=2.1.250 signing-in=browser',
        'codex: state=checking',
        'platform: Win32',
        'app: Mozilla/5.0 (Windows NT 10.0) Electron/38',
      ].join('\n'),
    )
  })

  it('leaves out the account, the error text and a version that is not one', () => {
    const text = aiConnectInfoText({
      'claude-code': status('claude-code', 'ready', {
        account: 'me@example.com',
        planName: 'max',
        version: 'C:\\Users\\me\\claude.exe',
      }),
      codex: status('codex', 'error', { error: 'failed: spawn C:\\Users\\me\\codex.exe ENOENT' }),
    })
    expect(text).toBe(['claude-code: state=ready', 'codex: state=error error=failed'].join('\n'))
  })
})
