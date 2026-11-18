import { describe, expect, it } from 'vitest'
import { controlHandler, type ControlHost } from '../src/main/control-handlers'
import { parseEnvelope } from '../src/main/control-server'

const host: ControlHost = {
  reveal: () => {},
  openDocument: () => false,
  activateTab: () => {},
  findTab: () => undefined,
}

describe('control channel: work-take (and pumui-take from before task names)', () => {
  it('accepts work-take with a task name, and pumui-take, without a path', () => {
    expect(
      parseEnvelope('{"token":"t","request":{"cmd":"work-take","feature":"edufine-pumui"}}'),
    ).toEqual({ token: 't', request: { cmd: 'work-take', feature: 'edufine-pumui' } })
    expect(parseEnvelope('{"token":"t","request":{"cmd":"pumui-take"}}')).toEqual({
      token: 't',
      request: { cmd: 'pumui-take' },
    })
  })

  it('refuses work-take without a proper task name', () => {
    expect(parseEnvelope('{"token":"t","request":{"cmd":"work-take"}}')).toBeNull()
    expect(parseEnvelope('{"token":"t","request":{"cmd":"work-take","feature":"../x"}}')).toBeNull()
  })

  it('has no work waiting for an extension: the desktop app fills the sites itself', async () => {
    expect(await controlHandler(host)({ cmd: 'work-take', feature: 'edufine-pumui' })).toEqual({
      ok: true,
      result: { text: null },
    })
    expect(await controlHandler(host)({ cmd: 'pumui-take' })).toEqual({
      ok: true,
      result: { text: null },
    })
  })

  it('still refuses unknown commands', () => {
    expect(parseEnvelope('{"token":"t","request":{"cmd":"pumui-put","text":"x"}}')).toBeNull()
  })
})
