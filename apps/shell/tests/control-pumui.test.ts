import { describe, expect, it } from 'vitest'
import { controlHandler, type ControlHost } from '../src/main/control-handlers'
import { parseEnvelope } from '../src/main/control-server'

const host = (text: string | null): ControlHost => ({
  reveal: () => {},
  openDocument: () => false,
  activateTab: () => {},
  findTab: () => undefined,
  takePumui: () => text,
})

describe('control channel: pumui-take', () => {
  it('accepts the command without a path', () => {
    expect(parseEnvelope('{"token":"t","request":{"cmd":"pumui-take"}}')).toEqual({
      token: 't',
      request: { cmd: 'pumui-take' },
    })
  })

  it('answers with the waiting 품의 text, or null', async () => {
    expect(await controlHandler(host('{"x":1}'))({ cmd: 'pumui-take' })).toEqual({ ok: true, result: { text: '{"x":1}' } })
    expect(await controlHandler(host(null))({ cmd: 'pumui-take' })).toEqual({ ok: true, result: { text: null } })
  })

  it('still refuses unknown commands', () => {
    expect(parseEnvelope('{"token":"t","request":{"cmd":"pumui-put","text":"x"}}')).toBeNull()
  })
})

