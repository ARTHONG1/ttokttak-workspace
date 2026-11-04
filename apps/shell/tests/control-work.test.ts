import { describe, expect, it } from 'vitest'
import { controlHandler, type ControlHost } from '../src/main/control-handlers'
import { parseEnvelope } from '../src/main/control-server'

const host = (text: string | null, asked: string[] = []): ControlHost => ({
  reveal: () => {},
  openDocument: () => false,
  activateTab: () => {},
  findTab: () => undefined,
  takeWork: (feature) => (asked.push(feature), text),
})

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

  it("answers with the task's waiting work, or null", async () => {
    const asked: string[] = []
    expect(
      await controlHandler(host('{"x":1}', asked))({ cmd: 'work-take', feature: 'edufine-pumui' }),
    ).toEqual({ ok: true, result: { text: '{"x":1}' } })
    expect(await controlHandler(host(null, asked))({ cmd: 'pumui-take' })).toEqual({
      ok: true,
      result: { text: null },
    })
    expect(asked).toEqual(['edufine-pumui', 'edufine-pumui'])
  })

  it('still refuses unknown commands', () => {
    expect(parseEnvelope('{"token":"t","request":{"cmd":"pumui-put","text":"x"}}')).toBeNull()
  })
})
