import { describe, expect, it } from 'vitest'
import { findNexacro, frameSurvey, type FrameWin } from '../src/nexacro'

// a window as the page script sees it: its own globals, child frames by index, length
function win(
  opts: { nexacro?: unknown; path?: string; children?: FrameWin[]; crossOrigin?: boolean } = {},
): FrameWin {
  const children = opts.children ?? []
  const w: Record<string | number, unknown> = { length: children.length }
  children.forEach((c, i) => (w[i] = c))
  if (opts.crossOrigin) {
    // another origin: reading its globals or location throws, like a browser does
    Object.defineProperty(w, 'nexacro', {
      get: () => {
        throw new Error('SecurityError')
      },
    })
    Object.defineProperty(w, 'location', {
      get: () => {
        throw new Error('SecurityError')
      },
    })
  } else {
    w.nexacro = opts.nexacro
    w.location = { pathname: opts.path ?? '/', search: '?user=secret' }
  }
  return w as unknown as FrameWin
}
const app = (name: string) => ({ getApplication: () => ({ name }) })

describe('finding K-에듀파인 (nexacro) on the page', () => {
  it('uses the page itself when it has the app', () => {
    const top = app('top')
    expect(findNexacro(win({ nexacro: top, children: [win({ nexacro: app('inner') })] }))).toBe(top)
  })

  it('looks into same-origin frames when a portal page wraps the app', () => {
    const inner = app('inner')
    const page = win({
      path: '/portal',
      children: [win({ path: '/menu' }), win({ children: [win({ nexacro: inner })] })],
    })
    expect(findNexacro(page)).toBe(inner)
  })

  it('skips frames of other origins and objects without getApplication', () => {
    const page = win({
      nexacro: {},
      children: [win({ crossOrigin: true }), win({ nexacro: { getApplication: 1 } })],
    })
    expect(findNexacro(page)).toBeUndefined()
  })

  it('stops at the depth limit', () => {
    let deep = win({ nexacro: app('deep') })
    for (let i = 0; i < 5; i++) deep = win({ children: [deep] })
    expect(findNexacro(deep)).toBeUndefined()
  })
})

describe('frame survey for the diagnostic file', () => {
  it('lists each frame with its path only, marks other origins and where the app is', () => {
    const page = win({
      path: '/klef/index.do',
      children: [win({ crossOrigin: true }), win({ path: '/nxui/app.html', nexacro: app('x') })],
    })
    const survey = frameSurvey(page)
    expect(survey).toEqual([
      { depth: 0, path: '/klef/index.do', nexacro: false },
      { depth: 1, path: '(다른 주소)', nexacro: false },
      { depth: 1, path: '/nxui/app.html', nexacro: true },
    ])
    expect(JSON.stringify(survey)).not.toContain('secret')
  })
})
