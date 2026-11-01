import { describe, expect, it } from 'vitest'
import { AiRunError } from '../src/run-error'
import { codexAppServerLaunchArgs } from '../src/codex-app-server'
import { codexAgentLaunchArgs } from '../src/agent-session/codex'
import { codexLocalEndpointFromConfig, readCodexLocalEndpoint } from '../src/subscription/codex-local-route'

const LOCAL = 'http://127.0.0.1:10100/v1'

describe('Codex CLI existing local connection', () => {
  it('reads the selected Codex home at launch without importing credentials', async () => {
    let path = ''
    const endpoint = await readCodexLocalEndpoint(
      { CODEX_HOME: '/fake/codex-home' },
      async (file) => {
        path = file
        return `# sign-in files are never loaded\nopenai_base_url = "${LOCAL}"\n`
      },
    )
    expect(path).toBe('/fake/codex-home/config.toml')
    expect(endpoint).toBe(LOCAL)
    expect(await readCodexLocalEndpoint({ CODEX_HOME: '/missing' }, async () => {
      throw Object.assign(new Error('not found'), { code: 'ENOENT' })
    })).toBeUndefined()
  })

  it('reuses the top-level local endpoint without replacing the Codex model catalog', () => {
    const endpoint = codexLocalEndpointFromConfig(
      `model = "web/chatgpt-web-gpt-6-sol"\nmodel_catalog_json = "/home/me/.codex/catalog.json"\nopenai_base_url = "${LOCAL}" # existing proxy\n`,
    )
    expect(endpoint).toBe(LOCAL)
    expect(codexAppServerLaunchArgs(endpoint)).toContain(`openai_base_url="${LOCAL}"`)
    expect(codexAgentLaunchArgs('cached', endpoint)).toContain(`openai_base_url="${LOCAL}"`)
    // model and catalog remain Codex's choice, never replaced by app arguments.
    expect(codexAppServerLaunchArgs(endpoint).join(' ')).not.toContain('model_catalog_json=')
    expect(codexAgentLaunchArgs('cached', endpoint).join(' ')).not.toContain('model=')
  })

  it('keeps the official subscription route when no custom endpoint is configured', () => {
    expect(codexLocalEndpointFromConfig('model = "gpt-6"\n')).toBeUndefined()
    expect(codexAppServerLaunchArgs()).toContain('model_provider="openai"')
    expect(codexAppServerLaunchArgs()).toContain('openai_base_url=""')
  })

  it('rejects remote, ambiguous, credential-bearing or malformed addresses', () => {
    for (const url of [
      'https://vendor.example/v1',
      'http://localhost:10100/v1',
      'http://192.168.1.3:10100/v1',
      'http://127.0.0.1:10100/v1?api_key=secret',
      'http://name:pass@127.0.0.1:10100/v1',
      'http://127.0.0.1:10100/v1#fragment',
      'file:///etc/passwd',
      'http://127.0.0.1:10100/v1/../admin',
    ]) {
      expect(() => codexLocalEndpointFromConfig(`openai_base_url = ${JSON.stringify(url)}`)).toThrow(
        AiRunError,
      )
    }
    expect(() => codexLocalEndpointFromConfig('openai_base_url = \"unterminated')).toThrow(
      AiRunError,
    )
  })

  it('does not adopt nested values or a custom model provider', () => {
    expect(
      codexLocalEndpointFromConfig('[model_providers.example]\nopenai_base_url = "http://127.0.0.1:10100/v1"'),
    ).toBeUndefined()
    expect(() =>
      codexLocalEndpointFromConfig(`model_provider = "other"\nopenai_base_url = "${LOCAL}"`),
    ).toThrow(AiRunError)
    expect(() =>
      codexLocalEndpointFromConfig(`openai_base_url = "${LOCAL}"\nopenai_base_url = "${LOCAL}"`),
    ).toThrow(AiRunError)
  })

  it('uses a single validated local address consistently for chat and agent mode', () => {
    const url = 'http://[::1]:10100/v1'
    const endpoint = codexLocalEndpointFromConfig(`openai_base_url = "${url}"`)
    expect(endpoint).toBe(url)
    for (const args of [codexAppServerLaunchArgs(endpoint), codexAgentLaunchArgs('disabled', endpoint)]) {
      expect(args.filter((_, index) => args[index - 1] === '-c')).toContain(`openai_base_url="${url}"`)
      expect(args.filter((_, index) => args[index - 1] === '-c')).toContain('features.hooks=false')
    }
  })
})
